# Windows 安装说明

[English](windows-installation.md) | [简体中文](windows-installation.zh-CN.md)

## 环境要求

- Windows 10 或 11
- Node.js 22 或更高版本
- Git，且每个由 CQB 管理的项目都必须位于 Git 工作树中
- pnpm 11 或更高版本
- Codex CLI 0.153.3 或更高版本，并支持插件与 MCP

确认工具链：

```powershell
node --version
git --version
pnpm --version
codex --version
```

CQB 会在任务登记时验证 Git 工作树，因为完成门禁需要独立捕获工作区、暂存区和未跟踪文件的变化。若工作区不是 Git 工作树，登记会返回直接错误。

## 构建与验证

在 CQB 仓库中运行：

```powershell
pnpm install
pnpm build
pnpm test
pnpm demo
```

## 安装到 Codex

运行：

```powershell
.\scripts\install.ps1
```

安装程序会构建 CQB、创建 `build\marketplace\.agents\plugins\marketplace.json`、按需登记该本地市场，并安装 `codex-quota-bridge@cqb-local`。它首次运行时根据 Safe 配置创建 `%CODEX_HOME%\cqb\config.yaml`，更新时保留该文件；不会手动修改 `config.toml`。

重启 ChatGPT 桌面应用或 Codex CLI，然后新建任务。当 Codex 提示时，请检查并信任插件的 Hook 定义。已安装的插件能力会由新任务加载。

## 从 npm 安装 CLI

已发布的 v1.0.0 包会全局安装 `cqb` 命令：

```powershell
npm install -g codex-quota-bridge@1.0.0
cqb settings --config "$env:CODEX_HOME\cqb\config.yaml"
```

## 绑定审查会话

在 Codex 桌面版中，CQB 默认使用内置 Browser。首次发起审查请求时会自动调用 `@Browser` 并搜索专用审查会话。找到匹配会话后，Codex 会直接打开；如果不存在，Codex 会提出创建名为 `CQB Reviewer` 的新会话，并通过 `cqb_bind_reviewer` MCP 工具保存确认后的 `/c/...` URL。内置 Browser 使用独立配置，因此按提示在其中登录。CQB 只验证 HTTPS ChatGPT 会话 URL，并将提供方保存为 `builtin`；不会读取 Cookie 或抓取页面。首次绑定不需要输入 Shell 命令或 CQB 专用提示词。Codex CLI 或无法使用 `@Browser` 时，使用本地回退流程：

```powershell
node .\dist\cli\index.js setup-reviewer
```

本地回退流程通过 Windows UI Automation 扫描允许的 Chrome/Edge 窗口。打开目标会话后回到终端按 Enter；同时打开多个有效窗口时，可添加 `--window-title "CQB Reviewer"` 选择其中一个。

该命令不会提交消息，也不会导入剪贴板内容。如果目标验证失败，现有配置保持不变。

## 配置审查会话

编辑 `%CODEX_HOME%\cqb\config.yaml`，设置：

```yaml
reviewer:
  browser_provider: builtin
  conversation_url: https://chatgpt.com/c/your-dedicated-conversation
  expected_window_title: CQB Reviewer
```

为专用会话命名，使浏览器标题包含 `CQB Reviewer`，并在该会话中选择 Sol。CQB 会记录首选模型，但无法通过 Windows 原生 API 验证当前选中的 ChatGPT 模型。

初次使用时保持默认 Safe 模式。需要经过验证的聚焦和粘贴时，可参考 `config.assisted.example.yaml`；需要经过验证的自动提交时，可参考 `config.autopilot.example.yaml`。使用前请替换示例会话 URL。配置自动输入前请阅读 [安全模型](security.zh-CN.md)。

仅使用以下精确声明授予 Autopilot 权限：

```powershell
node .\dist\cli\index.js consent grant --statement "I understand CQB may focus ChatGPT, paste repository context, and submit a message."
```

立即禁用自动输入，或撤销授权并将保存的配置恢复为 Safe 模式：

```powershell
node .\dist\cli\index.js automation disable
node .\dist\cli\index.js consent revoke
```

## 更新

重新构建并再次运行安装程序。安装程序会复用匹配的本地市场并保留用户配置。新建 Codex 任务以加载更新后的 Skill、MCP 服务器和 Hook。

## 管理命令行

构建后可运行：

```powershell
node .\dist\cli\index.js settings --config "$env:CODEX_HOME\cqb\config.yaml"
node .\dist\cli\index.js status <task-id>
node .\dist\cli\index.js review <task-id>
node .\dist\cli\index.js consent
node .\dist\cli\index.js automation disable
```
