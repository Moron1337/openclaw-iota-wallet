# OpenClaw IOTA Wallet Plugin - Project Plan

Last updated: 2026-02-13

## 1) Goal

Build a reusable OpenClaw plugin that exposes IOTA wallet capabilities safely:

- Read-only wallet operations for agent workflows.
- Approval-gated state-changing operations.
- Distribution as npm package so others can install with `openclaw plugins install`.

## 2) Current Decisions (locked)

- Plugin style: OpenClaw plugin with `openclaw.plugin.json` + `configSchema`.
- Runtime model: In-process plugin, therefore treated as trusted code.
- Integration strategy: CLI-first (`iota client`, `iota keytool`) with strict command allowlist.
- Security strategy: Optional tools only for side effects + explicit approval workflow.
- Transaction strategy: two-phase flow (prepare -> approve -> execute) with future offline-sign support.

## 3) Repository Layout

- `openclaw.plugin.json`: plugin id, schema, UI hints.
- `index.ts`: plugin entry and tool registration.
- `src/config.ts`: config normalization and defaults.
- `src/iota-cli.ts`: safe CLI wrapper.
- `src/errors.ts`: typed plugin error taxonomy.
- `src/validation.ts`: reusable input validation utilities.
- `src/draft-store.ts`: persistent transfer draft state.
- `src/tools/read-tools.ts`: read-only tools.
- `src/tools/tx-tools.ts`: approval-gated transfer flow (prepare, approve, dry-run, execute).
- `skills/iota-wallet/SKILL.md`: plugin-bundled operator guidance.
- `examples/openclaw.config.snippet.json5`: config bootstrap snippet.
- `.github/workflows/ci.yml`: CI pipeline for typecheck + tests.
- `docs/RELEASE_CHECKLIST.md`: release and publishing checklist.

## 4) Milestones

### M0 - Bootstrap (done)

- [x] Project directory created.
- [x] Git repository initialized.
- [x] Plugin manifest and TS scaffold created.
- [x] Initial skill and config example included.

### M1 - Read-only production path

- [x] Harden `execIotaCli` parser for large JSON payloads and edge cases.
- [x] Add address and coin-type validation utilities.
- [x] Add tests for `iota_active_env`, `iota_get_balance`, `iota_get_gas`.
- [x] Add error taxonomy for CLI/RPC/parse failures.

### M2 - Real prepare flow

- [x] Replace placeholder transfer draft with real unsigned transaction generation.
- [x] Implement `iota client ... --serialize-unsigned-transaction` integration.
- [x] Parse and store `tx_bytes` + decoded preview for user confirmation.
- [x] Add policy checks before draft creation (network, recipient, max amount).

### M3 - Approval + execution

- [x] Implement tokenized approvals with persistent store (state dir).
- [x] Wire `iota_execute_transfer` to signed tx execution path.
- [x] Add explicit dry-run mode where available.
- [x] Add mandatory decode/preview before final send.

### M4 - Signer abstraction

- [x] Local keystore signer path (`iota keytool sign`).
- [x] External signer mode: export unsigned payload and accept signature input.
- [x] Optional KMS signer integration path (`keytool sign-kms`).
- [x] Signature verification before broadcast.

### M5 - Packaging and release

- [x] CI: lint/typecheck/tests.
- [x] Versioning and changelog policy.
- [x] Publish checklist and docs for external users.
- [x] Install + doctor validation against OpenClaw target versions.

## 5) Security Baseline

- Never allow arbitrary shell or unrestricted commands.
- Allow only whitelisted `iota` subcommands.
- Keep side-effect tools optional in OpenClaw.
- Use approval gating for all transfer/sign/execute operations.
- Enforce transfer ceilings and recipient allowlists.
- Redact secret material from tool output.
- Pin package versions during deployment.

## 6) Local Dev Start

```bash
cd /home/codex/openclaw-iota-wallet-plugin
npm install
npm run build
```

Example plugin install (local link):

```bash
openclaw plugins install -l /home/codex/openclaw-iota-wallet-plugin
openclaw plugins enable openclaw-iota-wallet
openclaw plugins doctor
```

## 7) Known Gaps in Skeleton

- End-to-end mainnet transfer execution from a funded wallet is still pending.

## 8) Current Status Log

- 2026-02-13: M0 completed.
- 2026-02-13: M1 completed (validation, parser hardening, error taxonomy, read-tools tests).
- 2026-02-13: M2 completed (real unsigned tx generation + decode preview + policy checks).
- 2026-02-13: M3 partially completed (persistent draft store + execute path done; dry-run still open).
- 2026-02-13: M3 completed (persistent draft store + execute path + dry-run).
- 2026-02-13: M4 completed (local keystore, external signature and KMS signer mode + signature verification).
- 2026-02-13: M5 mostly completed (CI workflow + release checklist + versioning policy; live install validation open).
- 2026-02-13: M5 completed install validation on OpenClaw `2026.2.12` with plugin install + enable + `openclaw plugins doctor`.
- 2026-02-13: Installed IOTA CLI `1.16.2` on OpenClaw VM and validated required subcommands for plugin runtime (`client`/`keytool` paths used by tools).
- 2026-02-13: Added install-time wallet bootstrap (`postinstall`) to enforce `mainnet` env and auto-create the first wallet address when keystore is empty.
- 2026-02-13: Test status: `14/14` tests passing (`npm run build && npm test`).
## 9) External Source Notes (research basis)

- OpenClaw plugin docs: manifest, agent tools, plugin CLI, security model.
- IOTA docs: install, connect, client CLI, keytool CLI, offline transaction flow.
- Repository status checked on 2026-02-13:
  - `iotaledger/iota`: active.
  - `iotaledger/iota-sdk`: archived.
  - `iotaledger-archive/wallet.rs`: archived.

## 10) Next Implementation Order

1. Add stricter fail-safe checks before execution (network constraints, optional interactive confirmation policy).
2. Execute a full funded mainnet transfer E2E (prepare -> approve -> dry-run -> execute) and archive evidence.
3. Publish first external release.
