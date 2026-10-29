import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { loadConfig } from "../src/config.js";
import { Bridge } from "../src/bridge.js";
import { extension, EXT_ID } from "./helpers.js";

test("QA13 config migration preserves token and backups; new env takes priority", () => {
  const userHome = mkdtempSync(join(tmpdir(), "toolbox-migration-"));
  const frozenTools = JSON.parse(readFileSync(new URL("./fixtures/reading-tools.json", import.meta.url)));
  const legacyDescription = frozenTools.find((tool) => tool.name === "reading_list_export").inputSchema.properties.path.description;
  const oldDir = join(userHome, legacyDescription.split("Defaults to ~/")[1].split("/")[0]);
  mkdirSync(join(oldDir, "backups"), { recursive: true });
  writeFileSync(join(oldDir, "token"), "existing-token");
  writeFileSync(join(oldDir, "backups", "saved.json"), "preserved");
  const config = loadConfig({}, userHome);
  assert.equal(config.homeDir, join(userHome, ".chrome-toolbox-mcp"));
  assert.equal(existsSync(oldDir), false);
  assert.equal(readFileSync(join(config.homeDir, "token"), "utf8"), "existing-token");
  assert.equal(readFileSync(join(config.homeDir, "backups", "saved.json"), "utf8"), "preserved");
  assert.equal(loadConfig({ CHROME_TOOLBOX_MCP_PORT: "20001", READING_LIST_MCP_PORT: "20002" }, userHome).port, 20001);
  assert.equal(loadConfig({ READING_LIST_MCP_PORT: "20002" }, userHome).port, 20002);
  assert.equal(loadConfig({ CHROME_TOOLBOX_MCP_HOME: "new", READING_LIST_MCP_HOME: "old" }, userHome).homeDir, "new");
  assert.equal(loadConfig({ READING_LIST_MCP_HOME: "old" }, userHome).homeDir, "old");
  assert.ok(loadConfig({ CHROME_TOOLBOX_MCP_EXTENSION_IDS: "new", READING_LIST_MCP_EXTENSION_IDS: "old" }, userHome).allowedExtensionIds.includes("new"));
});

test("QA14 doctor reports new name and current capabilities", async (t) => {
  const homeDir = mkdtempSync(join(tmpdir(), "toolbox-doctor-"));
  const bridge = new Bridge({ port: 0, homeDir, allowedExtensionIds: [EXT_ID] });
  await bridge.start();
  t.after(() => bridge.close());
  const port = bridge.wss.address().port;
  const ws = await extension(port, async () => [], ["readingList", "tabs"]);
  t.after(() => ws.terminate());
  const child = spawn(process.execPath, ["src/cli.js", "doctor"], { env: { ...process.env, CHROME_TOOLBOX_MCP_HOME: homeDir, CHROME_TOOLBOX_MCP_PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => child.kill());
  let output = "";
  child.stdout.on("data", (s) => { output += s; });
  child.stderr.on("data", (s) => { output += s; });
  const code = await new Promise((resolve) => child.once("exit", resolve));
  assert.equal(code, 0, output);
  assert.match(output, /chrome-toolbox-mcp/);
  assert.match(output, /capabilities\s*:\s*readingList, tabs/);
});
