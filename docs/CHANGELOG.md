# 独立插件开发日志

## 项目演进

本项目从 I18N 插件补丁演变为独立 Obsidian 插件，经历了多个方案切换。

### 方案一：I18N 插件补丁（v1.0–v1.3）

通过字符串匹配替换 I18N 插件 `main.js` 中的 `Yg` 类，添加悬浮球菜单、翻译缓存等功能。

**局限**：强绑定 I18N 版本，每次 I18N 更新都可能导致补丁失效。

### 方案二：独立插件 + 油猴脚本模拟（v2.0–v2.3）

将插件从 I18N 中独立出来，通过模拟浏览器环境（GM_* API polyfill）加载沉浸式翻译的油猴脚本版本，获得原生功能体系（60+ 翻译引擎）。

**核心思路**：
- 注入 `GM_xmlhttpRequest`、`GM_getValue`、`GM_setValue` 等 Tampermonkey API 的 polyfill
- 使用 `obsidian.requestUrl` 替代 `fetch`/`XHR` 绕过 CORS
- 加载 `immersive-translate.user.js` 油猴脚本

**关键实现**：
- `_installGMPolyfill()` — GM_* API polyfill
- `_installGMFetchPolyfill()` — 基于 `obsidian.requestUrl` 的 `GM_fetch` 实现
- `_installBrowserAPIPolyfill()` — `chrome.storage`/`chrome.runtime` 等 API 模拟
- 冲突检测 — 自动检测，并按设置屏蔽或保留 I18N / Immersive Translate 插件的沉浸式翻译模块

### 方案三：Dashboard 集成（v2.4–v3.0）

在方案二基础上，通过 Electron `BrowserWindow` 打开沉浸式翻译 Dashboard，实现登录、Pro 功能、配置同步。

**核心思路**：
- 使用 `require('electron').BrowserWindow` 创建独立窗口
- 通过 `preload` 脚本和 `bridge` 代码注入 `chrome.*` API polyfill
- Dashboard 窗口与主 Obsidian 窗口之间通过 localStorage 自动同步配置

**关键实现**：
- `_openDashboardWindow()` — 创建 BrowserWindow 并注入 polyfill
- `dashboard-preload.js` — preload 脚本，最早注入 API 模拟
- bridge 代码 — `did-navigate` 事件中注入 DOM bridge
- `_autoSyncDashboardStorage()` — 每 3 秒自动同步 Dashboard localStorage
- `_fetchUserInfoFromDashboard()` — 从 Dashboard 抓取用户信息
- `_fetchUserInfoViaAPI()` — 通过 API 直接获取用户信息

### 方案四：原生运行时、直接设置与文档工作区（v3.1–v3.4）

插件复用油猴脚本的原生配置体系：悬浮球承担高频操作，Dashboard 同步账户与高级设置，Obsidian 设置页直接提供账户、Dashboard 操作、安全配置迁移和主机选项；官方文档翻译在独立内嵌工作区运行。

**当前职责**：
- 原生悬浮球：目标语言、当前翻译服务、双语/仅译文、翻译开关
- 原生模拟侧边栏：辅助按钮悬停展开，默认宽度 340px，可缩窄到 280px
- Dashboard：登录、账户资料、订阅信息，以及译文样式、字体、鼠标悬停和服务等高级设置同步
- Obsidian 设置页：直接展示账户、Dashboard 打开与手动同步、安全配置导入/导出、界面/正文翻译范围和冲突处理
- 文档翻译工作区：在独立窗口中承接官方文档翻译流程，与 Dashboard 生命周期隔离

### 方案五：可审计的阅读翻译公开测试版（v4.0）

发布合同收敛为完整 ZIP、设置页显示本机与官方当前运行时版本、用户显式安装更新和证据驱动的发布门禁。产品包含当前 Obsidian 窗口中的 Markdown 阅读翻译，以及隔离窗口内的官方 PDF/文档翻译工作区；Dashboard/账户能力继续使用独立的安全与平台验收周期。

---

## 版本变更记录

### v4.0.0 — 用户管理运行时、Dashboard 与完整 ZIP 发布合同（待发布）

- 设置页自动检测本机运行时和官方当前版本，并提供安装与更新按钮；首次安装可直接启用，已运行时更新在重启后生效。
- 新增完整 ZIP 发布器，从干净 commit 的临时 detached worktree 组装项目资产，校验白名单、版本同步、生成物一致性及分别记录实测运行时版本的 macOS/Windows 验收证据，并生成 SHA-256、项目 SPDX 2.3 SBOM 和发布清单。
- 公开测试版产品范围包含 Markdown 阅读视图、原生悬浮球、划词/悬停、翻译范围、安全配置迁移，以及带 PDF 标题栏入口、受控文件交接和译文保存的官方文档工作区。
- 设置页恢复账户名称、会员状态和 Dashboard 操作；Dashboard 使用隔离窗口、sandbox preload 与受限 IPC/页面桥，支持登录、账户管理和高级设置同步。运行时版本一致时更新按钮显示“已是最新版本”并禁用。
- 冲突处理默认保留其他插件状态，提示中提供保持现状、本次会话暂停和说明入口，设置页提供持续选择。
- 删除账户身份调试输出，Dashboard preload 的生产调试日志收敛到必要的安全警告。
- 兼容补丁按真实运行时的 dispatcher 作用域动态识别翻译、响应和内容传输函数；不满足同一作用域契约时保持原脚本并报告不兼容。
- 插件、manifest、package 和 bridge 版本同步为 4.0.0，最低 Obsidian 版本设为 1.12.7，Playwright 归入开发依赖。
- Release ZIP 白名单包含 Dashboard preload；新增 quality、CodeQL、Dependabot、隐私、安全、支持、贡献、行为规范、Issue/PR 模板和发布决策文档。

### v3.4.1 — PDF 翻译运行时、严格文件交接与一键保存

- PDF 工作区在独立 isolated world 中加载与 Obsidian 主窗口同源的 userscript 运行时、当前翻译配置和受限 GM/browser API；远程页面主 world 不获得 Node 或桥接能力。
- userscript 的跨域翻译请求通过专用 IPC 交给 Obsidian `requestUrl`，沿用主窗口已经验证的网络栈；preload 负责内存配置和隔离通信。
- PDF 运行时完成初始化后才开始本地文件交接，因此目标语言、翻译服务和翻译状态由实际翻译引擎处理，而不是只显示官方 PDF 样例的文本层。
- 自动交接只接受真实文件名进入页面标题或正文作为成功证据；普通站内导航不再视为成功，官方样例页初始化造成的瞬时失败会在同一受信任窗口中最多重试五次。
- PDF 翻译页新增「保存译文 PDF 到源目录」按钮：调用官方「翻译全部并下载」，自动选择可直接下载的图片版 PDF 并确认导出，将结果保存为源文件同目录的 `原文件名-译文.pdf`，已有同名文件时自动追加编号。
- 下载授权只对当前 PDF 工作区、当前文件代次和一次官方导出有效；同一 Electron 会话中的其他下载保持原行为，完成、取消和失败状态会回传到页面按钮并显示 Obsidian 提示。
- 新增 document runtime、preload、严格交接和初始化顺序的自动化回归测试。

### v3.4.0 — 直接设置与官方文档翻译工作区

- Obsidian 设置页直接展示账户信息、Dashboard 打开与手动同步，以及经过脱敏的安全配置导入/导出。
- 新增独立内嵌官方文档翻译工作区，支持 PDF、EPUB/MOBI/FB2/FBZ、DOCX、HTML/HTM/TXT/JSON、Markdown 和 SRT/ASS/VTT。
- Vault 内当前 PDF 在严格校验真实路径、文件类型和大小，并确认官方页面处于可接收文件的状态后尝试自动交接；交接未完成时保留官方页面的手动选取流程。
- EPUB/MOBI/FB2/FBZ、DOCX、HTML/HTM/TXT/JSON、Markdown 和 SRT/ASS/VTT 统一进入文档翻译工作区，由用户在官方页面手动选取文件。
- Dashboard 的职责限定为账户与高级设置同步；Dashboard 与文档翻译工作区使用独立窗口、权限边界和生命周期。

### v3.3.0 — 单一原生运行时

- 设置页取消运行时选择，目标语言、翻译服务、显示模式和翻译开关统一由原生悬浮球及其共享配置管理。
- 启动时清理旧的 `sdkMode` 和插件专用目标语言字段，历史安装会自动收敛到同一运行时。
- userscript 加载失败时直接报告引擎失败，不再启动功能不同的备用运行时。
- 完成 P1/P2 文档工作区可行性勘察：P1 进入带严格门禁和手动回退的 CDP 原型，P2 先统一官方工作区，再按格式独立验证自动交接。
- 插件说明、使用文档和 Dashboard 桥接版本统一更新到 3.3.0。

### v3.2.2 — Dashboard 运行时一致性

- Dashboard 切换双语/仅译文时直接更新当前已翻译页面，不再恢复旧的显示模式。
- 目标语言和翻译服务变化会先刷新 userscript 内容上下文，再按新配置重译当前页，避免复用上一种语言或服务的段落缓存。
- 译文主题和鼠标悬停设置分别执行 DOM 热更新与 userscript 上下文重建，不产生额外的正文翻译请求。
- userscript 文档消息同时校验请求 ID、消息类型和明确失败回执；连续设置提交按序写入，过期提交不会覆盖最新正文状态。
- userscript 通过限定消息类型的内容层兼容桥接入当前页更新；补丁校验所需协议结构，远端结构变化时保留已验证缓存，并在无兼容缓存时提示使用悬浮球确认语言和服务。
- 插件与 Dashboard 桥接版本统一更新到 3.2.2。

### v3.2.1 — 译文主题热更新与 PDF 入口

- Dashboard 的译文样式更新同时调用 userscript 专用的 `updateTranslationThemeConfig` 协议，已翻译节点会即时替换主题 class，支持从 `none` 切换到模糊、下划线等其他样式。
- 原生模拟侧边栏的初始宽度保持 340px，拖拽下限独立调整为 280px。
- Obsidian PDF 视图标题栏新增「翻译当前 PDF」按钮，并注册同名命令；入口在 Obsidian 内打开官方 PDF 工作区，并明确提示选择当前文件上传。
- 插件与 Dashboard 桥接版本统一更新到 3.2.1。

### v3.2.0 — 双向高级设置与 Obsidian 内嵌体验

- Dashboard 与主窗口以 `fullLocalUserConfig` 为共同配置源；运行时消息、IPC、轮询快照和存储变更事件共同覆盖即时写入与导航重载。
- 同步完整保留目标语言、翻译模式、译文主题、主题规则、字体、鼠标悬停和普通服务字段；主窗口本地凭据、密钥及未来未知字段在安全合并中保留。
- 高级设置写入通过 userscript 的 `setMiniConfigAsync` 触发上下文重载；翻译中的页面会还原并按原模式重新翻译，使主题与范围变化作用于现有内容。
- 界面与正文范围改为独立的精确 selector 集合，编辑器保持硬排除；设置开关保存后即时重建当前译文。
- 悬浮球的 userscript 与 Electron/desktop 配置分支统一使用原生 `hover` 辅助菜单，侧边栏、设置与反馈随悬停展开；原生模拟侧边栏默认宽度和拖拽下限调整为 340px。
- userscript 的 `openPdfViewerPage` 后台请求映射到 Obsidian 管理的 BrowserWindow；鼠标悬停翻译直接运行在当前文档。
- 插件与 Dashboard 桥接版本统一更新到 3.2.0。

### v3.1.0 — 原生悬浮球权威与侧边栏

- 沉浸式翻译运行时保留 `fullLocalUserConfig` 中的目标语言、当前服务和显示模式，悬浮球操作可直接驱动实际翻译。
- 首次运行且用户尚未设置原生选项时，开启悬浮球侧边栏入口；已有隐藏选择会被保留。
- Dashboard 快照限定为账号、订阅和脱敏后的 `translationServices` 可用性，合并时保护完整运行时配置、未知字段和凭据。
- Dashboard 通用配置写入被拒绝；移除注入的「返回个人设置」按钮。
- 原自建运行时设置面板收敛为「账户与高级恢复」，Obsidian 设置页主要呈现主机级配置。
- userscript 版本从实际执行脚本的 `@version` 读取，并与插件/桥接版本分别展示。
- Microsoft 翻译已用当前 userscript 实机验证通过，作为后续回归项目保留。
- 版本统一更新到 3.1.0。

### v3.0.2 — 生命周期、安全边界与同步稳定性

- 插件管理的卸载和重初始化清理可逆：只恢复插件实际改过、且仍保持插件写入值的全局和冲突设置；已经执行的 userscript 运行时副作用无法通过删除 script 节点完整撤销，彻底清理需重启 Obsidian。
- 编辑模式下启动文章翻译会通过 Obsidian 视图状态接口临时进入阅读视图，关闭翻译后恢复原编辑模式；CodeMirror 始终排除在翻译范围外，避免译文写入 Markdown 源文件。
- GM 请求桥限定在明确的请求范围内，Dashboard 窗口和 preload 仅在受信域名运行。
- Dashboard 配置同步改为有上限、脱敏、可校验的快照协议，支持显式删除、回滚、串行应用和失败重试。
- 导入/导出不再复制凭据、令牌、API 密钥或密码；移除会把完整浏览器扩展存储复制到剪贴板的旧提示。
- 冲突处理开关即时生效，旧版 I18N 补丁安装器改为显式 `--legacy-i18n-patch` 才能运行。

### v2.0.0 — 独立插件

- 从 I18N 插件独立，不再依赖 I18N
- 自动检测并按设置处理与 I18N / Immersive Translate 插件的冲突
- GM_* API polyfill 实现油猴脚本环境模拟
- 沉浸式翻译原生功能体系（60+ 翻译引擎）

### v2.1.0 — 悬浮球修复

- 修复悬浮球不显示的问题（添加 CSS 样式注入）
- 修复 JavaScript 语法错误（const 声明冲突、箭头函数 this 绑定）

### v2.2.0 — 稳定性修复

- 修复 Obsidian 反复加载工作区的 bug（替换 `document.location.reload()` 为优雅重初始化）
- 修复设置打开外部浏览器的问题（拦截 `window.open` 和 `GM.openInTab`）

### v2.3.0 — Dashboard 初步集成

- 通过 Electron BrowserWindow 打开 Dashboard
- Cookie 同步机制
- 导航拦截（`setWindowOpenHandler`）

### v2.4.0 — 功能增强

- 修复 `self._getAuthCookies is not a function` 错误
- 删除插件自定义 API 配置，改为从 IMT 配置自动检测
- 添加"其他/自定义"翻译服务栏目
- Dashboard 添加"返回个人设置"按钮
- 添加账号状态显示（用户名 + 绿色对号）

### v2.5.0 — 自动同步 + 批量导入

- 添加 Dashboard localStorage 自动同步机制
- 添加"从浏览器扩展批量导入"功能
- 改进 `_detectCustomServices` 扫描 `config.services` 对象

### v2.6.0 — 根本性修复

- `BUILTIN_SERVICES` 改用实际 IMT 服务 ID（`google`/`bing`/`deepl`/`openai` 等）
- `_detectCustomServices` 扫描 `translationServices`（IMT 实际的复数形式）
- 登录状态同步增加三层机制（localStorage 自动同步 + Dashboard JS 上下文抓取 + API 直接获取）
- 批量导入改为推荐从 Dashboard 设置页操作

### v2.7.0 — Dashboard 扩展检测 + 翻译服务切换

- 改进 `sendMessage` polyfill 支持多种消息类型响应（`checkExtension`/`getConfig`/`getUserInfo`）
- UI 顺序调整：登录和导入导出移到翻译服务上方
- 翻译服务切换：重置 polyfill 安装标志 + 派发 StorageEvent 通知引擎

### v2.8.0 — Dashboard 扩展检测修复（Playwright 方案）

- 16 轮 Playwright 抓包定位 Dashboard 扩展检测根因
- Dashboard JS 只读 `window.immersiveTranslateBrowserAPI`，从不赋值
- Dashboard 的 `jc()` 函数检查 `runtime.getManifest()` 返回值是否含 `_isUserscript`
- 修复 preload 的 `P` 变量声明顺序 bug（var hoisting 导致 P=undefined）
- 创建隐藏 DOM 元素供 Dashboard fallback IIFE 读取
- 新增 Poll Guard（每 100ms 检查 API 完整性，持续 20s）
- Playwright 验证 `hasWarning: false` ✅

### v2.8.1 — 登录状态持久化 + localStorage 桥接

- localStorage 双向桥接：Dashboard 原生 key ↔ imt-gm- 前缀 key
- sessionStorage 持久化桥接：防止页面重载丢失 session 数据
- sendMessage 增强：处理 getAuthToken/getAccount/getSubscription 等 auth 消息
- fetchInterceptor 扩大 URL 覆盖：login/token/subscription/config/profile/member
- "返回个人设置"按钮改用 `window.location.hash` 导航（避免完整页面重载）

### v2.8.2 — sessionStorage 桥接 + pushState 导航

- sessionStorage 桥接：自动备份到 localStorage，页面重载后恢复
- "返回个人设置"按钮改用 `history.pushState` + 手动 dispatch HashChangeEvent

### v2.8.3 — 按钮修复 + sendMessage 日志

- "返回个人设置"按钮改回 `window.location.hash = "general"`
- sendMessage 添加 `window.__imt_msg_logs` 诊断日志
- sendMessage 通用保存处理器（未识别的消息类型也保存到 localStorage）

### v2.8.4 — fetchInterceptor 全面升级

- 同时捕获 fetch/XHR 的请求体（POST body）和响应体
- URL 覆盖扩大：service/setting/preference/translate/api
- 数据识别增强：translateServices/serviceConfig/translatorConfig/memberConfig
- XHR 拦截器也使用 `_tryCaptureData` 统一处理

### v3.0.0 — 移除自定义悬浮球，使用 IMT 原生 UI

**重大重构**：移除自定义悬浮球和挂载点劫持，改用 IMT 原生悬浮球。

删除的代码：
- `_createBall()` — 自定义悬浮球创建
- `_createMenu()` — 自定义下拉菜单（界面翻译/文章翻译/目标语言/翻译服务切换）
- `toggleTranslate()` / `_closeMenu()` — 菜单控制
- `_getCurrentTranslationService()` / `_setTranslationService()` — 自定义服务切换
- `mountPoint` / `disclaimerPoint` 配置 — IMT SDK 挂载点劫持
- `__imtOwner` 球移除逻辑 — 不再移除原生 IMT 球
- `delete window.immersiveTranslateConfig` — 不再删除全局配置
- 悬浮球 CSS 样式（23 行）

修改的代码：
- `_disableI18NImtModule()` — 只禁用 I18N 的 modeImt，不再移除原生球和删除全局配置
- `_disableStandaloneImt()` — 只禁用独立插件，不再删除全局配置
- `_activateIMT()` — `immersiveTranslateConfig` 不再包含 `mountPoint`/`disclaimerPoint`
- `onload()` — 移除 `_createBall()` 调用
- `onunload()` — 移除球移除逻辑
- 构造函数 — 移除 `ball`/`menu`/`panel`/`disc`/`isActive` 状态变量
- CSS — 移除悬浮球相关样式，保留设置面板样式

保留的代码：
- GM_* polyfill / Browser API polyfill / GM_fetch polyfill
- Dashboard 集成（preload + bridge + 同步）
- 设置面板（IMTSettingsModal）
- Obsidian 设置页（IMTSettingTab）
- 冲突检测、导入/导出配置

### v3.0.1 — 修复 preload 路径 + I18N 冲突球 + 网络拦截

- `_getPreloadPath` 动态查找插件目录（支持 `IMT-enhanced` 等非标准目录名）
- `_removeConflictingBalls` 移除 I18N 插件创建的冲突悬浮球
- 启动延迟从 2s 减少到 500ms
- `GM_xmlhttpRequest` body 序列化：对象/数组自动 JSON.stringify
- `GM_fetch` body 序列化：同上
- 原生 fetch/XHR 全量拦截：所有外部 URL 路由到 `obsidian.requestUrl`
- 清除浏览器禁止的 header（Content-Length/Host/Origin 等）
- 统一 `_serializeBody` 和 `_cleanHeaders` 工具函数

---

## 当前行为与外部限制

### 1. 运行时设置来源

悬浮球的目标语言、当前翻译服务、双语/仅译文和翻译开关即时更新运行时；Dashboard 的同名控件及高级选项写入同一份配置，并通过运行时桥热应用。

### 2. Obsidian 设置页

设置页直接展示账户状态、Dashboard 打开与手动同步、安全配置导入/导出，以及 Obsidian 翻译范围和冲突选项。导入、导出和同步经过边界检查与凭据过滤，本地密钥、令牌和密码保留在主窗口。

### 3. Dashboard 同步范围

Dashboard 负责登录、账户/订阅资料与高级设置同步。它与文档翻译工作区使用独立的窗口、权限边界和生命周期。

### 4. 文档翻译工作区

独立内嵌官方工作区支持 PDF、EPUB/MOBI/FB2/FBZ、DOCX、HTML/HTM/TXT/JSON、Markdown 和 SRT/ASS/VTT。Vault 内当前 PDF 通过严格的路径、类型和大小校验，并在确认官方页面状态后尝试自动交接；翻译页可调用官方导出并将译文 PDF 一键保存到源文件夹，重名时自动编号。其他支持格式在本版本统一由用户手动选取。远程 PDF 的后台打开协议继续由 Obsidian 管理的 BrowserWindow 承接。

### 5. 第三方登录

Google、微信、Apple、Facebook 授权需要在系统浏览器完成。用户可在官方个人中心绑定邮箱并设置密码，再回到 Obsidian 使用邮箱登录。

### 6. Microsoft 翻译

当前 userscript 已实机验证 Microsoft 翻译可用。早期 Windows 开发阶段的 `ERR_INVALID_ARGUMENT` 历史根因尚无可复核证据，后续按回归项目检查。

---

## 关键技术决策

| 决策 | 原因 | 版本 |
|------|------|------|
| 统一使用油猴脚本运行时 | 油猴版本提供原生悬浮球、Dashboard 配置体系和 60+ 翻译引擎 | v2.0 |
| GM_fetch 基于 `obsidian.requestUrl` | `fetch`/`XHR` 受 CORS 限制，`requestUrl` 不受限制 | v2.0 |
| localStorage 作为配置存储 | 油猴脚本使用 `GM_getValue`/`GM_setValue`，映射到 localStorage | v2.0 |
| `imt-gm-` 前缀 | 避免与其他 localStorage 键冲突 | v2.0 |
| Electron BrowserWindow 打开 Dashboard | 需要在 Obsidian 内完成登录，不能跳转外部浏览器 | v2.3 |
| preload + bridge 双层注入 | preload 最早执行，bridge 在页面导航后补充 | v2.3 |
| `self._getAuthCookies` 暴露到全局 | IMT SDK 内部通过 `self._getAuthCookies()` 调用 | v2.4 |
| BUILTIN_SERVICES 使用实际 IMT 服务 ID | 虚构 ID（`google-free`/`deepl-pro`）导致所有服务被误判为自定义 | v2.6 |
| fetch/XHR 拦截器捕获 userInfo | Dashboard React 应用不会将 userInfo 写入 localStorage | v2.6 |
| `sendMessage` 动态参数解析 | Dashboard 调用时第一个参数是 extensionId 字符串 | v2.7 |
| 原生悬浮球作为运行时权威 | 原生控件能即时更新 userscript 内部状态，并与实际翻译行为一致 | v3.1 |
| userscript 与插件版本分离 | 悬浮球版本来自实际执行脚本，桥接版本来自插件发布版本 | v3.1 |
| Dashboard 全量普通配置安全合并 | 高级设置与悬浮球共享运行时状态，同时保留主窗口本地凭据和未来字段 | v3.2 |
| Obsidian 主机 selector 独立分层 | 界面、正文和编辑器范围可分别控制，切换后可安全重建译文 | v3.2 |
| userscript 兼容补丁锚定侧边栏常量 | 原生脚本将 435px 写死，窄窗口需要可验证、幂等的 340px 下限补丁 | v3.2 |
| 设置操作直接呈现在 Obsidian 设置页 | 账户、同步和安全配置迁移可在统一的主机设置界面完成 | v3.4 |
| Dashboard 与文档工作区分离 | 账户/高级设置同步与文档会话拥有独立权限边界和生命周期 | v3.4 |
| Vault PDF 使用受控自动交接 | 仅在路径、类型、大小和官方页面状态都通过校验时尝试交接，并始终保留官方手动选取 | v3.4 |
| 译文 PDF 使用单次定向保存 | 只消费当前 PDF 工作区的一次官方导出，将结果写入源文件夹并自动避让同名文件 | v3.4 |

---

## 文件结构

```
plugin/
├── main.js               # 主插件代码（独立 Obsidian 插件）
├── manifest.json          # 插件元数据
├── styles.css             # CSS 样式
└── dashboard-preload.js   # Dashboard 窗口 preload 脚本
```

## 配置存储结构

所有配置存储在主 Obsidian 窗口的 localStorage 中，使用 `imt-gm-` 前缀：

| Key | 内容 |
|-----|------|
| `imt-gm-fullLocalUserConfig` | 完整翻译配置（翻译服务、语言、选择器等） |
| `imt-gm-userInfo` | 用户信息（email、nickname、userType 等） |
| `imt-gm-imt_setting_secret_key` | 加密密钥 |
| `imt-gm-usage_limit_stats` | 使用量统计 |
| `imt-gm-subscriptionInfo` | 订阅信息 |
