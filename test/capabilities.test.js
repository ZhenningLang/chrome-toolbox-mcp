import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Bridge } from "../src/bridge.js";
import { ToolListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { EXT_ID, extension, mcp, until } from "./helpers.js";

// Independent expectations from the approved tool contract, not the production mapping.
const toolsByCapability = {
  readingList: ["reading_list_list", "reading_list_add", "reading_list_update", "reading_list_remove", "reading_list_restore", "reading_list_export"],
  tabs: ["tabs_list", "tabs_open", "tabs_move", "tab_groups_list", "tab_groups_update", "tabs_close"],
  bookmarks: ["bookmarks_search", "bookmarks_add", "bookmarks_move"],
  history: ["history_search"],
};

test("QA3-6 capability persistence, dynamic lists, eager peer subscription, reconnect and takeover", async (t) => {
  const homeDir = mkdtempSync(join(tmpdir(), "toolbox-caps-"));
  const hub = new Bridge({ port: 0, allowedExtensionIds: [EXT_ID], homeDir });
  await hub.start();
  t.after(() => hub.close());
  const port = hub.wss.address().port;
  const first = await mcp(hub, homeDir);
  t.after(() => first.client.close());
  const names = async (client) => (await client.listTools()).tools.map((x) => x.name);
  assert.deepEqual(await names(first.client), toolsByCapability.readingList);
  const ws = await extension(port);
  t.after(() => ws.terminate());
  const peer = new Bridge({ port, allowedExtensionIds: [EXT_ID], homeDir });
  await peer.start();
  t.after(() => peer.close());
  const second = await mcp(peer, homeDir);
  t.after(() => second.client.close());
  let changes = 0;
  let peerChanges = 0;
  first.client.setNotificationHandler(ToolListChangedNotificationSchema, () => { changes++; });
  second.client.setNotificationHandler(ToolListChangedNotificationSchema, () => { peerChanges++; });
  ws.send(JSON.stringify({ type: "capabilities", enabled: ["readingList", "tabs"] }));
  await until(() => changes > 0 && peerChanges > 0);
  assert.deepEqual(await names(first.client), [...toolsByCapability.readingList, ...toolsByCapability.tabs]);
  assert.deepEqual(await names(second.client), await names(first.client));
  const file = join(homeDir, "capabilities.json");
  assert.deepEqual(JSON.parse(readFileSync(file)).enabled, ["readingList", "tabs"]);
  if (process.platform !== "win32") assert.equal(statSync(file).mode & 0o777, 0o600);
  peer.hubSocket.send(JSON.stringify({ type: "capabilities", enabled: ["history"] }));
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(JSON.parse(readFileSync(file)).enabled, ["readingList", "tabs"]);
  peer.capabilityState.set(["history"], false);
  peer.hubSocket.terminate();
  await until(() => peer.hubSocket?.readyState === 1);
  assert.deepEqual(await names(second.client), await names(first.client));
  ws.send(JSON.stringify({ type: "capabilities", enabled: ["readingList"] }));
  await until(async () => JSON.stringify(await names(second.client)) === JSON.stringify(toolsByCapability.readingList));
  assert.deepEqual(await names(first.client), toolsByCapability.readingList);
  assert.deepEqual(await names(second.client), toolsByCapability.readingList);
  ws.send(JSON.stringify({ type: "capabilities", enabled: ["tabs"] }));
  await until(async () => (await names(second.client)).includes("tabs_list") && !(await names(second.client)).includes("reading_list_list"));
  // A reload mutation must not survive merely because disk and peer cache agree.
  assert.deepEqual(peer.capabilityState.enabled, ["tabs"]);
  writeFileSync(file, JSON.stringify({ enabled: ["bookmarks", "history"], updatedAt: new Date().toISOString() }));
  await hub.close();
  await until(() => peer.mode === "hub");
  const saved = JSON.parse(readFileSync(file, "utf8"));
  const expected = saved.enabled.flatMap((capability) => toolsByCapability[capability]);
  assert.deepEqual(await names(second.client), expected);
});

test("B peer handshake failure keeps MCP startup available with readingList defaults", async (t) => {
  const hubHome = mkdtempSync(join(tmpdir(), "toolbox-hub-token-"));
  const hub = new Bridge({ port: 0, homeDir: hubHome, allowedExtensionIds: [EXT_ID] });
  await hub.start();
  t.after(() => hub.close());
  const homeDir = mkdtempSync(join(tmpdir(), "toolbox-peer-token-"));
  writeFileSync(join(homeDir, "capabilities.json"), JSON.stringify({ enabled: ["tabs"] }));
  const logs = [];
  const peer = new Bridge({ port: hub.wss.address().port, homeDir, allowedExtensionIds: [EXT_ID], log: (msg) => logs.push(msg) });
  t.after(() => peer.close());
  await peer.start();
  assert.equal(peer.mode, "peer");
  assert.deepEqual(peer.capabilityState.enabled, ["readingList"]);
  const { client } = await mcp(peer, homeDir);
  t.after(() => client.close());
  assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name), toolsByCapability.readingList);
  assert.ok(logs.some((line) => line.includes("subscription") && line.includes("bad token")));
});

test("B invalid capability caches keep MCP startup available with readingList defaults", async (t) => {
  for (const [name, data] of [["truncated", '{"enabled":'], ["empty", ""], ["unknown id", '{"enabled":["tabs","downloads"]}'], ["unreadable file", null]]) {
    await t.test(name, async (sub) => {
      const homeDir = mkdtempSync(join(tmpdir(), "toolbox-invalid-cache-"));
      const file = join(homeDir, "capabilities.json");
      if (data === null) mkdirSync(file);
      else writeFileSync(file, data);
      const logs = [];
      const bridge = new Bridge({ port: 0, homeDir, allowedExtensionIds: [EXT_ID], log: (msg) => logs.push(msg) });
      sub.after(() => bridge.close());
      await bridge.start();
      assert.deepEqual(bridge.capabilityState.enabled, ["readingList"]);
      const { client } = await mcp(bridge, homeDir);
      sub.after(() => client.close());
      assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name), toolsByCapability.readingList);
      assert.ok(logs.some((line) => line.includes("capabilities cache") && line.includes("readingList")));
    });
  }
});

test("QA4 cold start reads saved capabilities; old extension hello resets to readingList", async (t) => {
  const homeDir = mkdtempSync(join(tmpdir(), "toolbox-saved-"));
  writeFileSync(join(homeDir, "capabilities.json"), JSON.stringify({ enabled: ["tabs"], updatedAt: new Date().toISOString() }), { mode: 0o600 });
  const bridge = new Bridge({ port: 0, homeDir, allowedExtensionIds: [EXT_ID] });
  await bridge.start();
  t.after(() => bridge.close());
  const { client } = await mcp(bridge, homeDir);
  t.after(() => client.close());
  assert.deepEqual((await client.listTools()).tools.map((t) => t.name), ["tabs_list", "tabs_open", "tabs_move", "tab_groups_list", "tab_groups_update", "tabs_close"]);
  const ws = await extension(bridge.wss.address().port);
  t.after(() => ws.terminate());
  await until(async () => (await client.listTools()).tools.some((t) => t.name === "reading_list_list"));
  assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name), toolsByCapability.readingList);
  assert.deepEqual(JSON.parse(readFileSync(join(homeDir, "capabilities.json"))).enabled, ["readingList"]);
});
