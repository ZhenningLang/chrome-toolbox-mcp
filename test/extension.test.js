import { test } from "node:test";
import assert from "node:assert/strict";
import { createCapabilityController, changeCapability } from "../extension/capabilities.js";
import { createDispatcher } from "../extension/dispatch.js";
import { until } from "./helpers.js";

function fakeChrome(saved) {
  const calls = [];
  let removed;
  const chrome = {
    calls, granted: new Set(["readingList"]), accepted: false,
    storage: { local: {
      get: async () => saved === undefined ? {} : { enabled: saved },
      set: async (v) => { saved = v.enabled; },
    } },
    permissions: {
      contains: async ({ permissions }) => permissions.every((p) => chrome.granted.has(p)),
      request: async (p) => { calls.push(["request", p]); if (chrome.accepted) p.permissions.forEach((v) => chrome.granted.add(v)); return chrome.accepted; },
      remove: async (p) => { calls.push(["remove", p]); p.permissions.forEach((v) => chrome.granted.delete(v)); removed(p); return true; },
      onRemoved: { addListener: (fn) => { removed = fn; } },
    },
    readingList: Object.fromEntries(["query", "addEntry", "updateEntry", "removeEntry"].map((m) => [m, async (p) => { calls.push([m, p]); return m === "query" ? [] : null; }])),
    tabs: { query: async () => { calls.push(["tabs.query"]); return []; } },
  };
  return chrome;
}

function controller(chrome, onChange) {
  const state = createCapabilityController(chrome, onChange);
  chrome.runtime = { sendMessage: async ({ id, checked }) => {
    await state.setEnabled(id, checked);
    return { enabled: state.enabled };
  } };
  return state;
}

test("QA7a first install defaults to readingList; optional grant/denial and removal", async () => {
  const chrome = fakeChrome();
  const pushed = [];
  const state = controller(chrome, (enabled) => pushed.push(enabled));
  await state.ready;
  assert.deepEqual(state.enabled, ["readingList"]);
  assert.deepEqual(chrome.calls, []);
  assert.equal(await changeCapability(chrome, "tabs", true), false);
  assert.deepEqual(chrome.calls[0], ["request", { permissions: ["tabs", "tabGroups"] }]);
  assert.deepEqual(state.enabled, ["readingList"]);
  chrome.accepted = true;
  await changeCapability(chrome, "tabs", true);
  assert.deepEqual(state.enabled, ["readingList", "tabs"]);
  await changeCapability(chrome, "tabs", false);
  assert.deepEqual(state.enabled, ["readingList"]);
  assert.deepEqual(pushed.at(-1), ["readingList"]);
  await changeCapability(chrome, "readingList", false);
  assert.deepEqual(state.enabled, []);
  assert.equal(chrome.calls.filter(([m]) => m === "remove").length, 1);
});

test("QA7 startup reconciles missing permissions and intercepts before any capability API", async () => {
  const chrome = fakeChrome(["readingList", "tabs"]);
  const pushed = [];
  const state = controller(chrome, (v) => pushed.push(v));
  const dispatch = createDispatcher(chrome, state);
  await state.ready;
  assert.deepEqual(pushed.at(-1), ["readingList"]);
  await assert.rejects(dispatch("tabs.list"), /capability "tabs" is turned off in the Chrome Toolbox popup/);
  assert.deepEqual(chrome.calls, []);
  chrome.accepted = true;
  await changeCapability(chrome, "tabs", true);
  const previousPushes = pushed.length;
  await chrome.permissions.remove({ permissions: ["tabs"] });
  await until(() => pushed.length > previousPushes);
  assert.deepEqual(pushed.at(-1), ["readingList"]);
  assert.deepEqual(state.enabled, ["readingList"]);
  assert.deepEqual((await chrome.storage.local.get("enabled")).enabled, ["readingList"]);
  await assert.rejects(dispatch("tabs.list"), /is turned off/);
  assert.equal(chrome.calls.some(([m]) => m === "tabs.query"), false);
});

test("QA4b old reading method names and prefixed aliases share capability gating", async () => {
  const chrome = fakeChrome();
  const state = controller(chrome);
  const dispatch = createDispatcher(chrome, state);
  await state.ready;
  for (const method of ["query", "add", "update", "remove"]) {
    await dispatch(method, { url: "https://example.com" });
    await dispatch(`readingList.${method}`, { url: "https://example.com" });
  }
  assert.equal(chrome.calls.length, 8);
  await changeCapability(chrome, "readingList", false);
  for (const method of ["query", "add", "update", "remove"]) await assert.rejects(dispatch(method), /is turned off/);
  assert.equal(chrome.calls.length, 8);
});

test("QA7 all disabled capabilities and tabGroups aliases reject without browser access", async () => {
  const chrome = fakeChrome([]);
  const state = createCapabilityController(chrome);
  const dispatch = createDispatcher(chrome, state);
  await state.ready;
  for (const method of ["query", "readingList.add", "tabs.list", "tabs.close", "tabGroups.list", "bookmarks.search", "history.search"]) {
    await assert.rejects(dispatch(method), /is turned off in the Chrome Toolbox popup/);
  }
  assert.deepEqual(chrome.calls, []);
});
