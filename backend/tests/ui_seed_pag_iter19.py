# Seeds 12 upcoming TEST_UI_Pag bookings (room T913) for dashboard pagination test; 'clean' removes them
import os, sys, datetime as dt, requests
from pymongo import MongoClient
API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
mdb = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))[os.environ.get("DB_NAME", "test_database")]
if sys.argv[1] == "seed":
    H = {"Authorization": "Bearer " + requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]}
    base = dt.date.today() + dt.timedelta(days=30)
    for i in range(12):
        ci = base + dt.timedelta(days=i * 3)
        r = requests.post(f"{API}/bookings", json={"guest_name": f"TEST_UI_Pag{i:02d}", "guest_phone": "0770000000", "room_number": "T913",
            "check_in_date": ci.isoformat(), "check_out_date": (ci + dt.timedelta(days=1)).isoformat()}, headers=H)
        print(r.status_code, end=" ")
else:
    print(mdb.bookings.delete_many({"guest_name": {"$regex": "^TEST_UI_Pag"}}).deleted_count)
