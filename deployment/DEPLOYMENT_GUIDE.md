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
# 1. Clone or copy the deployment folder to your server
scp -r deployment/ user@your-server:/srv/kreation/

# 2. SSH into server
ssh user@your-server
cd /srv/kreation

# 3. Copy environment file and fill in your values
cp .env.example .env
nano .env   # <-- EDIT ALL VALUES

# 4. Copy your CRM and Website code
#    (see "PROJECT STRUCTURE" below)

# 5. Build and start everything
docker compose up -d --build

# 6. Install SSL certificates
docker compose exec nginx certbot --nginx \
  -d app.kreationhotels.com \
  -d www.kreationhotels.com \
  --non-interactive --agree-tos -m your@email.com

# 7. Verify
curl https://www.kreationhotels.com        # Website
curl https://app.kreationhotels.com        # CRM login
```

## PROJECT STRUCTURE

```
/srv/kreation/
├── docker-compose.yml
├── .env
├── crm/
│   ├── backend/
│   │   ├── server.py              ← from /app/backend/server.py
│   │   ├── public_routes.py       ← from /app/backend/public_routes.py  (CRM keeps this for internal use)
│   │   ├── requirements.txt       ← from /app/backend/requirements.txt
│   │   └── .env                   ← generated from docker env
│   ├── frontend/
│   │   ├── src/App.js             ← from /app/frontend/src/App.js
│   │   ├── package.json           ← from /app/frontend/package.json
│   │   └── ...                    ← full React project
│   └── Dockerfile
├── website/
│   ├── backend/
│   │   ├── main.py                ← standalone website API server
│   │   ├── public_routes.py       ← from /app/backend/public_routes.py
│   │   └── requirements.txt
│   ├── frontend/
│   │   ├── src/
│   │   │   ├── Website.js         ← from /app/frontend/src/Website.js
│   │   │   ├── App.js             ← thin wrapper that renders Website
│   │   │   └── index.js
│   │   ├── package.json
│   │   └── ...
│   └── Dockerfile
├── nginx/
│   ├── crm.conf
│   └── website.conf
└── mongo/
    └── data/                      ← persistent MongoDB storage
```

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
