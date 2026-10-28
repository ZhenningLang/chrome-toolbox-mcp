import { z } from "zod";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ensureHome } from "./config.js";

const tabIds = z.array(z.number().int()).min(1).max(500);
const groupShape = {
  title: z.string().max(80).optional(),
  color: z.enum(["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"]).optional(),
  collapsed: z.boolean().optional(),
};
const group = z.object(groupShape);
const urlList = z.array(z.string().url()).min(1).max(100);

export function registerTabs(register, bridge) {
  register("tabs_list", { description: "List tabs and groups by window.", inputSchema: { windowId: z.number().int().optional() }, annotations: { readOnlyHint: true } },
    (args) => bridge.call("tabs.list", args));
  register("tabs_open", {
    description: "Open 1-100 URLs, or restore a tabs_close backup (urls optionally filters the backup). Named groups are recreated.",
    inputSchema: z.object({ urls: urlList.optional(), backupPath: z.string().optional(), group: group.optional(), active: z.boolean().default(false), windowId: z.number().int().optional() })
      .refine((v) => v.backupPath !== undefined || v.urls !== undefined, "provide urls or backupPath"),
  }, async ({ backupPath, urls, ...options }) => {
    if (backupPath === undefined) return bridge.call("tabs.open", { urls, ...options });
    const backup = JSON.parse(readFileSync(backupPath, "utf8"));
    const entries = z.array(z.object({ url: z.string().url(), group: group.extend({ id: z.number().int(), windowId: z.number().int() }).nullable().optional() })).max(500).parse(backup.tabs);
    const wanted = urls ? new Set(urls) : null;
    return bridge.call("tabs.open", { entries: entries.filter((t) => !wanted || wanted.has(t.url)), ...options });
  });
  register("tabs_move", {
    description: "Move tabs into an existing group, a new group, or out of groups. Choose exactly one destination.",
    inputSchema: z.object({ tabIds, groupId: z.number().int().optional(), newGroup: group.optional(), ungroup: z.literal(true).optional() })
      .refine((v) => [v.groupId, v.newGroup, v.ungroup].filter((x) => x !== undefined).length === 1, "choose exactly one of groupId, newGroup, ungroup"),
  }, (args) => bridge.call("tabs.move", args));
  register("tab_groups_list", { description: "List tab groups with their tab counts.", inputSchema: { windowId: z.number().int().optional() }, annotations: { readOnlyHint: true } },
    (args) => bridge.call("tabGroups.list", args));
  register("tab_groups_update", {
    description: "Rename, recolor or collapse a tab group.",
    inputSchema: z.object({ groupId: z.number().int(), ...groupShape }).refine((v) => Object.keys(groupShape).some((key) => v[key] !== undefined), "provide title, color or collapsed"),
  }, (args) => bridge.call("tabGroups.update", args));
  register("tabs_close", {
    description: "Close tabs only after saving a private backup of their titles, URLs and groups. Returns backupPath and closed count.",
    inputSchema: { tabIds }, annotations: { destructiveHint: true },
  }, async ({ tabIds }) => {
    const ids = [...new Set(tabIds)];
    const tabs = await bridge.call("tabs.snapshot", { tabIds: ids });
    ensureHome(bridge.homeDir);
    const backupPath = join(bridge.homeDir, "backups", `tabs-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.json`);
    writeFileSync(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), count: tabs.length, tabs }, null, 2), { mode: 0o600, flag: "wx" });
    const result = await bridge.call("tabs.close", { tabIds: ids });
    return { backupPath, closed: result.closed };
  });
}
