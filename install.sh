#!/bin/sh
# Install or update Blook: the CLI, the Chrome extension folder and the agent skill.
#   curl -fsSL https://raw.githubusercontent.com/cyrillbrito/blook/main/install.sh | sh
# Re-run to update. Env: BLOOK_INSTALL_DIR (default ~/.local/bin), BLOOK_NO_EXTENSION=1, BLOOK_NO_SKILL=1,
# BLOOK_DOWNLOAD_URL (default: the latest GitHub release).
set -eu

main() {
  url=${BLOOK_DOWNLOAD_URL:-https://github.com/cyrillbrito/blook/releases/latest/download}
  bin_dir=${BLOOK_INSTALL_DIR:-$HOME/.local/bin}
  ext_dir=$HOME/.blook/extension

  case "$(uname -s)" in
    Darwin) os=darwin ;;
    Linux) os=linux ;;
    *) fail "unsupported OS: $(uname -s)" ;;
  esac
  case "$(uname -m)" in
    arm64 | aarch64) arch=arm64 ;;
    x86_64 | amd64) arch=x64 ;;
    *) fail "unsupported CPU: $(uname -m)" ;;
  esac
  [ "$os-$arch" = linux-arm64 ] && fail "no linux-arm64 build yet"

  # The CLI
  mkdir -p "$bin_dir"
  echo "Downloading blook-$os-$arch"
  curl -fSL --progress-bar "$url/blook-$os-$arch" -o "$bin_dir/blook.tmp"
  chmod +x "$bin_dir/blook.tmp"
  [ "$os" = darwin ] && xattr -d com.apple.quarantine "$bin_dir/blook.tmp" 2>/dev/null || true
  mv "$bin_dir/blook.tmp" "$bin_dir/blook"
  echo "Installed blook $("$bin_dir/blook" --version) to $bin_dir/blook"

  # The extension: always the same folder, so Chrome keeps its ID and settings across updates.
  if [ -z "${BLOOK_NO_EXTENSION:-}" ]; then
    command -v unzip >/dev/null || fail "unzip is needed for the extension (or set BLOOK_NO_EXTENSION=1)"
    mkdir -p "$HOME/.blook"
    tmp=$(mktemp -d "$HOME/.blook/tmp.XXXXXX")
    echo "Downloading the Chrome extension"
    curl -fSL --progress-bar "$url/blook-chrome.zip" -o "$tmp/blook-chrome.zip"
    unzip -q "$tmp/blook-chrome.zip" -d "$tmp/extension"
    rm -rf "$ext_dir"
    mv "$tmp/extension" "$ext_dir"
    rm -rf "$tmp"
    echo "Unpacked the extension to $ext_dir"
  fi

  # The agent skill. npx asks which agents; it reads the terminal, not this piped script.
  if [ -z "${BLOOK_NO_SKILL:-}" ]; then
    if (: </dev/tty) 2>/dev/null; then
      "$bin_dir/blook" skill install </dev/tty || echo "Skill install failed; run: blook skill install"
    else
      "$bin_dir/blook" skill install -y || echo "Skill install failed; run: blook skill install"
    fi
  fi

  echo
  case ":$PATH:" in
    *":$bin_dir:"*) ;;
    *) echo "$bin_dir is not on your PATH. Add this line to your shell profile (~/.zshrc or ~/.bashrc):"
       echo "  export PATH=\"$bin_dir:\$PATH\""
       echo ;;
  esac

  if [ -z "${BLOOK_NO_EXTENSION:-}" ]; then
    echo "Load the extension in Chrome (once; after an update, click its reload icon instead):"
    echo "  1. Open chrome://extensions"
    echo "  2. Turn on Developer mode (top right)"
    echo "  3. Click Load unpacked and pick $ext_dir"
    echo "     (in the file picker, Cmd+Shift+G or Ctrl+L lets you paste the path)"
    echo "  4. Pin Blook from the puzzle icon in the toolbar"
    [ "$os" = darwin ] && open -a "Google Chrome" "chrome://extensions" 2>/dev/null || true
  fi
}

fail() {
  echo "blook install: $1" >&2
  exit 1
}

main "$@"
