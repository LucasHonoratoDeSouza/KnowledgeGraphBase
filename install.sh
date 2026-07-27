#!/bin/sh
# Knowledge OS -- one-line Linux installer (amd64 AppImage only).
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/LucasHonoratoDeSouza/KnowledgeGraphBase/main/install.sh | sh
#
# Resolves the latest **stable** (non-prerelease) GitHub release, verifies
# the downloaded AppImage's minisign signature and its checksum against the
# release's signed SHA256SUMS manifest, installs it to ~/.local/bin, and
# registers a .desktop entry + icon so it shows up in the application
# launcher. Never requires or invokes sudo (MVP-49 AC10).
#
# Only amd64 (x86_64) Linux is supported for this MVP; aarch64 is
# deliberately deferred (see issue #51).

set -eu

# Overridable only for scripts/test-install.sh's container test, which points
# this at a local mock server so the installer's happy/tamper/idempotency
# paths are deterministic and don't depend on a real stable release existing.
# Left unset, this defaults to the real GitHub API -- production behavior is
# unchanged.
API_BASE="${KNOWLEDGE_OS_INSTALL_API_BASE:-https://api.github.com}"

REPO="LucasHonoratoDeSouza/KnowledgeGraphBase"
BIN_NAME="knowledge-os"
INSTALL_DIR="${HOME}/.local/bin"
DESKTOP_DIR="${HOME}/.local/share/applications"
ICON_DIR="${HOME}/.local/share/icons/hicolor/256x256/apps"
CACHE_DIR="${HOME}/.cache/knowledge-os-install"

# The Knowledge OS minisign public key, also embedded in
# apps/desktop/src-tauri/tauri.conf.json (base64-encoded there) and
# documented in README.md. This is the raw base64 key string minisign's
# `-P` flag expects (not the full "untrusted comment: ..." key file).
# Overridable only for scripts/test-install.sh, which signs fixtures with a
# throwaway test keypair (the real private key is never available outside
# CI's signing secret) -- same override pattern and rationale as API_BASE.
MINISIGN_PUBKEY="${KNOWLEDGE_OS_INSTALL_PUBKEY:-RWQl26FzFJHvxw74sO1pttlHfyHfvsLRNH1y/SU001pRcHTeh/sb2YRd}"

# Pinned fallback minisign release, used only when no system `minisign` is
# already installed. Pinned (not "latest") so this script's behavior does
# not silently change if that project cuts a new release; the release and
# its assets remain available on GitHub indefinitely.
MINISIGN_FALLBACK_VERSION="0.12"

log() {
  printf '%s\n' "$*"
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

check_arch() {
  arch="$(uname -m)"
  case "$arch" in
    x86_64 | amd64) ;;
    *)
      die "unsupported architecture '${arch}': Knowledge OS only supports amd64 Linux for now. aarch64 support is deferred (see issue #51) -- refusing to download an incompatible binary."
      ;;
  esac
}

check_os() {
  if [ "$(uname -s)" != "Linux" ]; then
    die "unsupported operating system '$(uname -s)': Knowledge OS only supports Linux for this MVP."
  fi
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "required command '$1' not found -- please install it and re-run"
}

# Fetches the GitHub API's `/releases/latest` document, which resolves to
# the newest **non-prerelease** release -- the `dev` channel's prerelease
# builds are never returned by this route, matching the stable updater
# endpoint's own routing (see design.md's Tech Decisions).
resolve_latest_stable_release() {
  curl -fsSL "${API_BASE}/repos/${REPO}/releases/latest" \
    || die "could not resolve the latest stable release from GitHub -- check your network connection"
}

# $1 = json document, $2 = field name -> value of the first "field": "value" match
json_field() {
  printf '%s\n' "$1" \
    | grep -o "\"$2\": *\"[^\"]*\"" \
    | head -n1 \
    | sed -E "s/.*\"$2\": *\"([^\"]*)\"/\\1/"
}

# $1 = json document, $2 = extended regex the asset URL must match (anchored)
json_asset_url() {
  printf '%s\n' "$1" \
    | grep -o '"browser_download_url": *"[^"]*"' \
    | sed -E 's/.*"browser_download_url": *"([^"]*)"/\1/' \
    | grep -E "$2" \
    | head -n1
}

ensure_minisign() {
  if command -v minisign >/dev/null 2>&1; then
    MINISIGN_BIN="$(command -v minisign)"
    return
  fi
  if [ -x "${CACHE_DIR}/minisign" ]; then
    MINISIGN_BIN="${CACHE_DIR}/minisign"
    return
  fi

  log "no local 'minisign' found -- fetching a pinned copy for verification (no system install, no sudo)"
  mkdir -p "$CACHE_DIR"
  archive="${CACHE_DIR}/minisign.tar.gz"
  curl -fsSL -o "$archive" \
    "https://github.com/jedisct1/minisign/releases/download/${MINISIGN_FALLBACK_VERSION}/minisign-${MINISIGN_FALLBACK_VERSION}-linux.tar.gz" \
    || die "failed to download the minisign verifier (and no system minisign is installed)"
  tar -xzf "$archive" -C "$CACHE_DIR" minisign-linux/x86_64/minisign
  mv "${CACHE_DIR}/minisign-linux/x86_64/minisign" "${CACHE_DIR}/minisign"
  rm -rf "${CACHE_DIR}/minisign-linux" "$archive"
  chmod +x "${CACHE_DIR}/minisign"
  MINISIGN_BIN="${CACHE_DIR}/minisign"
}

# Tauri writes `.sig` release assets as a base64-encoded blob of the actual
# minisign signature text (verified against a real published `.sig`+AppImage
# pair during this task's implementation) -- decode once before handing it
# to the `minisign` CLI.
decode_sig() {
  # $1 = path to the downloaded (base64-wrapped) .sig asset
  # $2 = path to write the decoded minisign-format signature to
  base64 -d "$1" > "$2" 2>/dev/null || die "could not decode signature file '$1' -- it may be corrupt or truncated"
}

# Verifies the downloaded AppImage against both its own minisign signature
# and the release's signed SHA256SUMS checksum manifest. Refuses (non-zero
# exit, explicit message) if either check fails.
verify_download() {
  appimage="$1"
  appimage_sig_raw="$2"
  sums="$3"
  sums_sig_raw="$4"

  sums_sig="${CACHE_DIR}/SHA256SUMS.sig.decoded"
  appimage_sig="${CACHE_DIR}/AppImage.sig.decoded"
  decode_sig "$sums_sig_raw" "$sums_sig"
  decode_sig "$appimage_sig_raw" "$appimage_sig"

  "$MINISIGN_BIN" -Vm "$sums" -x "$sums_sig" -P "$MINISIGN_PUBKEY" -q \
    || die "SHA256SUMS signature verification failed -- refusing to install a possibly-tampered release"

  "$MINISIGN_BIN" -Vm "$appimage" -x "$appimage_sig" -P "$MINISIGN_PUBKEY" -q \
    || die "AppImage signature verification failed -- refusing to install a possibly-tampered release"

  appimage_name="$(basename "$appimage")"
  expected_line="$(grep -F "  ${appimage_name}" "$sums" || true)"
  [ -n "$expected_line" ] || die "SHA256SUMS does not list '${appimage_name}' -- refusing to install"

  (cd "$(dirname "$appimage")" && printf '%s\n' "$expected_line" | sha256sum -c - >/dev/null 2>&1) \
    || die "AppImage checksum verification failed against SHA256SUMS -- refusing to install a possibly-tampered download"
}

install_binary() {
  appimage="$1"
  mkdir -p "$INSTALL_DIR"
  cp "$appimage" "${INSTALL_DIR}/${BIN_NAME}"
  chmod +x "${INSTALL_DIR}/${BIN_NAME}"
}

# Extracts a launcher icon straight from the verified AppImage
# (`--appimage-extract` needs no FUSE and works even when libfuse2 is
# missing), so the installed icon always matches the installed version
# exactly, with no extra network dependency.
install_desktop_entry() {
  extract_dir="$(mktemp -d)"
  ( cd "$extract_dir" && "${INSTALL_DIR}/${BIN_NAME}" --appimage-extract >/dev/null 2>&1 ) || true

  mkdir -p "$ICON_DIR"
  icon_installed=0
  if [ -f "${extract_dir}/squashfs-root/.DirIcon" ]; then
    cp "${extract_dir}/squashfs-root/.DirIcon" "${ICON_DIR}/${BIN_NAME}.png" && icon_installed=1
  fi
  rm -rf "$extract_dir"

  mkdir -p "$DESKTOP_DIR"
  desktop_file="${DESKTOP_DIR}/${BIN_NAME}.desktop"
  {
    printf '[Desktop Entry]\n'
    printf 'Type=Application\n'
    printf 'Name=Knowledge OS\n'
    printf 'Exec=%s\n' "${INSTALL_DIR}/${BIN_NAME}"
    printf 'Terminal=false\n'
    printf 'Categories=Office;\n'
    if [ "$icon_installed" -eq 1 ]; then
      printf 'Icon=%s\n' "${BIN_NAME}"
    fi
  } > "$desktop_file"

  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$DESKTOP_DIR" >/dev/null 2>&1 || true
  fi
}

main() {
  check_os
  check_arch
  require_cmd curl
  require_cmd sha256sum
  require_cmd base64
  require_cmd tar

  mkdir -p "$CACHE_DIR"

  log "resolving the latest stable Knowledge OS release..."
  release_json="$(resolve_latest_stable_release)"
  version="$(json_field "$release_json" "tag_name")"
  [ -n "$version" ] || die "could not determine the latest stable release version"

  appimage_url="$(json_asset_url "$release_json" '_amd64\.AppImage$')"
  appimage_sig_url="$(json_asset_url "$release_json" '_amd64\.AppImage\.sig$')"
  sums_url="$(json_asset_url "$release_json" '/SHA256SUMS$')"
  sums_sig_url="$(json_asset_url "$release_json" '/SHA256SUMS\.sig$')"

  [ -n "$appimage_url" ] || die "could not find an amd64 AppImage asset on release ${version}"
  [ -n "$appimage_sig_url" ] || die "could not find the AppImage's .sig asset on release ${version}"
  [ -n "$sums_url" ] || die "could not find SHA256SUMS on release ${version}"
  [ -n "$sums_sig_url" ] || die "could not find SHA256SUMS.sig on release ${version}"

  # Keep the asset's own filename locally -- SHA256SUMS records artifacts by
  # their real release filename, and checksum lookup below matches on that.
  appimage_asset_name="$(basename "$appimage_url")"
  appimage_path="${CACHE_DIR}/${appimage_asset_name}"
  appimage_sig_path="${appimage_path}.sig"
  sums_path="${CACHE_DIR}/SHA256SUMS"
  sums_sig_path="${CACHE_DIR}/SHA256SUMS.sig"

  log "downloading Knowledge OS ${version}..."
  curl -fsSL -o "$appimage_path" "$appimage_url" || die "failed to download the AppImage"
  curl -fsSL -o "$appimage_sig_path" "$appimage_sig_url" || die "failed to download the AppImage's .sig"
  curl -fsSL -o "$sums_path" "$sums_url" || die "failed to download SHA256SUMS"
  curl -fsSL -o "$sums_sig_path" "$sums_sig_url" || die "failed to download SHA256SUMS.sig"

  log "verifying signature and checksum..."
  ensure_minisign
  verify_download "$appimage_path" "$appimage_sig_path" "$sums_path" "$sums_sig_path"

  log "installing to ${INSTALL_DIR}/${BIN_NAME}..."
  install_binary "$appimage_path"
  install_desktop_entry

  log ""
  log "Knowledge OS ${version} installed successfully."
  log "Launch it from your application launcher, or run: ${INSTALL_DIR}/${BIN_NAME}"
}

main "$@"
