# GitHub Actions Runner Runbook

Stand: 2026-03-17

## Purpose

This runbook is the canonical truth for the `openclaw-iota-wallet` self-hosted GitHub Actions runner on Hetzner.

Use it to answer:

- why normal CI moved off GitHub-hosted `ubuntu-latest`
- how the runner is installed safely
- which workflows are expected to use it
- which checks are intentionally exercised on the Hetzner host

## Security Posture

- dedicated user: `gha-runner`
- no sudo for the runner user
- separate runner install path:
  - `$RUNNER_HOME/actions-runner-openclaw-iota-wallet`
- repo-tracked systemd unit:
  - `ops/systemd/hetzner/openclaw-iota-wallet-github-actions-runner.service`
- labels:
  - `self-hosted`
  - `linux`
  - `x64`
  - `openclaw-iota-wallet`
  - `hetzner`

This runner is intended only for trusted workflows in this repository.

## Workflow Scope

Runs on the self-hosted runner:

- `.github/workflows/ci.yml`
- `.github/workflows/shellcheck.yml`
- `.github/workflows/nightly-release-gate.yml`

The nightly release gate intentionally proves more than the normal push CI:

- clean `npm ci --ignore-scripts`
- typecheck
- full Vitest suite
- `npm pack`
- packed plugin archive verification

## Prerequisites

1. Hetzner access as `ops`
2. repository self-hosted runner registration token from GitHub
3. dedicated operator SSH key with access to the Hetzner runtime host

## Installation

Prepare-only:

```bash
cd <repo-root>
PREPARE_ONLY=1 bash scripts/install_github_actions_runner_on_hetzner.sh
```

Full install:

```bash
cd <repo-root>
RUNNER_TOKEN=<repo-registration-token> \
  bash scripts/install_github_actions_runner_on_hetzner.sh
```

## Verification

On Hetzner:

```bash
sudo systemctl status openclaw-iota-wallet-github-actions-runner.service --no-pager
sudo journalctl -u openclaw-iota-wallet-github-actions-runner.service -n 40 --no-pager
```

In GitHub:

- repository settings
- Actions
- Runners

Expected state:

- one online runner with labels:
  - `self-hosted`
  - `linux`
  - `x64`
  - `openclaw-iota-wallet`
  - `hetzner`
