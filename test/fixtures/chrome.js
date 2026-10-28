export function fakeChrome() {
  const calls = [];
  const tabs = new Map();
  const groups = new Map();
  const bookmarks = new Map([["0", { id: "0", title: "" }], ["1", { id: "1", parentId: "0", title: "书签栏" }]]);
  const entries = new Map();
  let nextTab = 1;
  let nextGroup = 10;
  let nextBookmark = 2;
  const chrome = {
    calls, tabsStore: tabs, groupsStore: groups, bookmarksStore: bookmarks, entries,
    readingList: {
      query: async () => [...entries.values()],
      addEntry: async (entry) => { entries.set(entry.url, { ...entry, creationTime: 1000 }); },
      updateEntry: async (entry) => { Object.assign(entries.get(entry.url), entry); },
      removeEntry: async ({ url }) => { entries.delete(url); },
    },
    tabs: {
      query: async (filter) => { calls.push(["tabs.query", filter]); return [...tabs.values()].filter((t) => filter.windowId === undefined || t.windowId === filter.windowId); },
      get: async (id) => { if (!tabs.has(id)) throw new Error("tab not found"); return tabs.get(id); },
      create: async (p) => {
        calls.push(["tabs.create", p]);
        const t = { id: nextTab++, windowId: p.windowId ?? 1, index: tabs.size, title: p.url, url: p.url, groupId: -1, pinned: false, active: p.active, lastAccessed: 1000 };
        tabs.set(t.id, t); return t;
      },
      group: async (params) => {
        const { tabIds, groupId, createProperties } = params;
        calls.push(["tabs.group", params]);
        const id = groupId ?? nextGroup++;
        // Chrome defaults new groups to the current window (1 in this fixture).
        if (!groups.has(id)) groups.set(id, { id, windowId: createProperties?.windowId ?? 1, title: "", color: "grey", collapsed: false });
        tabIds.forEach((t) => { tabs.get(t).groupId = id; });
        return id;
      },
      ungroup: async (ids) => { calls.push(["tabs.ungroup", ids]); ids.forEach((id) => { tabs.get(id).groupId = -1; }); },
      remove: async (ids) => { chrome.beforeRemove?.(ids); calls.push(["tabs.remove", ids]); ids.forEach((id) => tabs.delete(id)); },
    },
    tabGroups: {
      query: async (filter) => [...groups.values()].filter((g) => filter.windowId === undefined || g.windowId === filter.windowId),
      get: async (id) => groups.get(id),
      update: async (id, p) => { calls.push(["tabGroups.update", id, p]); Object.assign(groups.get(id), p); return groups.get(id); },
    },
    bookmarks: {
      get: async (id) => [bookmarks.get(id)],
      getChildren: async (id) => [...bookmarks.values()].filter((b) => b.parentId === id),
      search: async (query) => { calls.push(["bookmarks.search", query]); return [...bookmarks.values()].filter((b) => b.title.includes(query)); },
      create: async (p) => { calls.push(["bookmarks.create", p]); const b = { id: String(nextBookmark++), ...p }; bookmarks.set(b.id, b); return b; },
      move: async (id, p) => { calls.push(["bookmarks.move", id, p]); Object.assign(bookmarks.get(id), p); return bookmarks.get(id); },
    },
    history: { search: async (p) => { calls.push(["history.search", p]); return [{ id: "9", url: "https://history.example", title: "History", lastVisitTime: 1000, visitCount: 3, typedCount: 1 }]; } },
  };
  return chrome;
}
