# Checks /receipts/booking/{id} for every Completed / Checked In booking (real data, read-only)
import os, requests
API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
H = {"Authorization": "Bearer " + requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]}
_j = requests.get(f"{API}/bookings", headers=H).json()
bks = _j if isinstance(_j, list) else (_j.get("bookings") or _j.get("items") or [])
for b in bks:
    if b.get("status") in ("Completed", "Checked In", "Checked-in"):
        r = requests.get(f"{API}/receipts/booking/{b['id']}", headers=H)
        extra = ""
        if r.status_code == 200:
            d = r.json()
            extra = f"ci={d['stay']['check_in_date']} co={d['stay']['check_out_date']} booking_ci={b.get('check_in_date')} gt={d['totals']['grand_total']} pay={len(d['payments'])}"
        print(b["status"], b["guest_name"], b["room_number"], r.status_code, extra)
