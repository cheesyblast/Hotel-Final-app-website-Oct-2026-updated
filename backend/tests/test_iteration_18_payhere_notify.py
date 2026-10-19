# Iteration 18: PayHere notify confirms multi-room hold -> N CRM bookings (uses DB payment_settings secret)
import os
import hashlib
import random
import datetime as dt
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"})
    if r.status_code != 200:
        pytest.skip("login failed")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_notify_creates_one_booking_per_room(admin_headers):
    ps = requests.get(f"{API}/payment-settings", headers=admin_headers).json()
    secret = ps.get("payhere_merchant_secret")
    if not secret:
        pytest.skip("no payhere secret configured")
    start = dt.date(2028, 1, 1) + dt.timedelta(days=random.randint(0, 300))
    ci, co = start.isoformat(), (start + dt.timedelta(days=1)).isoformat()
    h = requests.post(f"{API}/public/booking/hold", json={
        "room_type": "Double", "check_in": ci, "check_out": co, "guest_name": "TEST_Notify",
        "guest_email": "test_notify@example.com", "guest_phone": "0771234567", "num_rooms": 2}).json()
    mid, oid, amt, cur, status = h["payhere"]["merchant_id"], h["order_id"], h["payhere"]["amount"], "LKR", "2"
    sh = hashlib.md5(secret.encode()).hexdigest().upper()
    sig = hashlib.md5((mid + oid + amt + cur + status + sh).encode()).hexdigest().upper()
    # bad signature rejected
    bad = requests.post(f"{API}/public/payhere/notify", data={"merchant_id": mid, "order_id": oid, "payment_id": "P1",
        "payhere_amount": amt, "payhere_currency": cur, "status_code": status, "md5sig": "BAD"})
    assert bad.status_code == 400
    r = requests.post(f"{API}/public/payhere/notify", data={"merchant_id": mid, "order_id": oid, "payment_id": "P1",
        "payhere_amount": amt, "payhere_currency": cur, "status_code": status, "md5sig": sig})
    assert r.status_code == 200 and r.json()["status"] == "confirmed", r.text
    s = requests.get(f"{API}/public/booking/status/{oid}").json()
    assert s["status"] == "confirmed"
    # rooms now booked in availability
    a = requests.get(f"{API}/public/availability", params={"check_in": ci, "check_out": co}).json()
    dbl = [t for t in a["available_room_types"] if t["room_type"] == "Double"][0]
    assert dbl["available_count"] == 8
    for rn in h["room_numbers"]:
        assert rn not in dbl["available_rooms"]
    # idempotent
    r2 = requests.post(f"{API}/public/payhere/notify", data={"merchant_id": mid, "order_id": oid, "payment_id": "P1",
        "payhere_amount": amt, "payhere_currency": cur, "status_code": status, "md5sig": sig})
    assert r2.json()["status"] == "already_confirmed"
    print("ORDER", oid)
