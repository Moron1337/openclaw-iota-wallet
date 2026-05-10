# Changelog

All notable changes to this project are documented in this file.

This project follows Semantic Versioning.

## Unreleased

### Changed

- Refreshed CI/test dependencies while keeping `@iota/iota-sdk` pinned to `1.10.1`.

## [0.2.0] - 2026-03-17

### Changed

- Switched the standard runtime from CLI-first to SDK-first for reads, local-keystore signing, dry-run, and execute.
- Reduced the remaining CLI requirement to the optional KMS signer bridge.
- Added SDK-keystore bootstrap fallback during `postinstall` when the IOTA CLI is missing or unusable.
- Bumped the documented Node.js baseline to `>=20`.

## [0.1.2] - 2026-02-13

### Changed

- Added a step-by-step transfer execution guide to `README.md` with example payloads for `prepare`, `approve`, `dry-run`, and `execute`.
- Synced plugin manifest version to `0.1.2`.

## [0.1.1] - 2026-02-13

### Changed

- Updated repository, issue, homepage, CI badge, and security advisory links to the renamed GitHub repo `Moron1337/openclaw-iota-wallet`.
- Aligned lockfile package name metadata with `openclaw-iota-wallet`.

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
