"""SEO engine: settings resolution, per-page meta, JSON-LD, sitemap, robots, server-side head injection."""
import os
import re
import json
import time
import uuid
import html as htmlmod
from pathlib import Path
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response, HTMLResponse, FileResponse

from public_routes import db

UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR") or Path(__file__).parent / "uploads")
MEDIA_PREFIX = "/api/public/seo/media/"

PAGES = {
    "/": {"name": "Home", "changefreq": "weekly", "priority": "1.0"},
    "/rooms": {"name": "Rooms & Suites", "changefreq": "weekly", "priority": "0.9"},
    "/gallery": {"name": "Gallery", "changefreq": "monthly", "priority": "0.7"},
    "/about": {"name": "About Us", "changefreq": "monthly", "priority": "0.7"},
    "/contact": {"name": "Contact", "changefreq": "monthly", "priority": "0.8"},
    "/terms": {"name": "Terms & Conditions", "changefreq": "yearly", "priority": "0.3"},
    "/privacy-policy": {"name": "Privacy Policy", "changefreq": "yearly", "priority": "0.3"},
    "/refund-policy": {"name": "Refund Policy", "changefreq": "yearly", "priority": "0.3"},
}
OVERRIDABLE_PAGES = ["/", "/rooms", "/gallery", "/about", "/contact", "/terms"]

DEFAULT_SEO = {
    "site_title": "",
    "title_format": "{Hotel Name} | Boutique Hotel in {City}",
    "meta_description": "",
    "meta_keywords": [],
    "canonical_url": "",
    "robots_index": True,
    "robots_follow": True,
    "og_title": "",
    "og_description": "",
    "og_image": "",
    "twitter_card": "summary_large_image",
    "twitter_site": "",
    "schema": {
        "name": "", "legal_name": "", "description": "",
        "street": "", "city": "", "postal_code": "", "country": "",
        "latitude": "", "longitude": "",
        "star_rating": "", "checkin_time": "", "checkout_time": "",
        "price_range": "", "telephone": "", "email": "",
        "amenities": [],
    },
    "pages": {p: {"title": "", "description": ""} for p in OVERRIDABLE_PAGES},
}


async def load_seo() -> dict:
    """Stored SEO settings merged over defaults (raw, as edited in CRM)."""
    doc = await db.seo_settings.find_one({}, {"_id": 0}) or {}
    seo = {**DEFAULT_SEO, **{k: v for k, v in doc.items() if k in DEFAULT_SEO}}
    seo["schema"] = {**DEFAULT_SEO["schema"], **(doc.get("schema") or {})}
    seo["pages"] = {p: {**DEFAULT_SEO["pages"][p], **((doc.get("pages") or {}).get(p) or {})} for p in OVERRIDABLE_PAGES}
    seo["updated_at"] = doc.get("updated_at")
    return seo


def _validate(clean: dict):
    for k, v in clean.items():
        d = DEFAULT_SEO[k]
        ok = (isinstance(v, bool) if isinstance(d, bool) else isinstance(v, list) and all(isinstance(x, str) for x in v) if isinstance(d, list)
              else isinstance(v, dict) if isinstance(d, dict) else isinstance(v, str))
        if not ok:
            raise HTTPException(status_code=422, detail=f"Invalid value for '{k}'")
    if "pages" in clean and not all(isinstance(v, dict) for v in clean["pages"].values()):
        raise HTTPException(status_code=422, detail="Invalid value for 'pages'")
    if "schema" in clean and not isinstance(clean["schema"].get("amenities", []), list):
        raise HTTPException(status_code=422, detail="Invalid value for 'schema.amenities'")


async def save_seo(data: dict, username: str) -> dict:
    clean = {k: data[k] for k in DEFAULT_SEO if k in data}
    _validate(clean)
    if "canonical_url" in clean:
        clean["canonical_url"] = (clean["canonical_url"] or "").strip().rstrip("/")
    if "meta_keywords" in clean:
        clean["meta_keywords"] = [k.strip() for k in clean["meta_keywords"] if isinstance(k, str) and k.strip()]
    if "schema" in clean:
        clean["schema"] = {k: clean["schema"].get(k, v) for k, v in DEFAULT_SEO["schema"].items()}
    if "pages" in clean:
        clean["pages"] = {p: {"title": (clean["pages"].get(p) or {}).get("title", ""), "description": (clean["pages"].get(p) or {}).get("description", "")} for p in OVERRIDABLE_PAGES}
    clean["updated_at"] = datetime.now(timezone.utc).isoformat()
    clean["updated_by"] = username
    await db.seo_settings.update_one({}, {"$set": clean}, upsert=True)
    return await load_seo()


def save_upload(content: bytes, filename: str) -> str:
    ext = Path(filename or "").suffix.lower()
    if ext not in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
        raise HTTPException(status_code=400, detail="Only JPG, PNG, WEBP or GIF images are allowed")
    magic = {".png": [b"\x89PNG"], ".jpg": [b"\xff\xd8\xff"], ".jpeg": [b"\xff\xd8\xff"], ".gif": [b"GIF8"], ".webp": [b"RIFF"]}
    if not any(content.startswith(m) for m in magic[ext]) or (ext == ".webp" and content[8:12] != b"WEBP"):
        raise HTTPException(status_code=400, detail="File content is not a valid image")
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be 5 MB or smaller")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}{ext}"
    (UPLOAD_DIR / name).write_bytes(content)
    return f"{MEDIA_PREFIX}{name}"


def _canonical_base(seo: dict, request: Request = None) -> str:
    if seo.get("canonical_url"):
        return seo["canonical_url"].rstrip("/")
    env = os.environ.get("PUBLIC_WEBSITE_URL", "").rstrip("/")
    if env:
        return env
    if request is not None:
        proto = request.headers.get("x-forwarded-proto", request.url.scheme)
        host = request.headers.get("x-forwarded-host", request.headers.get("host", ""))
        return f"{proto}://{host}"
    return ""


def _abs(url: str, base: str) -> str:
    if not url:
        return ""
    return url if url.startswith(("http://", "https://")) else f"{base}{url if url.startswith('/') else '/' + url}"


async def resolve_meta(path: str, request: Request = None) -> dict:
    """Fully-resolved head tags for a public page path."""
    path = path if path in PAGES else "/"
    seo = await load_seo()
    hotel = await db.settings.find_one({}, {"_id": 0}) or {}
    sc = seo["schema"]
    hotel_name = sc.get("name") or seo.get("site_title") or hotel.get("hotel_name") or "Kreation Hotels"
    city = sc.get("city") or "Colombo"
    page_name = PAGES[path]["name"]
    base = _canonical_base(seo, request)

    def fmt(s):
        return (s or "").replace("{Hotel Name}", hotel_name).replace("{City}", city).replace("{Page}", page_name)

    override = seo["pages"].get(path, {}) if path in OVERRIDABLE_PAGES else {}
    site_title = fmt(seo.get("title_format")) if seo.get("title_format") else (seo.get("site_title") or hotel_name)
    if override.get("title"):
        title = fmt(override["title"])
    elif path == "/":
        title = site_title
    else:
        title = f"{page_name} | {seo.get('site_title') or hotel_name}"
    description = (fmt(override.get("description")) or fmt(seo.get("meta_description")) or fmt(sc.get("description"))
                   or f"{hotel_name} - boutique hotel & restaurant in {city}. Book direct for the best rates.")
    canonical = f"{base}{path}"
    og_image = _abs(seo.get("og_image"), base)
    robots = f"{'index' if seo.get('robots_index', True) else 'noindex'}, {'follow' if seo.get('robots_follow', True) else 'nofollow'}"

    return {
        "path": path,
        "title": title,
        "description": description,
        "keywords": ", ".join(seo.get("meta_keywords") or []),
        "canonical": canonical,
        "robots": robots,
        "og": {
            "title": fmt(seo.get("og_title")) if path == "/" and seo.get("og_title") else title,
            "description": (fmt(seo.get("og_description")) if path == "/" and seo.get("og_description") else description) or fmt(seo.get("og_description")),
            "image": og_image,
            "url": canonical,
            "type": "hotel",
            "site_name": hotel_name,
        },
        "twitter": {
            "card": seo.get("twitter_card") or "summary_large_image",
            "title": fmt(seo.get("og_title")) if path == "/" and seo.get("og_title") else title,
            "description": (fmt(seo.get("og_description")) if path == "/" and seo.get("og_description") else description) or fmt(seo.get("og_description")),
            "image": og_image,
            "site": seo.get("twitter_site") or "",
        },
        "jsonld": build_jsonld(seo, hotel, hotel_name, base, og_image, fmt),
    }


def build_jsonld(seo: dict, hotel: dict, hotel_name: str, base: str, image: str, fmt=lambda s: s) -> dict:
    sc = seo["schema"]
    data = {
        "@context": "https://schema.org",
        "@type": ["Hotel", "LodgingBusiness"],
        "name": hotel_name,
        "url": base or None,
        "legalName": sc.get("legal_name") or None,
        "description": fmt(sc.get("description") or seo.get("meta_description")) or None,
        "image": image or None,
        "telephone": sc.get("telephone") or hotel.get("hotel_phone") or None,
        "email": sc.get("email") or hotel.get("hotel_email") or None,
        "priceRange": sc.get("price_range") or None,
        "checkinTime": sc.get("checkin_time") or hotel.get("check_in_time") or None,
        "checkoutTime": sc.get("checkout_time") or hotel.get("check_out_time") or None,
    }
    if any(sc.get(k) for k in ("street", "city", "postal_code", "country")):
        data["address"] = {k: v for k, v in {
            "@type": "PostalAddress", "streetAddress": sc.get("street"), "addressLocality": sc.get("city"),
            "postalCode": sc.get("postal_code"), "addressCountry": sc.get("country"),
        }.items() if v}
    elif hotel.get("hotel_address"):
        data["address"] = {"@type": "PostalAddress", "streetAddress": hotel["hotel_address"]}
    try:
        if sc.get("latitude") not in ("", None) and sc.get("longitude") not in ("", None):
            data["geo"] = {"@type": "GeoCoordinates", "latitude": float(sc["latitude"]), "longitude": float(sc["longitude"])}
    except (TypeError, ValueError):
        pass
    if sc.get("star_rating"):
        data["starRating"] = {"@type": "Rating", "ratingValue": str(sc["star_rating"])}
    if sc.get("amenities"):
        data["amenityFeature"] = [{"@type": "LocationFeatureSpecification", "name": a, "value": True} for a in sc["amenities"]]
    return {k: v for k, v in data.items() if v is not None}


def head_tags_html(meta: dict) -> str:
    e = lambda v: htmlmod.escape(str(v or ""), quote=True)
    tags = [
        f"<title>{e(meta['title'])}</title>",
        f'<meta data-seo-ssr name="description" content="{e(meta["description"])}" />',
        f'<meta data-seo-ssr name="robots" content="{e(meta["robots"])}" />',
        f'<link data-seo-ssr rel="canonical" href="{e(meta["canonical"])}" />',
    ]
    if meta.get("keywords"):
        tags.append(f'<meta data-seo-ssr name="keywords" content="{e(meta["keywords"])}" />')
    for k, v in meta["og"].items():
        if v:
            tags.append(f'<meta data-seo-ssr property="og:{k}" content="{e(v)}" />')
    for k, v in meta["twitter"].items():
        if v:
            tags.append(f'<meta data-seo-ssr name="twitter:{k}" content="{e(v)}" />')
    ld = json.dumps(meta["jsonld"], ensure_ascii=False).replace("</", "<\\/")
    tags.append(f'<script data-seo-ssr type="application/ld+json">{ld}</script>')
    return "\n    ".join(tags)


_HEAD_STRIP = [
    re.compile(r"<title>.*?</title>", re.S | re.I),
    re.compile(r'<meta\s+name="(description|keywords|robots)"[^>]*>', re.I),
    re.compile(r'<meta\s+(property|name)="(og|twitter):[^"]*"[^>]*>', re.I),
    re.compile(r'<link\s+rel="canonical"[^>]*>', re.I),
]


def inject_head(template: str, meta: dict) -> str:
    for rx in _HEAD_STRIP:
        template = rx.sub("", template)
    return template.replace("</head>", f"    {head_tags_html(meta)}\n  </head>", 1)


_template_cache = {"html": None, "at": 0.0}


async def get_index_template() -> str:
    """Built index.html fetched from the static frontend (cached 60s)."""
    if _template_cache["html"] and time.time() - _template_cache["at"] < 60:
        return _template_cache["html"]
    url = os.environ.get("WEBSITE_INDEX_URL")
    if not url:
        raise HTTPException(status_code=500, detail="WEBSITE_INDEX_URL not configured")
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(url)
        r.raise_for_status()
    _template_cache.update(html=r.text, at=time.time())
    return r.text


async def build_sitemap(request: Request = None) -> str:
    seo = await load_seo()
    base = _canonical_base(seo, request)
    lastmod = (seo.get("updated_at") or datetime.now(timezone.utc).isoformat())[:10]
    urls = "".join(
        f"  <url>\n    <loc>{htmlmod.escape(base + p)}</loc>\n    <lastmod>{lastmod}</lastmod>\n"
        f"    <changefreq>{c['changefreq']}</changefreq>\n    <priority>{c['priority']}</priority>\n  </url>\n"
        for p, c in PAGES.items()
    )
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}</urlset>\n'


async def build_robots(request: Request = None) -> str:
    seo = await load_seo()
    base = _canonical_base(seo, request)
    rules = "Allow: /\nDisallow: /api/" if seo.get("robots_index", True) else "Disallow: /"
    return f"User-agent: *\n{rules}\n\nSitemap: {base}/sitemap.xml\n"


# ---------- Public API (mounted under /api on both backends) ----------
seo_public_router = APIRouter(prefix="/public/seo", tags=["Public SEO"])


@seo_public_router.get("/meta")
async def public_meta(request: Request, path: str = "/"):
    return await resolve_meta(path, request)


@seo_public_router.get("/sitemap.xml")
async def public_sitemap(request: Request):
    return Response(await build_sitemap(request), media_type="application/xml")


@seo_public_router.get("/robots.txt")
async def public_robots(request: Request):
    return Response(await build_robots(request), media_type="text/plain")


@seo_public_router.get("/render")
async def public_render(request: Request, path: str = "/"):
    """Server-rendered index.html with page meta injected (used for previewing the SSR output)."""
    return HTMLResponse(inject_head(await get_index_template(), await resolve_meta(path, request)))


@seo_public_router.get("/media/{name}")
async def public_media(name: str):
    if not re.fullmatch(r"[a-f0-9]{32}\.(jpg|jpeg|png|webp|gif)", name):
        raise HTTPException(status_code=404, detail="Not found")
    f = UPLOAD_DIR / name
    if not f.exists():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(f, headers={"Cache-Control": "public, max-age=31536000, immutable"})


# ---------- Root-level routes (website backend only, behind nginx) ----------
seo_root_router = APIRouter(tags=["SEO Root"])


@seo_root_router.get("/sitemap.xml")
async def root_sitemap(request: Request):
    return Response(await build_sitemap(request), media_type="application/xml")


@seo_root_router.get("/robots.txt")
async def root_robots(request: Request):
    return Response(await build_robots(request), media_type="text/plain")


@seo_root_router.get("/{full_path:path}")
async def root_page(full_path: str, request: Request):
    """Serve the SPA shell with per-page meta injected; unknown paths get home meta (SPA redirects to /)."""
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")
    path = "/" + full_path.strip("/")
    return HTMLResponse(inject_head(await get_index_template(), await resolve_meta(path, request)))
