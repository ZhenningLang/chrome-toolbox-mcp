import { CAPABILITIES } from "./capabilities.js";

export function createDispatcher(chrome, state) {
  const fields = (tab) => Object.fromEntries(["id", "windowId", "index", "title", "url", "pendingUrl", "groupId", "pinned", "active", "lastAccessed"].map((key) => [key, tab[key]]));
  async function groupsList(filter, knownTabs) {
    const [groups, tabs] = await Promise.all([chrome.tabGroups.query(filter), knownTabs ?? chrome.tabs.query(filter)]);
    const counts = new Map();
    for (const tab of tabs) counts.set(tab.groupId, (counts.get(tab.groupId) ?? 0) + 1);
    return groups.map((g) => ({ ...g, tabCount: counts.get(g.id) ?? 0 }));
  }
  async function groupTabs(tabIds, options, groupId) {
    const target = groupId !== undefined ? { groupId }
      : { createProperties: { windowId: (await chrome.tabs.get(tabIds[0])).windowId } };
    const id = await chrome.tabs.group({ tabIds, ...target });
    if (options && Object.keys(options).length) await chrome.tabGroups.update(id, options);
    return id;
  }
  async function parentPath(parentId) {
    const parts = [];
    const visited = new Set();
    while (parentId) {
      if (visited.has(parentId)) throw new Error(`cyclic bookmark parent ${parentId}`);
      visited.add(parentId);
      const [node] = await chrome.bookmarks.get(parentId);
      if (!node) throw new Error(`bookmark parent ${parentId} not found`);
      if (node.title) parts.unshift(node.title);
      parentId = node.parentId;
    }
    return parts.join("/");
  }
  async function resolveParent({ parentId, parentPath }) {
    if (parentId !== undefined) return parentId;
    let current = "0";
    for (const title of parentPath.split("/").filter(Boolean)) {
      const children = await chrome.bookmarks.getChildren(current);
      const folder = children.find((child) => !child.url && child.title === title)
        ?? await chrome.bookmarks.create({ parentId: current, title });
      current = folder.id;
    }
    return current;
  }
  const handlers = {
    "readingList.query": () => chrome.readingList.query({}),
    "readingList.add": ({ url, title, hasBeenRead }) => chrome.readingList.addEntry({ url, title, hasBeenRead: Boolean(hasBeenRead) }),
    "readingList.update": ({ url, title, hasBeenRead }) => {
      const info = { url };
      if (title !== undefined) info.title = title;
      if (hasBeenRead !== undefined) info.hasBeenRead = hasBeenRead;
      return chrome.readingList.updateEntry(info);
    },
    "readingList.remove": ({ url }) => chrome.readingList.removeEntry({ url }),
    "tabs.list": async (filter) => {
      const tabs = await chrome.tabs.query(filter);
      const groups = await groupsList(filter, tabs);
      const windows = [...new Set([...tabs, ...groups].map((v) => v.windowId))].map((windowId) => ({
        windowId, tabs: tabs.filter((t) => t.windowId === windowId).map(fields), groups: groups.filter((g) => g.windowId === windowId),
      }));
      return { windows };
    },
    "tabs.open": async ({ urls, entries, group, active = false, windowId }) => {
      const items = entries ?? urls.map((url) => ({ url }));
      const tabs = [];
      const restoredGroups = new Map();
      for (const item of items) {
        const tab = await chrome.tabs.create({ url: item.url, active, ...(windowId !== undefined ? { windowId } : {}) });
        tabs.push(tab);
        if (!group && item.group?.title) {
          const key = `${item.group.windowId}:${item.group.id}`;
          if (!restoredGroups.has(key)) restoredGroups.set(key, { options: { title: item.group.title, color: item.group.color, collapsed: item.group.collapsed }, tabIds: [] });
          restoredGroups.get(key).tabIds.push(tab.id);
        }
      }
      if (group && tabs.length) await groupTabs(tabs.map((t) => t.id), group);
      for (const { options, tabIds } of restoredGroups.values()) await groupTabs(tabIds, options);
      return { tabs: await Promise.all(tabs.map(async (t) => fields(await chrome.tabs.get(t.id)))) };
    },
    "tabs.move": async ({ tabIds, groupId, newGroup, ungroup }) => {
      if (ungroup) { await chrome.tabs.ungroup(tabIds); return { tabIds, groupId: -1 }; }
      return { tabIds, groupId: await groupTabs(tabIds, newGroup, groupId) };
    },
    "tabGroups.list": groupsList,
    "tabGroups.update": ({ groupId, ...options }) => chrome.tabGroups.update(groupId, options),
    "tabs.snapshot": async ({ tabIds }) => Promise.all(tabIds.map(async (id) => {
      const tab = await chrome.tabs.get(id);
      const group = tab.groupId >= 0 ? await chrome.tabGroups.get(tab.groupId) : null;
      return { ...fields(tab), url: tab.pendingUrl || tab.url, group };
    })),
    "tabs.close": async ({ tabIds }) => { await chrome.tabs.remove(tabIds); return { closed: tabIds.length }; },
    "bookmarks.search": async ({ query, limit = 50 }) => {
      const found = (await chrome.bookmarks.search(query)).slice(0, limit);
      return Promise.all(found.map(async ({ id, title, url, parentId }) => ({ id, title, url, parentId, parentPath: await parentPath(parentId) })));
    },
    "bookmarks.add": async (args) => {
      const parentId = await resolveParent(args);
      return chrome.bookmarks.create({ parentId, title: args.title, ...(args.url !== undefined ? { url: args.url } : {}) });
    },
    "bookmarks.move": async (args) => {
      const parentId = await resolveParent(args);
      return chrome.bookmarks.move(args.id, { parentId, ...(args.index !== undefined ? { index: args.index } : {}) });
    },
    "history.search": async (args) => (await chrome.history.search(args)).map(({ url, title, lastVisitTime, visitCount }) => ({ url, title, lastVisitTime, visitCount })),
  };
  return async (method, params = {}) => {
    if (["query", "add", "update", "remove"].includes(method)) method = `readingList.${method}`;
    const capability = CAPABILITIES.find((cap) => cap.prefix.some((prefix) => method.startsWith(prefix)))?.id ?? method.split(".")[0];
    if (!await state.allows(capability)) throw new Error(`capability "${capability}" is turned off in the Chrome Toolbox popup`);
    const handler = handlers[method];
    if (!handler) throw new Error(`unknown method ${method}`);
    return handler(params);
  };
}
