#!/bin/sh
# Install or update Blook: the CLI, the Chrome extension folder and the agent skill.
#   curl -fsSL https://raw.githubusercontent.com/cyrillbrito/blook/main/install.sh | sh
# Re-run to update. Env: BLOOK_INSTALL_DIR (default ~/.local/bin), BLOOK_NO_EXTENSION=1, BLOOK_NO_SKILL=1,
# BLOOK_DOWNLOAD_URL (default: the latest GitHub release), NO_COLOR.
set -eu

main() {
  url=${BLOOK_DOWNLOAD_URL:-https://github.com/cyrillbrito/blook/releases/latest/download}
  bin_dir=${BLOOK_INSTALL_DIR:-$HOME/.local/bin}
  ext_dir=$HOME/Blook/extension # visible and stable: easy to pick in Chrome, keeps its ID and settings

  # Styles only on a terminal, and not with NO_COLOR.
  if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
    b=$(printf '\033[1m') d=$(printf '\033[2m') g=$(printf '\033[32m') y=$(printf '\033[33m') r=$(printf '\033[0m')
    tty=1
  else
    b='' d='' g='' y='' r='' tty=''
  fi

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

  printf '%sBlook installer%s\n\n' "$b" "$r"

  # The CLI
  mkdir -p "$bin_dir"
  step "Downloading the blook CLI"
  curl -fsSL "$url/blook-$os-$arch" -o "$bin_dir/blook.tmp" || fail "download failed: $url/blook-$os-$arch"
  chmod +x "$bin_dir/blook.tmp"
  [ "$os" = darwin ] && xattr -d com.apple.quarantine "$bin_dir/blook.tmp" 2>/dev/null || true
  mv "$bin_dir/blook.tmp" "$bin_dir/blook"
  done_ "blook $("$bin_dir/blook" --version)  $d$(tilde "$bin_dir/blook")$r"

  # The extension: always the same folder, so Chrome keeps its ID and settings across updates.
  if [ -z "${BLOOK_NO_EXTENSION:-}" ]; then
    command -v unzip >/dev/null || fail "unzip is needed for the extension (or set BLOOK_NO_EXTENSION=1)"
    mkdir -p "$HOME/Blook"
    tmp=$(mktemp -d "$HOME/Blook/.tmp.XXXXXX")
    step "Downloading the Chrome extension"
    curl -fsSL "$url/blook-chrome.zip" -o "$tmp/blook-chrome.zip" || fail "download failed: $url/blook-chrome.zip"
    unzip -q "$tmp/blook-chrome.zip" -d "$tmp/extension"
    rm -rf "$ext_dir"
    mv "$tmp/extension" "$ext_dir"
    rm -rf "$tmp"
    done_ "Chrome extension  $d$(tilde "$ext_dir")$r"
  fi

  case ":$PATH:" in
    *":$bin_dir:"*) ;;
    *) printf '  %s!%s %s is not on your PATH. Add to ~/.zshrc or ~/.bashrc:\n' "$y" "$r" "$(tilde "$bin_dir")"
       # shellcheck disable=SC2016 # a literal $PATH, for the profile
       printf '    export PATH="%s:$PATH"\n' "$bin_dir" ;;
  esac

  # The agent skill, if wanted. Questions read the terminal, not this piped script.
  if [ -z "${BLOOK_NO_SKILL:-}" ]; then
    echo
    if (: </dev/tty) 2>/dev/null; then
      printf '%s?%s Add the blook skill to your coding agents? [Y/n] ' "$b" "$r"
      read -r answer </dev/tty || answer=n
      case "$answer" in
        n* | N*) printf '  %sSkipped. Later: blook skill install%s\n' "$d" "$r" ;;
        *) if "$bin_dir/blook" skill install </dev/tty; then done_ "Agent skill"
           else printf '  %s!%s Skill install failed. Later: blook skill install\n' "$y" "$r"; fi ;;
      esac
    else
      printf '  %sNo terminal to ask, skipped the agent skill. Later: blook skill install%s\n' "$d" "$r"
    fi
  fi

  # The Chrome guide comes from the CLI, so `blook extension` shows the same thing.
  if [ -z "${BLOOK_NO_EXTENSION:-}" ]; then
    echo
    "$bin_dir/blook" extension || true
  fi
}

# "  … what" while it runs (terminal only); done_ replaces it with "  ✓ what".
step() { [ -n "$tty" ] && printf '  %s… %s%s' "$d" "$1" "$r"; return 0; }
done_() {
  [ -n "$tty" ] && printf '\r\033[K'
  printf '  %s✓%s %s\n' "$g" "$r" "$1"
}
tilde() { case "$1" in "$HOME"/*) echo "~${1#"$HOME"}" ;; *) echo "$1" ;; esac; }

fail() {
  [ -n "${tty:-}" ] && printf '\n'
  echo "blook install: $1" >&2
  exit 1
}

main "$@"
