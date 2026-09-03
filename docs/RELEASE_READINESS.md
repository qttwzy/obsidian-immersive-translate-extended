# Immersive Translate Extended 公开发布准备度

> 更新日期：2026-09-01
>
> 权威发布合同：[ADR 0001](decisions/0001-public-beta-release-contract.md)
>
> 执行步骤：[RELEASE_PROCESS.md](RELEASE_PROCESS.md)

## 当前结论

仓库内的 4.0.0 产品与发布工程已经采用以下合同。创建公共仓库、Tag 或 Pre-release 仍以真实双平台证据、仓库历史审计、最终产物检查和维护者明确批准为前提。

| 项目 | 当前合同 |
| --- | --- |
| 产品范围 | Obsidian Desktop 的 Markdown 阅读翻译、悬浮球、划词/悬停、PDF/文档翻译工作区、安全配置迁移和显式冲突处理 |
| 运行时设置 | 设置页自动显示本机版本与官方当前版本；用户从官方地址安装或更新运行时 |
| 启动行为 | 启动时读取本机 `userscript.runtime.js` 并检查 `@version` 元数据 |
| 发行包 | GitHub Pre-release 完整 ZIP，包含项目插件文件、许可证和第三方说明 |
| 发布证据 | 精确绑定插件版本、Git commit、最低 Obsidian 版本、macOS/Windows 各自的实测运行时版本及证据链接 |
| 发布元数据 | ZIP 与 SBOM 校验和、SPDX 2.3 项目 SBOM、记录运行时设置来源和实测版本的 `release-manifest.json` |
| 账户与 Dashboard | 4.0.0 已包含账户状态展示、独立 Dashboard 登录/管理和高级设置同步；仍须通过同一双平台安全验收 |

## 仓库内已完成

### 运行时安装与加载

- 打开设置页时从官方地址读取脚本并解析 `@version`，结果在短时间内复用；安装与更新仍由用户明确触发。
- 下载地址为 `https://download.immersivetranslate.com/immersive-translate.user.js`。
- 安装器在写入前解析 `@version`，使用临时文件替换本机运行时，并在失败时保留已有可用文件。
- 插件启动读取本机运行时；尚未安装时提示用户前往设置。
- 首次安装可直接激活引擎；引擎已经运行时，更新在重启 Obsidian 后生效。
- `userscript.runtime.js` 及安装过程临时文件均排除在 Git 历史之外。

### 发布构建

- 构建器只从干净 Git commit 的 detached worktree 读取发行输入。
- 生成的 `main.js`、插件/桥接版本、manifest 和 package 版本必须一致。
- ZIP 白名单固定为：

  ```text
  immersive-translate-extended/LICENSE
  immersive-translate-extended/THIRD_PARTY_NOTICES.md
  immersive-translate-extended/dashboard-preload.js
  immersive-translate-extended/document-preload.js
  immersive-translate-extended/document-runtime.js
  immersive-translate-extended/main.js
  immersive-translate-extended/manifest.json
  immersive-translate-extended/styles.css
  ```

- 输出包含完整 ZIP、SPDX 2.3 项目 SBOM、`release-manifest.json` 和 `SHA256SUMS`。
- 输出先在临时目录中完成，再原子移动到目标目录。
- 自动化测试覆盖输入校验、资产白名单、commit 绑定、平台证据、运行时设置元数据、SBOM 边界和输出清理。

### 产品安全边界

- 公开测试版提供当前 Obsidian 窗口中的阅读翻译，以及独立的官方 PDF/文档翻译工作区。
- 编辑器区域保持受保护，整页翻译临时切换阅读视图并在结束后恢复原模式。
- PDF 标题栏按钮与命令只接受活动 PDF；本地文件通过 Vault 路径、类型、大小和受信任页面状态校验后尝试交接，失败时保留手动选择。
- 文档窗口限制在受信任的官方 origin 与路由，preload 使用隔离上下文；译文 PDF 保存授权绑定当前窗口、文件代次和一次导出。
- 配置导入/导出执行字段、条目数量和总大小限制，并过滤凭据类字段。
- 冲突处理保留用户控制，默认维持其他插件的当前状态。
- 插件没有新增项目运营的分析或崩溃上报服务；网络与本地存储边界记录在 [PRIVACY.md](../PRIVACY.md)。
- Dashboard 使用隔离的持久化窗口分区；主窗口与 Dashboard 通过受限 preload/IPC 请求同步账户和高级设置，页面侧不直接获得 Node.js 能力。

## 发布前必须补齐的证据

### 1. 仓库与第三方边界

- 扫描全部 refs、Git 对象、工作流、文档和构建产物中的真实凭据与隐私数据；轮换所有已暴露秘密。
- 确认公开仓库只包含有权公开的项目代码、测试、文档和素材。
- 复核项目名称、上游名称、域名和商标表述，保持非官方关系声明。
- 复核 `THIRD_PARTY_NOTICES.md`、LICENSE、README、PRIVACY、SECURITY 和 SUPPORT 的最终内容。

### 2. macOS 与 Windows 实机验收

在同一候选 commit 上分别使用干净 Obsidian profile 执行：

- 完整 ZIP 安装、启用、重启、禁用、升级和卸载/重装；
- 打开设置页，确认本机版本、官方当前版本和失败状态；
- 从设置页首次安装运行时，确认显示的版本；
- 再次执行更新，确认提示与重启后的版本状态；
- 设置页显示账户名称和会员状态，Dashboard 按钮可见；运行时版本一致时更新按钮显示“已是最新版本”并保持禁用；
- 打开 Dashboard 后完成登录/账户状态读取、高级设置同步和窗口重启恢复；
- Dashboard 页面无法直接访问 Node.js、额外权限或不受信任的导航；
- 已安装运行时条件下的离线启动；
- Markdown 阅读视图整页翻译、双语/仅译文、划词与悬停；
- PDF 标题栏翻译按钮、命令入口、当前 Vault PDF 自动交接与手动回退；
- 文档工作区手动选取，以及译文 PDF 保存、取消和失败状态；
- 界面/正文范围开关，编辑模式保护，多 leaf 与快速切换；
- 同类插件冲突提示与用户选择；
- 缺少运行时、无效版本元数据、官方地址请求失败等错误态；
- 窄窗口、键盘焦点、常用主题与高 DPI 的基本可用性。

每份证据记录：

- 插件版本、Git commit、Obsidian 版本和操作系统；
- 设置页显示的运行时版本；
- 输入、预期、实际结果和已知限制；
- 已脱敏截图或日志的 HTTPS 链接。

将两份通过结果写入仓库外的 `platform-evidence.json`，格式见 [RELEASE_PROCESS.md](RELEASE_PROCESS.md)。

### 3. 候选产物检查

在证据绑定的干净 commit 上执行：

```bash
npm ci --ignore-scripts
npm run build
npm run quality
npm run release:build -- \
  --root "$PWD" \
  --platform-evidence /absolute/path/to/platform-evidence.json \
  --out "$PWD/releases/4.0.0"
```

随后检查：

- `SHA256SUMS` 能验证 ZIP、SBOM 和 release manifest；
- ZIP 路径与七项白名单完全一致；
- `release-manifest.json` 的 commit、版本、官方来源、双平台实测运行时版本和证据链接准确；
- SBOM 只描述项目应用与生产 npm 元数据；
- 将该 ZIP 再安装到 macOS 与 Windows 干净 profile，完成阅读翻译、设置版本状态和 PDF 工作区 smoke test。

### 4. GitHub 治理与发布

- 默认分支禁止 force push 和删除，并要求通过质量检查与必要 review。
- Release tag 受保护；第三方 Actions 固定到审查过的 commit SHA。
- 按仓库可用能力启用 Dependabot、secret scanning、push protection、CodeQL 和 dependency review。
- Release 先保持 Draft 与 Pre-release 状态，上传四项预期产物并从未登录会话验证下载。
- 发布说明包含支持平台、最低 Obsidian、安装与运行时设置步骤、用户可见变化、已知限制、隐私边界和回滚方式。

## Go / No-go 清单

### GitHub public beta

- [ ] 公开仓库策略、备份、负责人和历史扫描记录已确认。
- [ ] secrets 已轮换，扫描结果已处置，发行包中没有 Vault、缓存、测试资产或诊断材料。
- [ ] 第三方归属、商标、非官方关系和数据边界已经复核。
- [ ] README、PRIVACY、SECURITY、SUPPORT、CHANGELOG 与发布说明一致。
- [ ] macOS 与 Windows 已完成同一候选 commit 的真实 Obsidian 验收，并分别记录设置页显示的运行时版本。
- [ ] 最终 ZIP 已在两个平台完成安装、运行时设置、阅读翻译和 PDF 工作区 smoke test。
- [ ] ZIP 白名单、校验和、SBOM、release manifest 和证据链接已人工复核。
- [ ] 分支/Tag 规则、CI 和可用的安全扫描已经启用。
- [ ] 维护者已明确批准创建 Tag 并发布 Pre-release。

### BRAT 与 Obsidian Community

这两个渠道使用独立的三文件交付和政策审查流程。开始相应发布前，需要单独验证安装合同、运行时设置方式、最低 Obsidian 版本、README/manifest 布局和官方目录政策。

## 参考资料

### Obsidian 官方

- [Developer policies](https://docs.obsidian.md/Community+directory/Developer+policies)
- [Submission requirements for plugins](https://docs.obsidian.md/Community+directory/Submission+requirements+for+plugins)
- [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin)
- [Release your plugin with GitHub Actions](https://docs.obsidian.md/Plugins/Releasing/Release+your+plugin+with+GitHub+Actions)
- [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)

### GitHub 官方

- [Repository best practices](https://docs.github.com/en/repositories/creating-and-managing-repositories/best-practices-for-repositories)
- [Securing your repository](https://docs.github.com/en/code-security/getting-started/securing-your-repository)
- [Secure use reference for GitHub Actions](https://docs.github.com/en/actions/reference/security/secure-use)
- [Using artifact attestations](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/using-artifact-attestations-to-establish-provenance-for-builds)

## 推荐执行顺序

1. 完成本仓库改动的自动化验证与代码审查并提交。
2. 安装该提交构建的插件，在 macOS 与 Windows 记录真实验收证据。
3. 将证据绑定到候选 commit，构建并检查四项 Release 产物。
4. 完成公共仓库审计与治理设置后，由维护者批准 Tag 和 Pre-release。
