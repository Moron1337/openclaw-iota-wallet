#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

tarball="$(
  find . -maxdepth 1 -type f -name 'openclaw-iota-wallet-*.tgz' -printf '%T@ %P\n' \
    | sort -nr \
    | awk 'NR == 1 { print $2 }'
)"

if [[ -z "$tarball" ]]; then
  echo "missing_tarball: run npm pack before artifact smoke" >&2
  exit 1
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

tar -xzf "$tarball" -C "$tmpdir"

required_files=(
  "package/package.json"
  "package/index.ts"
  "package/openclaw.plugin.json"
  "package/PROJECT_PLAN.md"
  "package/skills/iota-wallet/SKILL.md"
  "package/src/tools/tx-tools.ts"
)

for file in "${required_files[@]}"; do
  if [[ ! -f "$tmpdir/$file" ]]; then
    echo "missing_packaged_file: $file" >&2
    exit 1
  fi
done

node -e '
const fs = require("node:fs");
const [pkgPath, pluginPath] = process.argv.slice(1);
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const plugin = JSON.parse(fs.readFileSync(pluginPath, "utf8"));
if (pkg.version !== plugin.version) {
  console.error(`version_mismatch: package.json=${pkg.version} openclaw.plugin.json=${plugin.version}`);
  process.exit(1);
}
if (pkg.name !== "openclaw-iota-wallet") {
  console.error(`unexpected_package_name: ${pkg.name}`);
  process.exit(1);
}
' "$tmpdir/package/package.json" "$tmpdir/package/openclaw.plugin.json"

echo "pack_artifact_smoke_ok: $tarball"
