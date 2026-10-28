import { EventEmitter } from "node:events";
import { readFileSync, writeFileSync, renameSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ensureHome } from "./config.js";

export const CAPABILITY_TOOLS = {
  readingList: ["reading_list_list", "reading_list_add", "reading_list_update", "reading_list_remove", "reading_list_restore", "reading_list_export"],
  tabs: ["tabs_list", "tabs_open", "tabs_move", "tab_groups_list", "tab_groups_update", "tabs_close"],
  bookmarks: ["bookmarks_search", "bookmarks_add", "bookmarks_move"],
  history: ["history_search"],
};

export class CapabilityState extends EventEmitter {
  constructor(homeDir) {
    super();
    this.homeDir = homeDir;
    this.file = join(homeDir, "capabilities.json");
    this.reload();
  }
  reload() {
    let enabled;
    try { enabled = JSON.parse(readFileSync(this.file, "utf8")).enabled; }
    catch (err) { if (err.code !== "ENOENT") throw err; enabled = ["readingList"]; }
    this.set(enabled, false);
  }
  set(enabled, persist = true) {
    if (!Array.isArray(enabled) || enabled.some((id) => !Object.hasOwn(CAPABILITY_TOOLS, id))) throw new Error("invalid capability list");
    const next = Object.keys(CAPABILITY_TOOLS).filter((id) => enabled.includes(id));
    if (persist) {
      ensureHome(this.homeDir);
      const temp = `${this.file}.${randomUUID()}.tmp`;
      writeFileSync(temp, JSON.stringify({ enabled: next, updatedAt: new Date().toISOString() }, null, 2), { mode: 0o600, flag: "wx" });
      renameSync(temp, this.file);
      chmodSync(this.file, 0o600);
    }
    const changed = JSON.stringify(next) !== JSON.stringify(this.enabled);
    this.enabled = next;
    if (changed) this.emit("change", [...next]);
  }
}
