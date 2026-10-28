export const CAPABILITIES = [
  { id: "readingList", name: "阅读清单", description: "读取、添加和整理阅读清单，删除前备份。", permissions: ["readingList"], prefix: ["readingList."] },
  { id: "tabs", name: "标签页与标签组", description: "查看、打开、分组标签页，关闭前备份。", permissions: ["tabs", "tabGroups"], prefix: ["tabs.", "tabGroups."] },
  { id: "bookmarks", name: "书签", description: "搜索、添加和移动书签，不提供删除。", permissions: ["bookmarks"], prefix: ["bookmarks."] },
  { id: "history", name: "历史记录", description: "只读搜索浏览历史。", permissions: ["history"], prefix: ["history."] },
];

// Called directly from a popup click, before yielding the user gesture.
export function changeCapability(chrome, id, checked) {
  const cap = CAPABILITIES.find((c) => c.id === id);
  if (!cap) return Promise.reject(new Error(`unknown capability ${id}`));
  const grant = checked && id !== "readingList"
    ? chrome.permissions.request({ permissions: cap.permissions }) : Promise.resolve(true);
  return grant.then(async (allowed) => {
    const response = await chrome.runtime.sendMessage({ type: "setCapability", id, checked: checked && allowed });
    if (response.error) throw new Error(response.error);
    if (!checked && id !== "readingList") await chrome.permissions.remove({ permissions: cap.permissions });
    return response.enabled.includes(id);
  });
}

export function createCapabilityController(chrome, onChange = () => {}) {
  let enabled = [];
  let writes = Promise.resolve();
  function publish() {
    const snapshot = [...enabled];
    writes = writes.then(async () => {
      await chrome.storage.local.set({ enabled: snapshot });
      onChange(snapshot);
    });
    return writes;
  }
  const state = {
    get enabled() { return [...enabled]; },
    ready: null,
    async reconcile() {
      const { enabled: saved = ["readingList"] } = await chrome.storage.local.get("enabled");
      const valid = await Promise.all(CAPABILITIES.map(async (cap) =>
        Array.isArray(saved) && saved.includes(cap.id) && await chrome.permissions.contains({ permissions: cap.permissions }) ? cap.id : null));
      enabled = valid.filter(Boolean);
      await publish();
      return state.enabled;
    },
    async setEnabled(id, checked) {
      await state.ready;
      const cap = CAPABILITIES.find((c) => c.id === id);
      if (!cap) throw new Error(`unknown capability ${id}`);
      if (checked && !await chrome.permissions.contains({ permissions: cap.permissions })) checked = false;
      enabled = CAPABILITIES.filter((c) => c.id === id ? checked : enabled.includes(c.id)).map((c) => c.id);
      await publish();
      return checked;
    },
    async allows(id) {
      await state.ready;
      const cap = CAPABILITIES.find((c) => c.id === id);
      if (!cap || !enabled.includes(id)) return false;
      if (await chrome.permissions.contains({ permissions: cap.permissions })) return enabled.includes(id);
      await state.setEnabled(id, false);
      return false;
    },
  };
  chrome.permissions.onRemoved.addListener(({ permissions = [] }) => {
    enabled = enabled.filter((id) => !CAPABILITIES.find((c) => c.id === id).permissions.some((p) => permissions.includes(p)));
    publish().catch((err) => console.error("Chrome Toolbox permission update failed", err));
  });
  state.ready = state.reconcile();
  return state;
}
