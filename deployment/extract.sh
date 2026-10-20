#!/bin/bash
# ============================================
#  Kreation Hotels — Optional packaging script
#  Creates a clean, self-contained copy of the project that can be
#  copied to any server and started with:
#     cd <output>/deployment && docker compose up -d --build
#  (Not required when deploying from a git clone of the project.)
# ============================================
set -e

SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_DIR="${1:-./kreation-deploy}"

echo "▸ Packaging $SRC_DIR → $OUTPUT_DIR"
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR/backend" "$OUTPUT_DIR/frontend"

# Backend: only runtime files
cp "$SRC_DIR/backend/server.py" "$SRC_DIR/backend/public_routes.py" "$SRC_DIR/backend/seo_routes.py" "$SRC_DIR/backend/requirements.txt" "$OUTPUT_DIR/backend/"

# Frontend: source only (no node_modules / build)
cp -r "$SRC_DIR/frontend/src" "$SRC_DIR/frontend/public" "$OUTPUT_DIR/frontend/"
for f in package.json yarn.lock craco.config.js tailwind.config.js postcss.config.js jsconfig.json components.json; do
  [ -f "$SRC_DIR/frontend/$f" ] && cp "$SRC_DIR/frontend/$f" "$OUTPUT_DIR/frontend/"
done
[ -d "$SRC_DIR/frontend/plugins" ] && cp -r "$SRC_DIR/frontend/plugins" "$OUTPUT_DIR/frontend/"

# Deployment configs + build ignore rules
cp -r "$SRC_DIR/deployment" "$OUTPUT_DIR/deployment"
rm -f "$OUTPUT_DIR/deployment/.env"
cp "$SRC_DIR/.dockerignore" "$OUTPUT_DIR/.dockerignore"

# Sanity check: every file the Dockerfiles COPY must exist
for f in backend/server.py backend/public_routes.py backend/seo_routes.py backend/requirements.txt \
         deployment/website/backend/main.py deployment/website/backend/requirements.txt \
         deployment/website/nginx.conf.template deployment/crm/nginx.conf frontend/package.json frontend/yarn.lock; do
  [ -f "$OUTPUT_DIR/$f" ] || { echo "✗ Missing $f"; exit 1; }
done

echo ""
echo "✓ Done. Next steps on the server:"
echo "    cd $OUTPUT_DIR/deployment"
echo "    cp .env.example .env && nano .env"
echo "    docker compose up -d --build"
