#!/bin/bash
# ============================================
#  Kreation Hotels — Server Setup Script
#  Run on a fresh Ubuntu 22.04+ VPS
# ============================================

set -e

echo "═══════════════════════════════════════════"
echo "  Kreation Hotels — Server Setup"
echo "═══════════════════════════════════════════"

# ── 1. Install Docker ──
if ! command -v docker &> /dev/null; then
    echo "▸ Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER
    echo "  ✓ Docker installed"
else
    echo "  ✓ Docker already installed"
fi

# ── 2. Install Docker Compose ──
if ! command -v docker compose &> /dev/null; then
    echo "▸ Installing Docker Compose..."
    sudo apt-get update && sudo apt-get install -y docker-compose-plugin
    echo "  ✓ Docker Compose installed"
else
    echo "  ✓ Docker Compose already installed"
fi

# ── 3. Create project directory ──
PROJECT_DIR="/srv/kreation"
echo "▸ Setting up project at $PROJECT_DIR"
sudo mkdir -p $PROJECT_DIR
sudo chown $USER:$USER $PROJECT_DIR
cd $PROJECT_DIR

# ── 4. Next steps ──
echo ""
echo "═══════════════════════════════════════════"
echo "  Server ready!"
echo "═══════════════════════════════════════════"
echo ""
echo "  1. Put the project in $PROJECT_DIR (git clone, or copy the folder made by deployment/extract.sh)"
echo "     It must contain: backend/  frontend/  deployment/  .dockerignore"
echo ""
echo "  2. Configure environment:"
echo "     cd $PROJECT_DIR/deployment && cp .env.example .env && nano .env"
echo ""
echo "  3. Build & start (images build straight from ../backend and ../frontend):"
echo "     docker compose up -d --build"
echo ""
echo "  4. Verify SEO files are served raw by website-backend:"
echo "     curl -i http://localhost:8080/sitemap.xml   # website-frontend container"
echo "     curl -i http://localhost:8080/robots.txt"
echo ""
echo "  5. Setup SSL:"
echo "     sudo certbot --nginx -d app.kreationhotels.com -d www.kreationhotels.com"
echo "═══════════════════════════════════════════"
