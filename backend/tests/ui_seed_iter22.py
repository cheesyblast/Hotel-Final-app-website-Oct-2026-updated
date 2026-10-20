# Seed holds for iteration 22 UI tests (run: python ui_seed_iter22.py seed|confirm <order>|clean)
import sys, json, requests
from datetime import datetime, timedelta, timezone
from pymongo import MongoClient

def _env(p, key):
    for line in open(p):
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip().strip('"')

API = _env("/app/frontend/.env", "REACT_APP_BACKEND_URL").rstrip("/") + "/api"
db = MongoClient(_env("/app/backend/.env", "MONGO_URL"))[_env("/app/backend/.env", "DB_NAME")]

def hold(i):
    ci = datetime(2027, 8, 1) + timedelta(days=i * 2)
    r = requests.post(f"{API}/public/booking/hold", json={"room_type": "Double", "check_in": ci.strftime("%Y-%m-%d"),
        "check_out": (ci + timedelta(days=1)).strftime("%Y-%m-%d"), "guest_name": "Zz Test", "guest_email": "t@example.com", "guest_phone": "0770000000"})
    r.raise_for_status()
    return r.json()

cmd = sys.argv[1]
if cmd == "seed":
    out = {}
    for i, k in enumerate(["confirmed", "failed", "cancel", "pending"]):
        out[k] = hold(i)
    fut = datetime.now(timezone.utc) + timedelta(minutes=30)
    db.booking_holds.update_one({"order_id": out["confirmed"]["order_id"]}, {"$set": {"status": "confirmed", "paid_amount": 9450.0, "paid_currency": "LKR"}})
    db.booking_holds.update_one({"order_id": out["failed"]["order_id"]}, {"$set": {"status": "payment_failed", "failure_reason": "failed"}})
    db.booking_holds.update_one({"order_id": out["pending"]["order_id"]}, {"$set": {"expires_at": fut}})
    db.booking_holds.update_one({"order_id": out["cancel"]["order_id"]}, {"$set": {"expires_at": fut}})
    print(json.dumps({k: {"order_id": v["order_id"], "check_in": v["check_in"], "check_out": v["check_out"], "amount": v["payment_amount"]} for k, v in out.items()}))
elif cmd == "confirm":
    db.booking_holds.update_one({"order_id": sys.argv[2]}, {"$set": {"status": "confirmed", "paid_amount": 9450.0}})
elif cmd == "status":
    print(db.booking_holds.find_one({"order_id": sys.argv[2]}, {"_id": 0, "status": 1}))
elif cmd == "clean":
    print(db.booking_holds.delete_many({"guest_name": "Zz Test"}).deleted_count)
