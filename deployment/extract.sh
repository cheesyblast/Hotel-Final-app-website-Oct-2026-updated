#!/bin/bash
# ============================================
#  Extract CRM + Website into separate folders
#  Run from the Emergent project root (/app)
# ============================================

set -e

OUTPUT_DIR="${1:-/tmp/kreation-deploy}"
echo "Extracting to: $OUTPUT_DIR"

mkdir -p "$OUTPUT_DIR/crm/backend" "$OUTPUT_DIR/crm/frontend"
mkdir -p "$OUTPUT_DIR/website/backend" "$OUTPUT_DIR/website/frontend-src"
mkdir -p "$OUTPUT_DIR/nginx"

# ── CRM ──
echo "▸ Extracting CRM backend..."
cp /app/backend/server.py "$OUTPUT_DIR/crm/backend/"
cp /app/backend/public_routes.py "$OUTPUT_DIR/crm/backend/"
cp /app/backend/requirements.txt "$OUTPUT_DIR/crm/backend/"

echo "▸ Extracting CRM frontend..."
cp -r /app/frontend/src "$OUTPUT_DIR/crm/frontend/src"
cp -r /app/frontend/public "$OUTPUT_DIR/crm/frontend/public"
cp /app/frontend/package.json "$OUTPUT_DIR/crm/frontend/"
[ -f /app/frontend/yarn.lock ] && cp /app/frontend/yarn.lock "$OUTPUT_DIR/crm/frontend/"
[ -f /app/frontend/tailwind.config.js ] && cp /app/frontend/tailwind.config.js "$OUTPUT_DIR/crm/frontend/"
[ -f /app/frontend/postcss.config.js ] && cp /app/frontend/postcss.config.js "$OUTPUT_DIR/crm/frontend/"
[ -f /app/frontend/jsconfig.json ] && cp /app/frontend/jsconfig.json "$OUTPUT_DIR/crm/frontend/"

# Remove Website.js from CRM frontend (it has its own)
rm -f "$OUTPUT_DIR/crm/frontend/src/Website.js"

# CRM .env template
cat > "$OUTPUT_DIR/crm/backend/.env.example" << 'EOF'
MONGO_URL=mongodb://mongo:27017
DB_NAME=kreation_db
JWT_SECRET_KEY=CHANGE_ME
EOF

# CRM Dockerfile
cp /app/deployment/crm/Dockerfile "$OUTPUT_DIR/crm/"

echo "▸ Patching CRM App.js (remove website route, restore / as dashboard)..."
cd "$OUTPUT_DIR/crm/frontend/src"
# Remove Website import line
sed -i '/import Website/d' App.js
# Change /website route to not exist, restore dashboard to /
sed -i 's|<Route path="/website" element={<Website />} />||' App.js
sed -i 's|<Route path="/" element={<Navigate to="/website" replace />} />||' App.js
sed -i 's|path="/dashboard"|path="/"|' App.js
# Fix nav
sed -i "s|path: '/dashboard'|path: '/'|" App.js

# ── Website ──
echo "▸ Extracting Website backend..."
cp /app/backend/public_routes.py "$OUTPUT_DIR/website/backend/"
cp /app/deployment/website/backend/main.py "$OUTPUT_DIR/website/backend/"
cp /app/deployment/website/backend/requirements.txt "$OUTPUT_DIR/website/backend/"

echo "▸ Creating Website frontend..."
# The website frontend is a minimal React app wrapping Website.js
cp /app/frontend/src/Website.js "$OUTPUT_DIR/website/frontend-src/"

# Website .env template
cat > "$OUTPUT_DIR/website/backend/.env.example" << 'EOF'
MONGO_URL=mongodb://mongo:27017
DB_NAME=kreation_db
PAYHERE_MERCHANT_ID=YOUR_MERCHANT_ID
PAYHERE_MERCHANT_SECRET=YOUR_MERCHANT_SECRET
PAYHERE_BASE_URL=https://sandbox.payhere.lk
TURNSTILE_SECRET_KEY=YOUR_TURNSTILE_SECRET
PUBLIC_WEBSITE_URL=https://kreationhotels.com
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
