#!/usr/bin/env bash
# ============================================================================
# CodeBakers Agent System — Machine Setup
# Run: curl -fsSL https://raw.githubusercontent.com/tdaniel1925/codebakers-system/main/setup.sh | bash
# ============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

CODEBAKERS_DIR="$HOME/.codebakers"
CONFIG_FILE="$CODEBAKERS_DIR/config.json"
REPO_URL="https://github.com/tdaniel1925/codebakers-system.git"

# Helpers
info()    { echo -e "${BLUE}→${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warn()    { echo -e "${YELLOW}⚠${NC} $1"; }
fail()    { echo -e "${RED}✗${NC} $1"; exit 1; }
ask()     { echo -en "${BOLD}? $1${NC} "; }

# Detect OS
detect_os() {
  case "$(uname -s)" in
    Darwin*) OS="macos" ;;
    Linux*)  OS="linux" ;;
    *)       fail "Unsupported OS: $(uname -s). CodeBakers supports macOS and Linux." ;;
  esac
  success "Detected OS: $OS"
}

# Check if a command exists
has() { command -v "$1" &>/dev/null; }

# Install Node.js via nvm if not present
setup_node() {
  if has node; then
    NODE_VERSION=$(node -v)
    success "Node.js already installed: $NODE_VERSION"
    return
  fi

  info "Node.js not found. Installing via nvm..."
  if ! has nvm; then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    # shellcheck source=/dev/null
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  fi
  nvm install --lts
  nvm use --lts
  success "Node.js installed: $(node -v)"
}

# Enable pnpm via corepack
setup_pnpm() {
  if has pnpm; then
    success "pnpm already installed: $(pnpm -v)"
    return
  fi

  info "Enabling pnpm via corepack..."
  corepack enable
  corepack prepare pnpm@latest --activate
  success "pnpm installed: $(pnpm -v)"
}

# Install Supabase CLI
setup_supabase() {
  if has supabase; then
    success "Supabase CLI already installed: $(supabase -v 2>/dev/null || echo 'installed')"
    return
  fi

  info "Installing Supabase CLI..."
  if [ "$OS" = "macos" ]; then
    brew install supabase/tap/supabase
  else
    pnpm add -g supabase
  fi
  success "Supabase CLI installed"
}

# Install Vercel CLI
setup_vercel() {
  if has vercel; then
    success "Vercel CLI already installed"
    return
  fi

  info "Installing Vercel CLI..."
  pnpm add -g vercel
  success "Vercel CLI installed"
}

# Install GitHub CLI
setup_gh() {
  if has gh; then
    success "GitHub CLI already installed: $(gh --version | head -1)"
    return
  fi

  info "Installing GitHub CLI..."
  if [ "$OS" = "macos" ]; then
    brew install gh
  else
    # Debian/Ubuntu
    if has apt-get; then
      curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
      sudo apt-get update && sudo apt-get install gh -y
    else
      warn "Could not auto-install gh. Please install manually: https://cli.github.com/"
      return
    fi
  fi
  success "GitHub CLI installed"
}

# Optional: Stripe CLI
setup_stripe() {
  if has stripe; then
    success "Stripe CLI already installed"
    return
  fi

  ask "Install Stripe CLI? (needed for payment features) [y/N]"
  read -r answer
  if [[ "$answer" =~ ^[Yy]$ ]]; then
    info "Installing Stripe CLI..."
    if [ "$OS" = "macos" ]; then
      brew install stripe/stripe-cli/stripe
    else
      curl -s https://packages.stripe.dev/api/security/keypair/stripe-cli-gpg/public | gpg --dearmor | sudo tee /usr/share/keyrings/stripe.gpg > /dev/null
      echo "deb [signed-by=/usr/share/keyrings/stripe.gpg] https://packages.stripe.dev/stripe-cli-debian-local stable main" | sudo tee /etc/apt/sources.list.d/stripe.list > /dev/null
      sudo apt-get update && sudo apt-get install stripe -y
    fi
    success "Stripe CLI installed"
  else
    info "Skipping Stripe CLI (install later with: brew install stripe/stripe-cli/stripe)"
  fi
}

# Authentication
run_auth() {
  echo ""
  echo -e "${BOLD}Authentication Setup${NC}"
  echo "Each step is optional — press Enter to skip."
  echo ""

  # GitHub
  if has gh; then
    if gh auth status &>/dev/null; then
      success "GitHub: already authenticated"
    else
      ask "Authenticate with GitHub? [y/N]"
      read -r answer
      if [[ "$answer" =~ ^[Yy]$ ]]; then
        gh auth login
      else
        info "Skipping GitHub auth (run later: gh auth login)"
      fi
    fi
  fi

  # Supabase
  if has supabase; then
    ask "Authenticate with Supabase? [y/N]"
    read -r answer
    if [[ "$answer" =~ ^[Yy]$ ]]; then
      supabase login
    else
      info "Skipping Supabase auth (run later: supabase login)"
    fi
  fi

  # Vercel
  if has vercel; then
    ask "Authenticate with Vercel? [y/N]"
    read -r answer
    if [[ "$answer" =~ ^[Yy]$ ]]; then
      vercel login
    else
      info "Skipping Vercel auth (run later: vercel login)"
    fi
  fi
}

# Create config directory and clone repo
setup_codebakers_dir() {
  if [ -d "$CODEBAKERS_DIR" ]; then
    success "CodeBakers directory exists: $CODEBAKERS_DIR"
  else
    mkdir -p "$CODEBAKERS_DIR"
    success "Created CodeBakers directory: $CODEBAKERS_DIR"
  fi

  # Clone or update the repo
  if [ -d "$CODEBAKERS_DIR/repo" ]; then
    info "Updating CodeBakers repo..."
    git -C "$CODEBAKERS_DIR/repo" pull --quiet
    success "Repo updated"
  else
    info "Cloning CodeBakers repo..."
    git clone --quiet "$REPO_URL" "$CODEBAKERS_DIR/repo"
    success "Repo cloned"
  fi

  # Write config
  cat > "$CONFIG_FILE" <<EOF
{
  "version": "1.0.0",
  "installed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "os": "$OS",
  "codebakers_dir": "$CODEBAKERS_DIR",
  "repo_path": "$CODEBAKERS_DIR/repo",
  "node_version": "$(node -v 2>/dev/null || echo 'not installed')",
  "pnpm_version": "$(pnpm -v 2>/dev/null || echo 'not installed')"
}
EOF
  success "Config saved: $CONFIG_FILE"
}

# Print summary
print_summary() {
  echo ""
  echo -e "${BOLD}════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}${BOLD}  CodeBakers Agent System — Setup Complete${NC}"
  echo -e "${BOLD}════════════════════════════════════════════════════${NC}"
  echo ""
  echo "  Installed tools:"
  has node     && echo -e "    ${GREEN}✓${NC} Node.js    $(node -v)"
  has pnpm     && echo -e "    ${GREEN}✓${NC} pnpm       $(pnpm -v)"
  has supabase && echo -e "    ${GREEN}✓${NC} Supabase CLI"
  has vercel   && echo -e "    ${GREEN}✓${NC} Vercel CLI"
  has gh       && echo -e "    ${GREEN}✓${NC} GitHub CLI $(gh --version | head -1 | awk '{print $3}')"
  has stripe   && echo -e "    ${GREEN}✓${NC} Stripe CLI"
  echo ""
  echo "  Config: $CONFIG_FILE"
  echo "  Repo:   $CODEBAKERS_DIR/repo/"
  echo ""
  echo -e "  ${BOLD}Next steps:${NC}"
  echo "  1. Copy CLAUDE.md into your project folder"
  echo "  2. Open Claude Code"
  echo "  3. Start building!"
  echo ""
}

# ============================================================================
# Main
# ============================================================================

main() {
  echo ""
  echo -e "${BOLD}CodeBakers Agent System — Setup${NC}"
  echo "This will install the tools needed for the CodeBakers development system."
  echo ""

  detect_os
  setup_node
  setup_pnpm
  setup_gh
  setup_supabase
  setup_vercel
  setup_stripe
  run_auth
  setup_codebakers_dir
  print_summary
}

main "$@"
