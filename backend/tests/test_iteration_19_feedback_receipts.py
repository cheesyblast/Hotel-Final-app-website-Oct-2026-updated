# Iteration 19: Guest feedback (auto request on checkout/early-checkout, public submit, CRM list) + checkout receipts
import os
import time
import datetime as dt
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"
EXISTING_TOKEN = "GzrUqyuOaSLQ5ElD6dDzOg"

_mongo = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
mdb = _mongo[os.environ.get("DB_NAME", "test_database")]

TODAY = dt.date.today()
STATE = {}


@pytest.fixture(scope="module")
def H():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"})
    if r.status_code != 200:
        pytest.skip("admin login failed")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    names = ["TEST_FB_Normal", "TEST_FB_Early", "TEST_FB_NoContact"]
    mdb.feedback_requests.delete_many({"guest_name": {"$in": names}})
    mdb.customers.delete_many({"name": {"$in": names}})
    mdb.bookings.delete_many({"guest_name": {"$in": names}})
    mdb.daily_sales.delete_many({"customer_name": {"$in": names}})
    mdb.incomes.delete_many({"guest_name": {"$in": names}})
    mdb.rooms.delete_many({"room_number": {"$in": ["T901", "T902", "T903"]}})


def _setup_stay(H, room, name, nights, email="test@example.com", phone="0770000000"):
    r = requests.post(f"{API}/rooms", json={"room_number": room, "room_type": "Double", "price_per_night": 10000}, headers=H)
    assert r.status_code in (200, 201), r.text
    b = requests.post(f"{API}/bookings", json={
        "guest_name": name, "guest_email": email, "guest_phone": phone, "room_number": room,
        "check_in_date": TODAY.isoformat(), "check_out_date": (TODAY + dt.timedelta(days=nights)).isoformat(),
        "booking_amount": 10000 * nights, "advance_amount": 0,
    }, headers=H)
    assert b.status_code in (200, 201), b.text
    bid = b.json()["id"]
    c = requests.post(f"{API}/checkin", json={"booking_id": bid, "advance_amount": 2000, "payment_method": "Cash"}, headers=H)
    assert c.status_code == 200, c.text
    cust = mdb.customers.find_one({"name": name, "current_room": room}, {"_id": 0})
    assert cust, "customer not created on checkin"
    return bid, cust["id"]


# ---- Public feedback endpoints ----
class TestPublicFeedback:
    def test_get_bad_token_404(self):
        r = requests.get(f"{API}/public/feedback/does-not-exist-xyz")
        assert r.status_code == 404

    def test_get_existing_token(self):
        r = requests.get(f"{API}/public/feedback/{EXISTING_TOKEN}")
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("guest_name", "room_number", "check_in_date", "check_out_date", "status", "hotel_name"):
            assert k in d
        assert "token" not in d and "guest_email" not in d

    def test_post_bad_token_404(self):
        r = requests.post(f"{API}/public/feedback/does-not-exist-xyz", json={"overall_rating": 5})
        assert r.status_code == 404

    @pytest.mark.parametrize("payload", [{}, {"overall_rating": 0}, {"overall_rating": 6},
                                         {"overall_rating": 4, "staff_rating": 7},
                                         {"overall_rating": 4, "comment": "x" * 2001}])
    def test_post_validation_422(self, payload):
        r = requests.post(f"{API}/public/feedback/{EXISTING_TOKEN}", json=payload)
        assert r.status_code == 422, f"{payload} -> {r.status_code}"


# ---- Auto-creation on checkout + early checkout ----
class TestCheckoutCreatesFeedback:
    def test_normal_checkout(self, H):
        bid, cid = _setup_stay(H, "T901", "TEST_FB_Normal", 1)
        STATE["normal"] = (bid, cid)
        r = requests.post(f"{API}/checkout", json={"customer_id": cid, "payment_method": "Card"}, headers=H)
        assert r.status_code == 200, r.text
        fb = None
        for _ in range(20):
            fb = mdb.feedback_requests.find_one({"customer_id": cid})
            if fb:
                break
            time.sleep(1)
        assert fb, "feedback request not created after checkout"
        assert fb["status"] == "pending" and fb["room_number"] == "T901"
        assert fb["guest_email"] == "test@example.com"
        STATE["normal_token"] = fb["token"]

    def test_early_checkout(self, H):
        bid, cid = _setup_stay(H, "T902", "TEST_FB_Early", 3)
        STATE["early"] = (bid, cid)
        r = requests.post(f"{API}/early-checkout", json={"customer_id": cid, "payment_method": "Cash"}, headers=H)
        assert r.status_code == 200, r.text
        fb = None
        for _ in range(20):
            fb = mdb.feedback_requests.find_one({"customer_id": cid})
            if fb:
                break
            time.sleep(1)
        assert fb, "feedback request not created after early checkout"
        assert fb["status"] == "pending"
        STATE["early_token"] = fb["token"]

    def test_only_once_per_customer(self):
        cid = STATE["normal"][1]
        time.sleep(2)
        assert mdb.feedback_requests.count_documents({"customer_id": cid}) == 1

    def test_no_contact_no_request(self, H):
        bid, cid = _setup_stay(H, "T903", "TEST_FB_NoContact", 1, email="", phone="")
        r = requests.post(f"{API}/checkout", json={"customer_id": cid}, headers=H)
        assert r.status_code == 200, r.text
        time.sleep(3)
        assert mdb.feedback_requests.count_documents({"customer_id": cid}) == 0


# ---- Submit + list ----
class TestSubmitAndList:
    def test_submit_and_conflict(self):
        tok = STATE["normal_token"]
        r = requests.post(f"{API}/public/feedback/{tok}", json={
            "overall_rating": 4, "cleanliness_rating": 5, "staff_rating": 3, "comment": "  TEST_great stay  "})
        assert r.status_code == 200, r.text
        g = requests.get(f"{API}/public/feedback/{tok}").json()
        assert g["status"] == "submitted"
        r2 = requests.post(f"{API}/public/feedback/{tok}", json={"overall_rating": 1})
        assert r2.status_code == 409

    def test_list_requires_auth(self):
        assert requests.get(f"{API}/feedback").status_code in (401, 403)

    def test_list_stats_and_filters(self, H):
        r = requests.get(f"{API}/feedback", headers=H)
        assert r.status_code == 200
        d = r.json()
        st = d["stats"]
        for k in ("total_requests", "total_responses", "response_rate", "avg_overall", "avg_cleanliness",
                  "avg_staff", "avg_food", "avg_comfort", "distribution"):
            assert k in st
        assert set(st["distribution"].keys()) == {"1", "2", "3", "4", "5"}
        assert all("token" not in i for i in d["items"])
        sub = requests.get(f"{API}/feedback", params={"status": "submitted"}, headers=H).json()["items"]
        assert all(i["status"] == "submitted" for i in sub)
        pen = requests.get(f"{API}/feedback", params={"status": "pending"}, headers=H).json()["items"]
        assert all(i["status"] == "pending" for i in pen)
        assert any(i["guest_name"] == "TEST_FB_Early" for i in pen)
        s = requests.get(f"{API}/feedback", params={"search": "TEST_great"}, headers=H).json()["items"]
        assert len(s) >= 1 and s[0]["guest_name"] == "TEST_FB_Normal" and s[0]["comment"] == "TEST_great stay"
        mn = requests.get(f"{API}/feedback", params={"min_rating": 5}, headers=H).json()["items"]
        assert all(i["overall_rating"] >= 5 for i in mn)
        mx = requests.get(f"{API}/feedback", params={"max_rating": 4, "search": "TEST_FB"}, headers=H).json()["items"]
        assert any(i["guest_name"] == "TEST_FB_Normal" for i in mx)
        fut = (TODAY + dt.timedelta(days=30)).isoformat()
        assert requests.get(f"{API}/feedback", params={"start_date": fut}, headers=H).json()["items"] == []
        td = requests.get(f"{API}/feedback", params={"start_date": TODAY.isoformat(), "end_date": TODAY.isoformat(), "search": "TEST_FB"}, headers=H).json()["items"]
        assert len(td) >= 2


# ---- Receipts ----
class TestReceipts:
    def test_requires_auth(self):
        assert requests.get(f"{API}/receipts/customer/x").status_code in (401, 403)

    def test_customer_receipt(self, H):
        cid = STATE["normal"][1]
        r = requests.get(f"{API}/receipts/customer/{cid}", headers=H)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["receipt_number"].startswith("RCPT-")
        assert "hotel_name" in d["hotel"] and "currency" in d["hotel"]
        assert d["guest"]["name"] == "TEST_FB_Normal"
        assert d["stay"]["room_number"] == "T901" and d["stay"]["nights"] >= 1
        t = d["totals"]
        for k in ("room_charges", "restaurant_charges", "additional_charges", "discount_amount", "taxes",
                  "grand_total", "advance_paid", "balance_settled", "settlement_method"):
            assert k in t
        assert t["advance_paid"] == 2000
        assert abs(t["grand_total"] - (t["room_charges"] + t["restaurant_charges"] + t["additional_charges"] - t["discount_amount"] + t["taxes"])) < 0.01
        assert abs(t["balance_settled"] - (t["grand_total"] - t["advance_paid"])) < 0.01
        assert t["settlement_method"] == "Card", t
        assert isinstance(d["payments"], list) and isinstance(d["restaurant_orders"], list)
        assert sum(p["amount"] for p in d["payments"]) == 2000, d["payments"]
        print("RECEIPT", d)

    def test_booking_receipt(self, H):
        bid = STATE["early"][0]
        r = requests.get(f"{API}/receipts/booking/{bid}", headers=H)
        assert r.status_code == 200, r.text
        assert r.json()["guest"]["name"] == "TEST_FB_Early"
        assert r.json()["stay"]["check_out_date"] == TODAY.isoformat()

    def test_customer_receipt_404(self, H):
        assert requests.get(f"{API}/receipts/customer/nope", headers=H).status_code == 404

    def test_booking_receipt_never_checked_in_404(self, H):
        b = requests.post(f"{API}/bookings", json={
            "guest_name": "TEST_FB_NoContact", "room_number": "T903",
            "check_in_date": (TODAY + dt.timedelta(days=200)).isoformat(),
            "check_out_date": (TODAY + dt.timedelta(days=201)).isoformat()}, headers=H)
        assert b.status_code in (200, 201), b.text
        # NoContact customer exists for T903 -> same name+room match; use different name to get a never-checked-in case
        mdb.bookings.update_one({"id": b.json()["id"]}, {"$set": {"guest_name": "TEST_FB_Never"}})
        r = requests.get(f"{API}/receipts/booking/{b.json()['id']}", headers=H)
        mdb.bookings.delete_one({"id": b.json()["id"]})
        assert r.status_code == 404
        assert requests.get(f"{API}/receipts/booking/nope", headers=H).status_code == 404
