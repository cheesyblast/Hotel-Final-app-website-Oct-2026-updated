# SEO engine tests: settings auth/persist, image upload, meta resolution, sitemap, robots, SSR render
import os
import re
import io
import json
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082"
)


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"})
    if r.status_code != 200:
        pytest.skip("admin login failed")
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def H(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def original(H):
    r = requests.get(f"{API}/seo/settings", headers=H)
    assert r.status_code == 200
    orig = r.json()
    yield orig
    # restore
    orig.pop("updated_at", None)
    orig["robots_index"] = True
    requests.put(f"{API}/seo/settings", headers=H, json=orig)


TEST_PAYLOAD = {
    "site_title": "TEST_Kreation Hotel",
    "title_format": "{Hotel Name} | Boutique Hotel in {City}",
    "meta_description": "TEST meta description for the hotel",
    "meta_keywords": ["  boutique hotel ", "colombo", "  ", "spa"],
    "canonical_url": "https://test-hotel.example.com/",
    "robots_index": True,
    "robots_follow": False,
    "og_title": "TEST OG Title",
    "og_description": "TEST OG Desc",
    "og_image": "/api/public/seo/media/abc.png",
    "twitter_card": "summary",
    "schema": {
        "name": "TEST Hotel Name", "legal_name": "TEST Legal Pvt", "description": "Schema desc",
        "street": "1 Main St", "city": "Kandy", "postal_code": "20000", "country": "LK",
        "latitude": "7.29", "longitude": "80.63", "star_rating": "4",
        "checkin_time": "14:00", "checkout_time": "11:00", "price_range": "$$",
        "telephone": "+94111", "email": "t@example.com", "amenities": ["Free WiFi", "Pool"],
    },
    "pages": {"/rooms": {"title": "TEST Rooms Override", "description": "TEST rooms desc"}},
    "bogus_field": "x",
}


class TestAuth:
    def test_get_requires_auth(self):
        r = requests.get(f"{API}/seo/settings")
        assert r.status_code in (401, 403)

    def test_put_requires_auth(self):
        r = requests.put(f"{API}/seo/settings", json={"site_title": "x"})
        assert r.status_code in (401, 403)

    def test_upload_requires_auth(self):
        r = requests.post(f"{API}/seo/upload-image", files={"file": ("a.png", PNG, "image/png")})
        assert r.status_code in (401, 403)

    def test_staff_forbidden(self):
        r = requests.post(f"{API}/auth/login", json={"username": "staff1", "password": "staff123"})
        if r.status_code != 200:
            pytest.skip("staff login unavailable")
        t = r.json()["access_token"]
        r2 = requests.get(f"{API}/seo/settings", headers={"Authorization": f"Bearer {t}"})
        assert r2.status_code == 403


class TestSettingsAndMeta:
    def test_put_and_persist(self, H, original):
        r = requests.put(f"{API}/seo/settings", headers=H, json=TEST_PAYLOAD)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["canonical_url"] == "https://test-hotel.example.com"
        assert d["meta_keywords"] == ["boutique hotel", "colombo", "spa"]
        assert "bogus_field" not in d
        assert d["pages"]["/rooms"]["title"] == "TEST Rooms Override"
        assert set(d["pages"].keys()) == {"/", "/rooms", "/gallery", "/about", "/contact", "/terms"}
        g = requests.get(f"{API}/seo/settings", headers=H).json()
        assert g["site_title"] == "TEST_Kreation Hotel"
        assert g["schema"]["city"] == "Kandy"
        assert g["robots_follow"] is False
        assert "_id" not in g

    def test_meta_home(self, H, original):
        m = requests.get(f"{API}/public/seo/meta", params={"path": "/"}).json()
        assert m["title"] == "TEST Hotel Name | Boutique Hotel in Kandy"
        assert m["description"] == "TEST meta description for the hotel"
        assert m["keywords"] == "boutique hotel, colombo, spa"
        assert m["canonical"] == "https://test-hotel.example.com/"
        assert m["robots"] == "index, nofollow"
        assert m["og"]["title"] == "TEST OG Title"
        assert m["og"]["type"] == "hotel"
        assert m["og"]["image"] == "https://test-hotel.example.com/api/public/seo/media/abc.png"
        assert m["twitter"]["card"] == "summary"

    def test_meta_rooms_override(self, H, original):
        m = requests.get(f"{API}/public/seo/meta", params={"path": "/rooms"}).json()
        assert m["title"] == "TEST Rooms Override"
        assert m["description"] == "TEST rooms desc"
        assert m["canonical"] == "https://test-hotel.example.com/rooms"
        assert m["og"]["title"] == "TEST Rooms Override"

    def test_meta_inner_default(self, H, original):
        m = requests.get(f"{API}/public/seo/meta", params={"path": "/gallery"}).json()
        assert m["title"] == "Gallery | TEST_Kreation Hotel"
        m2 = requests.get(f"{API}/public/seo/meta", params={"path": "/privacy-policy"}).json()
        assert m2["title"] == "Privacy Policy | TEST_Kreation Hotel"
        m3 = requests.get(f"{API}/public/seo/meta", params={"path": "/nonexistent"}).json()
        assert m3["path"] == "/"

    def test_jsonld(self, H, original):
        j = requests.get(f"{API}/public/seo/meta", params={"path": "/"}).json()["jsonld"]
        assert j["@type"] == ["Hotel", "LodgingBusiness"]
        assert j["address"]["addressLocality"] == "Kandy"
        assert j["geo"]["latitude"] == 7.29 and j["geo"]["longitude"] == 80.63
        assert j["starRating"]["ratingValue"] == "4"
        assert j["priceRange"] == "$$"
        assert j["checkinTime"] == "14:00" and j["checkoutTime"] == "11:00"
        assert [a["name"] for a in j["amenityFeature"]] == ["Free WiFi", "Pool"]
        assert j["legalName"] == "TEST Legal Pvt"

    def test_sitemap(self, H, original):
        r = requests.get(f"{API}/public/seo/sitemap.xml")
        assert r.status_code == 200
        assert "xml" in r.headers["content-type"]
        for p in ["/", "/rooms", "/gallery", "/about", "/contact", "/terms", "/privacy-policy", "/refund-policy"]:
            assert f"<loc>https://test-hotel.example.com{p}</loc>" in r.text
        assert r.text.count("<lastmod>") == 8 and "<changefreq>" in r.text and "<priority>1.0</priority>" in r.text

    def test_robots_index(self, H, original):
        t = requests.get(f"{API}/public/seo/robots.txt").text
        assert "User-agent: *" in t and "Allow: /" in t and "Disallow: /api/" in t
        assert "Sitemap: https://test-hotel.example.com/sitemap.xml" in t

    def test_render(self, H, original):
        r = requests.get(f"{API}/public/seo/render", params={"path": "/about"})
        assert r.status_code == 200, r.text[:300]
        h = r.text
        assert len(re.findall(r"<title>", h)) == 1
        assert "<title>About Us | TEST_Kreation Hotel</title>" in h
        assert len(re.findall(r'name="description"', h)) == 1
        assert 'rel="canonical" href="https://test-hotel.example.com/about"' in h
        assert 'property="og:type" content="hotel"' in h
        assert 'name="twitter:card"' in h
        assert h.count('application/ld+json') == 1
        assert '<div id="root">' in h

    def test_robots_noindex(self, H, original):
        requests.put(f"{API}/seo/settings", headers=H, json={"robots_index": False})
        t = requests.get(f"{API}/public/seo/robots.txt").text
        assert "Disallow: /" in t and "Allow: /\n" not in t
        m = requests.get(f"{API}/public/seo/meta", params={"path": "/"}).json()
        assert m["robots"].startswith("noindex")
        requests.put(f"{API}/seo/settings", headers=H, json={"robots_index": True})


class TestUpload:
    def test_upload_png_and_fetch(self, H):
        r = requests.post(f"{API}/seo/upload-image", headers=H, files={"file": ("test.png", PNG, "image/png")})
        assert r.status_code == 200, r.text
        url = r.json()["url"]
        assert re.fullmatch(r"/api/public/seo/media/[a-f0-9]{32}\.png", url)
        g = requests.get(f"{BASE_URL}{url}")
        assert g.status_code == 200 and g.content == PNG

    def test_upload_bad_type(self, H):
        r = requests.post(f"{API}/seo/upload-image", headers=H, files={"file": ("x.txt", b"hello", "text/plain")})
        assert r.status_code == 400

    def test_upload_too_large(self, H):
        big = b"0" * (5 * 1024 * 1024 + 10)
        r = requests.post(f"{API}/seo/upload-image", headers=H, files={"file": ("big.jpg", big, "image/jpeg")})
        assert r.status_code == 400

    def test_media_traversal_404(self):
        assert requests.get(f"{API}/public/seo/media/..%2F..%2Fserver.py").status_code == 404
        assert requests.get(f"{API}/public/seo/media/{'0'*32}.png").status_code == 404
