import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Bridge } from "../src/bridge.js";
import { createDispatcher } from "../extension/dispatch.js";
import { fakeChrome } from "./fixtures/chrome.js";
import { EXT_ID, extension, mcp, until } from "./helpers.js";

async function setup(t) {
  const homeDir = mkdtempSync(join(tmpdir(), "toolbox-tools-"));
  const bridge = new Bridge({ port: 0, homeDir, allowedExtensionIds: [EXT_ID] });
  await bridge.start();
  t.after(() => bridge.close());
  const chrome = fakeChrome();
  const ws = await extension(bridge.wss.address().port, createDispatcher(chrome, { allows: async () => true }), ["readingList", "tabs", "bookmarks", "history"]);
  t.after(() => ws.terminate());
  const session = await mcp(bridge, homeDir);
  t.after(() => session.client.close());
  await until(async () => (await session.client.listTools()).tools.some((tool) => tool.name === "tabs_list"));
  const call = async (name, args = {}) => {
    const result = await session.call(name, args);
    if (result.isError) throw new Error(result.content[0].text);
    return JSON.parse(result.content[0].text);
  };
  return { ...session, call, chrome, homeDir, bridge };
}

test("QA8-9 tabs open 20 grouped tabs, backup before close, restore and URL-filter restore", async (t) => {
  const { chrome, call, homeDir } = await setup(t);
  const urls = Array.from({ length: 20 }, (_, i) => `https://example.com/${i}`);
  await call("tabs_open", { urls, group: { title: "测试", color: "blue", collapsed: true } });
  assert.equal(chrome.calls.filter(([m]) => m === "tabs.create").length, 20);
  assert.equal(chrome.calls.filter(([m]) => m === "tabs.group").length, 1);
  assert.equal(chrome.calls.filter(([m]) => m === "tabGroups.update").length, 1);
  assert.equal([...chrome.groupsStore.values()][0].title, "测试");
  assert.equal([...chrome.groupsStore.values()][0].collapsed, true);
  assert.equal(chrome.calls.find(([m]) => m === "tabs.create")[1].active, false);
  const ids = [...chrome.tabsStore.keys()];
  chrome.beforeRemove = () => {
    const file = join(homeDir, "backups", readdirSync(join(homeDir, "backups")).find((p) => p.startsWith("tabs-")));
    const backup = JSON.parse(readFileSync(file));
    assert.equal(backup.tabs.length, 20);
    assert.deepEqual(backup.tabs.map((tab) => ({ url: tab.url, title: tab.title, groupTitle: tab.group.title, groupColor: tab.group.color })),
      urls.map((url) => ({ url, title: url, groupTitle: "测试", groupColor: "blue" })));
    if (process.platform !== "win32") assert.equal(statSync(file).mode & 0o777, 0o600);
  };
  const closed = await call("tabs_close", { tabIds: ids });
  assert.equal(closed.closed, 20);
  assert.equal(chrome.tabsStore.size, 0);
  await call("tabs_open", { backupPath: closed.backupPath });
  assert.equal(chrome.tabsStore.size, 20);
  assert.deepEqual([...chrome.tabsStore.values()].map((tab) => tab.url), urls);
  assert.equal([...chrome.groupsStore.values()].at(-1).title, "测试");
  const filtered = await call("tabs_open", { backupPath: closed.backupPath, urls: [urls[0]] });
  assert.equal(filtered.tabs.length, 1);
  assert.equal(filtered.tabs[0].url, urls[0]);
  const listing = await call("tabs_list");
  assert.equal(listing.windows[0].tabs.length, 21);
  assert.equal((await call("tab_groups_list"))[0].tabCount, 0);
});

test("QA9 write failure closes no tabs", async (t) => {
  const { chrome, call, bridge } = await setup(t);
  await call("tabs_open", { urls: ["https://example.com"] });
  const file = join(bridge.homeDir, "not-a-directory");
  writeFileSync(file, "occupied");
  // Use the actual filesystem failure boundary, not a mocked success signal.
  bridge.homeDir = file;
  await assert.rejects(call("tabs_close", { tabIds: [1] }), /ENOTDIR|EEXIST/);
  assert.equal(chrome.calls.some(([m]) => m === "tabs.remove"), false);
  assert.equal(chrome.tabsStore.size, 1);
});

test("A:B1 pending navigation survives mixed-batch close and restore", async (t) => {
  const { chrome, call } = await setup(t);
  await call("tabs_open", { urls: ["https://material.example/committed", "https://material.example/new"] });
  Object.assign(chrome.tabsStore.get(2), { url: "", pendingUrl: "https://material.example/new", title: "Loading" });
  const closed = await call("tabs_close", { tabIds: [1, 2] });
  const backup = JSON.parse(readFileSync(closed.backupPath));
  assert.equal(backup.tabs[1].url, "https://material.example/new");
  assert.equal(backup.tabs[1].pendingUrl, "https://material.example/new");
  assert.equal(closed.closed, 2);
  await call("tabs_open", { backupPath: closed.backupPath });
  assert.deepEqual([...chrome.tabsStore.values()].map((tab) => tab.url), ["https://material.example/committed", "https://material.example/new"]);
});

test("A:B1 unresolvable tab aborts the whole close batch without removing tabs", async (t) => {
  const { chrome, call } = await setup(t);
  await call("tabs_open", { urls: ["https://material.example/keep", "https://material.example/loading"] });
  for (const url of ["", "not a URL", undefined]) {
    Object.assign(chrome.tabsStore.get(2), { url, pendingUrl: undefined });
    await assert.rejects(call("tabs_close", { tabIds: [1, 2] }), /cannot close tabs.*restorable/s);
    assert.equal(chrome.calls.some(([method]) => method === "tabs.remove"), false);
    assert.equal(chrome.tabsStore.size, 2);
  }
});

test("A:B1 pending URL wins over stale or missing committed URLs", async (t) => {
  const { chrome, call } = await setup(t);
  await call("tabs_open", { urls: ["https://material.example/old", "https://material.example/not-committed"] });
  Object.assign(chrome.tabsStore.get(1), { pendingUrl: "https://material.example/new-1" });
  Object.assign(chrome.tabsStore.get(2), { url: undefined, pendingUrl: "https://material.example/new-2" });
  const closed = await call("tabs_close", { tabIds: [1, 2] });
  const expected = ["https://material.example/new-1", "https://material.example/new-2"];
  assert.deepEqual(JSON.parse(readFileSync(closed.backupPath)).tabs.map((tab) => tab.url), expected);
  await call("tabs_open", { backupPath: closed.backupPath });
  assert.deepEqual([...chrome.tabsStore.values()].map((tab) => tab.url), expected);
});

test("A window-targeted open, move and restore create groups in the target window", async (t) => {
  const { chrome, call } = await setup(t);
  await call("tabs_open", { urls: ["https://window.example/1", "https://window.example/2"], windowId: 42, group: { title: "Window 42" } });
  assert.equal(chrome.calls.find(([method]) => method === "tabs.group")[1].createProperties?.windowId, 42);
  assert.equal([...chrome.groupsStore.values()].at(-1).windowId, 42);
  const moved = await call("tabs_move", { tabIds: [1], newGroup: { title: "Move" } });
  assert.equal(chrome.calls.filter(([method]) => method === "tabs.group").at(-1)[1].createProperties?.windowId, 42);
  await call("tabs_move", { tabIds: [2], groupId: moved.groupId });
  assert.equal(chrome.calls.filter(([method]) => method === "tabs.group").at(-1)[1].createProperties, undefined);
  const closed = await call("tabs_close", { tabIds: [1, 2] });
  const restored = await call("tabs_open", { backupPath: closed.backupPath, windowId: 77 });
  assert.deepEqual(restored.tabs.map((tab) => tab.windowId), [77, 77]);
  assert.equal(chrome.calls.filter(([method]) => method === "tabs.group").at(-1)[1].createProperties?.windowId, 77);
  assert.equal([...chrome.groupsStore.values()].at(-1).windowId, 77);
});

test("A existing group titles longer than the new-input limit survive close and restore", async (t) => {
  const { chrome, call } = await setup(t);
  await call("tabs_open", { urls: ["https://group.example/long-title"] });
  const groupId = await chrome.tabs.group({ tabIds: [1] });
  const title = "L".repeat(81);
  await chrome.tabGroups.update(groupId, { title, color: "purple" });
  const closed = await call("tabs_close", { tabIds: [1] });
  assert.equal(JSON.parse(readFileSync(closed.backupPath)).tabs[0].group.title, title);
  await call("tabs_open", { backupPath: closed.backupPath });
  assert.equal(chrome.tabsStore.size, 1);
  assert.equal([...chrome.groupsStore.values()].at(-1).title, title);
  assert.equal([...chrome.groupsStore.values()].at(-1).color, "purple");
});

test("QA10 tabs move into existing/new group and ungroup; group metadata updates", async (t) => {
  const { chrome, call } = await setup(t);
  await call("tabs_open", { urls: ["https://example.com", "https://example.org"] });
  await call("tabs_move", { tabIds: [1], newGroup: { title: "New", color: "green" } });
  const groupId = chrome.tabsStore.get(1).groupId;
  assert.equal(chrome.groupsStore.get(groupId).title, "New");
  await call("tabs_move", { tabIds: [2], groupId });
  assert.equal(chrome.tabsStore.get(2).groupId, groupId);
  assert.equal((await call("tab_groups_list"))[0].tabCount, 2);
  await call("tab_groups_update", { groupId, title: "Renamed", collapsed: true });
  assert.equal(chrome.groupsStore.get(groupId).title, "Renamed");
  await call("tabs_move", { tabIds: [1, 2], ungroup: true });
  assert.deepEqual([...chrome.tabsStore.values()].map((tab) => tab.groupId), [-1, -1]);
});

test("QA11 bookmarks return parent paths, create missing folders, move without deletion", async (t) => {
  const { call, client, chrome } = await setup(t);
  const added = await call("bookmarks_add", { title: "Material", url: "https://example.com", parentPath: "书签栏/写作/导读" });
  const results = await call("bookmarks_search", { query: "Material" });
  assert.equal(results[0].parentPath, "书签栏/写作/导读");
  assert.equal(results[0].id, added.id);
  assert.equal(chrome.calls.filter(([m]) => m === "bookmarks.create").length, 3);
  const moved = await call("bookmarks_move", { id: added.id, parentId: "1", index: 0 });
  assert.equal(moved.parentId, "1");
  assert.equal(moved.index, 0);
  const folder = await call("bookmarks_add", { title: "Folder", parentId: "1" });
  assert.equal(folder.url, undefined);
  assert.equal((await client.listTools()).tools.some((tool) => /bookmarks.*(delete|remove)/.test(tool.name)), false);
  for (let i = 0; i < 55; i++) await chrome.bookmarks.create({ title: `Match ${i}`, parentId: "1" });
  assert.equal((await call("bookmarks_search", { query: "Match" })).length, 50);
});

test("QA12 history translates ISO and milliseconds, defaults, and read-only response", async (t) => {
  const { call, client, chrome } = await setup(t);
  const startTime = Date.parse("2026-10-01T00:00:00Z");
  const endTime = Date.parse("2026-10-02T00:00:00Z");
  const result = await call("history_search", { text: "writing", startTime: "2026-10-01T00:00:00Z", endTime });
  assert.deepEqual(chrome.calls.at(-1), ["history.search", { text: "writing", startTime, endTime, maxResults: 100 }]);
  assert.deepEqual(result, [{ url: "https://history.example", title: "History", lastVisitTime: 1000, visitCount: 3 }]);
  await call("history_search", { text: "writing", startTime, endTime: "2026-10-02T00:00:00Z" });
  assert.deepEqual(chrome.calls.at(-1), ["history.search", { text: "writing", startTime, endTime, maxResults: 100 }]);
  const before = Date.now();
  await call("history_search");
  const args = chrome.calls.at(-1)[1];
  assert.equal(args.text, "");
  assert.ok(args.startTime >= before - 86400000 && args.startTime <= Date.now() - 86400000);
  assert.equal((await client.listTools()).tools.some((tool) => /history.*(delete|remove)/.test(tool.name)), false);
});

test("QA9a parameter limits reject before invoking any browser API", async (t) => {
  const { call, chrome } = await setup(t);
  const cases = [
    ["tabs_open", {}],
    ["tabs_open", { urls: Array(101).fill("https://example.com") }],
    ["tabs_open", { urls: [] }],
    ["tabs_open", { urls: ["not a URL"] }],
    ["tabs_open", { urls: ["https://example.com"], group: { color: "black" } }],
    ["tabs_open", { urls: ["https://example.com"], group: { title: "x".repeat(81) } }],
    ["tabs_move", { tabIds: [1] }],
    ["tabs_move", { tabIds: [1], groupId: 1, newGroup: {} }],
    ["tabs_move", { tabIds: [1], groupId: 1, ungroup: true }],
    ["tabs_move", { tabIds: [], ungroup: true }],
    ["tabs_move", { tabIds: Array(501).fill(1), ungroup: true }],
    ["tabs_close", { tabIds: [] }],
    ["tabs_close", { tabIds: Array(501).fill(1) }],
    ["tab_groups_update", { groupId: 1 }],
    ["tab_groups_update", { groupId: 1, color: "black" }],
    ["bookmarks_add", { title: "A", parentId: "1", parentPath: "A" }],
    ["bookmarks_add", { title: "A" }],
    ["bookmarks_move", { id: "2", parentId: "1", parentPath: "A" }],
    ["bookmarks_move", { id: "2" }],
    ["bookmarks_search", { query: "" }],
    ["bookmarks_search", { query: "A", limit: 501 }],
    ["bookmarks_search", { query: "A", limit: 0 }],
    ["history_search", { maxResults: 1001 }],
    ["history_search", { startTime: "yesterday" }],
    ["history_search", { startTime: "2026-10-01" }],
    ["history_search", { startTime: "2026-10-01T00:00:00" }],
  ];
  for (const [name, args] of cases) await assert.rejects(call(name, args), undefined, `${name} ${JSON.stringify(args)}`);
  assert.deepEqual(chrome.calls, []);
});

test("QA2/17 six reading tools retain representative response field sets over full protocol", async (t) => {
  const { call } = await setup(t);
  const keys = (obj) => Object.keys(obj).sort();
  const url = "https://reading.example";
  assert.deepEqual(keys(await call("reading_list_add", { entries: [{ url, title: "Reading" }] })), ["added", "skipped"]);
  const list = await call("reading_list_list");
  assert.deepEqual(keys(list), ["entries", "matched", "offset", "total", "unread"]);
  assert.deepEqual(keys(list.entries[0]), ["added", "read", "title", "url"]);
  assert.deepEqual(keys(await call("reading_list_update", { entries: [{ url, read: true }] })), ["notFound", "updated"]);
  const removed = await call("reading_list_remove", { urls: [url] });
  assert.deepEqual(keys(removed), ["after", "backupPath", "before", "notFound", "removed"]);
  assert.deepEqual(keys(removed.removed[0]), ["title", "url"]);
  assert.deepEqual(keys(await call("reading_list_restore", { backupPath: removed.backupPath })), ["added", "skipped"]);
  assert.deepEqual(keys(await call("reading_list_export")), ["count", "format", "path"]);
});

test("malformed tab backup payloads never open tabs; bookmark cycles terminate", { timeout: 3000 }, async (t) => {
  const { call, chrome, homeDir } = await setup(t);
  const file = join(homeDir, "bad.json");
  for (const input of ['{"tabs":[', '\u0000', '{"tabs":[{"url": "https://example.com", "group":{}}]}', '{"tabs":[[{"url":"https://example.com"}]]}', '{"tabs":[{"url":"bad"}]}']) {
    writeFileSync(file, input);
    await assert.rejects(call("tabs_open", { backupPath: file }));
  }
  assert.equal(chrome.tabsStore.size, 0);
  chrome.bookmarksStore.set("cycle", { id: "cycle", parentId: "cycle", title: "Loop" });
  chrome.bookmarksStore.set("leaf", { id: "leaf", parentId: "cycle", title: "Leaf" });
  await assert.rejects(call("bookmarks_search", { query: "Leaf" }), /cyclic bookmark parent/);
  for (const parentPath of ["书签栏//写作///导读", "书签栏/\"quote\"", "书签栏/\ufffd", "书签栏/重复/重复/重复"]) {
    const result = await call("bookmarks_add", { title: "Malformed path test", parentPath });
    assert.equal(result.title, "Malformed path test");
  }
});
