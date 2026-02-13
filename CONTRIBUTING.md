# Contributing

## Scope

This repository contains the OpenClaw plugin `openclaw-iota-wallet`.

## Prerequisites

- Node.js `>=18`
- npm
- IOTA CLI available as `iota` (or set `IOTA_CLI_PATH`)
- OpenClaw CLI for integration tests

## Local Setup

```bash
npm install
npm run build
npm test
```

## Development Rules

- Keep command execution restricted to approved IOTA CLI paths.
- Do not log secrets, mnemonics, private keys, or sensitive signer data.
- Keep side-effect tools optional and approval-gated.
- Update tests for every behavior change.
- Update docs when config or tool contracts change.

## Pull Requests

Before opening a PR:

- Run `npm run build`
- Run `npm test`
- Verify plugin install flow:
  - `openclaw plugins install -l .`
  - `openclaw plugins enable openclaw-iota-wallet`
  - `openclaw plugins doctor`

PR checklist:

- Explain behavior changes and migration impact.
- Link related issues.
- Include test evidence (logs/screenshots/output snippets).
- Update `CHANGELOG.md` when relevant.
