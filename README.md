# IOTA Claw Wallet Plugin

[![CI](https://github.com/Moron1337/iota-claw-wallet/actions/workflows/ci.yml/badge.svg)](https://github.com/Moron1337/iota-claw-wallet/actions/workflows/ci.yml)

OpenClaw plugin for IOTA wallet operations with approval-gated transaction flow.

- Plugin id: `openclaw-iota-wallet`
- Package: `iota-claw-wallet`
- Default network: `mainnet`

## Features

- Read-only wallet tools for environment, balances, and gas objects.
- Two-phase transfer flow (`prepare -> approve -> execute`).
- Optional dry-run before broadcast.
- Signature verification before final send.
- Strict CLI allowlist (`iota client` and `iota keytool` only).
- Install bootstrap that sets `mainnet` and auto-creates a first wallet address if missing.

## Requirements

- OpenClaw CLI (validated with `2026.2.12`).
- IOTA CLI (validated with `1.16.2`).
- Node.js `>=18` for local development.

## Required IOTA CLI Surface

The plugin depends on this minimal command set:

- `iota client active-env`
- `iota client balance`
- `iota client gas`
- `iota client pay-iota --serialize-unsigned-transaction`
- `iota client serialized-tx --dry-run`
- `iota client execute-signed-tx`
- `iota keytool decode-or-verify-tx`
- `iota keytool sign`
- `iota keytool sign-kms` (only for KMS signer mode)

## Install in OpenClaw

```bash
openclaw plugins install <npm-spec-or-tarball>
openclaw plugins enable openclaw-iota-wallet
openclaw plugins doctor
```

Install behavior:

- `postinstall` checks for `iota` CLI.
- Active env is switched to `mainnet`.
- If the keystore has no addresses, a first address is created automatically.

Optional install env vars:

- `IOTA_WALLET_BOOTSTRAP=0` to disable bootstrap.
- `IOTA_CLI_PATH=/custom/path/iota` to use a custom CLI path.

## Example Plugin Config

See `examples/openclaw.config.snippet.json5` for a full example.

```json5
{
  plugins: {
    entries: {
      "openclaw-iota-wallet": {
        enabled: true,
        config: {
          defaultNetwork: "mainnet",
          requireApproval: true,
          maxTransferNanos: "1000000000"
        }
      }
    }
  }
}
```

## Registered Tools

- `iota_active_env`
- `iota_get_balance`
- `iota_get_gas`
- `iota_prepare_transfer`
- `iota_approve_transfer`
- `iota_dry_run_transfer`
- `iota_execute_transfer`

## Local Development

```bash
npm install
npm run build
npm test
```

Local link test:

```bash
openclaw plugins install -l .
openclaw plugins enable openclaw-iota-wallet
openclaw plugins doctor
```

## Security Notes

- Side-effect tools are registered as optional.
- `requireApproval` defaults to `true`.
- `maxTransferNanos` and `recipientAllowlist` enforce policy limits.
- Arbitrary shell execution is blocked by command validation.

## Project Docs

- Main plan: `PROJECT_PLAN.md`
- Release process: `docs/RELEASE_CHECKLIST.md`
- Change log: `CHANGELOG.md`
- Contributing guide: `CONTRIBUTING.md`
- Security policy: `SECURITY.md`

## License

MIT (`LICENSE`)
