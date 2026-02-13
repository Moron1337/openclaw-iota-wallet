---
name: iota-wallet
description: Operate IOTA wallet tools through a safe approval-gated flow in OpenClaw.
---

# IOTA Wallet Skill

Use this flow for every state-changing operation:

1. Run `iota_prepare_transfer`.
2. If approvals are enabled, run `iota_approve_transfer`.
3. Run `iota_execute_transfer`.

Rules:

- Prefer read-only tools (`iota_active_env`, `iota_get_balance`, `iota_get_gas`) for diagnostics.
- Never bypass recipient allowlist or transfer amount policy.
- If an execution tool reports `not_implemented`, stop and report which milestone is required.
