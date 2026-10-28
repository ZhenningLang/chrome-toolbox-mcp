import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { Bridge } from "../src/bridge.js";
import { legacyHandlers } from "./fixtures/legacy-handlers.js";
import { fakeChrome } from "./fixtures/chrome.js";
import { EXT_ID, mcp, extension, until } from "./helpers.js";

test("QA2 reading tools match the complete 84d39f4 tools/list JSON", async () => {
  async function catalogue(server) {
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "compat-test", version: "1" });
    await server.connect(a);
    await client.connect(b);
    try { return JSON.parse(JSON.stringify((await client.listTools()).tools.filter((t) => t.name.startsWith("reading_list_")))); }
    finally { await client.close(); await server.close(); }
  }
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/reading-tools.json", import.meta.url)));
  // Captured from git show 84d39f4:src/server.js via MCP tools/list, not production helpers.
  // Kept in-tree so shallow CI checkouts need no historical objects.
  assert.deepEqual(await catalogue(createServer({}, { version: "1" })), fixture);
});

test("QA4a new server executes legacy extension handler table for list and add", async (t) => {
  const homeDir = mkdtempSync(join(tmpdir(), "toolbox-legacy-"));
  const bridge = new Bridge({ port: 0, homeDir, allowedExtensionIds: [EXT_ID] });
  await bridge.start();
  t.after(() => bridge.close());
  const chrome = fakeChrome();
  const handlers = legacyHandlers(chrome);
  const ws = await extension(bridge.wss.address().port, (method, args) => handlers[method](args));
  t.after(() => ws.terminate());
  const { call, client } = await mcp(bridge, homeDir);
  t.after(() => client.close());
  await until(() => bridge.capabilityState.enabled.length === 1);
  const before = await call("reading_list_list");
  assert.equal(JSON.parse(before.content[0].text).total, 0);
  const added = await call("reading_list_add", { entries: [{ url: "https://legacy.example", title: "Legacy" }] });
  assert.deepEqual(JSON.parse(added.content[0].text), { added: ["https://legacy.example"], skipped: [] });
  const after = JSON.parse((await call("reading_list_list")).content[0].text);
  assert.equal(after.total, 1);
  assert.equal(after.entries[0].title, "Legacy");
  assert.equal((await client.listTools()).tools.length, 6);
});
