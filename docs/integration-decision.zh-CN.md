# Codex Quota Bridge 集成方案

[English](integration-decision.md) | [简体中文](integration-decision.zh-CN.md)

**状态：** 已采纳用于 MVP  
**日期：** 2026-09-05

## 决策

CQB 以 Codex 插件形式交付，包含：

- 一个指导执行者何时本地工作、何时停止重试以及如何使用审查建议的 Codex Skill；
- 一个提供稳定 CQB 工具接口并管理持久化任务状态的本地 STDIO MCP 服务器；
- 为常规 Codex 任务附加会话标识和 CQB 路由指引的可信生命周期 Hook；
- 一个审查桥，其中 Safe 模式可请求 Codex 桌面版内置 Browser，并为 CLI 保留经过验证的 Chrome/Edge 回退；
- 由目标验证、载荷验证、用户授权和单任务发送上限保护的独立 Assisted 与 Autopilot 适配器。

MCP 服务器是 MVP 阶段的轻量 CQB 守护进程。插件启用后，Codex 会将其作为后台子进程启动，因此日常使用无需可见终端。运行时状态持久化在配置的 CQB 状态目录中，并能在 MCP 进程重启后恢复。

## 为什么这是原生集成方式

当前官方 Codex 插件格式允许在一个可安装单元中包含 Skill、MCP 服务器和生命周期 Hook。当前 Codex 客户端支持本地 STDIO MCP 服务器及插件作用域的工具策略。Skill 可根据描述被隐式选择，`SessionStart` 和 `UserPromptSubmit` Hook 则可向普通 Codex 任务加入模型可见的策略上下文。

这一组合提供以下安装后体验：

```text
常规 Codex 任务
    |
    +-- CQB Skill：执行与升级策略
    +-- CQB Hook：会话与任务上下文
    +-- CQB MCP：状态、熔断器、审查包、审查桥、结果门禁
                         |
                         +-- ChatGPT Plus 审查会话
```

Codex App Server 保留在适配器边界之后，供后续扩展使用。它是供应用托管或驱动 Codex 任务的官方 JSON-RPC 接口，但若将其作为主要集成方式，CQB 将成为第二个 Codex 客户端，不符合用户应在常规 Codex 任务中开始并持续工作的产品要求。

## 运行流程

1. 插件 Skill 和 Hook 使 CQB 可用于常规 Codex 任务。
2. 出现有意义的失败或用户明确要求专家审查时，执行者调用 CQB。
3. 仅当策略与证据要求均满足时，熔断器才允许升级。
4. CQB 持久化经过压缩和哈希绑定的审查请求。
5. 审查请求会检测原始 `user_input` 的语言并加入明确的回复语言指令；旧调用缺少该字段时回退到任务目标。
6. Safe 模式复制请求，并返回供 `@Browser` 执行的宿主 `browserAction`，或打开配置的 `https://chatgpt.com/...` 会话但不发送输入。
7. 首次使用时，Codex 桌面版自动调用 `@Browser`，搜索专用审查会话，打开已有匹配会话，或在创建 `CQB Reviewer` 后通过 `cqb_bind_reviewer` 保存用户确认的 `/c/...` URL；CLI 使用 `cqb setup-reviewer` 和 Windows UI Automation。
8. Assisted 模式在粘贴前通过 Windows UI Automation 验证浏览器 PID/HWND、精确 ChatGPT 会话 URL 和已聚焦的编辑框；消息由用户发送。
9. Autopilot 执行相同检查，并且仅在明确授权已持久化且未超过自动发送上限时发送。
10. 任务处于 `WAITING_FOR_REVIEW` 时，用户将复制的审查文本显式传给 MCP 工具；执行者在编辑前根据仓库验证所有建议。
11. 仅当 CQB 自身的验证运行器执行配置命令并检查 Git 状态后，才接受 `DONE`。

## 稳定工具接口

MVP 提供以下工具：

- `cqb_status`
- `cqb_should_escalate`
- `cqb_request_review`
- `cqb_bind_reviewer`
- `cqb_review_status`
- `cqb_get_review`
- `cqb_report_result`

管理功能通过可选的 `cqb` CLI 提供，传输层细节保留在适配器内部。

## 安全边界

- Safe 是默认模式，不能合成键盘输入。
- Assisted 模式不能提交消息。
- Autopilot 要求在本地保存精确授权声明。
- 粘贴和发送仅能操作当前任务中通过 SHA-256 验证的 `CQB_REVIEW_REQUEST`。
- 浏览器 PID、HWND、窗口标题、当前地址栏 URL 和已聚焦的 ChatGPT 编辑框必须在执行相应键盘操作的同一 Windows UI Automation 进程内匹配。
- 验证失败时保留审查包供手动使用，且不执行键盘输入。
- 仅在任务等待期间接收作为显式工具参数提供的审查响应。
- CQB 不抓取 ChatGPT、不读取 Cookie、不使用 OpenAI API 密钥，也不宣称可精确计算配额节省量。
- 暂停任务仅能在用户批准后通过显式调用 `cqb_status` 并设置 `resume: true` 来恢复。

## 平台约束

- Windows 是 MVP 已实现的本地自动化平台。
- ChatGPT 模型选择由配置的审查会话决定。CQB 将 `preferred_model: sol` 记录为用户意图，但不宣称能通过原生窗口 API 验证或切换当前 ChatGPT 模型。
- Safe 模式的审查返回由用户参与：用户复制审查响应，Codex 在等待期间将其显式传给 CQB。
- Codex 运行已安装插件提供的 Hook 前需要用户信任。
- 后续可由托盘进程负责通知和持续剪贴板等待；MVP 的守护进程生命周期由 Codex 通过内置 MCP 服务器管理。

## 官方参考

- [插件架构](https://developers.openai.com/plugins/concepts/plugins)
- [插件打包](https://developers.openai.com/plugins/build/plugins)
- [Codex MCP 集成](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
- [Codex Hook](https://learn.chatgpt.com/docs/hooks)
- [Codex 应用服务器](https://learn.chatgpt.com/docs/app-server)

## 本地能力检查

开发主机提供 Codex CLI 0.153.3，并支持 `codex plugin`、`codex mcp` 和 `codex app-server`。环境中可用 Node.js 22.17.1 和 Codex 内置的 pnpm 11.19.0。仓库初始为空目录，因此本实现建立了完整的插件与 TypeScript 项目结构。
