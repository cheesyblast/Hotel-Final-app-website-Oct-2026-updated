# Hotel Management System - PRD

## Original Problem Statement
Full-stack hotel management system (CRM) + Public hotel website with online booking engine. CRM for internal management, Website for guest-facing reservations. Both share the same database but are architecturally separate.

## Architecture
- **Backend**: FastAPI (server.py ~8.1k lines + public_routes.py for website APIs)
- **Frontend**: React (App.js CRM ~15k lines + Website.js public site ~700 lines)
- **Database**: MongoDB (shared between CRM and Website)
- **Auth**: JWT-based for CRM; Public APIs for website (no auth)
- **Routing**: `/website` → Public hotel website, `/dashboard` → CRM (auth required)

## What's Been Implemented

### CRM Features (Complete)
- Authentication, Dashboard, Room/Booking/Guest Management
- Restaurant POS, Stock Management, Payroll
- Income/Expense tracking with dynamic categories, vendor management
- Calendar view, Financial reports (daily/monthly), Role-based access
- Channel management, PDF ID proof uploads, 5-min room hold mechanism

### Public Hotel Website (NEW - Oct 2026)
1. **One-Page Design**: Hero slider, Rooms, Booking Engine, Amenities, Gallery, About, Contact, Footer
2. **Real-Time Booking Engine**: Checks CRM room availability → Guest details → PayHere payment
3. **5-Minute Room Hold**: Concurrent booking protection with countdown timer
4. **PayHere Payment Gateway**: Sandbox mode integrated, hash generation, server notification webhook
5. **Payment Options**: Full payment (100%) or Advance (30% minimum)
6. **Cloudflare Turnstile**: Bot protection on contact form (Site Key configured)
7. **SMS/Email Confirmations**: Uses CRM settings (notify.lk + Brevo) on booking confirmation
8. **Idempotency Guard**: PayHere notification handler prevents duplicate bookings on retries

## Key Public API Endpoints
- `GET /api/public/hotel-info` - Hotel details for website
- `GET /api/public/rooms` - Room types grouped with prices
- `GET /api/public/availability?check_in=&check_out=` - Real-time availability
- `POST /api/public/booking/hold` - Hold room for 5 minutes
- `GET /api/public/booking/status/{order_id}` - Check hold/booking status
- `POST /api/public/payhere/notify` - PayHere payment callback
- `POST /api/public/contact` - Contact form (Turnstile-verified)

## Environment Variables
### Backend (.env)
- PAYHERE_MERCHANT_ID, PAYHERE_MERCHANT_SECRET (sandbox placeholders)
- PAYHERE_BASE_URL (https://sandbox.payhere.lk)
- TURNSTILE_SECRET_KEY

### Frontend (.env)
- REACT_APP_TURNSTILE_SITE_KEY
- REACT_APP_PAYHERE_BASE_URL

## Credentials
- CRM Admin: admin / admin123

## Pending/Upcoming Tasks
- P0: Configure real PayHere merchant ID and secret (user in process)
- P1: Channel Manager real-time sync
- P2: Guest feedback system
- P2: Notification logs viewer
- P2: Guest checkout receipt PDF
- P3: Refactor monolithic App.js and server.py

## 2026-06 Fork Update
- Fixed CRM Settings: Taxes & Levies block was nested inside the Communication wrapper (rendered blank); moved out. Payroll Settings card was rendering on every Settings tab; now scoped under Taxes & Levies tab. Verified via screenshot across all 7 tabs.
- Awaiting user verification of last batch (multi-room booking, Email/SMS settings, PayHere DB keys, settings reorg).

## 2026-06 — Guest Feedback, A4 Receipt, Dashboard fixes
- Guest Feedback: auto email+SMS request after checkout/early-checkout (`send_feedback_request`, collection `feedback_requests`, token link `${PUBLIC_WEBSITE_URL}/feedback/<token>`). Public page `FeedbackPage.js` (overall 1–5 required + cleanliness/staff/food/comfort optional + comment). Public API `/api/public/feedback/{token}` GET/POST. CRM page `/guest-feedback` (`GuestFeedback.js`, nav "Feedback", permission id `feedback`) with averages, distribution, filters. API `GET /api/feedback`.
- A4 Check-out Receipt: `receipt.js` printReceipt(); APIs `/api/receipts/customer/{id}`, `/api/receipts/booking/{id}`; header from Hotel Settings. Replaces old Print Invoice after checkout + early checkout; "Print Receipt" in Bookings table and Guest Details booking history.
- Dashboard: Upcoming Bookings search; action menus now position:fixed (no clipping), exclusive, close on scroll.
- New env: PUBLIC_WEBSITE_URL (backend .env, docker-compose crm-backend, .env.example). Added lucide-react 0.460.0.
- Tested: iteration_19 (backend 20/20, frontend all flows pass).

## Backlog
- P1 Channel Manager real-time sync (Booking.com) — currently UI placeholder (MOCKED)
- P1 Refactor App.js (>15k lines) / server.py (>8k lines)
- P2 Notification logs viewer; manual "resend feedback request" button; Activity Logs card dark-theme styling

## 2026-06 — Domain isolation + dynamic PayHere URL
- App.js: `resolveSiteMode()` → `app.*` = CRM only; real domains (kreationhotels.com/www) = PublicSite only (/, /refund-policy, /privacy-policy, /terms, /feedback/:token, `*` → `<Navigate replace to="/"/>`; never CRM/setup). Preview hosts (*.preview.emergentagent.com, *.emergentagent.com, *.emergent.host, localhost) default CRM; `?site=website` / `?site=crm` switches (localStorage `preview_site_mode`), floating "Preview: switch to …" pill.
- PayHere: `/api/public/booking/hold` returns `payhere.checkout_url` from DB payhere_mode (live/production → https://www.payhere.lk/pay/checkout, sandbox/testing → https://sandbox.payhere.lk/pay/checkout; unset → env PAYHERE_BASE_URL); Website.js falls back to REACT_APP_PAYHERE_BASE_URL only if checkout_url missing.
- Fixed PayHere return/cancel URLs (were /website?booking=… which lost the query on redirect) → now /?booking=…, booking modal auto-opens on return.

## 2026-06 — SEO & Structured Data Engine
- CRM Settings → "SEO & Search" tab (`SeoSettings.js`): global meta (title format placeholders, description counter 150–160, keyword chips, canonical, robots toggles), OG/Twitter (image upload to disk → `/api/public/seo/media/<hex>.<ext>`), Schema.org Hotel fields + amenities, per-page overrides (/, /rooms, /gallery, /about, /contact, /terms). Mongo `seo_settings` single doc.
- APIs: admin `GET/PUT /api/seo/settings`, `POST /api/seo/upload-image`; public `/api/public/seo/meta?path=`, `/sitemap.xml`, `/robots.txt`, `/render?path=` (SSR preview), `/media/{name}`. Logic in `backend/seo_routes.py` (shared by CRM server and website backend).
- Public site: react-helmet-async 3.0.0 (React 19 native hoisting) via `SeoHead.js`; JSON-LD `#seo-jsonld`. New routes /rooms /gallery /about /contact scroll to sections.
- Production: website backend root router serves /sitemap.xml, /robots.txt and SSR-injected page HTML (nginx website.conf updated); shared `uploads` volume; env UPLOAD_DIR, WEBSITE_INDEX_URL. extract.sh rewritten to copy the full frontend for both CRM and website builds (old version was broken).
- Tested: iteration_20 (backend 16/16; frontend ~95% → minor issues fixed after).

## 2026-06 — SEO v2 + Analytics
- seo_settings.pages is now a list [{path,label,title,description}] (legacy dict auto-migrated); Home pinned; add/delete custom pages; public routes, nav/footer, sitemap and SSR all driven by `/api/public/seo/site-config`. Custom pages render home + scroll to same-id section; deleted → redirect /.
- Canonical: empty or emergentagent.com-on-live → request host / ?origin=window.location.origin. og/twitter image always absolute.
- Analytics inside SEO tab: ga4_id, gtm_id, pixel_id, head_code, body_code (validated). Public site only: SSR injection (marker meta[data-seo-tracking]) or client injection (`tracking.js`). Purchase event (GA4 + dataLayer + fbq Purchase, LKR, value = PayHere paid_amount) fires only for confirmed orders, deduped per order.
- Tested: iteration_21 (backend 28/28, frontend pass; purchase-on-unconfirmed bug fixed after).

## 2026-06 — Self-contained Docker builds
- New: deployment/Dockerfile.{crm-backend,crm-frontend,website-backend,website-frontend} (context = project root), /app/.dockerignore, deployment/website/nginx.conf.template (exact-match /sitemap.xml & /robots.txt + /api/ proxied to website-backend before SPA fallback; runtime resolver), deployment/crm/nginx.conf (noindex). Old combined crm/website Dockerfiles removed. compose builds from `..`; website-frontend exposed on 127.0.0.1:8080.
- Website backend requirements pinned to CRM versions (fastapi 0.110.1, starlette 0.37.2, pydantic 2.11.7/core 2.33.2, httpx 0.28.1, motor 3.3.1, pymongo 4.8.0…); Dockerfile import-checks `main` at build.
- extract.sh = optional packager (backend/frontend/deployment + .dockerignore, verifies COPY sources). setup.sh + DEPLOYMENT_GUIDE updated.
- Verified locally (no docker): website-backend from pinned venv + real `yarn build` + rendered nginx template → /sitemap.xml 200 application/xml, /robots.txt 200 text/plain, /api/* proxied, SPA routes 200.

## 2026-06 — Real payment status + SEO buttons
- Website BookingModal: PayHere return → "Confirming your payment…" (poll /public/booking/status every 3s × 20) → Confirmed (ref/room/dates/paid, fires purchase) | Failed (reason: cancelled/failed/chargedback/expired/not_found; "Try payment again" reopens details step prefilled from sessionStorage kh_pending_booking) | Pending ("still waiting for PayHere…" + Check again). Hotel phone fallback +94 112 301737.
- Backend: notify status 0 → payment_pending (hold kept, blocks room, never auto-expired); -1/-2/-3 → payment_failed + failure_reason; POST /public/booking/release/{order} on cancel; expired holds now marked "expired" (not deleted) so late confirmations still create bookings (flag confirmed_after_expiry).
- SEO tab: sitemap/robots buttons → {saved canonical}/sitemap.xml|robots.txt, hidden until canonical saved; removed preview-domain hint text.
- Tested: iteration_22 (frontend 100%, backend 14/15 → hold-deletion bug fixed & verified after).
