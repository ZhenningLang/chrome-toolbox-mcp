import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CAPABILITIES } from "../extension/capabilities.js";
import { CAPABILITY_TOOLS } from "../src/capabilityState.js";

const root = new URL("../", import.meta.url);
const digest = (value) => createHash("sha256").update(value).digest("hex");

test("QA1 original nine bridge tests are unchanged from 84d39f4", () => {
  const source = readFileSync(new URL("test/bridge.test.js", root), "utf8").replaceAll("\r\n", "\n");
  assert.equal(digest(source), "aba5f6d830f9b88d68164ffd35b8bb293a1725eaf7c34d2dabe27fa4ccb3a557");
});

test("QA15 manifest key identity, required/optional permission boundaries and popup", () => {
  const manifest = JSON.parse(readFileSync(new URL("extension/manifest.json", root)));
  assert.equal(digest(manifest.key), "34248e8f10af77b4a4ff7e9d4e2d04d3ca2f5b7eb0763e53e5f11f3c40ff7293");
  assert.deepEqual([...manifest.permissions].sort(), ["alarms", "readingList", "storage"]);
  assert.deepEqual([...manifest.optional_permissions].sort(), ["bookmarks", "history", "tabGroups", "tabs"]);
  assert.equal(manifest.action.default_popup, "popup.html");
  assert.equal(manifest.name, "Chrome Toolbox");
  assert.deepEqual(CAPABILITIES.map((c) => c.id), Object.keys(CAPABILITY_TOOLS));
  assert.equal(readFileSync(new URL("extension/popup.html", root), "utf8").includes('type="module" src="popup.js"'), true);
});

test("QA16 rename audit excludes only explicit migration and frozen compatibility text", () => {
  const fixturePath = "test/fixtures/reading-tools.json";
  const fixture = JSON.parse(readFileSync(new URL(fixturePath, root)));
  const legacyDescription = fixture.find((tool) => tool.name === "reading_list_export").inputSchema.properties.path.description;
  const legacyDir = legacyDescription.split("Defaults to ~/")[1].split("/")[0];
  // Derive the historical package name from the frozen schema; assembling the
  // display-name needle lets this test audit its own source without an exemption.
  const oldNames = [legacyDir.slice(1), ["Reading", "List", "MCP"].join(" ")];
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  assert.ok(tracked.includes("test/config.test.js"));
  assert.ok(tracked.includes("LICENSE"));
  for (const path of tracked) {
    if (path.startsWith("docs/specs/")) continue;
    let source = readFileSync(join(fileURLToPath(root), path));
    if (path === fixturePath) {
      const archived = JSON.parse(source.toString("utf8"));
      // Only the frozen export-path field is exempt, not arbitrary fixture text.
      delete archived.find((tool) => tool.name === "reading_list_export").inputSchema.properties.path.description;
      source = Buffer.from(JSON.stringify(archived));
    } else if (path === "src/config.js") {
      source = Buffer.from(source.toString("utf8").replace(JSON.stringify(legacyDir), '"legacy-directory"'));
    } else if (path === "src/server.js") {
      source = Buffer.from(source.toString("utf8").replace(JSON.stringify(legacyDescription), '"historical default description"'));
    } else if (["README.md", "README.zh-CN.md"].includes(path)) {
      source = Buffer.from(source.toString("utf8").replace(/## (Migration From The Old Name|从旧名迁移)[\s\S]*?(?=\n## |$)/, ""));
    }
    for (const oldName of oldNames) assert.equal(source.includes(Buffer.from(oldName)), false, `old name in ${path}`);
  }
});
