// Local-only bridge. Capability state in storage controls every browser call.
import { createCapabilityController } from "./capabilities.js";
import { createDispatcher } from "./dispatch.js";

const PORT = 17893;
const URL_ = `ws://127.0.0.1:${PORT}`;
const PING_MS = 20_000; // keeps the service worker alive while connected
const RETRY_MS = 3_000; // retry while the service worker is awake

let ws = null;
let pingTimer = null;
let retryTimer = null;

const capabilities = createCapabilityController(chrome, (enabled) => {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "capabilities", enabled }));
});
const dispatch = createDispatcher(chrome, capabilities);

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  const socket = new WebSocket(URL_);
  ws = socket;
  socket.onopen = async () => {
    await capabilities.ready;
    if (socket.readyState !== WebSocket.OPEN) return;
    setStatus("connected");
    socket.send(JSON.stringify({ type: "hello", role: "extension", version: chrome.runtime.getManifest().version, capabilities: capabilities.enabled }));
    socket.send(JSON.stringify({ type: "capabilities", enabled: capabilities.enabled }));
    clearInterval(pingTimer);
    pingTimer = setInterval(() => socket.readyState === WebSocket.OPEN && socket.send('{"type":"ping"}'), PING_MS);
  };
  socket.onmessage = async (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (!msg.id || !msg.method) return;
    try {
      const result = await dispatch(msg.method, msg.params || {});
      socket.send(JSON.stringify({ id: msg.id, result: result ?? null }));
    } catch (err) {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ id: msg.id, error: String(err?.message || err) }));
    }
  };
  socket.onclose = () => {
    clearInterval(pingTimer);
    if (ws === socket) ws = null;
    setStatus("waiting");
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, RETRY_MS);
  };
  socket.onerror = () => {}; // onclose follows and schedules the retry
}

function setStatus(state) {
  chrome.action.setBadgeText({ text: state === "connected" ? "" : "..." });
  chrome.storage.local.set({ connectionStatus: state }).catch((err) => console.error("Chrome Toolbox status update failed", err));
  chrome.action.setTitle({
    title: state === "connected" ? "Chrome Toolbox: connected" : "Chrome Toolbox: waiting for your AI client",
  });
}

// Chrome stops an idle service worker after ~30 s, which also stops the retry
// timer. The alarm (30 s is the shortest period allowed) wakes it back up.
chrome.alarms.create("reconnect", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => alarm.name === "reconnect" && connect());
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (sender.id !== chrome.runtime.id || msg.type !== "setCapability") return;
  capabilities.setEnabled(msg.id, msg.checked).then(
    () => respond({ enabled: capabilities.enabled }),
    (err) => respond({ error: err.message }),
  );
  return true;
});
capabilities.ready.then(connect).catch((err) => console.error("Chrome Toolbox startup failed", err));
