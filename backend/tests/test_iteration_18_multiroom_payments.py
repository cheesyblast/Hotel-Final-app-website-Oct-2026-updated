# Iteration 18: multi-room public holds, payment settings, email Brevo is_configured, removed DB reset
import os
import random
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"


def _rand_dates():
    # unique far-future date window per call to avoid hold collisions (holds last 5 min)
    import datetime as dt
    start = dt.date(2027, 2, 1) + dt.timedelta(days=random.randint(0, 600) * 2)
    return start.isoformat(), (start + dt.timedelta(days=2)).isoformat()


@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"})
    if r.status_code != 200:
        pytest.skip(f"admin login failed {r.status_code}")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _hold(ci, co, n, name="TEST_Multi"):
    return requests.post(f"{API}/public/booking/hold", json={
        "room_type": "Double", "check_in": ci, "check_out": co,
        "guest_name": name, "guest_email": "test_multi@example.com",
        "guest_phone": "0771234567", "num_guests": 2, "num_rooms": n,
    })


# ---- Multi-room hold ----
class TestMultiRoomHold:
    def test_hold_two_rooms(self):
        ci, co = _rand_dates()
        r = _hold(ci, co, 2)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["num_rooms"] == 2
        assert len(d["room_numbers"]) == 2 and len(set(d["room_numbers"])) == 2
        assert d["nights"] == 2
        assert d["subtotal"] == d["price_per_night"] * 2 * 2
        assert abs(d["total_amount"] - (d["subtotal"] + d["tax_amount"])) < 0.01
        assert d["payment_amount"] == d["total_amount"]
        assert d["payhere"]["amount"] == f"{d['payment_amount']:.2f}"
        # availability reduced by 2
        a = requests.get(f"{API}/public/availability", params={"check_in": ci, "check_out": co}).json()
        dbl = [t for t in a["available_room_types"] if t["room_type"] == "Double"][0]
        assert dbl["available_count"] == 8
        for rn in d["room_numbers"]:
            assert rn not in dbl["available_rooms"]
        # status endpoint
        s = requests.get(f"{API}/public/booking/status/{d['order_id']}")
        assert s.status_code == 200 and s.json()["status"] == "held"

    def test_hold_more_than_available_409(self):
        ci, co = _rand_dates()
        r1 = _hold(ci, co, 8)
        assert r1.status_code == 200, r1.text
        r = _hold(ci, co, 3)
        assert r.status_code == 409, r.text
        assert "Only 2 room(s) available" in r.json()["detail"]
        r2 = _hold(ci, co, 2)
        assert r2.status_code == 200
        r3 = _hold(ci, co, 1)
        assert r3.status_code == 409

    def test_hold_zero_rooms_400(self):
        ci, co = _rand_dates()
        r = _hold(ci, co, 0)
        assert r.status_code == 400

    def test_default_single_room(self):
        ci, co = _rand_dates()
        r = requests.post(f"{API}/public/booking/hold", json={
            "room_type": "Double", "check_in": ci, "check_out": co,
            "guest_name": "TEST_Single", "guest_email": "t@example.com", "guest_phone": "0771234567"})
        assert r.status_code == 200
        assert r.json()["num_rooms"] == 1 and len(r.json()["room_numbers"]) == 1

    def test_payhere_merchant_from_db(self, admin_headers):
        ps = requests.get(f"{API}/payment-settings", headers=admin_headers).json()
        ci, co = _rand_dates()
        d = _hold(ci, co, 1).json()
        if ps.get("payhere_merchant_id"):
            assert d["payhere"]["merchant_id"] == ps["payhere_merchant_id"]
            if ps.get("payhere_merchant_secret"):
                assert len(d["payhere"]["hash"]) == 32
        assert d["payhere"]["sandbox"] == (ps.get("payhere_mode", "sandbox") == "sandbox")


# ---- Payment settings ----
class TestPaymentSettings:
    def test_get_requires_auth(self):
        r = requests.get(f"{API}/payment-settings")
        assert r.status_code in (401, 403)

    def test_get_and_put_roundtrip(self, admin_headers):
        orig = requests.get(f"{API}/payment-settings", headers=admin_headers)
        assert orig.status_code == 200
        o = orig.json()
        assert "_id" not in o
        for k in ["payhere_merchant_id", "payhere_merchant_secret", "payhere_mode", "paypal_client_id", "webxpay_api_key"]:
            assert k in o
        r = requests.put(f"{API}/payment-settings", headers=admin_headers, json={
            "active_gateway": "payhere", "payhere_merchant_id": "TEST123", "payhere_merchant_secret": "TESTSECRET", "payhere_mode": "sandbox"})
        assert r.status_code == 200
        g = requests.get(f"{API}/payment-settings", headers=admin_headers).json()
        assert g["payhere_merchant_id"] == "TEST123"
        assert g["payhere_merchant_secret"] == "TESTSECRET"
        assert g["active_gateway"] == "payhere"
        # website hold uses it
        ci, co = _rand_dates()
        d = _hold(ci, co, 1).json()
        assert d["payhere"]["merchant_id"] == "TEST123"
        assert len(d["payhere"]["hash"]) == 32
        # restore
        restore = {k: o.get(k) for k in ["active_gateway", "payhere_merchant_id", "payhere_merchant_secret", "payhere_mode"] if o.get(k) is not None}
        if restore:
            requests.put(f"{API}/payment-settings", headers=admin_headers, json=restore)


# ---- Email Brevo is_configured ----
class TestEmailBrevo:
    def test_brevo_is_configured(self, admin_headers):
        orig = requests.get(f"{API}/email-settings", headers=admin_headers).json()
        r = requests.put(f"{API}/email-settings", headers=admin_headers, json={
            "provider": "brevo", "brevo_api_key": "xkeysib-TESTKEY1234567890", "from_email": "test@example.com", "from_name": "TEST"})
        assert r.status_code == 200, r.text
        g = requests.get(f"{API}/email-settings", headers=admin_headers).json()
        assert g["provider"] == "brevo"
        assert g["is_configured"] is True
        assert g["from_email"] == "test@example.com"
        # restore if a real config existed
        if orig.get("provider") == "brevo" and orig.get("brevo_api_key") and orig["brevo_api_key"] != "xkeysib-TESTKEY1234567890":
            requests.put(f"{API}/email-settings", headers=admin_headers, json={
                "provider": "brevo", "brevo_api_key": orig["brevo_api_key"], "from_email": orig.get("from_email"), "from_name": orig.get("from_name")})


# ---- Removed endpoints / auth ----
class TestRemovedAndAuth:
    def test_complete_reset_removed(self, admin_headers):
        r = requests.post(f"{API}/admin/complete-reset", headers=admin_headers, json={})
        assert r.status_code in (404, 405), r.status_code

    def test_admin_login(self):
        r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"})
        assert r.status_code == 200 and r.json().get("access_token")
