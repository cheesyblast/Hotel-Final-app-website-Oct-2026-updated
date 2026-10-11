"""Regression tests for the future-bookings availability bug.
Verifies:
 - GET /api/public/availability with future dates returns rooms (previously crashed/empty)
 - POST /api/public/booking/hold creates a hold for future dates
 - A confirmed CRM booking stored as YYYY-MM-DD string excludes the room from availability
 - A held room is excluded from availability
 - requirements.txt pins pymongo==4.8.0 and has no wheelhouse/emergent_plugins refs
 - /refund-policy, /privacy-policy, /terms, /, /website all load from the frontend
 - CRM /dashboard still accepts admin/admin123
"""
import os
import re
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to frontend .env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

def _read_env(key):
    for line in open("/app/backend/.env"):
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None

MONGO_URL = os.environ.get("MONGO_URL") or _read_env("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME") or _read_env("DB_NAME")

mongo = MongoClient(MONGO_URL)
db = mongo[DB_NAME]

FUTURE_CI = "2026-12-20"
FUTURE_CO = "2026-12-22"


@pytest.fixture
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- requirements.txt sanity ----------
def test_requirements_pymongo_pinned():
    content = open("/app/backend/requirements.txt").read()
    assert re.search(r"^pymongo==4\.8\.0\s*$", content, re.M), "pymongo must be pinned to 4.8.0"


def test_requirements_no_wheelhouse_or_emergent_plugins():
    content = open("/app/backend/requirements.txt").read().lower()
    assert "wheelhouse" not in content
    assert "emergent_plugins" not in content
    assert "emergent-plugins" not in content


# ---------- The bug: future availability ----------
def test_future_availability_returns_rooms(api):
    r = api.get(f"{BASE_URL}/api/public/availability",
                params={"check_in": FUTURE_CI, "check_out": FUTURE_CO})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["check_in"] == FUTURE_CI
    assert data["check_out"] == FUTURE_CO
    assert data["nights"] == 2
    types = data["available_room_types"]
    assert len(types) >= 1, "Expected at least one available room type for future dates"
    # Should have a Double room type with available_count > 0
    double = next((t for t in types if t["room_type"] == "Double"), None)
    assert double is not None, f"Expected Double type, got {types}"
    assert double["available_count"] >= 1
    assert double["total_price"] == double["price_per_night"] * 2


def test_future_availability_handles_bad_dates(api):
    r = api.get(f"{BASE_URL}/api/public/availability",
                params={"check_in": FUTURE_CO, "check_out": FUTURE_CI})
    assert r.status_code in (400, 422)


# ---------- Hold creation ----------
def test_booking_hold_future_dates(api):
    payload = {
        "room_type": "Double",
        "check_in": FUTURE_CI,
        "check_out": FUTURE_CO,
        "guest_name": "TEST_FutureGuest",
        "guest_email": "test_future@example.com",
        "guest_phone": "0771234567",
        "country": "Sri Lanka",
        "num_guests": 2,
        "special_requests": "",
        "payment_option": "advance",
    }
    r = api.post(f"{BASE_URL}/api/public/booking/hold", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["room_type"] == "Double"
    assert data["nights"] == 2
    assert data["payment_option"] == "advance"
    # 30% advance
    assert abs(data["payment_amount"] - round(data["total_amount"] * 0.30, 2)) < 0.01
    assert "payhere" in data
    assert data["payhere"]["currency"] == "LKR"
    # Cleanup
    db.booking_holds.delete_one({"id": data["hold_id"]})


# ---------- Overlap exclusion with string-dated CRM booking ----------
def test_crm_string_date_booking_excludes_room(api):
    """Insert a CRM-style booking (dates stored as YYYY-MM-DD strings) and verify
    the room is excluded from availability. This is the exact scenario the bug fix addresses."""
    # First find a room number
    rooms = list(db.rooms.find({"room_type": "Double"}, {"_id": 0, "room_number": 1}).limit(20))
    assert len(rooms) >= 1
    room_number = rooms[0]["room_number"]

    booking_id = f"TEST_{uuid.uuid4().hex[:8]}"
    # Dates overlapping FUTURE_CI..FUTURE_CO
    db.bookings.insert_one({
        "id": booking_id,
        "guest_name": "TEST_StringDateGuest",
        "room_number": room_number,
        "room_type": "Double",
        "check_in_date": FUTURE_CI,   # STRING
        "check_out_date": FUTURE_CO,  # STRING
        "status": "Confirmed",
        "booking_source": "CRM",
        "created_at": datetime.now(timezone.utc),
    })

    try:
        r = api.get(f"{BASE_URL}/api/public/availability",
                    params={"check_in": FUTURE_CI, "check_out": FUTURE_CO})
        assert r.status_code == 200, r.text
        data = r.json()
        double = next((t for t in data["available_room_types"] if t["room_type"] == "Double"), None)
        if double:
            assert room_number not in double["available_rooms"], \
                f"Room {room_number} with string-date CRM booking must be excluded"

        # Also verify a non-overlapping date still returns the room
        r2 = api.get(f"{BASE_URL}/api/public/availability",
                     params={"check_in": "2027-02-10", "check_out": "2027-02-12"})
        assert r2.status_code == 200
        data2 = r2.json()
        double2 = next((t for t in data2["available_room_types"] if t["room_type"] == "Double"), None)
        assert double2 is not None
        assert room_number in double2["available_rooms"], "Non-overlapping dates should include the room"
    finally:
        db.bookings.delete_one({"id": booking_id})


# ---------- Overlap exclusion with held room ----------
def test_held_room_excluded(api):
    # Create a hold directly
    hold_id = str(uuid.uuid4())
    rooms = list(db.rooms.find({"room_type": "Double"}, {"_id": 0, "room_number": 1}).limit(20))
    room_number = rooms[0]["room_number"]
    now = datetime.now(timezone.utc)
    db.booking_holds.insert_one({
        "id": hold_id,
        "order_id": f"TEST-{hold_id[:8]}",
        "room_number": room_number,
        "room_type": "Double",
        "check_in": datetime(2027, 3, 10),
        "check_out": datetime(2027, 3, 12),
        "status": "held",
        "created_at": now,
        "expires_at": now + timedelta(minutes=5),
    })
    try:
        r = api.get(f"{BASE_URL}/api/public/availability",
                    params={"check_in": "2027-03-10", "check_out": "2027-03-12"})
        assert r.status_code == 200
        data = r.json()
        double = next((t for t in data["available_room_types"] if t["room_type"] == "Double"), None)
        if double:
            assert room_number not in double["available_rooms"]
    finally:
        db.booking_holds.delete_one({"id": hold_id})


# ---------- Frontend routing ----------
def test_frontend_root_loads(api):
    r = api.get(BASE_URL + "/")
    assert r.status_code == 200
    assert "<div id=\"root\"" in r.text or "<div id='root'" in r.text


@pytest.mark.parametrize("path", ["/refund-policy", "/privacy-policy", "/terms", "/website"])
def test_policy_pages_load(api, path):
    r = api.get(BASE_URL + path)
    assert r.status_code == 200


# ---------- CRM login ----------
def test_crm_admin_login(api):
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert "access_token" in data or "token" in data
