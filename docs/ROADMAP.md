# 产品路线图

## 产品边界

插件优先完善与 Obsidian 阅读、写作和资料整理直接相关的体验：Markdown 正文翻译、界面翻译、鼠标悬停、原生悬浮球、翻译侧边栏、Dashboard 高级设置，以及 vault 内文档的翻译入口。

沉浸式翻译官方将 PDF Pro、ePub/Mobi、字幕文件等设计为独立文档工作区。插件沿用这一产品模型，在 Obsidian 管理的窗口中提供入口和文件交接，不复制另一套文档渲染器。

## 当前基线（v3.4.1）

- 插件使用单一原生运行时；历史引擎选择与插件专用目标语言字段会在加载时自动清理。
- 悬浮球负责语言、服务、双语/仅译文和当前页面翻译状态。
- Dashboard 与主窗口同步完整普通设置；译文主题即时重绘，翻译模式直接更新当前 DOM，目标语言与翻译服务通过 userscript 内容层刷新上下文并重新翻译当前页；连续提交串行执行并以最新设置为准。
- 鼠标悬停按键、效果和服务通过 userscript 上下文重建生效，不触发当前页重译。
- 翻译侧边栏默认 340px，可缩窄到 280px。
- Obsidian 设置页直接呈现账户、Dashboard 打开与手动同步、安全配置导入/导出、翻译范围和冲突处理。
- Dashboard 与文档翻译工作区使用独立 BrowserWindow、preload、权限边界和生命周期；PDF userscript 只在专用 isolated world 中获得受限运行时桥。
- PDF 视图标题栏和命令面板提供「翻译当前 PDF」入口；Vault 内 PDF 在翻译运行时初始化后，通过真实路径、类型、大小和真实文件名校验执行有界自动交接。
- PDF 翻译页提供「保存译文 PDF 到源目录」；按钮调用官方图片版导出，只定向当前工作区的一次下载，并在源文件夹生成自动避让重名的译文 PDF。
- 「打开文档翻译工作区」统一承接 EPUB/MOBI/FB2/FBZ、DOCX、HTML/HTM/TXT/JSON、Markdown 和 SRT/ASS/VTT，本版本由用户在官方页面手动选择。
- 远程 PDF 的 `openPdfViewerPage` 请求由独立文档 BrowserWindow 承接。

## 能力取舍

| 能力 | 产品形态 | 优先级 | 结论 |
|---|---|---:|---|
| Markdown 正文、Obsidian 界面、鼠标悬停 | 当前 Obsidian 页面内运行 | P0 | 持续做深，要求实时生效 |
| Dashboard 高级设置 | Obsidian 管理的独立窗口 | P0 | 完成设置矩阵和热更新分级 |
| vault 本地 PDF | PDF 视图入口 → 官方 PDF 工作区 | P1 | 已交付隔离翻译运行时、严格交接、有界重试与源目录一键保存 |
| 在线 PDF | 官方 PDF viewer 工作区 | P1 | 保留现有映射并补来源回归 |
| ePub/Mobi、DOCX、字幕文件 | 官方 Document Translation 工作区 | P2 | 统一手动入口已交付，自动交接按格式独立验证 |
| 本地 HTML/TXT/JSON/Markdown | 官方 Document Translation 工作区 | P2 | 统一手动入口已交付，必要时再评估本地文本实现 |
| 视频/会议字幕、图片翻译等网页能力 | 原网页场景 | P3 | 只保留 userscript 自带能力，不建设 Obsidian 专用界面 |

## 交付状态与后续计划

### P0：设置同步可靠性矩阵

1. 建立 Dashboard 实际 UI 回归矩阵：目标语言、翻译服务、双语/仅译文、译文主题、主题规则、字体、悬停按键、悬停效果和悬停服务。
2. 将设置分为三类：DOM 热更新、userscript 上下文重建、当前页重新翻译；每一项只走一种明确路径。
3. 所有 userscript 配置消息等待对应回执；测试修改前基线、新值和重放顺序。
4. 验收：Dashboard 修改后，主窗口存储值、运行时值和可见 DOM 三者一致；双向切换无需重启。

### P1：当前 PDF 的受控文件交接（已交付）

1. 文档工作区使用独立窗口和专用 preload，不复用 Dashboard；远程页面主 world 保持 `nodeIntegration: false`，只有固定 isolated world 能访问受限存储桥，HTTP(S) 请求经专用 IPC 交给 Obsidian `requestUrl`，只允许官方文档来源和已知路由。
2. 仅在用户执行「翻译当前 PDF」后读取当下活动 `TFile`；真实路径必须位于 Vault 内，同时通过 `.pdf` 白名单、普通文件和 100 MB 上限校验。
3. 页面加载完成后先向 isolated world 注入当前 userscript、`fullLocalUserConfig` 和受限 GM/browser API；运行时明确确认后，CDP 才接受唯一带 PDF `accept` 条件的文件输入并派发 `input`/`change`。
4. 成功只由真实文件名进入页面标题或正文确认；普通站内导航、官方样例文档和页面原有加载元素均不作为成功证据。
5. 官方样例页初始化造成的瞬时未确认最多重试五次；调试器在每次结果中通过 `finally` 分离，连续请求串行处理，旧窗口、旧页面代次和重复 load 事件不能重复交接。
6. 任一运行时、路径、页面结构、导航或 CDP 步骤失败时停止自动交接，并给出对应失败原因。
7. 兼容探针同时验证运行时加载、真实文件名、译文结果和调试器分离；若后续页面无法唯一识别输入或确认结果，仅停用该自动交接路径。
8. 翻译页按钮先取得当前 PDF 的单次下载授权，再调用官方「翻译全部并下载」；Electron 只为同一窗口产生的该次下载设置源文件夹目标路径，并把完成状态回传页面。

当前方案将 PDF 文件路径交给官方 React 页的文件输入，并在独立 isolated world 中运行 userscript；这两层都不是官方公开 API，因此按兼容探针管理。方案不采用长期本地 HTTP 服务，也不把大文件编码成 base64/Blob 注入页面，以避免端口暴露、跨渲染进程 URL 失效和大文件内存放大。

### P2：统一文档翻译工作区（第一阶段已交付）

1. 「打开文档翻译工作区」命令已承接 EPUB/MOBI/FB2/FBZ、DOCX、HTML/HTM/TXT/JSON、Markdown 和 SRT/ASS/VTT；活动文件名会进入手动选择提示。
2. 当前这些格式统一进入官方 `/file/` 工作区并由用户手动选择；未支持的活动文件也可以打开通用工作区另选文件。
3. 后续为每种格式建立独立探针，再复用 P1 的路径校验、单次 CDP 生命周期和手动回退框架，不共享未经验证的 selector。
4. 只有唯一文件输入、事件时序和可见上传状态均有证据的格式才启用自动交接；任一条件失败只影响该格式的自动层。
5. ePub、字幕、DOCX 和 PDF 继续使用官方上传、编辑、预览与导出流程，不在 Obsidian 内复制 viewer、时间轴编辑器、OCR 或导出器。
6. 若官方工作区长期不可用，只对 Markdown、TXT、JSON、HTML 这类 Obsidian 核心文本格式另行评估 clean-room 本地实现。

### P3：窗口与使用体验收尾

1. 区分 Dashboard、PDF 工作区和 Document Translation 工作区的标题、导航和最近窗口状态。
2. 补充返回设置、关闭、重新选择文件、上传中和错误恢复状态。
3. 为远程 PDF、本地 PDF、不同大小文件和 Pro/免费账户建立人工回归清单。
4. 文档明确哪些能力在当前笔记内运行，哪些能力进入官方文档工作区。

## 官方流程依据

完整证据、现场实验和逐格式 GO/CUT 矩阵见 [P1/P2 可行性报告](P1_P2_FEASIBILITY.md)。

- [PDF 翻译](https://immersivetranslate.com/docs/features/pdf/)
- [使用说明：悬停、视频与文档入口](https://immersivetranslate.com/docs/usage/)
- [常见问题：本地 HTML/PDF](https://immersivetranslate.com/docs/faq/)
- [Document Translation](https://immersivetranslate.com/en/document/)
- [PDF Pro](https://official-worker.immersivetranslate.com/en/document/pdf-pro-translator/)
