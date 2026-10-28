import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
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
  const oldName = /chrome-reading-list-mcp|Reading List MCP/g;
  function files(dir) {
    return readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]);
  }
  const targets = ["package.json", "package-lock.json", ...files("src"), ...files("extension"), ...files("scripts"), ...files(".github")];
  for (const path of targets.filter((p) => /\.(js|json|yml)$/.test(p))) {
    let source = readFileSync(new URL(path, root), "utf8");
    if (path === "src/config.js") source = source.replace('".chrome-reading-list-mcp"', '"legacy-directory"');
    // QA2 freezes this exact public schema description; migration docs explain the retained wording.
    if (path === "src/server.js") source = source.replace("Defaults to ~/.chrome-reading-list-mcp/exports/.", "historical default description");
    assert.equal(source.match(oldName), null, `old name in ${path}`);
  }
  for (const path of ["README.md", "README.zh-CN.md"]) {
    const source = readFileSync(new URL(path, root), "utf8");
    const outsideMigration = source.replace(/## (Migration From The Old Name|从旧名迁移)[\s\S]*?(?=\n## |$)/, "");
    assert.equal(outsideMigration.match(oldName), null, path);
  }
});
