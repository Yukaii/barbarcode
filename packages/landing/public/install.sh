#!/bin/sh
# Installs the barbarcode command (a single self-contained executable, no Node.js needed).
#
#   curl -fsSL https://barbarcode.yukai.dev/install.sh | sh
#
# Options (environment variables):
#   BARBARCODE_VERSION       version to install, e.g. 0.2.0 (default: latest)
#   BARBARCODE_INSTALL_DIR   where to put it (default: ~/.local/bin)
#   BARBARCODE_DOWNLOAD_URL  base URL to download release assets from (for mirrors and testing)
set -eu

REPO="Yukaii/barbarcode"
VERSION="${BARBARCODE_VERSION:-latest}"
INSTALL_DIR="${BARBARCODE_INSTALL_DIR:-$HOME/.local/bin}"

fail() {
  printf 'barbarcode install: %s\n' "$1" >&2
  exit 1
}

case "$(uname -s)" in
  Linux) os=linux ;;
  Darwin) os=darwin ;;
  *) fail "unsupported system $(uname -s). On Windows, run in PowerShell: irm https://barbarcode.yukai.dev/install.ps1 | iex" ;;
esac

case "$(uname -m)" in
  x86_64 | amd64) arch=x64 ;;
  arm64 | aarch64) arch=arm64 ;;
  *) fail "unsupported CPU $(uname -m). Use npx barbarcode instead (needs Node.js 22+)." ;;
esac

# A shell running under Rosetta reports x86_64 on Apple Silicon; install the native build.
if [ "$os" = darwin ] && [ "$arch" = x64 ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || true)" = 1 ]; then
  arch=arm64
fi

libc=""
if [ "$os" = linux ] && { [ -f /etc/alpine-release ] || ls /lib/ld-musl-* >/dev/null 2>&1; }; then
  libc="-musl"
fi

asset="barbarcode-$os-$arch$libc.gz"
if [ -n "${BARBARCODE_DOWNLOAD_URL:-}" ]; then
  base="$BARBARCODE_DOWNLOAD_URL"
elif [ "$VERSION" = latest ]; then
  base="https://github.com/$REPO/releases/latest/download"
else
  base="https://github.com/$REPO/releases/download/v${VERSION#v}"
fi

fetch() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 2 -o "$2" "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "$2" "$1"
  else
    fail "needs curl or wget"
  fi
}

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d ' ' -f 1
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | cut -d ' ' -f 1
  else
    fail "needs sha256sum or shasum to verify the download"
  fi
}

command -v gzip >/dev/null 2>&1 || fail "needs gzip"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT INT TERM

printf 'Downloading %s…\n' "$asset"
fetch "$base/$asset" "$tmp/$asset" || fail "could not download $base/$asset"
fetch "$base/SHA256SUMS" "$tmp/SHA256SUMS" || fail "could not download $base/SHA256SUMS"

expected="$(grep " $asset\$" "$tmp/SHA256SUMS" | cut -d ' ' -f 1)"
[ -n "$expected" ] || fail "no checksum listed for $asset"
[ "$(sha256 "$tmp/$asset")" = "$expected" ] || fail "checksum mismatch for $asset; not installing"

gzip -dc "$tmp/$asset" > "$tmp/barbarcode"
chmod 755 "$tmp/barbarcode"
mkdir -p "$INSTALL_DIR"
mv -f "$tmp/barbarcode" "$INSTALL_DIR/barbarcode"

if [ -n "$libc" ] && ! ls /usr/lib/libstdc++.so.6 /usr/lib/*/libstdc++.so.6 >/dev/null 2>&1; then
  printf '\nOn Alpine, barbarcode needs the C++ runtime: apk add libstdc++ libgcc\n'
fi

printf 'Installed barbarcode %s to %s\n' "$("$INSTALL_DIR/barbarcode" --version 2>/dev/null || echo '')" "$INSTALL_DIR/barbarcode"

case ":$PATH:" in
  *":$INSTALL_DIR:"*) printf 'Run it with: barbarcode\n' ;;
  *)
    printf '\n%s is not on your PATH. Add this line to your shell profile (~/.zshrc, ~/.bashrc):\n' "$INSTALL_DIR"
    # shellcheck disable=SC2016 # $PATH is meant to be printed literally
    printf '  export PATH="%s:$PATH"\n' "$INSTALL_DIR"
    printf 'Or run it directly: %s\n' "$INSTALL_DIR/barbarcode"
    ;;
esac
