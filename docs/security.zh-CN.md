# 安全模型

[English](security.md) | [简体中文](security.zh-CN.md)

CQB 将自动向外部应用输入视为特权操作。

## 默认边界

Safe 模式只复制当前任务生成的审查请求；选择内置 Browser 提供方时，CQB 会为 Codex 桌面版返回宿主 `browserAction`，不会在这条路径上打开外部浏览器。CQB 在 Safe 模式下不能执行聚焦、粘贴或发送。仅在任务等待期间，才会从显式的 `cqb_get_review` 响应参数导入审查输出。

## Assisted 模式边界

Assisted 模式在粘贴前要求满足以下全部条件：

1. 配置的 URL 使用 `https://chatgpt.com`；
2. 在允许的进程中找到 Chrome 或 Edge 窗口；
3. 其 PID、HWND 和标题与配置的审查者身份匹配；
4. 浏览器地址栏精确指向配置的 ChatGPT 会话；
5. Windows UI Automation 定位并聚焦 ChatGPT 编辑框；
6. 同一前台 HWND 保持活动；
7. 待处理封装的类型、任务 ID、状态和 SHA-256 哈希仍然匹配。

消息由用户提交。

## Autopilot 模式边界

Autopilot 还要求使用 `config.autopilot.example.yaml` 中的精确授权声明、设置 `auto_send: true`、存在有效的待处理 CQB 封装，并且任务仍有自动审查额度。CQB 会在桌面输入前持久预留载荷哈希和发送额度，并在粘贴前以及按下 Enter 前再次即时验证并聚焦编辑框。

编辑框焦点检查、HWND 检查、剪贴板比对和键盘操作均在同一个有时限的 PowerShell/UI Automation 进程中执行。CQB 要求粘贴前编辑框为空，随后通过 UI Automation 回读编辑框，并在按下 Enter 前要求内容与完整载荷精确匹配。任一检查失败后，CQB 都不会继续执行键盘输入；已验证的请求会保留在剪贴板中供手动使用。

## 数据处理

审查包仅包含调用方选择的文件、符号、摘录、证据、错误、尝试、约束和差异摘要。CQB 会在有大小限制的审查包中保留每个必需部分，并对 bearer/basic 凭据、常见 API 与云令牌、JWT、凭据赋值、带身份信息的连接字符串及私钥区块进行脱敏。

可随时运行 `cqb automation disable` 启用持久化运行时总开关。`cqb consent revoke` 也会将保存的配置切换为 Safe 模式并启用该总开关。

请将仓库内容视为潜在敏感信息。在 Safe 或 Assisted 模式下发送前审阅审查包，并使用与该仓库相适应的 ChatGPT 工作区和数据保留策略。
