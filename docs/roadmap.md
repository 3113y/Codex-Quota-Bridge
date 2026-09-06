# Roadmap

## Codex integration hardening

- Add versioned compatibility tests against generated Codex App Server and MCP schemas.
- Correlate Codex session identity with CQB task state through supported hook fields.
- Add an optional App Server resume adapter for installations that deliberately choose externally driven Codex turns.

## Reviewer return

- Add a tray-owned, state-scoped clipboard watcher with visible waiting state and immediate disable control.
- Add transport adapters that preserve the same `ReviewerTransport` contract.

## Windows experience

- Add a signed background service and tray UI for status, automation mode, review count, pause, and Autopilot disable.
- Add Windows notification-center delivery with actionable review status.
- Add installer signing and an uninstall workflow.

## Measurement

- Calibrate context estimates against official counters when available.
- Report retry patterns, review latency, and verification outcomes without presenting estimated values as quota measurements.
