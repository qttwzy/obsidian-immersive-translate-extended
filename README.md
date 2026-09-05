# Immersive Translate Extended for Obsidian

把沉浸式翻译，延伸进你的笔记库。  
Immersive Translate, extended into your vault.

[中文](#中文) · [English](#english)

## 中文

在 Obsidian 桌面版中使用沉浸式翻译悬浮球、划词翻译、Markdown 双语翻译、账户 Dashboard、PDF 翻译工作区，以及设置与第三方插件等宿主窗口的界面翻译。插件设置会显示本机翻译运行时版本和官方当前版本，并提供从官方地址安装或更新的操作。

本项目是社区维护的非官方 Obsidian 插件，与 Obsidian、Immersive Translate 及各翻译服务提供方没有官方合作或背书关系。相关名称和商标归各自权利人所有。

### 功能范围

| 能力 | 4.0.x 范围 |
| --- | --- |
| Markdown 阅读视图 | 从悬浮球启动整页双语或仅译文翻译 |
| 划词与悬停 | 使用本机运行时翻译选中或悬停文本 |
| 翻译范围 | 分别控制 Obsidian 界面区域与阅读视图正文；编辑器保持原文 |
| 宿主弹窗 | 设置、第三方插件市场和主题市场等独立窗口与主窗口使用同一目标语言、翻译服务和双语/仅译文状态 |
| 配置迁移 | 导入、导出经过字段和大小限制的配置；凭据类字段会被过滤 |
| 插件冲突 | 检测重叠的翻译能力，由用户决定是否暂停 |
| 账户与 Dashboard | 查看账户状态，打开独立 Dashboard 登录、管理账户并同步高级设置 |
| PDF 与文档 | 从 PDF 视图打开官方文档工作区；其他支持格式可在工作区手动选择 |
| 运行时安装 | 显示本机与官方当前版本，由用户从官方地址安装或更新 |

翻译引擎、账户要求、付费能力和可用地区由本机安装的运行时及用户选择的服务决定。

### 系统要求

- Obsidian 桌面版 `1.12.7` 或更高版本。
- 插件仅支持桌面端。
- Linux 可使用源码自行验证；当前发布测试以 macOS 和 Windows 为主。

### 安装

从 [GitHub Releases](https://github.com/qttwzy/obsidian-immersive-translate-extended/releases) 下载 `immersive-translate-extended-<version>.zip`。

1. 解压 ZIP。
2. 把其中的 `immersive-translate-extended/` 文件夹放到 `<你的 Vault>/.obsidian/plugins/immersive-translate-extended/`。
3. 重启 Obsidian，在“设置 → 第三方插件”中启用 **Immersive Translate Extended**。
4. 打开插件设置，在“翻译运行时”中按需选择安装或更新。

ZIP 中包含 `main.js`、`dashboard-preload.js`、`document-preload.js`、`document-runtime.js`、`gm-element.js`、`gm-headers.js`、`manifest.json`、`styles.css`、`LICENSE` 和 `THIRD_PARTY_NOTICES.md`。翻译运行时由设置页从官方来源安装到本机插件目录。

### 使用

1. 打开 Markdown 笔记并切换到阅读视图。
2. 使用右下角悬浮球选择目标语言、翻译服务和双语或仅译文模式。
3. 选中文本或使用鼠标悬停功能进行局部翻译。
4. 在插件设置中调整界面与正文翻译范围。
5. 在“账户与高级设置”中查看账户状态，或打开 Dashboard 登录并同步高级设置。
6. 打开 Vault 中的 PDF，使用标题栏语言图标进入官方 PDF 工作区；也可从命令面板打开文档翻译工作区。
7. 打开独立设置窗口或第三方插件/主题市场时，界面翻译会跟随主窗口的双语或仅译文状态。

从编辑或实时预览模式发起整页翻译时，插件会临时进入阅读视图；结束翻译后恢复原模式，Markdown 源文不会被译文覆盖。

### 源码与贡献

本仓库展示可构建的产品快照：`plugin/` 是插件源码与生成物，`scripts/` 提供构建和打包命令，`tests/` 提供自动化验证，`.github/` 定义公开仓的 CI 与发布流程。

```bash
npm ci --ignore-scripts
npm run build
npm run quality
npm run package:build -- --root "$PWD" --out "$PWD/dist"
```

Issue 可用于报告问题和提出需求。Pull request 可作为具体补丁提案提交；维护者会在开发仓完成集成，并通过后续公开快照发布。详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

隐私说明见 [PRIVACY.md](PRIVACY.md)，安全问题见 [SECURITY.md](SECURITY.md)，使用支持见 [SUPPORT.md](SUPPORT.md)。

---

## English

Use the Immersive Translate floating ball, selection translation, Markdown bilingual translation, account Dashboard, PDF translation workspace, and host-window interface translation in Obsidian Desktop. Plugin settings show the locally installed translation runtime and the current official version, with user-initiated install and update actions.

This is an unofficial, community-maintained Obsidian plugin. It is not affiliated with or endorsed by Obsidian, Immersive Translate, or any translation provider. Their names and trademarks belong to their respective owners.

### Requirements

- Obsidian Desktop `1.12.7` or newer.
- Desktop only.
- Release testing currently focuses on macOS and Windows; Linux users can validate from source.

### Install

Download `immersive-translate-extended-<version>.zip` from [GitHub Releases](https://github.com/qttwzy/obsidian-immersive-translate-extended/releases), extract it, and place the included `immersive-translate-extended/` directory at `<your vault>/.obsidian/plugins/immersive-translate-extended/`. Restart Obsidian, enable the plugin under Settings → Community plugins, then install the translation runtime from plugin settings when needed. With UI translation enabled and the main window in bilingual or translation-only mode, detached Settings and community plugin or theme windows follow that same translation state.

The ZIP contains `main.js`, `dashboard-preload.js`, `document-preload.js`, `document-runtime.js`, `gm-element.js`, `gm-headers.js`, `manifest.json`, `styles.css`, `LICENSE`, and `THIRD_PARTY_NOTICES.md`. The translation runtime is installed locally from the official source through plugin settings.

### Source and contributions

This repository contains a buildable product snapshot: plugin source and generated output under `plugin/`, build and packaging commands under `scripts/`, automated checks under `tests/`, and public CI and release workflows under `.github/`.

```bash
npm ci --ignore-scripts
npm run build
npm run quality
npm run package:build -- --root "$PWD" --out "$PWD/dist"
```

Use Issues for bug reports and feature requests. Pull requests are accepted as concrete patch proposals; maintainers integrate accepted patches in the development repository and publish them in a later public snapshot. See [CONTRIBUTING.md](CONTRIBUTING.md).

Read [PRIVACY.md](PRIVACY.md) for data handling, [SECURITY.md](SECURITY.md) for vulnerability reporting, and [SUPPORT.md](SUPPORT.md) for support scope.
