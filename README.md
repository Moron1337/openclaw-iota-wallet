# IOTA Claw Wallet Plugin

[![CI](https://github.com/Moron1337/openclaw-iota-wallet/actions/workflows/ci.yml/badge.svg)](https://github.com/Moron1337/openclaw-iota-wallet/actions/workflows/ci.yml)

OpenClaw plugin for IOTA wallet operations with approval-gated transaction flow.

Machine-to-machine wallet layer for the IOTA economy: autonomous bots can hold funds, pay each other, and execute smart contracts in real time.

- Plugin id: `openclaw-iota-wallet`
- Package: `openclaw-iota-wallet`
- Default network: `mainnet`

## Features

- Read-only wallet tools for environment, balances, and gas objects.
- Two-phase transfer flow (`prepare -> approve -> execute`).
- Optional dry-run before broadcast.
- Signature verification before final send.
- Strict CLI allowlist (`iota client` and `iota keytool` only).
- Install bootstrap that sets `mainnet` and auto-creates a first wallet address if missing.

## Machine Economy Focus

`openclaw-iota-wallet` is built for autonomous agents that need native on-chain value transfer:

- Bot-to-bot settlement without manual payment steps.
- Smart-contract based flows such as escrow and conditional payout logic.
- Fast move from agent decision to verifiable on-chain execution.

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
- If `iota` is missing, `postinstall` can auto-install it from official `iotaledger/iota` GitHub releases.
- Active env is switched to `mainnet`.
- If the keystore has no addresses, a first address is created automatically.

Optional install env vars:

- `IOTA_WALLET_BOOTSTRAP=0` to disable bootstrap.
- `IOTA_WALLET_AUTO_INSTALL_CLI=0` to disable automatic IOTA CLI install.
- `IOTA_CLI_VERSION=latest` to choose release version for auto-install (default is `latest`).
- `IOTA_CLI_INSTALL_DIR=/path/bin` to choose install target for auto-install (default `~/.local/bin`).
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

## How To Execute A Transfer

After plugin install, run this flow in OpenClaw:

1. Verify network and funds:
   - `iota_active_env`
   - `iota_get_balance` (`withCoins: true`)
   - `iota_get_gas` (collect one or more coin object IDs for `inputCoins`)
2. Prepare the transaction:
   - Call `iota_prepare_transfer` with:
     - `recipient`: target `0x...` address
     - `amountNanos`: amount in smallest unit as numeric string
     - `inputCoins`: coin object IDs from `iota_get_gas`
     - optional `gasBudget`
   - Save `draft.id` from the response.
3. Approve the draft (if `requireApproval: true`):
   - Call `iota_approve_transfer` with `draftId` and `approve: true`.
4. Simulate before broadcast (recommended):
   - Call `iota_dry_run_transfer` with `draftId`.
5. Execute on-chain:
   - Call `iota_execute_transfer` with `draftId`.
   - Optional:
     - `signerAddress` for local-keystore signing.
     - `signature` for external-signature mode.

### Example Tool Payloads

```json
{
  "tool": "iota_prepare_transfer",
  "params": {
    "recipient": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "amountNanos": "1000000000",
    "inputCoins": [
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    ],
    "gasBudget": "2000000"
  }
}
```

```json
{
  "tool": "iota_approve_transfer",
  "params": {
    "draftId": "REPLACE_WITH_DRAFT_ID",
    "approve": true
  }
}
```

```json
{
  "tool": "iota_dry_run_transfer",
  "params": {
    "draftId": "REPLACE_WITH_DRAFT_ID"
  }
}
```

```json
{
  "tool": "iota_execute_transfer",
  "params": {
    "draftId": "REPLACE_WITH_DRAFT_ID"
  }
}
```

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
