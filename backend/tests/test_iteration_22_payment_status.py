# Iteration 22: PayHere notify status handling, booking status, release hold
import os
import hashlib
from datetime import datetime, timedelta, timezone
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def _env(key):
    with open("/app/backend/.env") as f:
        for line in f:
            if line.startswith(key + "="):
                return line.split("=", 1)[1].strip().strip('"')


mongo = MongoClient(_env("MONGO_URL"))[_env("DB_NAME")]
CREATED = []
DAY = [10]


def make_hold():
    ci = datetime(2027, 6, 1) + timedelta(days=DAY[0])
    DAY[0] += 2
    r = requests.post(f"{API}/public/booking/hold", json={
        "room_type": "Double", "check_in": ci.strftime("%Y-%m-%d"), "check_out": (ci + timedelta(days=1)).strftime("%Y-%m-%d"),
        "guest_name": "Zz Test", "guest_email": "t@example.com", "guest_phone": "0770000000"})
    assert r.status_code == 200, r.text
    oid = r.json()["order_id"]
    CREATED.append(oid)
    return r.json()


def sign(merchant_id, order_id, amount, currency, status_code):
    secret = mongo.payment_settings.find_one({}).get("payhere_merchant_secret")
    sh = hashlib.md5(secret.encode()).hexdigest().upper()
    return hashlib.md5((merchant_id + order_id + amount + currency + str(status_code) + sh).encode()).hexdigest().upper()


def notify(order_id, amount, status_code, sig=None):
    mid = "TEST123"
    data = {"merchant_id": mid, "order_id": order_id, "payment_id": "P1", "payhere_amount": amount,
            "payhere_currency": "LKR", "status_code": str(status_code),
            "md5sig": sig or sign(mid, order_id, amount, "LKR", status_code), "status_message": "x"}
    return requests.post(f"{API}/public/payhere/notify", data=data)


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    mongo.booking_holds.delete_many({"order_id": {"$in": CREATED}})
    mongo.bookings.delete_many({"group_order_id": {"$in": CREATED}})


# Notify: status 0 keeps hold held + payment_pending
def test_notify_pending_keeps_hold():
    h = make_hold()
    r = notify(h["order_id"], h["payhere"]["amount"], 0)
    assert r.status_code == 200 and r.json()["status"] == "pending"
    doc = mongo.booking_holds.find_one({"order_id": h["order_id"]})
    assert doc["status"] == "held" and doc["payment_pending"] is True
    s = requests.get(f"{API}/public/booking/status/{h['order_id']}").json()
    assert s["status"] == "held" and s["payment_pending"] is True


# Notify: -1/-2/-3 -> payment_failed with reasons
@pytest.mark.parametrize("code,reason", [(-1, "cancelled"), (-2, "failed"), (-3, "chargedback")])
def test_notify_failure_codes(code, reason):
    h = make_hold()
    r = notify(h["order_id"], h["payhere"]["amount"], code)
    assert r.status_code == 200 and r.json()["status"] == "payment_failed"
    s = requests.get(f"{API}/public/booking/status/{h['order_id']}").json()
    assert s["status"] == "payment_failed" and s["failure_reason"] == reason


# Notify: bad signature rejected
def test_notify_bad_signature():
    h = make_hold()
    r = notify(h["order_id"], h["payhere"]["amount"], -2, sig="BAD")
    assert r.status_code == 400
    assert mongo.booking_holds.find_one({"order_id": h["order_id"]})["status"] == "held"


# Notify: failure does not override confirmed
def test_notify_failure_does_not_override_confirmed():
    h = make_hold()
    mongo.booking_holds.update_one({"order_id": h["order_id"]}, {"$set": {"status": "confirmed"}})
    notify(h["order_id"], h["payhere"]["amount"], -2)
    assert mongo.booking_holds.find_one({"order_id": h["order_id"]})["status"] == "confirmed"


# Status endpoint: fields
def test_status_fields():
    h = make_hold()
    mongo.booking_holds.update_one({"order_id": h["order_id"]}, {"$set": {"status": "confirmed", "paid_amount": 1234.0, "paid_currency": "LKR"}})
    s = requests.get(f"{API}/public/booking/status/{h['order_id']}").json()
    for k in ["status", "paid_amount", "num_rooms", "failure_reason", "payment_pending", "room_type", "check_in", "check_out", "currency"]:
        assert k in s
    assert s["paid_amount"] == 1234.0 and s["num_rooms"] == 1 and s["payment_pending"] is False
    assert s["check_in"] == h["check_in"]


def test_status_unknown_404():
    assert requests.get(f"{API}/public/booking/status/WEB-NOPE0000").status_code == 404


# Status: expired held w/o pending -> expired; held+pending -> not expired
def test_status_expiry_rules():
    past = datetime.now(timezone.utc) - timedelta(minutes=10)
    a = make_hold()
    b = make_hold()
    mongo.booking_holds.update_one({"order_id": a["order_id"]}, {"$set": {"expires_at": past}})
    mongo.booking_holds.update_one({"order_id": b["order_id"]}, {"$set": {"expires_at": past, "payment_pending": True}})
    assert requests.get(f"{API}/public/booking/status/{a['order_id']}").json()["status"] == "expired"
    sb = requests.get(f"{API}/public/booking/status/{b['order_id']}").json()
    assert sb["status"] == "held" and sb["payment_pending"] is True


# Expired payment_pending hold survives cleanup triggered by another hold/availability call
def test_pending_hold_survives_cleanup():
    past = datetime.now(timezone.utc) - timedelta(minutes=10)
    b = make_hold()
    mongo.booking_holds.update_one({"order_id": b["order_id"]}, {"$set": {"expires_at": past, "payment_pending": True}})
    requests.get(f"{API}/public/availability", params={"check_in": "2027-07-01", "check_out": "2027-07-02"})
    assert mongo.booking_holds.find_one({"order_id": b["order_id"]}) is not None, "payment_pending hold deleted by cleanup_expired_holds"


# Release endpoint
def test_release_held():
    h = make_hold()
    r = requests.post(f"{API}/public/booking/release/{h['order_id']}")
    assert r.status_code == 200 and r.json()["released"] is True
    assert requests.get(f"{API}/public/booking/status/{h['order_id']}").json()["status"] == "cancelled"


@pytest.mark.parametrize("patch", [{"status": "confirmed"}, {"status": "payment_failed"}, {"status": "held", "payment_pending": True}])
def test_release_untouched(patch):
    h = make_hold()
    mongo.booking_holds.update_one({"order_id": h["order_id"]}, {"$set": patch})
    r = requests.post(f"{API}/public/booking/release/{h['order_id']}")
    assert r.status_code == 200 and r.json()["released"] is False
    assert mongo.booking_holds.find_one({"order_id": h["order_id"]})["status"] == patch["status"]


def test_release_unknown():
    r = requests.post(f"{API}/public/booking/release/WEB-NOPE0000")
    assert r.status_code == 200 and r.json()["released"] is False
