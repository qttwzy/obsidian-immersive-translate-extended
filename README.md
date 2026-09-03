# Immersive Translate Extended for Obsidian

把沉浸式翻译，延伸进你的笔记库。  
Immersive Translate, extended into your vault.

[中文](#中文) · [English](#english)

## 中文

在 Obsidian 桌面版中使用沉浸式翻译悬浮球、划词翻译、Markdown 双语翻译、账户 Dashboard 和 PDF 翻译工作区。启用插件后，设置页会显示本机运行时版本和官方当前版本，并可从官方地址安装或更新。

本项目是社区维护的非官方 Obsidian 插件，与 Obsidian、Immersive Translate 及各翻译服务提供方没有官方合作或背书关系。相关名称和商标归各自权利人所有。

### 公开测试版范围

| 能力 | 4.0.0 范围 |
| --- | --- |
| Markdown 阅读视图 | 通过原生悬浮球启动整页双语或仅译文翻译 |
| 划词与悬停 | 使用本机已安装运行时提供的选中文本和鼠标悬停翻译 |
| 翻译范围 | 分别控制 Obsidian 界面区域与阅读视图正文；编辑器始终受保护 |
| 配置迁移 | 导入、导出经过字段和大小限制的安全配置；凭据类字段会被过滤 |
| 插件冲突 | 检测 I18N 沉浸式模块和另一套 Immersive Translate 插件，由用户明确选择是否暂停 |
| 账户与 Dashboard | 在设置页显示已保存的账户和会员状态，打开独立 Dashboard 登录、管理账户并同步高级设置 |
| PDF 与文档 | PDF 视图提供翻译按钮并尝试将当前文件交给独立的官方工作区；其他支持格式可在工作区手动选择 |
| 运行时安装 | 设置页自动显示本机版本和官方当前版本；由用户从官方地址安装或更新 |

4.0.0 包含当前 Obsidian 窗口内的阅读翻译、独立账户 Dashboard，以及在另一独立窗口中运行的官方 PDF/文档翻译工作区。PDF 文件经过 Vault 路径、类型和大小检查后尝试自动交接；其他支持格式由用户在工作区中手动选择。

翻译引擎、账户要求、付费能力和可用地区由本机安装的运行时及用户选择的服务决定。

### 系统要求与验证状态

- Obsidian 桌面版 `1.12.7` 或更高版本。
- 插件仅支持桌面端。
- 每个公开测试版必须同时附带 macOS 与 Windows 的真实 Obsidian 验收证据；具体链接记录在 `release-manifest.json`。
- Linux 不在首个公开测试版的承诺矩阵中。

### 安装

只使用 [GitHub Releases](../../releases) 中标记为 Pre-release 的完整 ZIP。不要把单独的 `main.js`、`manifest.json` 或 `styles.css` 当作可安装版本。

1. 下载 `immersive-translate-extended-<version>.zip`、`SHA256SUMS` 和 `release-manifest.json`。
2. 根据 `SHA256SUMS` 校验 ZIP。例如 macOS 可运行：

   ```bash
   shasum -a 256 immersive-translate-extended-<version>.zip
   ```

3. 解压 ZIP，把其中的 `immersive-translate-extended/` 文件夹放到：

   ```text
   <你的 Vault>/.obsidian/plugins/immersive-translate-extended/
   ```

4. 重启 Obsidian，在“设置 → 第三方插件”中启用 **Immersive Translate Extended**。
5. 打开插件设置，确认“翻译运行时”显示本机状态和官方当前版本；尚未安装时点击“安装运行时”。

Release ZIP 中的插件目录包含 `main.js`、`dashboard-preload.js`、`document-preload.js`、`document-runtime.js`、`manifest.json`、`styles.css`、`LICENSE` 和 `THIRD_PARTY_NOTICES.md`。设置页完成安装后，运行时保存在本机插件目录的 `userscript.runtime.js`。

### 使用

1. 打开 Markdown 笔记并切换到阅读视图。
2. 使用右下角的沉浸式翻译悬浮球选择目标语言、翻译服务和双语/仅译文模式。
3. 选中文本或使用鼠标悬停功能进行局部翻译。
4. 在插件设置中分别调整“界面翻译范围”和“正文翻译范围”。
5. 在“账户与高级设置”中查看已保存的账户状态，或打开 Dashboard 登录、管理账户并同步高级设置。
6. 如果检测到同类插件，在“冲突处理”中查看影响后再决定是否暂停对应功能。默认会保留其他插件的当前状态。
7. 打开 Vault 中的 PDF，点击 PDF 视图标题栏里的语言图标；插件会打开官方 PDF 工作区并尝试交接当前文件。也可从命令面板运行“打开文档翻译工作区”并手动选择受支持的文件。

从编辑或实时预览模式发起整页翻译时，插件会临时进入阅读视图；结束翻译后恢复原模式，Markdown 源文不会被译文覆盖。

### 更新、回滚与卸载

更新前先备份 Vault，并保留插件目录中的 `data.json`：

1. 禁用插件并退出 Obsidian。
2. 备份当前插件目录和 `data.json`。
3. 用新 ZIP 中的完整插件目录替换旧版本，再把备份的 `data.json` 放回。
4. 重启 Obsidian 并重新启用插件。

回滚时使用相同步骤安装上一份已验证 ZIP，并恢复与该版本同时备份的 `data.json`。卸载时先禁用插件，再删除插件目录；如需清理运行时在 Obsidian Web 存储中的服务配置，请先备份 Vault，并在 Obsidian 的开发者工具中确认具体键值后处理。

### 运行时安装与发布完整性

- “安装运行时”和“更新运行时”按钮从沉浸式翻译官方地址获取当前脚本。
- 打开设置页时，插件读取官方脚本的 `@version` 元数据，并同时显示本机版本与官方当前版本；短时间内重复打开会复用检查结果。
- 引擎已经运行时，更新会在重启 Obsidian 后生效；首次安装可直接启用。
- 发布构建会校验干净 Git commit、分别记录实测运行时版本的 macOS/Windows 验收证据、资产白名单和生成物一致性，并输出项目发行物的 SPDX 2.3 SBOM 与校验和。

运行时来源与归因说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。发布操作见 [docs/RELEASE_PROCESS.md](docs/RELEASE_PROCESS.md)。

### 数据与网络

打开插件设置时，插件会从沉浸式翻译官方地址读取脚本并解析版本元数据；点击安装或更新按钮后才会把脚本写入插件目录。打开 Dashboard 会连接沉浸式翻译官方账户页面，用于登录、账户管理和高级设置同步。翻译会把你主动翻译的笔记正文、选中文本或界面文本发送给所选翻译服务。点击 PDF 翻译按钮或在文档工作区选择文件时，相应文件会交给 Immersive Translate 官方工作区处理。网络接收方的处理规则、保留期限和地区由相应第三方政策决定。

插件在本地保存宿主设置和运行时配置；服务凭据可能存在 Obsidian 的 Web 存储中。安全配置导出会限制字段、条目数量和总大小，并过滤凭据、令牌、API 密钥和密码类字段。分享日志、截图或配置前仍应人工检查其中的笔记内容、路径和身份信息。

完整说明见 [PRIVACY.md](PRIVACY.md)。

### 故障排查

- 没有出现悬浮球：确认当前是 Markdown 阅读视图，然后重启 Obsidian 并重新启用插件。
- 提示尚未安装运行时：打开插件设置，点击“安装运行时”；更新后若收到提示，请重启 Obsidian。
- PDF 视图没有翻译按钮：确认当前活动标签是 Vault 中的 PDF，并在更新插件文件后重启 Obsidian 或关闭再启用插件。
- 页面出现重复悬浮球或重复翻译：检查“冲突处理”，只保留一套实际运行的翻译能力。
- 翻译服务报错：检查网络、账户、配额和服务配置；不要把密钥贴进公开 Issue。

使用问题见 [SUPPORT.md](SUPPORT.md)，安全问题见 [SECURITY.md](SECURITY.md)。

### 开发

活跃产品位于 `plugin/`。`plugin/main.entry.js` 是入口源码，`plugin/main.js` 是构建生成物。

```bash
npm ci --ignore-scripts
npm run build
npm run quality
```

提交规范见 [CONTRIBUTING.md](CONTRIBUTING.md)。本仓库代码使用 [MIT License](LICENSE)；第三方组件遵循各自许可。

---

## English

Immersive Translate, extended into your vault.

Use the Immersive Translate floating ball, selection translation, Markdown bilingual translation, account Dashboard, and PDF translation workspace in Obsidian Desktop. After enabling the plugin, settings show both the locally installed runtime and the current official version, with install and update actions from the official source.

This is an unofficial, community-maintained Obsidian plugin. It is not affiliated with or endorsed by Obsidian, Immersive Translate, or any translation provider. Their names and trademarks belong to their respective owners.

### Public beta scope

| Capability | 4.0.0 scope |
| --- | --- |
| Markdown Reading View | Start bilingual or translation-only page translation from the native floating ball |
| Selection and hover | Translate selected or hovered text through the locally installed runtime |
| Translation scope | Control Obsidian UI regions and Reading View content separately; editors remain protected |
| Configuration transfer | Import or export a bounded, filtered configuration envelope |
| Conflict handling | Detect overlapping plugins and let the user explicitly choose whether to pause them |
| Account and Dashboard | Show saved account and membership status in settings, then open an isolated Dashboard for login, account management, and advanced-setting sync |
| PDF and documents | Add a PDF-view action that hands the current file to an isolated official workspace when possible; other supported formats use manual selection |
| Runtime setup | Show the local and current official versions automatically, with user-initiated install and update actions |

Version 4.0.0 includes reading translation in the current Obsidian window, an isolated account Dashboard, and the official PDF/document workspace in a separate isolated window. Vault PDFs are checked for path, type, and size before automatic handoff is attempted; other supported formats are selected manually in the workspace.

Available engines, account requirements, paid capabilities, and regional availability are determined by the locally installed runtime and the selected provider.

### Requirements and validation

- Obsidian Desktop `1.12.7` or newer.
- Desktop only.
- Every distributed beta must link real macOS and Windows Obsidian acceptance evidence from `release-manifest.json`.
- Linux is outside the first beta acceptance matrix.

### Install

Use only the complete ZIP from a Pre-release on [GitHub Releases](../../releases). Individual `main.js`, `manifest.json`, or `styles.css` files are not an installable distribution.

1. Download `immersive-translate-extended-<version>.zip`, `SHA256SUMS`, and `release-manifest.json`.
2. Verify the ZIP hash against `SHA256SUMS`.
3. Extract the ZIP and place its `immersive-translate-extended/` directory at:

   ```text
   <your vault>/.obsidian/plugins/immersive-translate-extended/
   ```

4. Restart Obsidian and enable **Immersive Translate Extended** under Settings → Community plugins.
5. Open the plugin settings, confirm the local status and current official version under Translation runtime, then choose **Install runtime** when needed.

The plugin directory in the Release ZIP contains `main.js`, `dashboard-preload.js`, `document-preload.js`, `document-runtime.js`, `manifest.json`, `styles.css`, `LICENSE`, and `THIRD_PARTY_NOTICES.md`. The settings action stores the runtime locally as `userscript.runtime.js`.

### Use

1. Open a Markdown note in Reading View.
2. Use the floating ball to select a target language, provider, and bilingual or translation-only mode.
3. Select or hover text for focused translation.
4. Use plugin settings to control UI and Reading View translation scopes separately.
5. Under Account and advanced settings, review saved account status or open the Dashboard to sign in, manage the account, and synchronize advanced settings.
6. If overlapping plugins are detected, review the impact under Conflict handling before choosing whether to pause one. Existing plugin state is preserved by default.
7. Open a PDF in the Vault and click the languages icon in the PDF view header. The plugin opens the official PDF workspace and attempts to hand off the active file. The **Open document translation workspace** command supports manual file selection for other formats.

Starting page translation from an editing mode temporarily enters Reading View. Stopping translation restores the prior editing mode; translated output does not overwrite Markdown source.

### Upgrade, rollback, and uninstall

Back up the vault and retain the plugin's `data.json` before upgrading. Disable the plugin, quit Obsidian, replace the entire plugin directory with the new ZIP, restore the saved `data.json`, then restart and enable the plugin. Use the same process with a previously verified ZIP and its matching settings backup to roll back.

To uninstall, disable the plugin and remove its directory. Provider configuration may also exist in Obsidian Web storage; inspect and back up the relevant keys before clearing that storage.

### Runtime setup and release integrity

- **Install runtime** and **Update runtime** retrieve the current script from the official Immersive Translate address.
- Opening settings reads the official script's `@version` metadata and shows it beside the installed version; checks are reused for a short period.
- An update takes effect after restarting Obsidian when the engine is already running; a first installation can activate immediately.
- Release builds validate a clean Git commit, macOS/Windows acceptance with each platform's tested runtime version, the asset allowlist, and generated code, then emit an SPDX 2.3 SBOM and checksums for the project distribution.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for runtime attribution and [docs/RELEASE_PROCESS.md](docs/RELEASE_PROCESS.md) for the release contract.

### Data and network use

Opening plugin settings reads the official script and parses its version metadata; choosing Install or Update writes that script to the plugin directory. Opening the Dashboard connects to the official Immersive Translate account pages for login, account management, and advanced-setting synchronization. Translation sends the note text, selected text, or UI text you choose to translate to the selected provider. Invoking PDF translation or selecting a file in the document workspace hands that file to the official Immersive Translate workspace for processing. Each recipient's own policy controls processing, retention, and region.

Host settings and runtime configuration are stored locally. Provider credentials may be stored in Obsidian Web storage. Safe configuration export applies field, count, and size limits and filters credential-, token-, API-key-, and password-like fields. Always review logs, screenshots, and exported configuration for note content, paths, or identity data before sharing.

Read [PRIVACY.md](PRIVACY.md) for details, [SUPPORT.md](SUPPORT.md) for help, and [SECURITY.md](SECURITY.md) for vulnerability reporting.

### Development

The active product lives under `plugin/`. `plugin/main.entry.js` is source; `plugin/main.js` is generated.

```bash
npm ci --ignore-scripts
npm run build
npm run quality
```

See [CONTRIBUTING.md](CONTRIBUTING.md). Repository code is licensed under the [MIT License](LICENSE); third-party components retain their own terms.
