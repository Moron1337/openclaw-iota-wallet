#!/usr/bin/env bash
set -euo pipefail

SSH_KEY="${SSH_KEY:-/home/codex/.ssh/id_ed25519_clawdex_hetzner_pg_20260223}"
SSH_KNOWN_HOSTS="${SSH_KNOWN_HOSTS:-/home/codex/.ssh/known_hosts}"
REMOTE_HOST="${REMOTE_HOST:-ops@49.13.114.125}"
RUNNER_USER="${RUNNER_USER:-gha-runner}"
RUNNER_GROUP="${RUNNER_GROUP:-$RUNNER_USER}"
RUNNER_HOME="${RUNNER_HOME:-/home/$RUNNER_USER}"
RUNNER_DIR="${RUNNER_DIR:-$RUNNER_HOME/actions-runner-openclaw-iota-wallet}"
RUNNER_WORK_DIR="${RUNNER_WORK_DIR:-_work}"
RUNNER_LABELS="${RUNNER_LABELS:-openclaw-iota-wallet,hetzner}"
RUNNER_NAME="${RUNNER_NAME:-}"
RUNNER_VERSION="${RUNNER_VERSION:-2.332.0}"
REPO_URL="${REPO_URL:-https://github.com/Moron1337/openclaw-iota-wallet}"
PREPARE_ONLY="${PREPARE_ONLY:-0}"
RUNNER_TOKEN="${RUNNER_TOKEN:-${GITHUB_RUNNER_TOKEN:-}}"
SERVICE_NAME="${SERVICE_NAME:-openclaw-iota-wallet-github-actions-runner.service}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'EOF'
Usage:
  PREPARE_ONLY=1 bash scripts/install_github_actions_runner_on_hetzner.sh

  RUNNER_TOKEN=<registration-token> \
    bash scripts/install_github_actions_runner_on_hetzner.sh

What it does:
  - creates or reuses a dedicated gha-runner user on Hetzner
  - installs prerequisite packages
  - downloads and configures the GitHub Actions runner
  - installs the repo-tracked systemd unit
  - starts the runner service
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

ssh_opts=(
  -i "$SSH_KEY"
  -o BatchMode=yes
  -o StrictHostKeyChecking=yes
  -o UserKnownHostsFile="$SSH_KNOWN_HOSTS"
)

scp_opts=(
  -i "$SSH_KEY"
  -o BatchMode=yes
  -o StrictHostKeyChecking=yes
  -o UserKnownHostsFile="$SSH_KNOWN_HOSTS"
)

remote_runner_name() {
  if [[ -n "$RUNNER_NAME" ]]; then
    printf '%s\n' "$RUNNER_NAME"
    return
  fi
  ssh "${ssh_opts[@]}" "$REMOTE_HOST" "hostname -s" | awk '{print "openclaw-iota-wallet-" $1}'
}

ensure_remote_user_and_packages() {
  # shellcheck disable=SC2029
  ssh "${ssh_opts[@]}" "$REMOTE_HOST" "
    set -euo pipefail
    export DEBIAN_FRONTEND=noninteractive
    if ! id -u '$RUNNER_USER' >/dev/null 2>&1; then
      sudo useradd --create-home --home-dir '$RUNNER_HOME' --shell /bin/bash '$RUNNER_USER'
    fi
    sudo apt-get update
    sudo apt-get install -y git curl jq tar unzip ca-certificates libicu74
    sudo install -d -o '$RUNNER_USER' -g '$RUNNER_GROUP' -m 0755 '$RUNNER_DIR'
    sudo install -d -o '$RUNNER_USER' -g '$RUNNER_GROUP' -m 0755 '$RUNNER_HOME/.local/bin'
  "
}

install_runner_bits() {
  local runner_name="$1"
  local runner_url="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
  scp "${scp_opts[@]}" \
    "$ROOT_DIR/ops/systemd/hetzner/$SERVICE_NAME" \
    "$REMOTE_HOST:/tmp/$SERVICE_NAME"
  # shellcheck disable=SC2029
  ssh "${ssh_opts[@]}" "$REMOTE_HOST" "
    set -euo pipefail
    sudo -u '$RUNNER_USER' bash -lc '
      set -euo pipefail
      cd \"$RUNNER_DIR\"
      if [[ ! -f .runner-version ]] || [[ \"\$(cat .runner-version)\" != \"${RUNNER_VERSION}\" ]]; then
        find \"$RUNNER_DIR\" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
        tmpdir=\$(mktemp -d)
        trap \"rm -rf \\\"\\\$tmpdir\\\"\" EXIT
        curl -L --fail --show-error \"${runner_url}\" -o \"\$tmpdir/runner.tgz\"
        tar -xzf \"\$tmpdir/runner.tgz\" -C \"$RUNNER_DIR\"
        printf \"%s\n\" \"${RUNNER_VERSION}\" > .runner-version
      fi
    '
    sudo install -m 0644 \"/tmp/$SERVICE_NAME\" \"/etc/systemd/system/$SERVICE_NAME\"
    rm -f \"/tmp/$SERVICE_NAME\"
    sudo systemctl daemon-reload
    echo '$runner_name'
  "
}

configure_runner() {
  local runner_name="$1"
  # shellcheck disable=SC2029
  ssh "${ssh_opts[@]}" "$REMOTE_HOST" "
    set -euo pipefail
    sudo systemctl stop '$SERVICE_NAME' >/dev/null 2>&1 || true
    sudo -u '$RUNNER_USER' bash -lc '
      set -euo pipefail
      cd \"$RUNNER_DIR\"
      if [[ -f .runner ]]; then
        ./config.sh remove --token \"$RUNNER_TOKEN\" >/dev/null 2>&1 || true
      fi
      ./config.sh \
        --unattended \
        --replace \
        --url \"$REPO_URL\" \
        --token \"$RUNNER_TOKEN\" \
        --name \"$runner_name\" \
        --labels \"$RUNNER_LABELS\" \
        --work \"$RUNNER_WORK_DIR\"
    '
    sudo systemctl enable --now '$SERVICE_NAME'
  "
}

verify_runner_service() {
  # shellcheck disable=SC2029
  ssh "${ssh_opts[@]}" "$REMOTE_HOST" "
    set -euo pipefail
    sudo systemctl status '$SERVICE_NAME' --no-pager
    sudo journalctl -u '$SERVICE_NAME' -n 40 --no-pager
  "
}

main() {
  ensure_remote_user_and_packages
  runner_name="$(remote_runner_name)"
  install_runner_bits "$runner_name" >/dev/null

  if [[ "$PREPARE_ONLY" == "1" ]]; then
    echo "Runner host prepared on $REMOTE_HOST"
    echo "Runner registration still pending."
    echo "Use RUNNER_TOKEN=<token> bash scripts/install_github_actions_runner_on_hetzner.sh to finish."
    exit 0
  fi

  if [[ -z "$RUNNER_TOKEN" ]]; then
    echo "ERROR: RUNNER_TOKEN is required unless PREPARE_ONLY=1" >&2
    exit 1
  fi

  configure_runner "$runner_name"
  verify_runner_service
  echo "Runner installed and started on $REMOTE_HOST as $runner_name"
}

main "$@"
