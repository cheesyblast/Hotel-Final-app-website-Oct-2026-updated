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
