import { z } from "zod";

const destination = {
  parentId: z.string().optional(),
  parentPath: z.string().min(1).optional(),
};
const oneParent = (v) => (v.parentId !== undefined) !== (v.parentPath !== undefined);

export function registerBookmarks(register, bridge) {
  register("bookmarks_search", {
    description: "Search bookmarks, including each result's parent folder path.",
    inputSchema: { query: z.string().min(1), limit: z.number().int().min(1).max(500).default(50) },
    annotations: { readOnlyHint: true },
  }, (args) => bridge.call("bookmarks.search", args));
  register("bookmarks_add", {
    description: "Add a bookmark (or folder when url is omitted). Choose parentId or parentPath; missing path folders are created. parentPath must start with an existing root folder name in Chrome's UI language.",
    inputSchema: z.object({ title: z.string(), url: z.string().url().optional(), ...destination }).refine(oneParent, "choose exactly one of parentId or parentPath"),
  }, (args) => bridge.call("bookmarks.add", args));
  register("bookmarks_move", {
    description: "Move a bookmark or folder to parentId or parentPath, optionally at index. parentPath must start with an existing root folder name in Chrome's UI language.",
    inputSchema: z.object({ id: z.string(), ...destination, index: z.number().int().min(0).optional() }).refine(oneParent, "choose exactly one of parentId or parentPath"),
  }, (args) => bridge.call("bookmarks.move", args));
}
