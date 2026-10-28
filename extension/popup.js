import { CAPABILITIES, changeCapability } from "./capabilities.js";

const error = document.querySelector("#error");
const controls = new Map();
const busy = new Set();
for (const cap of CAPABILITIES) {
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = cap.id;
  input.disabled = true;
  const text = document.createElement("span");
  const title = document.createElement("strong");
  title.textContent = cap.name;
  const description = document.createElement("span");
  description.className = "description";
  description.textContent = cap.description;
  const permission = document.createElement("span");
  permission.className = "permission";
  text.append(title, description, permission);
  label.append(input, text);
  document.querySelector("#capabilities").append(label);
  controls.set(cap.id, { input, permission });
  input.addEventListener("change", () => {
    const checked = input.checked;
    busy.add(cap.id);
    input.disabled = true;
    error.textContent = "";
    changeCapability(chrome, cap.id, checked).then((enabled) => {
      if (checked && !enabled) error.textContent = "未获浏览器授权，能力保持关闭。";
    }).catch((err) => { error.textContent = `无法更新能力：${err.message}。请重新打开面板重试。`; })
      .finally(() => { busy.delete(cap.id); return refresh().catch(showError); });
  });
}
function showError(err) { error.textContent = `无法读取状态：${err.message}`; }
async function refresh() {
  const { enabled = ["readingList"], connectionStatus } = await chrome.storage.local.get(["enabled", "connectionStatus"]);
  const connection = document.querySelector("#connection");
  connection.textContent = connectionStatus === "connected" ? "已连接本地服务" : "等待本地服务连接";
  connection.dataset.connected = String(connectionStatus === "connected");
  for (const cap of CAPABILITIES) {
    const { input, permission } = controls.get(cap.id);
    const granted = await chrome.permissions.contains({ permissions: cap.permissions });
    input.checked = enabled.includes(cap.id) && granted;
    input.disabled = busy.has(cap.id);
    permission.textContent = cap.id === "readingList" ? "安装时授权，开关只控制助手访问" : granted ? "浏览器已授权" : "未授权，勾选时申请";
  }
}
chrome.storage.onChanged.addListener(() => refresh().catch(showError));
refresh().catch(showError);
