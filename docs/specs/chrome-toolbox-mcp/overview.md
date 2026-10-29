Audience:   P3 实现 agent
Scope:      把阅读清单 MCP 扩成通用的 Chrome MCP（chrome-toolbox-mcp）：一个插件 + 一个本地服务，按能力勾选，勾了才暴露 / Non-scope: 页面内容读取、点击、截图等网页自动化；Chrome 应用商店上架；npm 发布
State:      approved
Genre:      G-SPEC
Code-Root:  /Users/zhenninglang/Projects/chrome-reading-list-mcp
Prefixes:   U-DEC, U-BEH, U-GATE, U-SPK, U-ACC, U-NG, U-DEP, U-CTR, U-DIAG

# chrome-toolbox-mcp · G-SPEC 机器版 spec

Planned at: 84d39f4 · 2026-10-29

## 术语表

- U-DEC: 待决策
- U-BEH: 有意行为变化
- U-GATE: 不可逆动作（单向门）
- U-SPK: 翻车假设与 spike
- U-ACC: 验收承诺
- U-NG: non-goals
- U-DEP: 新增依赖
- U-CTR: 既有契约与回归红线
- U-DIAG: 根因与现状诊断
- 能力（capability）：插件弹窗里一个可勾选的开关，对应一组 MCP 工具和一组 Chrome 权限。首批四个：`readingList`、`tabs`、`bookmarks`、`history`。
- 能力清单：插件当前勾选的能力集合，SSOT 在插件的 `chrome.storage.local`。

## TL;DR

在现有「服务 ⇄ WebSocket ⇄ 插件」骨架上加一层能力开关：插件弹窗勾选能力（勾选时按需申请 Chrome 权限），把能力清单推给服务；服务按清单启用或停用工具并发 `tools/list_changed`；插件对未勾选能力的调用一律拒绝。首批能力：阅读清单（迁移）、标签页与标签组、书签、历史记录。仓库与包改名 `chrome-toolbox-mcp`。

## 现状诊断

[U-DIAG-1|3937] 现有服务只认阅读清单：插件 handler 表写死四个阅读清单方法（extension/background.js:14），服务启动即注册六个 `reading_list_*` 工具（src/server.js:17），没有任何开关；manifest 的 `permissions` 静态写死 `readingList`。要加能力只能改代码并重新加载插件，无法按需暴露。

[U-DIAG-2|0d06] 用户的 MCP 启动经 `~/.dotfiles/scripts/mcp_lazy.py --static-catalogue`。带这个参数时它把 `tools/list` 结果缓存 24 小时；不带时，若服务在 initialize 里声明 `tools.listChanged: true`，它不缓存、保持透明，并在收到 `notifications/tools/list_changed` 时清缓存（mcp_lazy.py 的 `save_cache` 与 `read_backend`）。MCP SDK 1.32.2 的 `McpServer` 默认声明 `listChanged: true`，`RegisteredTool.enable()/disable()` 会自动发 `tools/list_changed`。

## 已锁定

- 走 `/dev-complete`；新名 `chrome-toolbox-mcp`（npm 与 GitHub 均未占用，2026-10-29 查 registry.npmjs.org 与 api.github.com 均 404）。
- 不勾选的能力：服务端工具列表不出现 + 插件端拒绝执行，两道都做，以插件为准。
- 首批能力四个，范围见「能力与工具」节。
- 现有阅读清单工具名、参数、返回形状不变（[U-CTR-1|d8e3]）。
- 插件 manifest 的 `key` 不变，扩展 ID 不变（[U-CTR-2|26d5]）。

## 待决策

[U-DEC-1|abc9] GitHub 仓库改名方式：在原仓库上改名（GitHub 自动把旧地址跳转到新地址，星标与历史保留），还是新建仓库、旧仓库归档。改名是外部可见动作，执行前过 `/guard-gitops`。 裁决（2026-10-29）：在原仓库上直接改名。

[U-DEC-2|5fe2] 首次装上新版插件时默认勾选哪些能力：只勾阅读清单（保持现有行为，其余等用户自己开），还是四个全勾。 裁决（2026-10-29）：默认只开阅读清单。

[U-DEC-3|4b6e] 标签页能力是否包含「关闭标签页」：包含（关闭前把标题和网址写进备份文件，可按备份重新打开），还是首批只读加分组、不提供关闭。 裁决（2026-10-29）：能关，关之前先存备份（tabs_close 进首批）。

## 边界

[U-NG-1|44a4] 不做页面内容读取、点击、填表、截图这类网页自动化；那是 Chrome DevTools MCP 与 hangwin/mcp-chrome 已经覆盖的领域。

[U-NG-2|4808] 不做历史记录删除、书签删除；历史只读搜索，书签只做搜索、添加、移动。

[U-NG-3|b605] 不上架 Chrome 应用商店、不发布 npm；继续用「加载已解压的扩展程序」和 `npx github:` 安装。

[U-NG-4|c9f6] 不做 Chrome「已保存标签组」的保存或删除：`chrome.tabGroups` 没有对应 API，收起分组用 `collapsed: true` 代替。

## 能力与工具

能力和工具一一列在这里，实现 agent 不得增减。工具参数用 zod 声明，风格照抄 src/server.js:17 起的现有写法。

| 能力 | Chrome 权限 | 工具 |
|---|---|---|
| `readingList` 阅读清单 | `readingList`（安装时必需权限） | `reading_list_list` `reading_list_add` `reading_list_update` `reading_list_remove` `reading_list_restore` `reading_list_export`（全部原样迁移） |
| `tabs` 标签页与标签组 | `tabs` `tabGroups` | `tabs_list` `tabs_open` `tabs_move` `tab_groups_list` `tab_groups_update` `tabs_close` |
| `bookmarks` 书签 | `bookmarks` | `bookmarks_search` `bookmarks_add` `bookmarks_move` |
| `history` 历史记录 | `history` | `history_search` |

[U-BEH-1|5e08] 新增标签页工具的语义与参数边界（zod 写死）：`tabs_list`（可选 `windowId`）返回每个窗口的标签页（id、windowId、index、title、url、groupId、pinned、active、lastAccessed）和该窗口的分组；`tabs_open` 收 `urls`（1–100 个合法网址，超过直接报错、不截断、一个都不开）或 `backupPath`（加可选 `urls` 过滤，按备份重开、原分组名非空时重建同名分组），二者恰选其一；可选 `group: {title(≤80 字), color, collapsed}` 把新开的标签页放进一个新分组，可选 `active`（默认 false，后台打开）、`windowId`；`tabs_move` 收 `tabIds`（1–500）和三选一的目标：`groupId`（进已有分组）、`newGroup: {title, color, collapsed}`（进新分组）、`ungroup: true`（移出分组，`chrome.tabs.ungroup`）；`tab_groups_list`（可选 `windowId`）列出分组（id、title、color、collapsed、windowId、标签页数）；`tab_groups_update` 收 `groupId` 与至少一项 `title`/`color`/`collapsed`；`color` 只接受 Chrome 的九色枚举 grey/blue/red/yellow/green/pink/purple/cyan/orange。`tabs_close` 收 `tabIds`（1–500），先把每个标签页的标题、网址、所在分组名与颜色写进 `<home>/backups/tabs-<时间>.json`（0600，照抄 src/readingList.js:77 的备份写法）且写盘成功后才调 `chrome.tabs.remove`；写盘失败则一个都不关、返回错误；返回备份路径与实际关闭数。

[U-BEH-2|9b04] 新增书签与历史工具的语义与参数边界（zod 写死）：`bookmarks_search` 收 `query`（非空）与 `limit`（默认 50，1–500），用 `chrome.bookmarks.search`，返回 id、title、url、parentId 和父文件夹路径（如 `书签栏/写作/导读`）；`bookmarks_add` 收 `title`、可选 `url`（不给就是建文件夹），目标文件夹用 `parentId` 或 `parentPath` 恰选其一，二者都给或都不给报错，`parentPath` 不存在时逐级建文件夹；`bookmarks_move` 收 `id` 与 `parentId`/`parentPath` 恰选其一，可选 `index`；`history_search` 收可选 `text`（默认空串=全部）、可选 `startTime`/`endTime`（ISO 8601 字符串或毫秒时间戳，统一换成毫秒；不给 startTime 时默认 24 小时前，与 `chrome.history.search` 默认一致）、`maxResults`（默认 100，1–1000），返回 url、title、lastVisitTime、visitCount。

[U-BEH-3|47eb] 插件新增弹窗：点工具栏图标弹出能力列表，每项一个勾选框、一句说明、权限状态。`tabs`、`bookmarks`、`history` 三项勾选时在点击回调里调 `chrome.permissions.request` 申请该能力的权限，用户拒绝则勾选框弹回未勾选；取消勾选时调 `chrome.permissions.remove` 交还权限。`readingList` 的权限是安装时必需权限（见 U-SPK-1），它的勾选框只管是否暴露给助手，不申请也不交还权限。首次安装或从旧版升级（`chrome.storage.local` 里没有记录）时默认只勾 `readingList`。插件每次启动先做一次对账：有效清单 = 已存的勾选 ∩ 当前确实持有权限的能力（`chrome.permissions.contains`），对账后的结果写回存储并推送服务。弹窗顶部显示与本地服务的连接状态。页面示意见 approval.md「页面示意」。

[U-BEH-4|b2d6] 能力清单的流转：插件在连上服务时（hello 消息里带 `capabilities`）和每次勾选或权限变化时发 `{type:"capabilities", enabled:[...]}`；hub 进程收到后写入 `<home>/capabilities.json`（权限 0600）并转发给所有 peer；peer 与 hub 握手成功（welcome）后，hub 立即把当前清单推给它一次，之后每次变化再推；peer 断线重连同样重推；peer 升格为 hub 时先读盘。peer 进程启动即连接 hub 订阅清单（不再等到第一次工具调用才连），这样从没调用过浏览器工具的 peer 也能收到变化。每个服务进程据此对工具 `enable()` / `disable()`。服务启动时先读 `capabilities.json` 决定初始工具列表，文件不存在时视为 `["readingList"]`。插件 hello 里没有 capabilities（旧版插件）时也视为 `["readingList"]`。只接受来自插件连接的清单消息，peer 发来的一律忽略。

[U-BEH-5|fee9] 插件端拦截与线上方法名：阅读清单沿用旧方法名 `query`/`add`/`update`/`remove`（新服务照旧发这四个名字，保证新服务配旧插件可用），新插件同时接受旧名与 `readingList.<动作>` 两种写法，二者都归 `readingList` 能力并经过拦截；新能力用 `<能力>.<动作>`（如 `tabs.open`）。插件收到调用时先查有效能力清单，未勾选或权限已缺失则返回错误 `capability "<能力>" is turned off in the Chrome Toolbox popup`，不碰任何 Chrome API。`chrome.permissions.onRemoved` 触发时同步取消勾选、写回存储并推送清单。

[U-BEH-6|6e7b] 改名带来的可见变化：npm 包名、bin、插件名、日志前缀、MCP server name 改为 `chrome-toolbox-mcp`；配置目录默认 `~/.chrome-toolbox-mcp`，环境变量前缀 `CHROME_TOOLBOX_MCP_`。新目录不存在而旧目录 `~/.chrome-reading-list-mcp` 存在时，首次启动把旧目录整体改名为新目录（保留 token 与备份）；旧环境变量 `READING_LIST_MCP_*` 仍被读取，新变量优先。

## 既有契约

[U-CTR-1|d637] 六个 `reading_list_*` 工具的名字、参数、返回形状、删除前写备份的行为不变（src/server.js:17 起；测试 test/bridge.test.js:85）。用户的会话记录与笔记里引用了这些名字。

[U-CTR-2|3967] 扩展 ID `ccclijbaodgdphbciifmfgnihbadlloj` 不变（src/config.js:10），靠 manifest 里的 `key` 字段固定。改 manifest 时不得删改 `key`；否则服务拒绝插件连接（来源白名单校验在 src/bridge.js:117 的调用方）。

[U-CTR-3|d075] 安全边界不变：服务只监听 127.0.0.1；插件连接按 Origin 白名单放行，网页无法伪造；第二个服务进程须出示 0600 token 才能经 hub 转发（src/bridge.js:134）。能力清单消息只接受来自插件连接，peer 发来的一律忽略。

[U-CTR-4|6e35] 端口 17893 不变（src/config.js:6）。新旧版本双向混用时阅读清单照常可用：新服务配旧插件——旧插件 hello 不带清单，服务视为 `["readingList"]`，并用旧方法名 `query/add/update/remove` 调用（U-BEH-5）；旧服务配新插件——旧服务发旧方法名，新插件按 `readingList` 能力受理并拦截，旧服务忽略它不认识的 `capabilities` 消息。两条路径都要有真实调用的自动化测试。

## 新增依赖

[U-DEP-1|4f8c] 无新增 npm 依赖、无新进程、无外部服务。新增的只有插件的弹窗页面（`extension/popup.html` + `popup.js`）和 Chrome 权限（`tabs` `tabGroups` `bookmarks` `history`，均尽量放 `optional_permissions`）。弹窗不用框架，原生 DOM。

## 不可逆动作

[U-GATE-1|8b96] GitHub 仓库改名（或按 U-DEC-1 新建仓库）。旧地址的 `npx -y github:ZhenningLang/chrome-reading-list-mcp` 在改名后靠 GitHub 跳转继续可用 [未验证：npx 走 git 协议时是否跟随仓库改名跳转，见 U-SPK-3]。执行前过 `/guard-gitops`，由 owner 当场确认。

[U-GATE-2|c8fa] 改用户本机 MCP 配置：`~/.claude.json` 里这个服务的启动参数去掉 `--static-catalogue`，并把 npx 地址换成新仓库名；kilo、opencode 的配置同理。改前备份原文件，改后跑 `claude mcp list` 确认连上。属于 harness 配置，改动走 `~/.dotfiles` 的 SSOT（若这些配置由 dotfiles 生成）。

## 翻车假设

[U-SPK-1|f5cb] 假设：`tabs`、`tabGroups`、`bookmarks`、`history` 都能写进 `optional_permissions`。处置：已验证（文档）——Chrome 官方 chrome.permissions 参考页（developer.chrome.com/docs/extensions/reference/api/permissions，2026-10-29 读取）「不能设为可选的权限」只有 debugger、declarativeNetRequest、devtools、geolocation、mdns、proxy、tts、ttsEngine、wallpaper，四个都不在内。`readingList` 不做可选：可选权限只能在用户点击时申请（`chrome.permissions.request` 要求用户手势），而 owner 裁决新插件默认就开阅读清单，所以它留在安装时必需权限里——旧版插件本来就持有它，升级不多弹窗（spec review 2026-10-29 B2）。本机 Chrome 156 上真正弹出授权框，留到人工验收时确认。

[U-SPK-2|3e32] 假设：Claude Code 在会话中途收到 `tools/list_changed` 会刷新工具列表。If 不成立，勾选后要新开会话才看到新工具；能力清单落盘（U-BEH-4）保证下次会话立即生效，插件拦截保证关掉的能力当场失效。spike：起一个最小 MCP 服务，30 秒后 enable 一个工具，在 Claude Code 里观察；时间盒 30 分钟。处置：接受风险——不阻塞实现，结论写进 README。

[U-SPK-3|ea6f] 假设：仓库改名后，`npx -y github:ZhenningLang/chrome-reading-list-mcp` 仍能拉到新仓库。If 不成立，旧配置的用户（主要是本人的几台机器）启动失败，需要手改配置。处置：接受风险——改名当天同步改本机配置（U-GATE-2），README 写清新地址。

## 场景化推演

| Scenario | Actor / Context | Step-by-step path | System touchpoints | Exposed issue | Requirement / Contract |
|---|---|---|---|---|---|
| 打开标签页能力整理素材 | 作者，Chrome 开着 174 个标签页，Claude Code 会话已启动 | 点图标 → 勾「标签页与标签组」→ Chrome 弹窗申请权限 → 允许 → 插件推送能力清单 → 服务启用 `tabs_*` 工具 → Claude 调 `tabs_open` 把 64 个网址开进「写作·导读」分组并收起 | 弹窗、`chrome.permissions`、WebSocket、`capabilities.json`、MCP 工具列表 | 会话中途启用的工具，客户端是否立刻可见（U-SPK-2） | U-BEH-3、U-BEH-4、U-BEH-1、U-ACC-2 |
| 关掉历史记录能力 | 作者不想让 AI 看历史，会话里 AI 仍持有旧工具列表 | 取消勾选「历史记录」→ 插件交还权限、推送新清单 → AI 仍按旧列表调 `history_search` → 插件拒绝并返回「已在弹窗关闭」 | 弹窗、插件拦截、服务 `disable()` | 工具列表刷新不及时时，只靠插件拦截兜底 | U-BEH-5、U-ACC-3 |
| 两个 AI 客户端同时在用 | Claude Code 是 hub，kilo 是 peer | 勾选变化 → hub 收到清单、写盘、转发 peer → 两边工具列表一致；hub 退出 → peer 接管端口并读盘 | bridge hub/peer、`capabilities.json` | peer 接管时不能丢清单 | U-BEH-4、U-CTR-3、U-ACC-4 |

## 方案

**选定**：服务端注册全部工具后按清单 `disable()`，靠 SDK 自带的 `list_changed` 通知；插件端按方法名前缀拦截。理由：改动集中在 server 与插件两处，bridge 只多一种消息类型。

**被否**：每次清单变化重建 `McpServer` 实例——会断开 stdio 连接；只做插件端拦截、工具全量列出——用户已选「勾了才出现」。

## 实施步骤

改动形状：

```diff
 chrome-toolbox-mcp/                # 原 chrome-reading-list-mcp
 ├── package.json                   # name/bin/description/repository 改名
 ├── README.md / README.zh-CN.md    # 改名 + 能力开关说明 + 迁移说明
 ├── extension/
 │   ├── manifest.json              # name 改；optional_permissions；action.default_popup；key 不动
 │   ├── background.js              # handler 按能力分组；拦截；推送能力清单
+│   ├── capabilities.js            # 能力表：id、名字、说明、权限、方法名（插件内 SSOT）
+│   ├── popup.html
+│   └── popup.js
 ├── src/
 │   ├── cli.js                     # 日志前缀、HELP、doctor 打印能力清单
 │   ├── config.js                  # 新目录与环境变量、旧目录迁移
 │   ├── bridge.js                  # 处理 capabilities 消息、写盘、转发 peer
 │   ├── server.js                  # 只留注册入口，按能力分文件注册
+│   ├── capabilityState.js         # 读写 capabilities.json，订阅变化
 │   ├── readingList.js             # 方法名改为 readingList.*
+│   ├── tabs.js
+│   ├── bookmarks.js
+│   └── history.js
 └── test/
     ├── bridge.test.js             # 现有 9 条保留
+    ├── capabilities.test.js       # 清单流转、enable/disable、落盘、peer 转发
+    └── tools.test.js              # 标签页/书签/历史工具对假插件的调用与参数校验
```

调用树：

```diff
 Bridge#attachExtension(ws).on("message")
   ping → pong
+  type=capabilities → capabilityState.set(enabled) → 写盘 → 广播 peers
   settle(response)
 createServer(bridge, capabilityState)
+  registerReadingList / registerTabs / registerBookmarks / registerHistory
+  capabilityState.onChange → 每个能力的工具 enable()/disable()
```

验证方式：

1. U-SPK-1 已按官方文档验证，插件 manifest 直接用 optional_permissions。
2. `npm test`：现有 9 条全绿（U-CTR-1/3）；新增测试覆盖 U-BEH-1/2/4/5/6。
3. `node scripts/e2e.js` 保留为真实 Chrome 加载插件的冒烟测试并改到新名字；四个能力的协议集成另写假插件测试（`test/` 下），是补充不是替代。
4. 人工：在本机 Chrome 加载插件，按「场景化推演」第 1、2 行走一遍，贴截图与工具调用结果。

## 验收承诺

[U-ACC-1|2fc2] 阅读清单回归：新版插件加服务下，`reading_list_list` 返回 368 条（与 2026-10-29 备份条数一致），现有 9 条测试全绿。

[U-ACC-2|ae87] 标签页能力：勾选后，一次 `tabs_open` 传 20 个网址加 `group:{title:"测试",collapsed:true}`，Chrome 里出现一个名为「测试」、已收起、含 20 个标签页的分组；`tab_groups_list` 能列出它。再用 `tabs_close` 关掉这 20 个，返回的备份文件含 20 条；用该备份调 `tabs_open` 后，「测试」分组和 20 个标签页重新出现。

[U-ACC-3|98b0] 拦截：任一能力未勾选时，直接对插件发该能力的方法调用，返回「已在弹窗关闭」错误，且 Chrome 状态无变化（自动化测试用假 chrome 对象断言没有 API 被调用）。

[U-ACC-4|8670] 工具列表跟随：勾选或取消某能力后 2 秒内，已连接的服务进程发出 `notifications/tools/list_changed`，随后 `tools/list` 只含已勾选能力的工具；hub 退出后接管的 peer 工具列表与 `capabilities.json` 一致（自动化测试）。

[U-ACC-5|8ac3] 改名与迁移：旧目录 `~/.chrome-reading-list-mcp` 存在时首次启动后，新目录里有原 token 与备份文件，旧插件连接不受影响；`doctor` 输出新名字和当前能力清单。

```yaml
# spec-contract
checks:
  - "现有 9 条测试全绿，reading_list_* 工具形状不变"
  - "未勾选能力的调用在插件端被拒，Chrome API 未被调用"
  - "勾选变化 2 秒内发 tools/list_changed，tools/list 只含已勾选能力"
  - "tabs_open 20 个网址进一个已收起的命名分组"
  - "旧配置目录自动迁移，token 与备份保留"
non_goals:
  - "网页自动化（读页面、点击、截图）"
  - "删除历史与书签"
  - "应用商店上架与 npm 发布"
  - "已保存标签组的保存与删除"
validation_commands:
  - "npm test"
  - "node scripts/e2e.js"
locked_decisions:
  - "名字 chrome-toolbox-mcp"
  - "工具列表动态 + 插件端拦截"
  - "首批能力：阅读清单、标签页与标签组、书签、历史记录"
  - "扩展 ID 与端口不变"
derisk_spikes:
  - type: "2 第三方 API / SDK 实际契约"
    question: "五个权限能否都放进 optional_permissions"
    method: "Chrome 156 加载最小插件，调 chrome.permissions.request"
    status: "verified"
  - type: "2 第三方 API / SDK 实际契约"
    question: "Claude Code 会话中途是否响应 tools/list_changed"
    method: "最小 MCP 服务延时 enable 一个工具，在 Claude Code 观察"
    status: "deferred(接受风险，能力清单落盘兜底)"
```
