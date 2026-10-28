# Chrome Toolbox MCP

[English](README.md)

让 AI 助手整理 Chrome 阅读清单、标签页与标签组、书签，或只读搜索浏览历史。一个插件、一个本地 MCP 服务，每项能力一个开关。**新安装和旧版升级默认只开阅读清单。**

支持 Claude Desktop、Claude Code、Cursor、Codex、opencode、Kilo 等 MCP 客户端。

## 安装

需要 Chrome 120+ 与 Node.js 18+。

1. 从[最新发布](https://github.com/ZhenningLang/chrome-toolbox-mcp/releases/latest)下载并解压 `extension.zip`，也可使用仓库里的 `extension` 目录。
2. 打开 `chrome://extensions`，开启开发者模式，点「加载已解压的扩展程序」，选择 `extension` 文件夹。
3. 给 AI 客户端添加 MCP 服务并重启客户端。

**Claude Code**：

```bash
claude mcp add -s user chrome-toolbox -- npx -y github:ZhenningLang/chrome-toolbox-mcp
```

**Claude Desktop / Cursor** 的 MCP 配置：

```json
{
  "mcpServers": {
    "chrome-toolbox": { "command": "npx", "args": ["-y", "github:ZhenningLang/chrome-toolbox-mcp"] }
  }
}
```

**Codex** 的 `~/.codex/config.toml`：

```toml
[mcp_servers.chrome-toolbox]
command = "npx"
args = ["-y", "github:ZhenningLang/chrome-toolbox-mcp"]
```

**opencode** 的 `~/.config/opencode/opencode.json` 或 **Kilo** 的 `~/.config/kilo/kilo.json`：

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

检查配置、能力清单与连接：

```bash
npx -y github:ZhenningLang/chrome-toolbox-mcp doctor
```

`doctor` 显示配置目录、端口、当前能力和阅读清单连接检查。阅读清单关闭时会明确跳过该项检查，不会越过开关访问。

## 能力开关

点击工具栏的 **Chrome Toolbox** 图标。面板顶部显示本地连接状态，下面四个勾选框各有说明和权限状态。

| 能力 | 默认 | 权限 |
|---|---|---|
| 阅读清单 | 开 | 安装时已有，开关只管助手访问，不申请或交还权限 |
| 标签页与标签组 | 关 | 勾选时申请 `tabs`、`tabGroups` |
| 书签 | 关 | 勾选时申请 `bookmarks` |
| 历史记录 | 关 | 勾选时申请 `history`，工具只读 |

拒绝 Chrome 授权框，开关弹回关闭。取消勾选可选能力，会交还对应权限。状态保存在本机；插件启动时会把已保存的勾选与当前实际权限对账，权限已撤销的能力自动关闭。服务端只列出已启用工具，插件端还会独立拦截未勾选或权限缺失的调用。

部分 MCP 客户端在会话中途不刷新工具列表。**勾选后看不到新工具时，新开助手会话。** 取消勾选仍会在插件端立即拒绝调用。如果你使用带 `--static-catalogue` 的 MCP 懒加载包装器，应从其配置移除该参数以支持动态通知；本项目不会自动修改客户端配置。

## 工具清单

| 能力 | 工具 |
|---|---|
| 阅读清单 | `reading_list_list`、`reading_list_add`、`reading_list_update`、`reading_list_remove`、`reading_list_restore`、`reading_list_export` |
| 标签页与标签组 | `tabs_list`、`tabs_open`、`tabs_move`、`tab_groups_list`、`tab_groups_update`、`tabs_close` |
| 书签 | `bookmarks_search`、`bookmarks_add`、`bookmarks_move` |
| 历史记录 | `history_search` |

六个阅读清单工具的名字、参数、返回结构保持原样：列表可按已读状态、关键词筛选和分页；添加跳过已有网址；删除前备份全清单；恢复只补缺失条目；导出支持 Markdown、JSON、CSV。

`tabs_open` 直接打开 1–100 个网址，默认后台打开。传 `group:{"title":"写作","collapsed":true}` 可放进已收起的新分组。`tabs_move` 接收 1–500 个标签页 ID，目标在 `groupId`、`newGroup`、`ungroup:true` 中恰选一个。分组名最长 80 字，颜色限 grey、blue、red、yellow、green、pink、purple、cyan、orange。

`tabs_close` 接收 1–500 个标签页 ID，先把标题、网址和分组信息写入 `~/.chrome-toolbox-mcp/backups/tabs-*.json`，成功后才关闭；写盘失败一个都不关。返回 `backupPath` 和关闭数。将 `backupPath` 传给 `tabs_open` 可重开，附带 `urls` 可只恢复备份里指定的网址，有名字的分组会重建。它不是完整浏览器会话快照，不恢复表单状态、前进后退历史或原标签页 ID。

备份保留加载中的导航目标。任一选中标签页没有可恢复网址，整批拒绝关闭，所有选中标签页保持打开。已有分组恢复时不追施新建组名的 80 字限制。打开或恢复批次不保证事务性：Chrome 拒绝某个网址时，已经新建的标签页会保留。

`bookmarks_search` 返回父文件夹路径，默认最多 50 条，上限 500。添加或移动时 `parentId` 与 `parentPath` 恰选一个；路径不存在会逐级建文件夹。添加时不传 `url` 就是建文件夹。没有书签删除工具。

`parentPath` 第一段必须是 Chrome 当前界面语言下已存在的根文件夹名，例如中文的「书签栏」、英文的 `Bookmarks bar`。也可直接使用搜索结果里的 `parentId`。

`history_search` 的起止时间接受带 `Z` 或 UTC 偏移（如 `+08:00`）的 ISO 8601 日期时间，或毫秒时间戳；纯日期和不带时区的本地时间会被拒绝。起点默认 24 小时前，关键词默认空串，条数默认 100、上限 1000。没有历史删除工具。

## 安全与边界

- 插件与服务只走本机 `127.0.0.1:17893`；服务校验固定扩展来源，网页不能冒充。其它本地 MCP 进程须持有仅本人可读的 token。
- 助手会看到你开放能力里的数据。本地传输不代表助手不会把结果发给它的模型服务商，仍受客户端自己的隐私策略约束。
- 阅读清单删除、标签页关闭前均写仅本人可读的备份；备份可能含私密标题和网址。
- 多个 MCP 客户端共用 hub，能力变化、重连、hub 接管后都同步清单。
- 不读取网页正文、不点击或截图，不删书签和历史，也不管理 Chrome 的「已保存标签组」。

## 从旧名迁移

旧包名为 `chrome-reading-list-mcp`，旧插件名为 **Reading List MCP**。原位置更新并重新加载插件，将客户端命令改为 `npx -y github:ZhenningLang/chrome-toolbox-mcp`。扩展 ID 与端口不变；新旧插件和服务混用时，阅读清单仍兼容。

新默认目录不存在时，服务把 `~/.chrome-reading-list-mcp` 整体改名为 `~/.chrome-toolbox-mcp`，保留 token、备份、导出。显式指定 HOME 时不迁移；两个目录都已存在时，不合并、不覆盖。

新变量为 `CHROME_TOOLBOX_MCP_HOME`、`CHROME_TOOLBOX_MCP_PORT`、`CHROME_TOOLBOX_MCP_EXTENSION_IDS`。旧 `READING_LIST_MCP_*` 仍可用，新变量优先。为保持公开工具 schema 兼容，阅读清单导出的默认路径说明仍保留旧文案；实际默认导出写入新目录。

GitHub 仓库改名与本机 MCP 配置更新是需 owner 单独确认的外部操作，本轮代码不会执行。请使用新安装地址，不依赖旧地址跳转。

## 常见问题

- **插件未连接**：确认 Chrome 开着且插件启用。`...` 徽标表示等待本地 MCP 服务；服务由助手客户端启动。
- **新工具没出现**：查看面板开关与权限，再新开助手会话。
- **端口冲突**：插件固定使用 17893。服务 PORT 变量用于诊断，单改服务变量不会自动改插件端口。

## 开发

```bash
npm install
npm test                  # 单元测试与假插件完整协议往返
npm run test:e2e          # Chrome for Testing，独立临时 profile
```

真实 Chrome 冒烟使用默认端口，先停止其它服务；可用 `CHROME_BIN` 指定 Chrome for Testing。可选权限框和真实 profile 的数据由人工验收检查。

## 许可证

MIT
