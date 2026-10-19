# Seed / cleanup helper for iteration 19 UI tests: python ui_seed_iter19.py seed|clean
import os, sys, json, datetime as dt, requests
from pymongo import MongoClient
API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
mdb = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))[os.environ.get("DB_NAME", "test_database")]
NAMES = ["TEST_UI_Normal", "TEST_UI_Early", "TEST_UI_Upcoming"]
ROOMS = ["T911", "T912", "T913"]
T = dt.date.today()

if sys.argv[1] == "seed":
    H = {"Authorization": "Bearer " + requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]}
    out = {}
    for room, name, nights, start, ci in [("T911", "TEST_UI_Normal", 1, 0, True), ("T912", "TEST_UI_Early", 3, 0, True), ("T913", "TEST_UI_Upcoming", 2, 5, False)]:
        requests.post(f"{API}/rooms", json={"room_number": room, "room_type": "Double", "price_per_night": 10000}, headers=H)
        b = requests.post(f"{API}/bookings", json={"guest_name": name, "guest_email": "test@example.com", "guest_phone": "0770000000",
            "room_number": room, "check_in_date": (T + dt.timedelta(days=start)).isoformat(),
            "check_out_date": (T + dt.timedelta(days=start + nights)).isoformat(), "booking_amount": 10000 * nights}, headers=H).json()
        out[name] = {"booking_id": b["id"]}
        if ci:
            requests.post(f"{API}/checkin", json={"booking_id": b["id"], "advance_amount": 2000}, headers=H)
            out[name]["customer_id"] = mdb.customers.find_one({"name": name})["id"]
    print(json.dumps(out))
else:
    for c in ["feedback_requests"]:
        mdb[c].delete_many({"guest_name": {"$in": NAMES}})
    mdb.customers.delete_many({"name": {"$in": NAMES}})
    mdb.bookings.delete_many({"guest_name": {"$in": NAMES}})
    mdb.daily_sales.delete_many({"customer_name": {"$in": NAMES}})
    mdb.incomes.delete_many({"guest_name": {"$in": NAMES}})
    mdb.rooms.delete_many({"room_number": {"$in": ROOMS}})
    print("cleaned")
