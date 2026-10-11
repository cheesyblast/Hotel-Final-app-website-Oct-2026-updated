"""Regression tests for /api/rooms/availability/check (CRM) + public site basics.

Covers the string-vs-datetime bug that previously caused future-date availability
checks to fail when existing bookings stored check_in_date as YYYY-MM-DD strings.
"""
import os
import uuid
import requests
import pytest
from pymongo import MongoClient
from datetime import datetime, timezone

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

FUTURE_CI = "2026-12-20"
FUTURE_CO = "2026-12-22"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": "admin", "password": "admin123"}, timeout=20)
    assert r.status_code == 200, r.text
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def db():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


# -------- CRM availability check --------

def test_crm_availability_future_dates_returns_rooms(auth_headers):
    r = requests.get(
        f"{BASE_URL}/api/rooms/availability/check",
        params={"check_in_date": FUTURE_CI, "check_out_date": FUTURE_CO},
        headers=auth_headers, timeout=20,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["check_in_date"] == FUTURE_CI
    assert data["check_out_date"] == FUTURE_CO
    assert data["stay_duration"] == 2
    assert data["total_rooms"] >= 1
    assert data["available_rooms"] >= 1
    assert isinstance(data["rooms"], list)
    assert len(data["rooms"]) == data["available_rooms"]
    # Ensure no _id leaked
    for room in data["rooms"]:
        assert "_id" not in room
        assert "room_number" in room


def test_crm_availability_invalid_dates(auth_headers):
    r = requests.get(
        f"{BASE_URL}/api/rooms/availability/check",
        params={"check_in_date": FUTURE_CO, "check_out_date": FUTURE_CI},
        headers=auth_headers, timeout=20,
    )
    assert r.status_code == 400


def test_crm_availability_bad_format(auth_headers):
    r = requests.get(
        f"{BASE_URL}/api/rooms/availability/check",
        params={"check_in_date": "not-a-date", "check_out_date": FUTURE_CO},
        headers=auth_headers, timeout=20,
    )
    assert r.status_code == 400


def test_crm_availability_excludes_string_date_booking(auth_headers, db):
    """Insert a CRM-style booking w/ STRING check_in_date overlapping future dates.
    Confirm the targeted room is excluded from the CRM availability response.
    """
    # Pick an available room first
    r = requests.get(
        f"{BASE_URL}/api/rooms/availability/check",
        params={"check_in_date": FUTURE_CI, "check_out_date": FUTURE_CO},
        headers=auth_headers, timeout=20,
    )
    assert r.status_code == 200
    rooms = r.json()["rooms"]
    assert rooms, "need at least one available room to run this test"
    target_room = rooms[0]["room_number"]
    before_count = r.json()["available_rooms"]

    booking_id = f"TEST_{uuid.uuid4().hex[:8]}"
    doc = {
        "id": booking_id,
        "booking_reference": booking_id,
        "guest_name": "TEST_string_dates",
        "room_number": target_room,
        "check_in_date": FUTURE_CI,          # STRING on purpose
        "check_out_date": FUTURE_CO,          # STRING on purpose
        "status": "Confirmed",
        "stay_type": "Night Stay",
        "created_at": datetime.now(timezone.utc),
    }
    db.bookings.insert_one(doc)
    try:
        r2 = requests.get(
            f"{BASE_URL}/api/rooms/availability/check",
            params={"check_in_date": FUTURE_CI, "check_out_date": FUTURE_CO},
            headers=auth_headers, timeout=20,
        )
        assert r2.status_code == 200
        after_rooms = {room["room_number"] for room in r2.json()["rooms"]}
        assert target_room not in after_rooms, "string-date booking must exclude room"
        assert r2.json()["available_rooms"] == before_count - 1

        # Non-overlapping range should still include the room
        r3 = requests.get(
            f"{BASE_URL}/api/rooms/availability/check",
            params={"check_in_date": "2027-01-10", "check_out_date": "2027-01-12"},
            headers=auth_headers, timeout=20,
        )
        assert r3.status_code == 200
        non_overlap_rooms = {room["room_number"] for room in r3.json()["rooms"]}
        assert target_room in non_overlap_rooms
    finally:
        db.bookings.delete_one({"id": booking_id})


# -------- Public availability still works --------

def test_public_availability_future_dates():
    r = requests.get(
        f"{BASE_URL}/api/public/availability",
        params={"check_in": FUTURE_CI, "check_out": FUTURE_CO},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "available_room_types" in data
    assert data["available_room_types"][0]["available_count"] >= 1


# -------- Pymongo pin --------

def test_pymongo_pinned():
    with open("/app/backend/requirements.txt") as f:
        content = f.read()
    assert "pymongo==4.8.0" in content


# -------- Website + CRM login smoke --------

def test_website_root_200():
    r = requests.get(f"{BASE_URL}/", timeout=20)
    assert r.status_code == 200


def test_crm_login_admin():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": "admin", "password": "admin123"}, timeout=20)
    assert r.status_code == 200
