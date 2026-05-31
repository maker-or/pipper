#!/usr/bin/env bash
set -euo pipefail

SUPPORTED_NODE_VERSION="24.13.1"
NODE_VERSION="${SUPPORTED_NODE_VERSION}"
NVM_VERSION="${NVM_VERSION:-v0.40.3}"
EVOLUTION_WORKSPACE_ROOT="${EVOLUTION_WORKSPACE_ROOT:-${HOME}/Library/evolve/pipper}"
PIPPER_REPO_URL="${PIPPER_REPO_URL:-https://github.com/maker-or/pipper}"

if [ "${NODE_VERSION}" != "${SUPPORTED_NODE_VERSION}" ]; then
  printf '[setup-dev-env] ERROR: This script only installs Node %s. Requested: %s\n' "${SUPPORTED_NODE_VERSION}" "${NODE_VERSION}" >&2
  exit 1
fi

OS_NAME="$(uname -s)"
if [ "${OS_NAME}" != "Darwin" ]; then
  printf '[setup-dev-env] ERROR: This script is macOS only. Detected: %s\n' "${OS_NAME}" >&2
  exit 1
fi
printf '[setup-dev-env] Detected OS: %s\n' "${OS_NAME}"

check_command() {
  command -v "$1" >/dev/null 2>&1
}

install_git() {
  if check_command git; then
    printf '[setup-dev-env] git is installed: %s\n' "$(git --version)"
    return 0
  fi

  printf '[setup-dev-env] git is not installed. Attempting installation...\n'

  if check_command brew; then
    printf '[setup-dev-env] Installing git via Homebrew: brew install git\n'
    brew install git
  elif check_command port; then
    printf '[setup-dev-env] Installing git via MacPorts: sudo port install git\n'
    sudo port install git
  else
    printf '[setup-dev-env] Installing Xcode Command Line Tools: xcode-select --install\n'
    xcode-select --install >/dev/null 2>&1 || true
    printf '[setup-dev-env] ERROR: No package manager found. Install git with Homebrew, MacPorts, or Xcode Command Line Tools, then rerun this script.\n' >&2
    exit 1
  fi

  check_command git || {
    if check_command xcode-select && ! xcode-select -p >/dev/null 2>&1; then
      printf '[setup-dev-env] ERROR: Xcode Command Line Tools installer launched. Complete the installation, then rerun this script\n' >&2
      exit 1
    fi
    printf '[setup-dev-env] ERROR: git installation failed\n' >&2
    exit 1
  }

  printf '[setup-dev-env] git installed successfully: %s\n' "$(git --version)"
}

install_nvm() {
  if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
    # shellcheck disable=SC1090
    . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
    return 0
  fi

  printf '[setup-dev-env] nvm is not installed. Installing nvm %s...\n' "${NVM_VERSION}"
  export NVM_DIR="$HOME/.nvm"
  mkdir -p "$NVM_DIR"
  curl -fsSL "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh" | bash

  [ -s "$NVM_DIR/nvm.sh" ] || {
    printf '[setup-dev-env] ERROR: nvm installation did not create nvm.sh\n' >&2
    exit 1
  }
  # shellcheck disable=SC1090
  . "$NVM_DIR/nvm.sh"
}

install_node_with_nvm() {
  install_nvm

  if ! declare -F nvm >/dev/null 2>&1; then
    # shellcheck disable=SC1090
    . "${NVM_DIR}/nvm.sh"
  fi

  printf '[setup-dev-env] Using nvm: %s\n' "$(command -v nvm || true)"

  if nvm version "${NODE_VERSION}" >/dev/null 2>&1; then
    printf '[setup-dev-env] Node %s is already installed\n' "${NODE_VERSION}"
  else
    printf '[setup-dev-env] Node %s is not installed. Downloading...\n' "${NODE_VERSION}"
    nvm install "${NODE_VERSION}"
  fi

  nvm use "${NODE_VERSION}"
}

install_node_with_mise() {
  printf '[setup-dev-env] Using mise: %s\n' "$(command -v mise || true)"
  printf '[setup-dev-env] Ensuring Node %s is installed with mise...\n' "${NODE_VERSION}"
  mise install "node@${NODE_VERSION}"
  mise use -g "node@${NODE_VERSION}"
}

install_node_with_fnm() {
  printf '[setup-dev-env] Using fnm: %s\n' "$(command -v fnm || true)"
  printf '[setup-dev-env] Ensuring Node %s is installed with fnm...\n' "${NODE_VERSION}"
  fnm install "${NODE_VERSION}"
  fnm use "${NODE_VERSION}"
}

install_node_with_volta() {
  printf '[setup-dev-env] Using volta: %s\n' "$(command -v volta || true)"
  printf '[setup-dev-env] Ensuring Node %s is installed with volta...\n' "${NODE_VERSION}"
  volta install "node@${NODE_VERSION}"
}

install_node_with_asdf() {
  printf '[setup-dev-env] Using asdf: %s\n' "$(command -v asdf || true)"
  printf '[setup-dev-env] Ensuring Node %s is installed with asdf...\n' "${NODE_VERSION}"
  asdf install nodejs "${NODE_VERSION}"
  asdf global nodejs "${NODE_VERSION}"
}

install_node_with_nodenv() {
  printf '[setup-dev-env] Using nodenv: %s\n' "$(command -v nodenv || true)"
  printf '[setup-dev-env] Ensuring Node %s is installed with nodenv...\n' "${NODE_VERSION}"
  nodenv install "${NODE_VERSION}"
  nodenv global "${NODE_VERSION}"
}

install_node_with_nave() {
  printf '[setup-dev-env] Using nave: %s\n' "$(command -v nave || true)"
  printf '[setup-dev-env] Ensuring Node %s is installed with nave...\n' "${NODE_VERSION}"
  nave use "${NODE_VERSION}"
}

check_node_managers() {
  if check_command nvm || [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
    install_node_with_nvm
    return 0
  fi

  if check_command mise; then
    install_node_with_mise
    return 0
  fi

  if check_command fnm; then
    install_node_with_fnm
    return 0
  fi

  if check_command volta; then
    install_node_with_volta
    return 0
  fi

  if check_command asdf; then
    install_node_with_asdf
    return 0
  fi

  if check_command nodenv; then
    install_node_with_nodenv
    return 0
  fi

  if check_command nave; then
    install_node_with_nave
    return 0
  fi

  printf '[setup-dev-env] No known node managers found\n'
  install_node_with_nvm
}

ensure_bun_available() {
  if check_command bun; then
    printf '[setup-dev-env] bun is installed: %s\n' "$(bun --version)"
    return 0
  fi

  if check_command npm; then
    printf '[setup-dev-env] bun is not installed. Installing via npm: npm install -g bun\n'
    npm install -g bun || true
  fi

  if check_command bun; then
    printf '[setup-dev-env] bun installed successfully: %s\n' "$(bun --version)"
    return 0
  fi

  printf '[setup-dev-env] bun is unavailable; dependency install will fall back to npm if possible\n'
}

clone_pipper_repo() {
  local target_dir="${EVOLUTION_WORKSPACE_ROOT}"
  local repo_url="${PIPPER_REPO_URL}"

  if [ -e "$target_dir" ] && [ ! -d "$target_dir" ]; then
    printf '[setup-dev-env] ERROR: %s exists and is not a directory\n' "$target_dir" >&2
    exit 1
  fi

  if [ -d "$target_dir/.git" ]; then
    printf '[setup-dev-env] Reusing existing Pipper checkout at %s\n' "$target_dir"
    return 0
  fi

  if [ -d "$target_dir" ] && [ -n "$(find "$target_dir" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
    printf '[setup-dev-env] ERROR: %s already exists and is not empty, but is not a git checkout\n' "$target_dir" >&2
    exit 1
  fi

  mkdir -p "$(dirname "$target_dir")"
  printf '[setup-dev-env] Cloning %s into %s\n' "$repo_url" "$target_dir"
  git clone "$repo_url" "$target_dir"
}

install_pipper_dependencies() {
  local target_dir="${EVOLUTION_WORKSPACE_ROOT}"

  if [ ! -f "$target_dir/package.json" ]; then
    printf '[setup-dev-env] ERROR: %s does not contain package.json\n' "$target_dir" >&2
    exit 1
  fi

  printf '[setup-dev-env] Installing Pipper dependencies in %s\n' "$target_dir"
  if check_command bun; then
    (cd "$target_dir" && bun install)
    return 0
  fi

  if check_command npm; then
    printf '[setup-dev-env] bun unavailable; running npm install instead\n'
    (cd "$target_dir" && npm install)
    return 0
  fi

  printf '[setup-dev-env] ERROR: neither bun nor npm is available for dependency install\n' >&2
  exit 1
}

main() {
  if check_command node; then
    printf '[setup-dev-env] Preflight node version: %s\n' "$(node --version)"
  else
    printf '[setup-dev-env] Preflight node check: not installed\n'
  fi

  printf '[setup-dev-env] Installing node\n'
  check_node_managers

  printf '[setup-dev-env] Checking git...\n'
  install_git

  ensure_bun_available

  clone_pipper_repo
  install_pipper_dependencies

  if check_command node; then
    printf '[setup-dev-env] Final Node version: %s\n' "$(node --version)"
    return 0
  fi

  printf '[setup-dev-env] ERROR: Node is still not available on PATH after setup\n' >&2
  exit 1
}

main "$@"
