import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Globe, Share2, Building2, FileText, Upload, X, Check, Loader2, ExternalLink, Search } from "lucide-react";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND}/api`;

const AMENITIES = ["Free Wi-Fi", "Air Conditioning", "Restaurant", "Room Service", "Swimming Pool", "Free Parking", "24-hour Front Desk",
  "Airport Shuttle", "Bar", "Fitness Centre", "Spa", "Laundry Service", "Flat-screen TV", "Mini Fridge", "Family Rooms", "Non-smoking Rooms"];
const PAGE_LABELS = { "/": "Home", "/rooms": "Rooms", "/gallery": "Gallery", "/about": "About", "/contact": "Contact", "/terms": "Terms & Conditions" };

const inputCls = "w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-md px-3 py-2 focus:outline-none focus:border-blue-500 placeholder-gray-500";
const mediaUrl = (u) => (u && u.startsWith("/") ? `${BACKEND}${u}` : u);

const Field = ({ label, hint, children }) => (
  <label className="block">
    <span className="block text-sm font-medium text-gray-300 mb-1">{label}</span>
    {children}
    {hint && <span className="block text-xs text-gray-500 mt-1">{hint}</span>}
  </label>
);

const Section = ({ icon: Icon, title, subtitle, children, testId }) => (
  <section className="bg-gray-800 rounded-lg border border-gray-700 p-6" data-testid={testId}>
    <div className="flex items-start gap-3 mb-5">
      <div className="p-2 rounded-md bg-blue-600/15 text-blue-400"><Icon className="w-5 h-5" /></div>
      <div>
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        {subtitle && <p className="text-sm text-gray-400">{subtitle}</p>}
      </div>
    </div>
    <div className="space-y-4">{children}</div>
  </section>
);

export const CharCounter = ({ value, min = 150, max = 160, testId }) => {
  const n = (value || "").length;
  const state = n === 0 ? "text-gray-500" : n >= min && n <= max ? "text-emerald-400" : n > max ? "text-red-400" : "text-amber-400";
  const label = n === 0 ? "" : n >= min && n <= max ? "Optimal" : n > max ? "Too long - may be cut off" : "A bit short";
  return <span className={`text-xs ${state}`} data-testid={testId}>{n} chars {label && `· ${label}`} (optimal {min}–{max})</span>;
};

const Toggle = ({ checked, onChange, on, off, testId }) => (
  <button type="button" onClick={() => onChange(!checked)} data-testid={testId}
    className={`inline-flex items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${checked ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" : "border-red-500/50 bg-red-500/10 text-red-300"}`}>
    <span className={`relative h-5 w-9 rounded-full transition-colors ${checked ? "bg-emerald-500" : "bg-gray-600"}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
    </span>
    {checked ? on : off}
  </button>
);

const TagInput = ({ tags, onChange }) => {
  const [draft, setDraft] = useState("");
  const add = () => {
    const parts = draft.split(",").map((t) => t.trim()).filter(Boolean).filter((t) => !tags.includes(t));
    if (parts.length) onChange([...tags, ...parts]);
    setDraft("");
  };
  return (
    <div className="flex flex-wrap items-center gap-2 bg-gray-700 border border-gray-600 rounded-md px-2 py-2" data-testid="seo-keywords">
      {tags.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 bg-blue-600/20 text-blue-200 text-xs px-2 py-1 rounded-full" data-testid={`seo-keyword-${t}`}>
          {t}
          <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} className="hover:text-white" aria-label={`Remove ${t}`}><X className="w-3 h-3" /></button>
        </span>
      ))}
      <input value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={add}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } else if (e.key === "Backspace" && !draft && tags.length) onChange(tags.slice(0, -1)); }}
        placeholder={tags.length ? "Add more..." : "e.g. boutique hotel colombo, rooms in colombo 03"}
        className="flex-1 min-w-[180px] bg-transparent text-white text-sm focus:outline-none placeholder-gray-500" data-testid="seo-keyword-input" />
    </div>
  );
};

const SearchPreview = ({ title, url, description }) => (
  <div className="rounded-lg bg-white p-4 font-sans" data-testid="seo-google-preview">
    <div className="text-xs text-gray-600 truncate">{url || "https://www.example.com"}</div>
    <div className="text-[#1a0dab] text-lg leading-snug truncate">{title || "Page title"}</div>
    <div className="text-sm text-gray-700 line-clamp-2">{description || "Your meta description appears here in Google results."}</div>
  </div>
);

const ImageUpload = ({ value, onChange }) => {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const upload = async (file) => {
    if (!file) return;
    setBusy(true); setErr("");
    try {
      const fd = new FormData(); fd.append("file", file);
      const r = await axios.post(`${API}/seo/upload-image`, fd);
      onChange(r.data.url);
    } catch (e) { setErr(e.response?.data?.detail || "Upload failed"); }
    finally { setBusy(false); if (ref.current) ref.current.value = ""; }
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://... or upload an image (1200×630 recommended)" data-testid="seo-og-image-input" />
        <button type="button" onClick={() => ref.current?.click()} disabled={busy}
          className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-md bg-gray-600 hover:bg-gray-500 text-white text-sm transition-colors disabled:opacity-60" data-testid="seo-og-image-upload-btn">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload
        </button>
        <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => upload(e.target.files?.[0])} data-testid="seo-og-image-file" />
      </div>
      {err && <p className="text-xs text-red-400" data-testid="seo-og-image-error">{err}</p>}
      {value && (
        <div className="relative w-full max-w-md aspect-[1200/630] rounded-md overflow-hidden border border-gray-600 bg-gray-900">
          <img src={mediaUrl(value)} alt="Social share preview" className="w-full h-full object-cover" data-testid="seo-og-image-preview" />
          <button type="button" onClick={() => onChange("")} className="absolute top-2 right-2 p-1 rounded-full bg-black/60 text-white hover:bg-black" aria-label="Remove image" data-testid="seo-og-image-remove"><X className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  );
};

const GlobalMeta = ({ seo, set, hotelName, city }) => {
  const titlePreview = (seo.title_format || "").replace("{Hotel Name}", seo.schema.name || seo.site_title || hotelName).replace("{City}", seo.schema.city || city).replace("{Page}", "Home");
  return (
    <Section icon={Globe} title="Global Meta Settings" subtitle="Default title, description and indexing rules for search engines" testId="seo-section-global">
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Site Title" hint="Used as the brand suffix on inner pages, e.g. “Rooms & Suites | Site Title”">
          <input className={inputCls} value={seo.site_title} onChange={(e) => set({ site_title: e.target.value })} placeholder={hotelName} data-testid="seo-site-title" />
        </Field>
        <Field label="Home Title Format" hint="Placeholders: {Hotel Name}, {City}, {Page}">
          <input className={inputCls} value={seo.title_format} onChange={(e) => set({ title_format: e.target.value })} data-testid="seo-title-format" />
        </Field>
      </div>
      <Field label="Meta Description">
        <textarea rows={3} className={inputCls} value={seo.meta_description} onChange={(e) => set({ meta_description: e.target.value })} data-testid="seo-meta-description"
          placeholder="A short, compelling summary of the hotel shown under your link in Google." />
        <CharCounter value={seo.meta_description} testId="seo-meta-description-counter" />
      </Field>
      <Field label="Focus Keywords" hint="Press Enter or comma to add a keyword">
        <TagInput tags={seo.meta_keywords} onChange={(meta_keywords) => set({ meta_keywords })} />
      </Field>
      <Field label="Canonical Domain URL" hint="Your primary public address. Used for canonical links, sitemap and social cards.">
        <input className={inputCls} value={seo.canonical_url} onChange={(e) => set({ canonical_url: e.target.value })} placeholder="https://www.kreationhotels.com" data-testid="seo-canonical-url" />
      </Field>
      <div>
        <span className="block text-sm font-medium text-gray-300 mb-2">Robots Directives</span>
        <div className="flex flex-wrap gap-3">
          <Toggle checked={seo.robots_index} onChange={(robots_index) => set({ robots_index })} on="Index (visible in search)" off="No-index (hidden from search)" testId="seo-robots-index" />
          <Toggle checked={seo.robots_follow} onChange={(robots_follow) => set({ robots_follow })} on="Follow links" off="No-follow" testId="seo-robots-follow" />
        </div>
      </div>
      <div>
        <span className="block text-xs uppercase tracking-wider text-gray-500 mb-2">Google preview (Home)</span>
        <SearchPreview title={titlePreview} url={seo.canonical_url} description={seo.pages["/"]?.description || seo.meta_description} />
      </div>
    </Section>
  );
};

const SocialMeta = ({ seo, set }) => (
  <Section icon={Share2} title="Social Media / Open Graph & Twitter Cards" subtitle="How your link looks when shared on Facebook, WhatsApp, LinkedIn and X" testId="seo-section-social">
    <div className="grid md:grid-cols-2 gap-4">
      <Field label="OG Title" hint="Leave empty to use the page title">
        <input className={inputCls} value={seo.og_title} onChange={(e) => set({ og_title: e.target.value })} data-testid="seo-og-title" />
      </Field>
      <Field label="Twitter Card Format">
        <select className={inputCls} value={seo.twitter_card} onChange={(e) => set({ twitter_card: e.target.value })} data-testid="seo-twitter-card">
          <option value="summary_large_image">summary_large_image (big image)</option>
          <option value="summary">summary (small thumbnail)</option>
        </select>
      </Field>
    </div>
    <Field label="OG Description">
      <textarea rows={2} className={inputCls} value={seo.og_description} onChange={(e) => set({ og_description: e.target.value })} data-testid="seo-og-description" />
      <CharCounter value={seo.og_description} min={55} max={200} testId="seo-og-description-counter" />
    </Field>
    <Field label="X / Twitter handle (optional)">
      <input className={inputCls} value={seo.twitter_site} onChange={(e) => set({ twitter_site: e.target.value })} placeholder="@kreationhotels" data-testid="seo-twitter-site" />
    </Field>
    <Field label="Primary Social Share Image">
      <ImageUpload value={seo.og_image} onChange={(og_image) => set({ og_image })} />
    </Field>
  </Section>
);

const SchemaMeta = ({ seo, setSchema }) => {
  const sc = seo.schema;
  const f = (key, label, props = {}) => (
    <Field label={label}>
      <input className={inputCls} value={sc[key] ?? ""} onChange={(e) => setSchema({ [key]: e.target.value })} data-testid={`seo-schema-${key}`} {...props} />
    </Field>
  );
  const toggleAmenity = (a) => setSchema({ amenities: sc.amenities.includes(a) ? sc.amenities.filter((x) => x !== a) : [...sc.amenities, a] });
  return (
    <Section icon={Building2} title="Rich Snippets / Structured Data" subtitle="Schema.org Hotel details that help Google show rich hotel results" testId="seo-section-schema">
      <div className="grid md:grid-cols-2 gap-4">
        {f("name", "Official Business Name")}
        {f("legal_name", "Legal Name")}
      </div>
      <Field label="Business Description">
        <textarea rows={2} className={inputCls} value={sc.description} onChange={(e) => setSchema({ description: e.target.value })} data-testid="seo-schema-description" />
      </Field>
      <div className="grid md:grid-cols-4 gap-4">
        <div className="md:col-span-2">{f("street", "Street Address")}</div>
        {f("city", "City")}
        {f("postal_code", "Postal Code")}
        {f("country", "Country", { placeholder: "LK or Sri Lanka" })}
        {f("latitude", "Latitude", { placeholder: "6.9000", inputMode: "decimal" })}
        {f("longitude", "Longitude", { placeholder: "79.8600", inputMode: "decimal" })}
        <Field label="Star Rating">
          <select className={inputCls} value={sc.star_rating} onChange={(e) => setSchema({ star_rating: e.target.value })} data-testid="seo-schema-star_rating">
            <option value="">Not rated</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} star{n > 1 ? "s" : ""}</option>)}
          </select>
        </Field>
        {f("checkin_time", "Check-in Time", { type: "time" })}
        {f("checkout_time", "Check-out Time", { type: "time" })}
        {f("price_range", "Price Range", { placeholder: "$$ or LKR 9,500 – 25,000" })}
        {f("telephone", "Telephone")}
        <div className="md:col-span-2">{f("email", "Email", { type: "email" })}</div>
      </div>
      <div>
        <span className="block text-sm font-medium text-gray-300 mb-2">Official Amenities</span>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2" data-testid="seo-amenities">
          {AMENITIES.map((a) => {
            const on = sc.amenities.includes(a);
            return (
              <button type="button" key={a} onClick={() => toggleAmenity(a)} data-testid={`seo-amenity-${a.replace(/\W+/g, "-").toLowerCase()}`}
                className={`flex items-center gap-2 text-left text-sm px-3 py-2 rounded-md border transition-colors ${on ? "border-blue-500 bg-blue-600/15 text-white" : "border-gray-600 text-gray-400 hover:border-gray-500"}`}>
                <span className={`w-4 h-4 rounded flex items-center justify-center ${on ? "bg-blue-500" : "border border-gray-500"}`}>{on && <Check className="w-3 h-3 text-white" />}</span>
                {a}
              </button>
            );
          })}
        </div>
      </div>
    </Section>
  );
};

const PageOverrides = ({ seo, setPage, base }) => (
  <Section icon={FileText} title="Page-by-Page Overrides" subtitle="Custom titles and descriptions per page. Leave empty to use the defaults." testId="seo-section-pages">
    {Object.entries(PAGE_LABELS).map(([path, label]) => (
      <div key={path} className="rounded-md border border-gray-700 p-4 space-y-3" data-testid={`seo-page-${label.toLowerCase().replace(/\W+/g, "-")}`}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-white">{label} <span className="text-gray-500 font-normal">{path}</span></span>
          <a href={`${base}${path}`} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:text-blue-300 inline-flex items-center gap-1">Open <ExternalLink className="w-3 h-3" /></a>
        </div>
        <input className={inputCls} value={seo.pages[path]?.title || ""} onChange={(e) => setPage(path, { title: e.target.value })} placeholder="Custom meta title" data-testid={`seo-page-title-${path === "/" ? "home" : path.slice(1)}`} />
        <textarea rows={2} className={inputCls} value={seo.pages[path]?.description || ""} onChange={(e) => setPage(path, { description: e.target.value })} placeholder="Custom meta description" data-testid={`seo-page-description-${path === "/" ? "home" : path.slice(1)}`} />
        <CharCounter value={seo.pages[path]?.description} />
      </div>
    ))}
  </Section>
);

export default function SeoSettings() {
  const [seo, setSeo] = useState(null);
  const [hotel, setHotel] = useState({});
  const [status, setStatus] = useState({ saving: false, msg: "", error: false });

  useEffect(() => {
    axios.get(`${API}/seo/settings`).then((r) => setSeo(r.data)).catch(() => setStatus({ msg: "Could not load SEO settings", error: true }));
    axios.get(`${API}/public/hotel-info`).then((r) => setHotel(r.data)).catch(() => {});
  }, []);

  if (!seo) return <div className="text-gray-400 py-12 text-center" data-testid="seo-loading">{status.msg || "Loading SEO settings..."}</div>;

  const set = (patch) => setSeo((s) => ({ ...s, ...patch }));
  const setSchema = (patch) => setSeo((s) => ({ ...s, schema: { ...s.schema, ...patch } }));
  const setPage = (path, patch) => setSeo((s) => ({ ...s, pages: { ...s.pages, [path]: { ...s.pages[path], ...patch } } }));
  const save = async () => {
    setStatus({ saving: true, msg: "", error: false });
    try {
      const r = await axios.put(`${API}/seo/settings`, seo);
      setSeo(r.data);
      setStatus({ saving: false, msg: "SEO settings saved - live on the website now", error: false });
    } catch (e) {
      setStatus({ saving: false, msg: e.response?.data?.detail || "Save failed", error: true });
    }
  };
  const siteBase = (seo.canonical_url || "").replace(/\/$/, "");

  return (
    <div className="space-y-6" data-testid="seo-settings">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2"><Search className="w-5 h-5 text-blue-400" /> SEO & Search</h2>
          <p className="text-sm text-gray-400">Changes apply to the public website as soon as you save.</p>
        </div>
        <div className="flex gap-2 text-xs">
          <a href={`${API}/public/seo/sitemap.xml`} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded bg-gray-700 text-gray-200 hover:bg-gray-600 inline-flex items-center gap-1" data-testid="seo-view-sitemap">sitemap.xml <ExternalLink className="w-3 h-3" /></a>
          <a href={`${API}/public/seo/robots.txt`} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded bg-gray-700 text-gray-200 hover:bg-gray-600 inline-flex items-center gap-1" data-testid="seo-view-robots">robots.txt <ExternalLink className="w-3 h-3" /></a>
        </div>
      </div>

      <GlobalMeta seo={seo} set={set} hotelName={hotel.hotel_name || "Kreation Hotels"} city="Colombo" />
      <SocialMeta seo={seo} set={set} />
      <SchemaMeta seo={seo} setSchema={setSchema} />
      <PageOverrides seo={seo} setPage={setPage} base={siteBase} />

      <div className="sticky bottom-0 z-10 -mx-2 px-2 py-3 bg-gray-900/90 backdrop-blur border-t border-gray-700 flex flex-wrap items-center justify-end gap-3">
        {status.msg && <span className={`text-sm ${status.error ? "text-red-400" : "text-emerald-400"}`} data-testid="seo-save-status">{status.msg}</span>}
        <button onClick={save} disabled={status.saving} className="inline-flex items-center gap-2 px-5 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-60" data-testid="seo-save-btn">
          {status.saving && <Loader2 className="w-4 h-4 animate-spin" />} Save SEO Settings
        </button>
      </div>
    </div>
  );
}
