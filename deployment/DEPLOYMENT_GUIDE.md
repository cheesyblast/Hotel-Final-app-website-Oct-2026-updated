# ============================================================
#  DEPLOYMENT GUIDE — Kreation Hotels CRM + Website
#  Self-hosted · Docker Compose · Nginx · MongoDB
# ============================================================
#
#  Architecture:
#
#   www.kreationhotels.com ──► Nginx ──► website-frontend (static)
#                                    └──► website-backend  :8002
#
#   app.kreationhotels.com ──► Nginx ──► crm-frontend (static)
#                                    └──► crm-backend      :8001
#
#   MongoDB (shared) ──► kreation_db  (or per-client DB)
#
# ============================================================

## PREREQUISITES

- Ubuntu 22.04+ VPS (2GB+ RAM recommended)
- Docker & Docker Compose installed
- Domain DNS configured:
  - `app.kreationhotels.com`  → A record → your server IP
  - `www.kreationhotels.com`  → A record → your server IP
- Ports 80 and 443 open

## QUICK START (Single Server)

```bash
# 1. Get the project onto the server (either option)
git clone <your-repo> /srv/kreation                      # or:
bash deployment/extract.sh ./kreation-deploy && scp -r kreation-deploy user@server:/srv/kreation

# 2. Configure
cd /srv/kreation/deployment
cp .env.example .env && nano .env      # <-- EDIT ALL VALUES

# 3. Build and start everything (no manual file copying needed)
docker compose up -d --build

# 4. Verify SEO endpoints return raw XML / text (not the SPA)
curl -i http://localhost:8080/sitemap.xml     # website-frontend container directly
curl -i http://localhost:8080/robots.txt
curl -i http://localhost:8002/sitemap.xml     # website-backend directly

# 5. Install SSL certificates
sudo certbot --nginx -d app.kreationhotels.com -d www.kreationhotels.com
```

## PROJECT STRUCTURE

All images are built with the **project root as build context**, straight from the source folders:

```
/srv/kreation/
├── .dockerignore                     ← keeps node_modules, tests, .git out of images
├── backend/                          ← server.py, public_routes.py, seo_routes.py, requirements.txt
├── frontend/                         ← React app (one codebase; App.js picks CRM vs Website by hostname)
└── deployment/
    ├── docker-compose.yml            ← run docker compose from here
    ├── .env                          ← from .env.example
    ├── Dockerfile.crm-backend        ← server.py + public_routes.py + seo_routes.py
    ├── Dockerfile.crm-frontend       ← React build + crm/nginx.conf
    ├── Dockerfile.website-backend    ← main.py + public_routes.py + seo_routes.py (import-checked at build)
    ├── Dockerfile.website-frontend   ← React build + website/nginx.conf.template
    ├── crm/nginx.conf                ← CRM SPA (noindex, robots Disallow all)
    ├── website/
    │   ├── nginx.conf.template       ← /sitemap.xml, /robots.txt, /api/ → website-backend; SPA fallback
    │   └── backend/{main.py,requirements.txt}
    └── nginx/{crm.conf,website.conf} ← edge reverse proxy + SSL
```

`/sitemap.xml` and `/robots.txt` are proxied to `website-backend` both by the edge nginx and by the nginx inside
the website-frontend container (exact-match locations, evaluated before the `try_files … /index.html` fallback),
so crawlers always receive the generated documents. The frontend container resolves the backend at request time
(`resolver 127.0.0.11`), so it starts even if the backend is still booting. Override with env
`WEBSITE_BACKEND_UPSTREAM` (default `website-backend:8002`) if you rename the service.

## SETTING UP FOR A NEW CRM CLIENT

When you sell the CRM to another hotel:

```bash
# 1. Copy the crm/ folder
cp -r /srv/kreation/crm /srv/newclient/crm

# 2. Create a new .env with their database name
cat > /srv/newclient/.env << EOF
MONGO_URL=mongodb://mongo:27017
DB_NAME=newclient_db           # ← unique per client
JWT_SECRET_KEY=$(openssl rand -hex 32)
# ... other settings
EOF

# 3. Add their docker-compose service (or a new compose file)
# 4. Add Nginx config for their domain
# 5. docker compose up -d --build
```

Each client gets their own:
- Database name in the shared MongoDB
- JWT secret key
- Domain and Nginx config
- Docker containers

## ENVIRONMENT VARIABLES REFERENCE

| Variable | Where | Description |
|---|---|---|
| `MONGO_URL` | Both | MongoDB connection string |
| `DB_NAME` | Both | Database name (unique per client) |
| `JWT_SECRET_KEY` | CRM | Auth token signing key |
| `PAYHERE_MERCHANT_ID` | Website | PayHere merchant ID |
| `PAYHERE_MERCHANT_SECRET` | Website | PayHere merchant secret |
| `PAYHERE_BASE_URL` | Website | `https://www.payhere.lk` for live |
| `TURNSTILE_SECRET_KEY` | Website | Cloudflare Turnstile secret |
| `PUBLIC_WEBSITE_URL` | CRM | Public website base URL used in guest feedback links (e.g. https://kreationhotels.com) |
| `UPLOAD_DIR` | CRM + Website | Shared folder (docker volume `uploads`) for SEO share images |
| `WEBSITE_INDEX_URL` | Website | Built index.html used for server-side SEO tag injection (http://website-frontend:80/index.html) |
| `REACT_APP_BACKEND_URL` | Both FE | Backend API URL |
| `REACT_APP_TURNSTILE_SITE_KEY` | Website FE | Turnstile site key |
| `CRM_API_URL` | Website BE | CRM backend URL (for shared DB) |

## SSL SETUP

After first `docker compose up`, install SSL:

```bash
# Install certbot in nginx container
docker compose exec nginx apt update && apt install -y certbot python3-certbot-nginx

# Get certificates
docker compose exec nginx certbot --nginx \
  -d app.kreationhotels.com \
  -d www.kreationhotels.com

# Auto-renewal (add to host crontab)
echo "0 3 * * * docker compose -f /srv/kreation/docker-compose.yml exec nginx certbot renew" | crontab -
```

## UPDATING THE APP

```bash
cd /srv/kreation

# Pull new code (if using git)
git pull

# Rebuild and restart
docker compose up -d --build

# Or restart specific service
docker compose up -d --build crm-backend
docker compose up -d --build website-frontend
```

## MONITORING

```bash
# View logs
docker compose logs -f crm-backend
docker compose logs -f website-backend
docker compose logs -f nginx

# Check status
docker compose ps

# Database backup
docker compose exec mongo mongodump --db kreation_db --out /backup/
docker cp kreation-mongo-1:/backup ./backups/
```

## TROUBLESHOOTING

| Issue | Fix |
|---|---|
| 502 Bad Gateway | Backend container crashed — `docker compose logs crm-backend` |
| CORS errors | Add domain to `CORS_ORIGINS` in backend .env |
| MongoDB connection refused | Check `mongo` container is running, check `MONGO_URL` |
| SSL not working | Run certbot again, check ports 80/443 are open |
| PayHere not calling back | Ensure `notify_url` is publicly accessible HTTPS |

## SEO Engine (sitemap, robots, social previews)
- Configure everything in CRM → Settings → **SEO & Search**. Set **Canonical Domain URL** to `https://www.kreationhotels.com`.
- nginx (`nginx/website.conf`) sends page requests to the website backend, which injects title / meta / Open Graph / Twitter / JSON-LD into `index.html` so Facebook, WhatsApp and LinkedIn previews work. Static assets still come from `website-frontend`; if the backend is down nginx falls back to the plain SPA.
- `https://www.kreationhotels.com/sitemap.xml` and `/robots.txt` are generated live from the CRM settings. Submit the sitemap in Google Search Console.
- Uploaded share images are stored in the `uploads` docker volume (shared by crm-backend and website-backend) and served at `/api/public/seo/media/...`.
