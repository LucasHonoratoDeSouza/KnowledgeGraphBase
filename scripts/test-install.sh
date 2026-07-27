#!/usr/bin/env bash
# Container-based end-to-end test for install.sh (T16/T17).
#
# Drives a disposable Ubuntu Docker container through install.sh's happy
# path, tamper rejection, and non-amd64 guard, against a local mock of the
# two GitHub endpoints the script talks to (so the test is deterministic
# and does not depend on a real stable release existing yet). Fixtures are
# signed with a throwaway test keypair via install.sh's
# KNOWLEDGE_OS_INSTALL_PUBKEY/KNOWLEDGE_OS_INSTALL_API_BASE test seams --
# the real production signing key is never used or available here.
#
# Requires: docker, curl, python3.
#
# Run via: make test-installer

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="$(mktemp -d)"
FIXTURES_DIR="${WORK_DIR}/fixtures"
ASSETS_DIR="${FIXTURES_DIR}/assets"
MOCK_PORT=8899
IMAGE_TAG="knowledge-os-install-test:local"
SERVER_PID=""
FAILURES=0

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

pass() { printf '[PASS] %s\n' "$1"; }
fail() { printf '[FAIL] %s\n' "$1"; FAILURES=$((FAILURES + 1)); }

require_host_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "error: required command '$1' not found on the host running this test" >&2
    exit 2
  }
}

fetch_minisign() {
  # Host-side minisign, used only to SIGN test fixtures with a throwaway
  # keypair -- never the production key. Pinned to the same version
  # install.sh's own fallback path uses, for consistency.
  local version="0.12"
  local bin_dir="${WORK_DIR}/minisign-bin"
  mkdir -p "$bin_dir"
  local archive="${bin_dir}/minisign.tar.gz"
  curl -fsSL -o "$archive" \
    "https://github.com/jedisct1/minisign/releases/download/${version}/minisign-${version}-linux.tar.gz"
  tar -xzf "$archive" -C "$bin_dir" minisign-linux/x86_64/minisign
  MINISIGN="${bin_dir}/minisign-linux/x86_64/minisign"
  chmod +x "$MINISIGN"
}

# Wraps a minisign-produced .sig file the same way Tauri wraps its own
# `.sig` release assets (base64 of the plain minisign signature text) --
# verified against a real published Tauri `.sig` asset during T16's
# implementation.
tauri_wrap_sig() {
  base64 -w0 "$1" > "$2"
}

generate_fixtures() {
  mkdir -p "$ASSETS_DIR"
  fetch_minisign

  "$MINISIGN" -G -f -W -p "${WORK_DIR}/test.pub" -s "${WORK_DIR}/test.key" >/dev/null
  TEST_PUBKEY="$(awk 'NR==2' "${WORK_DIR}/test.pub")"

  local version="0.0.0-test"
  local appimage_name="Knowledge.OS_${version}_amd64.AppImage"

  # A real AppImage so `--appimage-extract` (icon install) exercises the
  # real code path, not a stub. Cached across re-runs of this script.
  local cache="${ROOT_DIR}/.cache-test-install"
  mkdir -p "$cache"
  local real_appimage="${cache}/real.AppImage"
  if [ ! -f "$real_appimage" ]; then
    gh release download dev --repo LucasHonoratoDeSouza/KnowledgeGraphBase \
      -p "Knowledge.OS_0.1.18_amd64.AppImage" -O "$real_appimage"
  fi
  cp "$real_appimage" "${ASSETS_DIR}/${appimage_name}"

  "$MINISIGN" -S -s "${WORK_DIR}/test.key" -m "${ASSETS_DIR}/${appimage_name}" \
    -x "${WORK_DIR}/appimage.minisig" -c "test" -t "file:${appimage_name}" >/dev/null
  tauri_wrap_sig "${WORK_DIR}/appimage.minisig" "${ASSETS_DIR}/${appimage_name}.sig"

  ( cd "$ASSETS_DIR" && sha256sum "$appimage_name" > SHA256SUMS )
  "$MINISIGN" -S -s "${WORK_DIR}/test.key" -m "${ASSETS_DIR}/SHA256SUMS" \
    -x "${WORK_DIR}/sums.minisig" -c "test" -t "sums" >/dev/null
  tauri_wrap_sig "${WORK_DIR}/sums.minisig" "${ASSETS_DIR}/SHA256SUMS.sig"

  cat > "${FIXTURES_DIR}/release.json" <<JSON
{
  "tag_name": "${version}",
  "prerelease": false,
  "assets": [
    {"browser_download_url": "http://127.0.0.1:${MOCK_PORT}/assets/${appimage_name}"},
    {"browser_download_url": "http://127.0.0.1:${MOCK_PORT}/assets/${appimage_name}.sig"},
    {"browser_download_url": "http://127.0.0.1:${MOCK_PORT}/assets/SHA256SUMS"},
    {"browser_download_url": "http://127.0.0.1:${MOCK_PORT}/assets/SHA256SUMS.sig"}
  ]
}
JSON

  APPIMAGE_NAME="$appimage_name"
}

start_mock_server() {
  python3 "${ROOT_DIR}/scripts/test-install/mock_server.py" "$FIXTURES_DIR" "$MOCK_PORT" &
  SERVER_PID=$!
  for _ in $(seq 1 20); do
    curl -fsS "http://127.0.0.1:${MOCK_PORT}/repos/x/y/releases/latest" >/dev/null 2>&1 && return
    sleep 0.2
  done
  echo "error: mock server did not become ready" >&2
  exit 2
}

build_image() {
  docker build -t "$IMAGE_TAG" -f "${ROOT_DIR}/scripts/test-install/Dockerfile" "$ROOT_DIR" >/dev/null
}

run_in_container() {
  # $1 = extra docker run args (word-split), $2.. = command
  local extra_args="$1"
  shift
  # shellcheck disable=SC2086
  docker run --rm --network host $extra_args "$IMAGE_TAG" "$@"
}

test_happy_path() {
  local out
  # This expands inside the container's `sh -c`, not here.
  # shellcheck disable=SC2016
  if out=$(run_in_container "-e KNOWLEDGE_OS_INSTALL_API_BASE=http://127.0.0.1:${MOCK_PORT} -e KNOWLEDGE_OS_INSTALL_PUBKEY=${TEST_PUBKEY}" \
      sh -c '/opt/install.sh && test -x "$HOME/.local/bin/knowledge-os" && test -f "$HOME/.local/share/applications/knowledge-os.desktop" && test -f "$HOME/.local/share/icons/hicolor/256x256/apps/knowledge-os.png" && echo ALL_CHECKS_OK' 2>&1); then
    if printf '%s' "$out" | grep -q "ALL_CHECKS_OK"; then
      pass "happy path: AppImage installed, executable, .desktop entry + icon present"
    else
      fail "happy path: install.sh succeeded but expected artifacts are missing"
      printf '%s\n' "$out"
    fi
  else
    fail "happy path: install.sh exited non-zero"
    printf '%s\n' "$out"
  fi
}

test_tamper_rejected() {
  # Flip one byte of the served AppImage so its checksum/signature no
  # longer match what SHA256SUMS/the .sig assert.
  local tampered_dir="${WORK_DIR}/fixtures-tampered"
  cp -r "$FIXTURES_DIR" "$tampered_dir"
  python3 - "$tampered_dir/assets/${APPIMAGE_NAME}" <<'PY'
import sys
path = sys.argv[1]
with open(path, "r+b") as fh:
    fh.seek(0)
    byte = fh.read(1)
    fh.seek(0)
    fh.write(bytes([byte[0] ^ 0xFF]))
PY

  local tamper_port=$((MOCK_PORT + 1))
  python3 "${ROOT_DIR}/scripts/test-install/mock_server.py" "$tampered_dir" "$tamper_port" &
  local tamper_pid=$!
  for _ in $(seq 1 20); do
    curl -fsS "http://127.0.0.1:${tamper_port}/repos/x/y/releases/latest" >/dev/null 2>&1 && break
    sleep 0.2
  done

  local out status
  set +e
  out=$(run_in_container "-e KNOWLEDGE_OS_INSTALL_API_BASE=http://127.0.0.1:${tamper_port} -e KNOWLEDGE_OS_INSTALL_PUBKEY=${TEST_PUBKEY}" \
      sh -c '/opt/install.sh' 2>&1)
  status=$?
  set -e
  kill "$tamper_pid" >/dev/null 2>&1 || true

  if [ "$status" -ne 0 ] && printf '%s' "$out" | grep -qi "refusing to install"; then
    pass "tamper rejection: install.sh refused a tampered AppImage with a non-zero exit and explicit message"
  else
    fail "tamper rejection: expected non-zero exit + explicit refusal message, got status=${status}"
    printf '%s\n' "$out"
  fi
}

test_non_amd64_guard() {
  local out status
  set +e
  # A minimal PATH-shim `uname` reporting aarch64, with no network reachable
  # (bogus API base) -- proves the arch guard exits before any download is
  # attempted: if it tried to reach the network first, this would fail with
  # a connection/DNS error instead of the specific architecture message.
  # This expands inside the container's `sh -c`, not here.
  # shellcheck disable=SC2016
  out=$(run_in_container "-e KNOWLEDGE_OS_INSTALL_API_BASE=http://127.0.0.1:1" \
      sh -c 'mkdir -p /tmp/fakebin && printf "#!/bin/sh\ncase \"\$1\" in -s) echo Linux;; -m) echo aarch64;; *) echo Linux;; esac\n" > /tmp/fakebin/uname && chmod +x /tmp/fakebin/uname && PATH="/tmp/fakebin:$PATH" /opt/install.sh' 2>&1)
  status=$?
  set -e

  if [ "$status" -ne 0 ] && printf '%s' "$out" | grep -qi "unsupported architecture"; then
    pass "non-amd64 guard: install.sh exits early with a specific architecture message, never reaching the network"
  else
    fail "non-amd64 guard: expected an early unsupported-architecture exit, got status=${status}"
    printf '%s\n' "$out"
  fi
}

test_idempotent_upgrade() {
  local home_dir out1 out2 mtime1 mtime2 desktop_count
  home_dir="${WORK_DIR}/home-idempotent"
  mkdir -p "$home_dir"

  out1=$(docker run --rm --network host -v "${home_dir}:/home/tester" \
      -e KNOWLEDGE_OS_INSTALL_API_BASE="http://127.0.0.1:${MOCK_PORT}" \
      -e KNOWLEDGE_OS_INSTALL_PUBKEY="$TEST_PUBKEY" \
      "$IMAGE_TAG" sh -c '/opt/install.sh' 2>&1)
  mtime1=$(stat -c '%Y' "${home_dir}/.local/bin/knowledge-os" 2>/dev/null || echo "")

  sleep 2
  out2=$(docker run --rm --network host -v "${home_dir}:/home/tester" \
      -e KNOWLEDGE_OS_INSTALL_API_BASE="http://127.0.0.1:${MOCK_PORT}" \
      -e KNOWLEDGE_OS_INSTALL_PUBKEY="$TEST_PUBKEY" \
      "$IMAGE_TAG" sh -c '/opt/install.sh' 2>&1)
  mtime2=$(stat -c '%Y' "${home_dir}/.local/bin/knowledge-os" 2>/dev/null || echo "")
  desktop_count=$(find "${home_dir}/.local/share/applications" -name '*.desktop' 2>/dev/null | wc -l)

  if [ -x "${home_dir}/.local/bin/knowledge-os" ] \
      && [ "$desktop_count" -eq 1 ] \
      && [ -n "$mtime1" ] && [ -n "$mtime2" ] && [ "$mtime2" -ge "$mtime1" ] \
      && printf '%s' "$out2" | grep -qi "upgrading existing install"; then
    pass "idempotent upgrade: second run replaces the binary in place, exactly one .desktop entry, no duplication"
  else
    fail "idempotent upgrade: expected exactly one .desktop entry and a replaced (not duplicated) binary"
    printf 'run1: %s\nrun2: %s\ndesktop_count=%s\n' "$out1" "$out2" "$desktop_count"
  fi
}

test_uninstall_preserves_vault() {
  local home_dir out status
  home_dir="${WORK_DIR}/home-uninstall"
  mkdir -p "${home_dir}/my-vault"
  echo "important vault data" > "${home_dir}/my-vault/marker.txt"

  docker run --rm --network host -v "${home_dir}:/home/tester" \
      -e KNOWLEDGE_OS_INSTALL_API_BASE="http://127.0.0.1:${MOCK_PORT}" \
      -e KNOWLEDGE_OS_INSTALL_PUBKEY="$TEST_PUBKEY" \
      "$IMAGE_TAG" sh -c '/opt/install.sh' >/dev/null 2>&1

  set +e
  out=$(docker run --rm --network host -v "${home_dir}:/home/tester" \
      "$IMAGE_TAG" sh -c '/opt/install.sh --uninstall' 2>&1)
  status=$?
  set -e

  if [ "$status" -eq 0 ] \
      && [ ! -e "${home_dir}/.local/bin/knowledge-os" ] \
      && [ ! -e "${home_dir}/.local/share/applications/knowledge-os.desktop" ] \
      && [ ! -e "${home_dir}/.local/share/icons/hicolor/256x256/apps/knowledge-os.png" ] \
      && [ -f "${home_dir}/my-vault/marker.txt" ] \
      && [ "$(cat "${home_dir}/my-vault/marker.txt")" = "important vault data" ]; then
    pass "--uninstall: removes binary/.desktop/icon, leaves the vault marker file untouched"
  else
    fail "--uninstall: expected binary/.desktop/icon removed and vault marker preserved"
    printf '%s\n' "$out"
  fi
}

test_no_sudo_invocation() {
  # Static check on the real script, not the container -- MVP-49 AC10.
  # `sudo` only appears inside printed instructional strings (the exact
  # command a user would run themselves for libfuse2), never executed by
  # the script itself.
  if grep -n 'sudo' "${ROOT_DIR}/install.sh" | grep -qv -E '^\s*[0-9]+:\s*#|log "'; then
    fail "no-sudo check: found a 'sudo' usage outside comments/printed instructional text"
  else
    pass "no-sudo check: install.sh never invokes sudo (only mentions it in comments/user-facing instructions)"
  fi
}

main() {
  require_host_cmd docker
  require_host_cmd curl
  require_host_cmd python3
  require_host_cmd gh

  echo "== building test image =="
  build_image

  echo "== generating signed fixtures =="
  generate_fixtures

  echo "== starting mock GitHub API/asset server =="
  start_mock_server

  echo "== T16: happy path =="
  test_happy_path

  echo "== T16: tamper rejection =="
  test_tamper_rejected

  echo "== T16: non-amd64 guard =="
  test_non_amd64_guard

  echo "== T17: idempotent upgrade =="
  test_idempotent_upgrade

  echo "== T17: --uninstall preserves the vault =="
  test_uninstall_preserves_vault

  echo "== T17: no-sudo static check =="
  test_no_sudo_invocation

  if [ "$FAILURES" -gt 0 ]; then
    echo "${FAILURES} check(s) failed"
    exit 1
  fi
  echo "all install.sh container checks passed"
}

main "$@"
