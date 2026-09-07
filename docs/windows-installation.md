# Windows Installation

[English](windows-installation.md) | [简体中文](windows-installation.zh-CN.md)

## Requirements

- Windows 10 or 11
- Node.js 22 or newer
- Git, with each CQB-managed project inside a Git worktree
- pnpm 11 or newer
- Codex CLI 0.153.3 or newer with plugin and MCP support

Confirm the toolchain:

```powershell
node --version
git --version
pnpm --version
codex --version
```

CQB validates the Git worktree during task registration because the completion gate independently captures working, staged, and untracked changes. Registration fails with a direct error when the workspace is not a Git worktree.

## Build and verify

From the CQB repository:

```powershell
pnpm install
pnpm build
pnpm test
pnpm demo
```

## Install in Codex

Run:

```powershell
.\scripts\install.ps1
```

The installer builds CQB, creates `build\marketplace\.agents\plugins\marketplace.json`, registers that local marketplace when needed, and installs `codex-quota-bridge@cqb-local`. It creates `%CODEX_HOME%\cqb\config.yaml` from the Safe profile once and preserves that file on updates. It does not hand-edit `config.toml`.

Restart the ChatGPT desktop app or Codex CLI and start a new task. Review the plugin's hook definitions and trust them when Codex prompts. Installed plugin capabilities are loaded by new tasks.

## Install the CLI from npm

The published v1.0.0 package installs the `cqb` command globally:

```powershell
npm install -g codex-quota-bridge@1.0.0
cqb settings --config "$env:CODEX_HOME\cqb\config.yaml"
```

## Bind the reviewer conversation

For Codex desktop, CQB uses the built-in Browser by default. The first review request automatically invokes `@Browser` and searches for the dedicated reviewer conversation. When a matching conversation exists, Codex opens it; otherwise it proposes creating a new conversation named `CQB Reviewer` and persists the confirmed `/c/...` URL through the `cqb_bind_reviewer` MCP tool. The built-in Browser uses its own profile, so sign in there when prompted. CQB validates the HTTPS ChatGPT conversation URL and stores the provider as `builtin`; it does not read cookies or scrape the page. No shell command or CQB-specific prompt is required for this one-time binding. For Codex CLI, or when `@Browser` is unavailable, use the local fallback:

```powershell
node .\dist\cli\index.js setup-reviewer
```

The local fallback scans allowed Chrome/Edge windows through Windows UI Automation. Return to the terminal and press Enter after opening the target conversation. Add `--window-title "CQB Reviewer"` to select one when multiple valid windows are open.

The setup command does not submit a message or import clipboard content. If target validation fails, it leaves the existing configuration unchanged.

## Configure the reviewer

Edit `%CODEX_HOME%\cqb\config.yaml`. Set:

```yaml
reviewer:
  browser_provider: builtin
  conversation_url: https://chatgpt.com/c/your-dedicated-conversation
  expected_window_title: CQB Reviewer
```

Name the dedicated conversation so its browser title contains `CQB Reviewer`. Select Sol in that conversation. CQB records the preferred model but cannot verify the selected ChatGPT model through Windows native APIs.

Keep the default Safe mode during initial use. Copy `config.assisted.example.yaml` when you want verified focus and paste, or `config.autopilot.example.yaml` when you want verified submission. Replace the example conversation URL before use. Read [Security](security.md) before configuring automatic input.

Grant Autopilot consent only with the exact statement:

```powershell
node .\dist\cli\index.js consent grant --statement "I understand CQB may focus ChatGPT, paste repository context, and submit a message."
```

Disable automatic input immediately, or revoke consent and return the saved configuration to Safe mode:

```powershell
node .\dist\cli\index.js automation disable
node .\dist\cli\index.js consent revoke
```

## Update

Rebuild and rerun the installer. The installer reuses the matching local marketplace and preserves the user configuration. Start a new Codex task so the updated Skill, MCP server, and hooks are loaded.

## Administrative CLI

After building:

```powershell
node .\dist\cli\index.js settings --config "$env:CODEX_HOME\cqb\config.yaml"
node .\dist\cli\index.js status <task-id>
node .\dist\cli\index.js review <task-id>
node .\dist\cli\index.js consent
node .\dist\cli\index.js automation disable
```
