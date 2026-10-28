# Chrome Toolbox MCP

[中文说明](README.zh-CN.md)

Let your AI assistant organize your Chrome reading list, tabs, tab groups and bookmarks, or search history. One Chrome extension, one local MCP server, and a checkbox for each capability.

Works with MCP clients including Claude Desktop, Claude Code, Cursor, Codex, opencode and Kilo. **Only reading list access is enabled by default.**

## Setup

Requires Chrome 120+ and Node.js 18+.

1. Download and unzip `extension.zip` from the [latest release](https://github.com/ZhenningLang/chrome-toolbox-mcp/releases/latest), or use the repository's `extension` directory.
2. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `extension`.
3. Add the local server to your MCP client, then restart the client.

**Claude Code**

```bash
claude mcp add -s user chrome-toolbox -- npx -y github:ZhenningLang/chrome-toolbox-mcp
```

**Claude Desktop / Cursor**: add this to your MCP configuration:

```json
{
  "mcpServers": {
    "chrome-toolbox": { "command": "npx", "args": ["-y", "github:ZhenningLang/chrome-toolbox-mcp"] }
  }
}
```

**Codex** (`~/.codex/config.toml`):

```toml
[mcp_servers.chrome-toolbox]
command = "npx"
args = ["-y", "github:ZhenningLang/chrome-toolbox-mcp"]
```

**opencode** (`~/.config/opencode/opencode.json`) / **Kilo** (`~/.config/kilo/kilo.json`):

```json
{
  "mcp": {
    "chrome-toolbox": {
      "type": "local",
      "command": ["npx", "-y", "github:ZhenningLang/chrome-toolbox-mcp"],
      "enabled": true
    }
  }
}
```

Check the connection and current capabilities:

```bash
npx -y github:ZhenningLang/chrome-toolbox-mcp doctor
```

`doctor` reports the configuration directory, local port, enabled capabilities and reading-list connection check. When reading-list access is off, that check is explicitly skipped rather than accessing a disabled capability.

## Capability Switches

Click the **Chrome Toolbox** toolbar icon. The popup shows connection status, four checkboxes, descriptions and permission status.

| Capability | Default | Browser access |
|---|---|---|
| 阅读清单 / Reading list | On | Required at installation; checkbox controls assistant access only |
| 标签页与标签组 / Tabs and groups | Off | Requests `tabs` and `tabGroups` on click |
| 书签 / Bookmarks | Off | Requests `bookmarks` on click |
| 历史记录 / History | Off | Requests `history` on click, read-only tools |

Declining Chrome's permission prompt leaves the capability off. Unchecking an optional capability also returns its permissions. Changes persist locally; startup reconciles saved switches with permissions still granted by Chrome. The server lists only enabled tools, and the extension independently rejects disabled or revoked capabilities.

Some MCP clients may not refresh tools during a session. **Start a new session after enabling a capability if its tools do not appear.** Disabling access still takes effect immediately in the extension. If a lazy MCP wrapper uses `--static-catalogue`, remove that option from its configuration to allow dynamic tool-list notifications; this project does not edit client configuration automatically.

## Tools

| Capability | Tools |
|---|---|
| Reading list | `reading_list_list`, `reading_list_add`, `reading_list_update`, `reading_list_remove`, `reading_list_restore`, `reading_list_export` |
| Tabs and groups | `tabs_list`, `tabs_open`, `tabs_move`, `tab_groups_list`, `tab_groups_update`, `tabs_close` |
| Bookmarks | `bookmarks_search`, `bookmarks_add`, `bookmarks_move` |
| History | `history_search` |

The six reading-list tool schemas and response shapes are unchanged. List supports status/search/pagination; add skips existing URLs; remove backs up the whole list first; restore re-adds missing entries; export supports Markdown, JSON and CSV.

`tabs_open` opens 1-100 URLs in the background by default. Use `group: {"title":"Writing","collapsed":true}` to create a named, collapsed group. `tabs_move` accepts 1-500 tab IDs and exactly one destination: `groupId`, `newGroup`, or `ungroup:true`. Group colors: grey, blue, red, yellow, green, pink, purple, cyan, orange. Group titles are limited to 80 characters.

`tabs_close` accepts 1-500 tab IDs and saves titles, URLs and group metadata in `~/.chrome-toolbox-mcp/backups/tabs-*.json` before closing anything. A failed backup closes nothing. Reopen using `tabs_open` with `backupPath`; optional `urls` filters entries in that backup. Named groups are recreated, but a backup is not a full browser-session snapshot: form state, navigation stacks and original tab IDs are not restored.

`bookmarks_search` includes parent folder paths and defaults to 50 results (maximum 500). Add/move accepts exactly one of `parentId` or `parentPath`; missing path folders are created progressively. Omitting `url` when adding creates a folder. There is no bookmark deletion tool.

`history_search` accepts ISO 8601 or epoch-millisecond start/end times. Start defaults to 24 hours ago, text to all entries, and maxResults to 100 (maximum 1000). History tools are read-only.

## Safety

- Browser-to-server traffic stays on `127.0.0.1:17893`. The server accepts the fixed extension Origin; websites cannot use the bridge. Additional local clients authenticate with an owner-only token.
- Your AI client receives the data you enable, so its own provider/data policies still apply. Local transport does not mean an AI client cannot send results to its model provider.
- Reading-list removal and tab closure write owner-only backups before destructive calls. Backups may contain private titles and URLs.
- Multiple MCP processes share one extension through a hub; capability changes propagate to peers, including after reconnection and hub takeover.
- No page-content reading, clicking, screenshots, bookmark deletion, history deletion or saved-tab-group management.

## Migration From The Old Name

The package was previously `chrome-reading-list-mcp`, and the extension was **Reading List MCP**. Update the unpacked extension in place and change client commands to `npx -y github:ZhenningLang/chrome-toolbox-mcp`. The fixed extension ID and port are unchanged; reading-list calls work with mixed old/new versions.

When the new default directory does not exist, the server renames `~/.chrome-reading-list-mcp` to `~/.chrome-toolbox-mcp`, preserving the token, backups and exports. Explicit HOME overrides are not migrated. If both directories already exist, neither is merged or overwritten.

Use `CHROME_TOOLBOX_MCP_HOME`, `CHROME_TOOLBOX_MCP_PORT` and `CHROME_TOOLBOX_MCP_EXTENSION_IDS` for new configuration. Legacy `READING_LIST_MCP_*` variables remain supported, with new variables taking priority. The frozen reading-list export schema retains its historical default-path description for compatibility; actual default exports use the new directory.

The new install address is the supported address. This code does not rename the GitHub repository or edit your client configuration; those are separate owner-approved operations. Do not rely on redirects from the old install address.

## Troubleshooting

- **Extension not connected**: keep Chrome open and the unpacked extension enabled. The `...` badge means it is waiting for the MCP server. The AI client starts the server.
- **Tool missing**: check the popup, grant the requested permissions, and start a new assistant session if needed.
- **Port conflict**: the extension uses 17893. Server PORT overrides are for diagnostics; changing the server alone does not change the extension's port.

## Development

```bash
npm install
npm test                  # unit and fake-extension protocol tests
npm run test:e2e          # real Chrome for Testing, throwaway profile
```

Real Chrome smoke tests use the default port. Stop other copies before running them; set `CHROME_BIN` if Chrome for Testing is installed elsewhere. Optional permission dialogs and real-profile data require manual acceptance testing.

## License

MIT
