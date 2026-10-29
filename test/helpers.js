import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { WebSocket } from "ws";
import { createServer } from "../src/server.js";
import { ReadingList } from "../src/readingList.js";

export const EXT_ID = "ccclijbaodgdphbciifmfgnihbadlloj";
export async function mcp(bridge, homeDir) {
  const server = createServer(new ReadingList(bridge, { homeDir }), { version: "test" });
  const client = new Client({ name: "test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  return { client, server, call: async (name, args = {}) => client.callTool({ name, arguments: args }) };
}
export async function extension(port, dispatch = async () => [], capabilities) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { origin: `chrome-extension://${EXT_ID}` });
  ws.on("message", async (raw) => {
    const msg = JSON.parse(String(raw));
    if (!msg.id) return;
    try { ws.send(JSON.stringify({ id: msg.id, result: (await dispatch(msg.method, msg.params)) ?? null })); }
    catch (err) { ws.send(JSON.stringify({ id: msg.id, error: err.message })); }
  });
  await new Promise((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
  ws.send(JSON.stringify({ type: "hello", role: "extension", ...(capabilities && { capabilities }) }));
  return ws;
}
export async function until(fn) {
  const start = Date.now();
  while (!await fn()) {
    if (Date.now() - start > 1900) throw new Error("condition not reached within 2 seconds");
    await new Promise((r) => setTimeout(r, 10));
  }
}
