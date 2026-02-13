# Changelog

All notable changes to this project are documented in this file.

This project follows Semantic Versioning.

## [0.1.0] - 2026-02-13

### Added

- Initial OpenClaw IOTA wallet plugin scaffold and manifest.
- Read-only tools: `iota_active_env`, `iota_get_balance`, `iota_get_gas`.
- Approval-gated transfer flow: `prepare`, `approve`, `dry-run`, `execute`.
- Signer modes: local keystore, external signature, and KMS.
- Signature verification before execute.
- Persistent draft store for transfer approvals.
- CI workflow for typecheck + tests.
- Release checklist and project plan docs.
- Install-time wallet bootstrap:
  - sets IOTA env to `mainnet`
  - creates first wallet address when keystore is empty

### Changed

- Plugin id standardized to `openclaw-iota-wallet`.
- Default network changed to `mainnet`.
