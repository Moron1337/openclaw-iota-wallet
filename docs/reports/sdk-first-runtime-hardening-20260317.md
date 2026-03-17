# SDK-First Runtime Hardening - 2026-03-17

## Goal

Remove the hard dependency on a working local `iota` binary for the standard OpenClaw wallet flow.

## What Changed

- Read tools now use the IOTA TypeScript SDK instead of `iota client`.
- Local-keystore transfer prepare / dry-run / execute now use the IOTA TypeScript SDK.
- External-signature mode now uses SDK build + verify + execute.
- KMS mode keeps a narrow CLI bridge for `keytool sign-kms`.
- `postinstall` now falls back to SDK-keystore bootstrap when the IOTA CLI is missing or unusable.

## Why

Constrained OpenClaw hosts can fail to run the official IOTA CLI binary even after download, for example because shared libraries such as `libpq.so.5` are unavailable and cannot be installed without root.

That environment should still be able to:

- create a wallet identity
- read balances / gas
- prepare a transfer
- approve a transfer
- dry-run a transfer
- execute a transfer with a local keystore or external signature

## Verification

Local verification:

- `npm run build`
- `npm test`
- `npm pack --dry-run`

Fresh install smoke in a simulated broken-CLI environment:

- installed the package from a fresh tarball with:
  - `PATH` pointing to a fake `iota` binary that exits with a `libpq.so.5` shared-library error
  - `IOTA_WALLET_AUTO_INSTALL_CLI=0`
- verified that `postinstall` still completed successfully
- verified that a new SDK keystore was created at:
  - `~/.iota/iota_config/iota.keystore`

## Remaining CLI Dependency

Only the KMS signing bridge still depends on the CLI:

- `iota keytool sign-kms`

All standard local-keystore and external-signature paths are now SDK-first.
