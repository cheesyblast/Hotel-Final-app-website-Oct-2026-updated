#!/bin/bash
# ============================================
#  Extract CRM + Website into separate folders
#  Run from the Emergent project root (/app)
# ============================================

set -e

OUTPUT_DIR="${1:-/tmp/kreation-deploy}"
echo "Extracting to: $OUTPUT_DIR"

mkdir -p "$OUTPUT_DIR/crm/backend" "$OUTPUT_DIR/website/backend" "$OUTPUT_DIR/nginx"

# Both frontends are built from the same React codebase; App.js picks CRM vs Website by hostname
copy_frontend() {
  local dest="$1"
  mkdir -p "$dest"
  cp -r /app/frontend/src "$dest/src"
  cp -r /app/frontend/public "$dest/public"
  cp /app/frontend/package.json "$dest/"
  for f in yarn.lock tailwind.config.js postcss.config.js jsconfig.json craco.config.js components.json; do
    [ -f "/app/frontend/$f" ] && cp "/app/frontend/$f" "$dest/"
  done
  [ -d /app/frontend/plugins ] && cp -r /app/frontend/plugins "$dest/plugins"
  return 0
}

# ── CRM ──
echo "▸ Extracting CRM backend..."
cp /app/backend/server.py /app/backend/public_routes.py /app/backend/seo_routes.py "$OUTPUT_DIR/crm/backend/"
cp /app/backend/requirements.txt "$OUTPUT_DIR/crm/backend/"

echo "▸ Extracting CRM frontend..."
copy_frontend "$OUTPUT_DIR/crm/frontend"

# CRM .env template
cat > "$OUTPUT_DIR/crm/backend/.env.example" << 'EOF'
MONGO_URL=mongodb://mongo:27017
DB_NAME=kreation_db
JWT_SECRET_KEY=CHANGE_ME
PUBLIC_WEBSITE_URL=https://www.kreationhotels.com
UPLOAD_DIR=/app/uploads
EOF

# CRM Dockerfile
cp /app/deployment/crm/Dockerfile "$OUTPUT_DIR/crm/"

# ── Website ──
echo "▸ Extracting Website backend..."
cp /app/backend/public_routes.py /app/backend/seo_routes.py "$OUTPUT_DIR/website/backend/"
cp /app/deployment/website/backend/main.py "$OUTPUT_DIR/website/backend/"
cp /app/deployment/website/backend/requirements.txt "$OUTPUT_DIR/website/backend/"

echo "▸ Extracting Website frontend..."
copy_frontend "$OUTPUT_DIR/website/frontend"

# Website .env template
cat > "$OUTPUT_DIR/website/backend/.env.example" << 'EOF'
MONGO_URL=mongodb://mongo:27017
DB_NAME=kreation_db
PAYHERE_MERCHANT_ID=YOUR_MERCHANT_ID
PAYHERE_MERCHANT_SECRET=YOUR_MERCHANT_SECRET
PAYHERE_BASE_URL=https://sandbox.payhere.lk
TURNSTILE_SECRET_KEY=YOUR_TURNSTILE_SECRET
PUBLIC_WEBSITE_URL=https://www.kreationhotels.com
UPLOAD_DIR=/app/uploads
WEBSITE_INDEX_URL=http://website-frontend:80/index.html
EOF

# Website Dockerfile
cp /app/deployment/website/Dockerfile "$OUTPUT_DIR/website/"

# ── Configs ──
echo "▸ Copying deployment configs..."
cp /app/deployment/docker-compose.yml "$OUTPUT_DIR/"
cp /app/deployment/.env.example "$OUTPUT_DIR/"
cp /app/deployment/nginx/*.conf "$OUTPUT_DIR/nginx/"
cp /app/deployment/setup.sh "$OUTPUT_DIR/"
cp /app/deployment/DEPLOYMENT_GUIDE.md "$OUTPUT_DIR/"

echo ""
echo "════════════════════════════════════════════"
echo "  ✓ Extraction complete!"
echo "════════════════════════════════════════════"
echo ""
echo "  Output: $OUTPUT_DIR"
echo ""
echo "  Structure:"
find "$OUTPUT_DIR" -maxdepth 3 -type f | head -40
echo ""
echo "  To deploy: Follow DEPLOYMENT_GUIDE.md"
echo "════════════════════════════════════════════"
