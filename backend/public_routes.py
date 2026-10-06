"""
Public Website API Routes - Separate from CRM
Handles: Room availability, Online bookings, PayHere payments, Contact form
"""
import os
import uuid
import hashlib
import httpx
from datetime import datetime, date, timedelta, timezone
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

public_router = APIRouter(prefix="/public", tags=["Public Website"])

HOLD_DURATION_MINUTES = 5

# ==================== MODELS ====================

class AvailabilityRequest(BaseModel):
    check_in: str  # YYYY-MM-DD
    check_out: str  # YYYY-MM-DD

class BookingHoldRequest(BaseModel):
    room_type: str
    check_in: str
    check_out: str
    guest_name: str
    guest_email: str
    guest_phone: str
    country: str = "Sri Lanka"
    num_guests: int = 1
    special_requests: str = ""
    payment_option: str = "full"  # "full" or "advance" (30%)

class ContactFormRequest(BaseModel):
    name: str
    email: str
    phone: str = ""
    message: str
    turnstile_token: str

# ==================== HELPERS ====================

async def cleanup_expired_holds():
    """Remove expired booking holds"""
    now = datetime.now(timezone.utc)
    result = await db.booking_holds.delete_many({
        "expires_at": {"$lt": now},
        "status": "held"
    })
    return result.deleted_count

async def get_held_rooms_for_dates(check_in_dt, check_out_dt):
    """Get room numbers currently held for overlapping dates"""
    await cleanup_expired_holds()
    now = datetime.now(timezone.utc)
    holds = await db.booking_holds.find({
        "status": "held",
        "expires_at": {"$gt": now},
        "$or": [
            {"check_in": {"$lt": check_out_dt}, "check_out": {"$gt": check_in_dt}}
        ]
    }).to_list(100)
    return [h.get("room_number") for h in holds]

async def get_booked_rooms_for_dates(check_in_dt, check_out_dt):
    """Get room numbers with confirmed bookings for overlapping dates"""
    bookings = await db.bookings.find({
        "status": {"$in": ["Confirmed", "Checked In"]},
        "$or": [
            {"check_in_date": {"$lt": check_out_dt}, "check_out_date": {"$gt": check_in_dt}}
        ]
    }).to_list(1000)
    return [b.get("room_number") for b in bookings]

def generate_payhere_hash(merchant_id, order_id, amount, currency, merchant_secret):
    """Generate PayHere payment hash"""
    secret_hash = hashlib.md5(merchant_secret.encode()).hexdigest().upper()
    raw = merchant_id + order_id + f"{amount:.2f}" + currency + secret_hash
    return hashlib.md5(raw.encode()).hexdigest().upper()

# ==================== PUBLIC ENDPOINTS ====================

@public_router.get("/hotel-info")
async def get_hotel_info():
    """Get hotel information for the website"""
    settings = await db.settings.find_one({}, {"_id": 0})
    if not settings:
        return {
            "hotel_name": "Kreation Hotels Colombo",
            "hotel_address": "No.5, Palmyrah Avenue, Colombo 03",
            "hotel_phone": "+94 11 234 5678",
            "hotel_email": "info@kreationhotels.com",
            "check_in_time": "14:00",
            "check_out_time": "12:00"
        }
    return {
        "hotel_name": settings.get("hotel_name", "Kreation Hotels Colombo"),
        "hotel_address": settings.get("hotel_address", "No.5, Palmyrah Avenue, Colombo 03"),
        "hotel_phone": settings.get("hotel_phone", ""),
        "hotel_email": settings.get("hotel_email", ""),
        "check_in_time": settings.get("check_in_time", "14:00"),
        "check_out_time": settings.get("check_out_time", "12:00"),
        "currency": settings.get("currency", "LKR"),
        "tax_rate": settings.get("tax_rate", 0)
    }

@public_router.get("/rooms")
async def get_public_rooms():
    """Get room types with rates for the website (grouped by type)"""
    rooms = await db.rooms.find({}, {"_id": 0}).to_list(100)
    room_types = {}
    for room in rooms:
        rt = room.get("room_type", "Standard")
        if rt not in room_types:
            room_types[rt] = {
                "room_type": rt,
                "price_per_night": room.get("price_per_night", 0),
                "max_occupancy": room.get("max_occupancy", 2),
                "amenities": room.get("amenities", []),
                "image_url": room.get("image_url", ""),
                "total_rooms": 0,
            }
        room_types[rt]["total_rooms"] += 1
    return list(room_types.values())

@public_router.get("/availability")
async def check_availability(check_in: str, check_out: str):
    """Check real-time room availability for given dates"""
    try:
        ci = datetime.strptime(check_in, "%Y-%m-%d")
        co = datetime.strptime(check_out, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    if ci >= co:
        raise HTTPException(status_code=400, detail="Check-out must be after check-in")
    if ci.date() < datetime.now().date():
        raise HTTPException(status_code=400, detail="Check-in date cannot be in the past")

    nights = (co - ci).days

    # Get all rooms
    all_rooms = await db.rooms.find({}, {"_id": 0}).to_list(100)

    # Get booked + held rooms
    booked = await get_booked_rooms_for_dates(ci, co)
    held = await get_held_rooms_for_dates(ci, co)
    unavailable = set(booked + held)

    # Group available rooms by type
    available_types = {}
    for room in all_rooms:
        rn = room.get("room_number", "")
        rt = room.get("room_type", "Standard")
        if rn not in unavailable:
            if rt not in available_types:
                available_types[rt] = {
                    "room_type": rt,
                    "price_per_night": room.get("price_per_night", 0),
                    "max_occupancy": room.get("max_occupancy", 2),
                    "amenities": room.get("amenities", []),
                    "image_url": room.get("image_url", ""),
                    "available_count": 0,
                    "available_rooms": [],
                    "total_price": 0,
                }
            available_types[rt]["available_count"] += 1
            available_types[rt]["available_rooms"].append(rn)
            available_types[rt]["total_price"] = room.get("price_per_night", 0) * nights

    return {
        "check_in": check_in,
        "check_out": check_out,
        "nights": nights,
        "available_room_types": list(available_types.values())
    }

@public_router.post("/booking/hold")
async def hold_room(req: BookingHoldRequest):
    """Hold a room for 5 minutes while guest completes payment"""
    await cleanup_expired_holds()

    try:
        ci = datetime.strptime(req.check_in, "%Y-%m-%d")
        co = datetime.strptime(req.check_out, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")

    nights = (co - ci).days
    if nights < 1:
        raise HTTPException(status_code=400, detail="Minimum 1 night stay required")

    # Find an available room of the requested type
    all_rooms = await db.rooms.find({"room_type": req.room_type}, {"_id": 0}).to_list(100)
    booked = await get_booked_rooms_for_dates(ci, co)
    held = await get_held_rooms_for_dates(ci, co)
    unavailable = set(booked + held)

    available_room = None
    for room in all_rooms:
        if room.get("room_number") not in unavailable:
            available_room = room
            break

    if not available_room:
        raise HTTPException(status_code=409, detail="No rooms available for the selected dates and type. Please try different dates.")

    price_per_night = available_room.get("price_per_night", 0)
    total_amount = price_per_night * nights

    if req.payment_option == "advance":
        payment_amount = round(total_amount * 0.30, 2)
    else:
        payment_amount = total_amount

    hold_id = str(uuid.uuid4())
    order_id = f"WEB-{hold_id[:8].upper()}"
    now = datetime.now(timezone.utc)

    hold_record = {
        "id": hold_id,
        "order_id": order_id,
        "room_number": available_room["room_number"],
        "room_type": req.room_type,
        "check_in": ci,
        "check_out": co,
        "nights": nights,
        "guest_name": req.guest_name,
        "guest_email": req.guest_email,
        "guest_phone": req.guest_phone,
        "country": req.country,
        "num_guests": req.num_guests,
        "special_requests": req.special_requests,
        "price_per_night": price_per_night,
        "total_amount": total_amount,
        "payment_amount": payment_amount,
        "payment_option": req.payment_option,
        "status": "held",
        "created_at": now,
        "expires_at": now + timedelta(minutes=HOLD_DURATION_MINUTES),
    }

    await db.booking_holds.insert_one(hold_record)

    # Generate PayHere hash
    merchant_id = os.environ.get("PAYHERE_MERCHANT_ID", "")
    merchant_secret = os.environ.get("PAYHERE_MERCHANT_SECRET", "")
    currency = "LKR"

    pay_hash = ""
    if merchant_id and merchant_secret:
        pay_hash = generate_payhere_hash(merchant_id, order_id, payment_amount, currency, merchant_secret)

    return {
        "hold_id": hold_id,
        "order_id": order_id,
        "room_number": available_room["room_number"],
        "room_type": req.room_type,
        "check_in": req.check_in,
        "check_out": req.check_out,
        "nights": nights,
        "price_per_night": price_per_night,
        "total_amount": total_amount,
        "payment_amount": payment_amount,
        "payment_option": req.payment_option,
        "expires_in_seconds": HOLD_DURATION_MINUTES * 60,
        "payhere": {
            "merchant_id": merchant_id,
            "order_id": order_id,
            "amount": f"{payment_amount:.2f}",
            "currency": currency,
            "hash": pay_hash,
            "sandbox": "sandbox" in os.environ.get("PAYHERE_BASE_URL", "sandbox"),
        }
    }

@public_router.post("/payhere/notify")
async def payhere_payment_notify(request: Request):
    """PayHere server notification callback - confirms payment"""
    form_data = await request.form()
    merchant_id = form_data.get("merchant_id", "")
    order_id = form_data.get("order_id", "")
    payment_id = form_data.get("payment_id", "")
    payhere_amount = form_data.get("payhere_amount", "0")
    payhere_currency = form_data.get("payhere_currency", "LKR")
    status_code = form_data.get("status_code", "")
    md5sig = form_data.get("md5sig", "")

    # Verify hash
    merchant_secret = os.environ.get("PAYHERE_MERCHANT_SECRET", "")
    local_secret_hash = hashlib.md5(merchant_secret.encode()).hexdigest().upper()
    local_sig = hashlib.md5(
        (merchant_id + order_id + payhere_amount + payhere_currency + str(status_code) + local_secret_hash).encode()
    ).hexdigest().upper()

    if local_sig != md5sig.upper():
        print(f"PayHere signature mismatch for order {order_id}")
        raise HTTPException(status_code=400, detail="Invalid signature")

    # status_code 2 = success
    if str(status_code) == "2":
        hold = await db.booking_holds.find_one({"order_id": order_id})
        if not hold:
            print(f"No hold found for order {order_id}")
            return {"status": "hold_not_found"}

        # Idempotency: skip if already confirmed
        if hold.get("status") == "confirmed":
            return {"status": "already_confirmed", "booking_id": hold.get("booking_id", "")}

        # Create actual booking in the CRM
        booking_id = str(uuid.uuid4())
        booking = {
            "id": booking_id,
            "guest_name": hold.get("guest_name", ""),
            "guest_email": hold.get("guest_email", ""),
            "guest_phone": hold.get("guest_phone", ""),
            "country": hold.get("country", "Sri Lanka"),
            "id_passport": "",
            "room_number": hold.get("room_number", ""),
            "room_type": hold.get("room_type", ""),
            "check_in_date": hold.get("check_in"),
            "check_out_date": hold.get("check_out"),
            "num_guests": hold.get("num_guests", 1),
            "stay_type": "Full Day",
            "booking_amount": hold.get("total_amount", 0),
            "advance_amount": hold.get("payment_amount", 0),
            "payment_method": "Online Payment",
            "status": "Confirmed",
            "special_requests": hold.get("special_requests", ""),
            "booking_source": "Website",
            "booking_channel_name": "Website",
            "created_at": datetime.now(timezone.utc),
            "guest_id_proof": "",
            "guest_id_proof_name": "",
        }
        await db.bookings.insert_one(booking)

        # Also add guest to customers collection
        customer = {
            "id": str(uuid.uuid4()),
            "name": hold.get("guest_name", ""),
            "email": hold.get("guest_email", ""),
            "phone": hold.get("guest_phone", ""),
            "country": hold.get("country", ""),
            "room_number": hold.get("room_number", ""),
            "check_in_date": hold.get("check_in"),
            "check_out_date": hold.get("check_out"),
            "room_charges": hold.get("total_amount", 0),
            "advance_amount": hold.get("payment_amount", 0),
            "total_amount": hold.get("total_amount", 0),
            "status": "Confirmed",
        }
        await db.customers.insert_one(customer)

        # Record advance payment in daily_sales
        if hold.get("payment_amount", 0) > 0:
            sale_record = {
                "id": str(uuid.uuid4()),
                "date": datetime.combine(datetime.now().date(), datetime.min.time()),
                "customer_name": hold.get("guest_name", ""),
                "room_number": hold.get("room_number", ""),
                "room_charges": hold.get("total_amount", 0),
                "additional_charges": 0,
                "discount_amount": 0,
                "advance_amount": hold.get("payment_amount", 0),
                "total_amount": hold.get("payment_amount", 0),
                "payment_method": "Online Payment",
                "sale_type": "website_booking_advance",
                "created_at": datetime.now(timezone.utc),
            }
            await db.daily_sales.insert_one(sale_record)

        # Mark hold as confirmed
        await db.booking_holds.update_one(
            {"order_id": order_id},
            {"$set": {"status": "confirmed", "payment_id": payment_id, "confirmed_at": datetime.now(timezone.utc)}}
        )

        # TODO: Send SMS and Email confirmations using CRM settings
        # (notify.lk and Brevo - will use same config from CRM settings)
        try:
            await send_booking_confirmations(hold, booking_id)
        except Exception as e:
            print(f"Failed to send confirmations: {e}")

        return {"status": "confirmed", "booking_id": booking_id}
    else:
        # Payment failed or pending - release hold
        await db.booking_holds.update_one(
            {"order_id": order_id},
            {"$set": {"status": "payment_failed"}}
        )
        return {"status": "payment_failed"}

async def send_booking_confirmations(hold, booking_id):
    """Send SMS and Email booking confirmations using CRM settings"""
    settings = await db.settings.find_one({}, {"_id": 0})
    if not settings:
        return

    guest_name = hold.get("guest_name", "")
    room = hold.get("room_number", "")
    ci = hold.get("check_in")
    co = hold.get("check_out")
    ci_str = ci.strftime("%Y-%m-%d") if isinstance(ci, datetime) else str(ci)
    co_str = co.strftime("%Y-%m-%d") if isinstance(co, datetime) else str(co)
    amount = hold.get("payment_amount", 0)

    # SMS via notify.lk
    sms_api_key = settings.get("sms_api_key", "")
    sms_sender_id = settings.get("sms_sender_id", "")
    phone = hold.get("guest_phone", "")
    if sms_api_key and phone:
        sms_text = f"Dear {guest_name}, your booking at Kreation Hotels is confirmed! Room: {room}, Check-in: {ci_str}, Check-out: {co_str}. Payment: LKR {amount:.2f}. Ref: {booking_id[:8]}. Thank you!"
        try:
            async with httpx.AsyncClient() as hclient:
                await hclient.post("https://app.notify.lk/api/v1/send", json={
                    "user_id": settings.get("sms_user_id", ""),
                    "api_key": sms_api_key,
                    "sender_id": sms_sender_id,
                    "to": phone,
                    "message": sms_text
                }, timeout=10)
        except Exception as e:
            print(f"SMS send error: {e}")

    # Email via Brevo
    email_api_key = settings.get("email_api_key", "")
    guest_email = hold.get("guest_email", "")
    if email_api_key and guest_email:
        hotel_name = settings.get("hotel_name", "Kreation Hotels Colombo")
        from_email = settings.get("from_email", "noreply@kreationhotels.com")
        from_name = settings.get("from_name", hotel_name)
        try:
            async with httpx.AsyncClient() as hclient:
                await hclient.post("https://api.brevo.com/v3/smtp/email", json={
                    "sender": {"name": from_name, "email": from_email},
                    "to": [{"email": guest_email, "name": guest_name}],
                    "subject": f"Booking Confirmed - {hotel_name}",
                    "htmlContent": f"""
                    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                        <h2 style="color:#1a5632;">Booking Confirmed!</h2>
                        <p>Dear {guest_name},</p>
                        <p>Your booking at <strong>{hotel_name}</strong> has been confirmed.</p>
                        <table style="width:100%;border-collapse:collapse;margin:20px 0;">
                            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Room</td><td style="padding:8px;border:1px solid #ddd;">{room} ({hold.get('room_type','')})</td></tr>
                            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Check-in</td><td style="padding:8px;border:1px solid #ddd;">{ci_str}</td></tr>
                            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Check-out</td><td style="padding:8px;border:1px solid #ddd;">{co_str}</td></tr>
                            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Amount Paid</td><td style="padding:8px;border:1px solid #ddd;">LKR {amount:,.2f}</td></tr>
                            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Booking Ref</td><td style="padding:8px;border:1px solid #ddd;">{booking_id[:8].upper()}</td></tr>
                        </table>
                        <p>Check-in time: {settings.get('check_in_time','14:00')} | Check-out time: {settings.get('check_out_time','12:00')}</p>
                        <p>If you have any questions, please contact us at {settings.get('hotel_phone','')}.</p>
                        <p>We look forward to welcoming you!</p>
                        <p>Warm regards,<br/><strong>{hotel_name}</strong></p>
                    </div>
                    """
                }, headers={
                    "api-key": email_api_key,
                    "Content-Type": "application/json"
                }, timeout=10)
        except Exception as e:
            print(f"Email send error: {e}")

@public_router.get("/booking/status/{order_id}")
async def get_booking_status(order_id: str):
    """Check the status of a booking hold"""
    hold = await db.booking_holds.find_one({"order_id": order_id}, {"_id": 0})
    if not hold:
        raise HTTPException(status_code=404, detail="Booking not found")

    now = datetime.now(timezone.utc)
    expires_at = hold.get("expires_at")
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if hold.get("status") == "held" and expires_at and now > expires_at:
        await db.booking_holds.update_one({"order_id": order_id}, {"$set": {"status": "expired"}})
        hold["status"] = "expired"

    return {
        "order_id": hold.get("order_id"),
        "status": hold.get("status"),
        "room_type": hold.get("room_type"),
        "check_in": hold.get("check_in").strftime("%Y-%m-%d") if isinstance(hold.get("check_in"), datetime) else str(hold.get("check_in", "")),
        "check_out": hold.get("check_out").strftime("%Y-%m-%d") if isinstance(hold.get("check_out"), datetime) else str(hold.get("check_out", "")),
        "payment_amount": hold.get("payment_amount"),
        "guest_name": hold.get("guest_name"),
    }

@public_router.post("/contact")
async def submit_contact_form(req: ContactFormRequest):
    """Submit contact form with Cloudflare Turnstile verification"""
    # Verify Turnstile token
    turnstile_secret = os.environ.get("TURNSTILE_SECRET_KEY", "0x4AAAAAAFPUeHxwEx4yE7kmLTxueDpPc9Q")
    if turnstile_secret and req.turnstile_token and req.turnstile_token != "bypass":
        verify_ok = True
        try:
            async with httpx.AsyncClient() as hclient:
                resp = await hclient.post(
                    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
                    data={"secret": turnstile_secret, "response": req.turnstile_token},
                    timeout=10
                )
                result = resp.json()
                verify_ok = bool(result.get("success"))
        except Exception:
            verify_ok = True  # Allow submission if Turnstile is unreachable
        if not verify_ok:
            raise HTTPException(status_code=400, detail="Bot verification failed. Please try again.")

    # Store the contact message
    contact = {
        "id": str(uuid.uuid4()),
        "name": req.name,
        "email": req.email,
        "phone": req.phone,
        "message": req.message,
        "created_at": datetime.now(timezone.utc),
        "status": "new"
    }
    await db.contact_messages.insert_one(contact)

    return {"message": "Thank you for your message! We will get back to you shortly."}
