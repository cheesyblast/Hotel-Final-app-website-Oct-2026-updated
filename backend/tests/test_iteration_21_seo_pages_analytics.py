# Iteration 21: SEO dynamic page list, analytics tracking, canonical fallback, booking status paid_amount
import os
import re
import uuid
import pytest
import requests
from datetime import datetime, timedelta, timezone
from pymongo import MongoClient
from dotenv import dotenv_values

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
LOCAL = "http://localhost:8001/api"
ENV = dotenv_values("/app/backend/.env")
mdb = MongoClient(ENV["MONGO_URL"])[ENV["DB_NAME"]]

DEFAULT_PATHS = ["/", "/rooms", "/gallery", "/about", "/contact", "/terms", "/privacy-policy", "/refund-policy"]


@pytest.fixture(scope="module")
def H():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"})
    if r.status_code != 200:
        pytest.skip("admin login failed")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module", autouse=True)
def restore(H):
    yield
    # Restore defaults (cleanup requested by main agent)
    pages = [{"path": p, "label": "", "title": "", "description": ""} for p in DEFAULT_PATHS]
    requests.put(f"{API}/seo/settings", headers=H, json={
        "pages": pages, "ga4_id": "", "gtm_id": "", "pixel_id": "", "head_code": "", "body_code": "",
        "canonical_url": "", "robots_index": True})


def put(H, **kw):
    return requests.put(f"{API}/seo/settings", headers=H, json=kw)


def pages_with(*extra, drop=()):
    base = [{"path": p, "label": "", "title": "", "description": ""} for p in DEFAULT_PATHS if p not in drop]
    return base + list(extra)


DINING = {"path": "/dining", "label": "Dining", "title": "TEST Dining Title", "description": "TEST dining desc"}


# --- Validation ---
class TestValidation:
    @pytest.mark.parametrize("bad", ["dining", "/Din ing", "/api/x", "/feedback", "/static/x", "/a_b", "/x/", "/-x"])
    def test_invalid_paths_422(self, H, bad):
        r = put(H, pages=pages_with({"path": bad, "label": "X"}))
        assert r.status_code == 422, (bad, r.status_code, r.text)

    def test_duplicate_422(self, H):
        r = put(H, pages=pages_with(DINING, DINING))
        assert r.status_code == 422
        assert "Duplicate" in r.json()["detail"]

    @pytest.mark.parametrize("k,v", [("ga4_id", "UA-123"), ("ga4_id", "g-abc12345"), ("gtm_id", "GTM-1"), ("pixel_id", "12ab"), ("pixel_id", "123")])
    def test_bad_ids_422(self, H, k, v):
        assert put(H, **{k: v}).status_code == 422

    def test_requires_auth(self):
        assert requests.put(f"{API}/seo/settings", json={"ga4_id": ""}).status_code in (401, 403)

    def test_home_kept_first_when_omitted(self, H):
        pg = [p for p in pages_with(DINING) if p["path"] != "/"]
        r = put(H, pages=pg)
        assert r.status_code == 200, r.text
        paths = [p["path"] for p in r.json()["pages"]]
        assert paths[0] == "/" and "/dining" in paths
        g = requests.get(f"{API}/seo/settings", headers=H).json()
        assert g["pages"][0]["path"] == "/"

    def test_home_moved_to_first(self, H):
        pg = pages_with(DINING)
        pg = pg[1:] + pg[:1]
        r = put(H, pages=pg)
        assert r.status_code == 200
        assert r.json()["pages"][0]["path"] == "/"


# --- Legacy migration ---
class TestLegacy:
    def test_legacy_dict_migrates(self, H):
        mdb.seo_settings.update_one({}, {"$set": {"pages": {"/": {"title": "LegacyHome"}, "/rooms": {"title": "LegacyRooms", "description": ""}}}})
        g = requests.get(f"{API}/seo/settings", headers=H).json()
        assert isinstance(g["pages"], list)
        paths = [p["path"] for p in g["pages"]]
        assert paths[0] == "/"
        assert set(DEFAULT_PATHS) <= set(paths)
        assert next(p for p in g["pages"] if p["path"] == "/rooms")["title"] == "LegacyRooms"
        assert put(H, pages=pages_with()).status_code == 200


# --- Public site-config / meta / sitemap ---
class TestPublic:
    def test_custom_page_flow(self, H):
        r = put(H, pages=pages_with(DINING, drop=("/gallery",)), canonical_url="")
        assert r.status_code == 200, r.text
        sc = requests.get(f"{API}/public/seo/site-config").json()
        paths = [p["path"] for p in sc["pages"]]
        assert "/dining" in paths and "/gallery" not in paths
        assert {"path": "/dining", "label": "Dining"} in sc["pages"]
        assert set(sc["tracking"].keys()) == {"ga4_id", "gtm_id", "pixel_id", "head_code", "body_code"}

        m = requests.get(f"{API}/public/seo/meta", params={"path": "/dining"}).json()
        assert m["path"] == "/dining" and m["title"] == "TEST Dining Title" and m["description"] == "TEST dining desc"
        assert m["canonical"].endswith("/dining")

        home = requests.get(f"{API}/public/seo/meta", params={"path": "/"}).json()
        g = requests.get(f"{API}/public/seo/meta", params={"path": "/gallery"}).json()
        assert g["path"] == "/" and g["title"] == home["title"]

        sm = requests.get(f"{API}/public/seo/sitemap.xml").text
        locs = re.findall(r"<loc>([^<]+)</loc>", sm)
        assert len(locs) == 8
        assert any(l.endswith("/dining") for l in locs)
        assert not any(l.endswith("/gallery") for l in locs)
        rb = requests.get(f"{API}/public/seo/robots.txt").text
        assert "Sitemap:" in rb and "User-agent: *" in rb

    def test_og_image_absolute(self, H):
        assert put(H, og_image="/api/public/seo/media/abc.png", canonical_url="").status_code == 200
        m = requests.get(f"{API}/public/seo/meta", params={"path": "/"}).json()
        assert m["og"]["image"].startswith("https://"), m["og"]["image"]
        assert m["twitter"]["image"].startswith("https://")
        html = requests.get(f"{API}/public/seo/render", params={"path": "/"}).text
        og = re.search(r'property="og:image" content="([^"]+)"', html).group(1)
        assert og.startswith("https://")


# --- Canonical fallback ---
class TestCanonical:
    def test_empty_canonical_uses_host(self, H):
        assert put(H, canonical_url="", og_image="/api/public/seo/media/abc.png").status_code == 200
        m = requests.get(f"{LOCAL}/public/seo/meta", params={"path": "/rooms"}, headers={"Host": "www.kreationhotels.com"}).json()
        assert m["canonical"] == "https://www.kreationhotels.com/rooms"
        assert m["og"]["image"] == "https://www.kreationhotels.com/api/public/seo/media/abc.png"
        sm = requests.get(f"{LOCAL}/public/seo/sitemap.xml", headers={"Host": "www.kreationhotels.com"}).text
        assert "<loc>https://www.kreationhotels.com/</loc>" in sm

    def test_emergent_canonical_ignored_on_live(self, H):
        assert put(H, canonical_url="https://hospitality-ops-18.preview.emergentagent.com").status_code == 200
        m = requests.get(f"{LOCAL}/public/seo/meta", params={"path": "/"}, headers={"Host": "www.kreationhotels.com"}).json()
        assert m["canonical"] == "https://www.kreationhotels.com/"
        # on preview host the saved emergent canonical is kept
        m2 = requests.get(f"{API}/public/seo/meta", params={"path": "/"}).json()
        assert "emergentagent.com" in m2["canonical"]

    def test_real_canonical_kept(self, H):
        assert put(H, canonical_url="https://www.kreationhotels.com/").status_code == 200
        m = requests.get(f"{LOCAL}/public/seo/meta", params={"path": "/"}, headers={"Host": "other.example.com"}).json()
        assert m["canonical"] == "https://www.kreationhotels.com/"

    def test_origin_param(self, H):
        assert put(H, canonical_url="").status_code == 200
        m = requests.get(f"{API}/public/seo/meta", params={"path": "/about", "origin": "https://foo.com"}).json()
        assert m["canonical"] == "https://foo.com/about"
        assert m["og"]["image"].startswith("https://foo.com/")


# --- Tracking injection in SSR ---
class TestTracking:
    def test_render_contains_tracking(self, H):
        r = put(H, ga4_id="G-TEST12345", gtm_id="GTM-TEST123", pixel_id="1234567890123456",
                head_code="<meta name='test-head' content='1'>", body_code="<div id='test-body-snippet'></div>", og_image="")
        assert r.status_code == 200, r.text
        html = requests.get(f"{API}/public/seo/render", params={"path": "/"}).text
        head, body = html.split("</head>", 1)
        assert "googletagmanager.com/gtag/js?id=G-TEST12345" in head
        assert "gtm.js?id=" in head and "GTM-TEST123" in head
        assert "fbq('init','1234567890123456')" in head
        assert "<meta name='test-head' content='1'>" in head
        assert "data-seo-tracking" in head
        pre_body_end = body.split("</body>")[0]
        assert "<div id='test-body-snippet'></div>" in pre_body_end
        assert "ns.html?id=GTM-TEST123" in pre_body_end
        sc = requests.get(f"{API}/public/seo/site-config").json()["tracking"]
        assert sc["ga4_id"] == "G-TEST12345" and sc["pixel_id"] == "1234567890123456"

    def test_ids_strip(self, H):
        r = put(H, ga4_id=" G-TEST12345 ")
        assert r.status_code == 200 and r.json()["ga4_id"] == "G-TEST12345"


# --- Booking status paid_amount ---
class TestBookingStatus:
    def test_status_paid_amount(self):
        oid = f"WEB-TEST{uuid.uuid4().hex[:6].upper()}"
        now = datetime.now(timezone.utc)
        mdb.booking_holds.insert_one({"id": str(uuid.uuid4()), "order_id": oid, "status": "confirmed", "room_type": "Double",
                                      "check_in": now, "check_out": now + timedelta(days=1), "payment_amount": 9500.0,
                                      "paid_amount": 9400.0, "paid_currency": "LKR", "guest_name": "TEST_Guest",
                                      "expires_at": now + timedelta(minutes=5)})
        try:
            d = requests.get(f"{API}/public/booking/status/{oid}").json()
            assert d["paid_amount"] == 9400.0 and d["currency"] == "LKR" and d["payment_amount"] == 9500.0
        finally:
            mdb.booking_holds.delete_one({"order_id": oid})

    def test_status_404(self):
        assert requests.get(f"{API}/public/booking/status/WEB-NOPE0000").status_code == 404
