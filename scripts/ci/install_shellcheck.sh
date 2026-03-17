#!/usr/bin/env bash
set -euo pipefail

SHELLCHECK_VERSION_RAW="${SHELLCHECK_VERSION:-v0.10.0}"
INSTALL_DIR="${SHELLCHECK_INSTALL_DIR:-$HOME/.local/bin}"
PLATFORM="${SHELLCHECK_PLATFORM:-linux}"
ARCH="${SHELLCHECK_ARCH:-x86_64}"

normalize_version() {
  local raw="${1:-}"
  if [[ -z "$raw" ]]; then
    echo "v0.10.0"
    return 0
  fi
  if [[ "$raw" == v* ]]; then
    echo "$raw"
  else
    echo "v$raw"
  fi
}

if ! command -v curl >/dev/null 2>&1; then
  echo "[install-shellcheck] curl is required" >&2
  exit 1
fi
if ! command -v tar >/dev/null 2>&1; then
  echo "[install-shellcheck] tar is required" >&2
  exit 1
fi

version="$(normalize_version "$SHELLCHECK_VERSION_RAW")"
asset="shellcheck-${version}.${PLATFORM}.${ARCH}.tar.xz"
url="https://github.com/koalaman/shellcheck/releases/download/${version}/${asset}"

mkdir -p "$INSTALL_DIR"
target="$INSTALL_DIR/shellcheck"
if [[ -x "$target" ]]; then
  installed_version="$("$target" --version 2>/dev/null | awk '/version:/ {print $2; exit}' || true)"
  if [[ "$installed_version" == "${version#v}" ]]; then
    echo "[install-shellcheck] shellcheck ${version} already installed at $target"
    if [[ -n "${GITHUB_PATH:-}" ]]; then
      echo "$INSTALL_DIR" >> "$GITHUB_PATH"
    fi
    exit 0
  fi
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

archive_path="$tmp_dir/$asset"
extract_dir="$tmp_dir/extract"
mkdir -p "$extract_dir"

echo "[install-shellcheck] downloading $url"
curl -fsSL "$url" -o "$archive_path"
tar -xJf "$archive_path" -C "$extract_dir"

binary_path="$(find "$extract_dir" -maxdepth 2 -type f -name shellcheck | head -n 1 || true)"
if [[ -z "$binary_path" ]]; then
  echo "[install-shellcheck] extracted archive did not contain shellcheck binary" >&2
  exit 1
fi

install -m 0755 "$binary_path" "$target"
if [[ -n "${GITHUB_PATH:-}" ]]; then
  echo "$INSTALL_DIR" >> "$GITHUB_PATH"
fi

echo "[install-shellcheck] installed ${version} to $target"
"$target" --version
