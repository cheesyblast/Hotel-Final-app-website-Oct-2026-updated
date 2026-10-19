import React, { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

let cleaned = false;

const setJsonLd = (data) => {
  let el = document.getElementById("seo-jsonld");
  if (!el) {
    el = document.createElement("script");
    el.type = "application/ld+json";
    el.id = "seo-jsonld";
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
};

// Per-route head tags resolved by the backend from CRM SEO settings
export default function SeoHead() {
  const { pathname } = useLocation();
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    let alive = true;
    axios.get(`${API}/public/seo/meta`, { params: { path: pathname } })
      .then((r) => {
        if (!alive) return;
        if (!cleaned) {
          // Drop server-injected / static head tags once so Helmet's tags are the only copy
          document.querySelectorAll('[data-seo-ssr], head > meta[name="description"]').forEach((el) => el.remove());
          cleaned = true;
        }
        setJsonLd(r.data.jsonld);
        setMeta(r.data);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [pathname]);

  if (!meta) return null;
  const { og, twitter } = meta;
  return (
    <Helmet prioritizeSeoTags>
      <title>{meta.title}</title>
      <meta name="description" content={meta.description} />
      {meta.keywords && <meta name="keywords" content={meta.keywords} />}
      <meta name="robots" content={meta.robots} />
      <link rel="canonical" href={meta.canonical} />
      <meta property="og:type" content={og.type} />
      <meta property="og:title" content={og.title} />
      <meta property="og:description" content={og.description} />
      <meta property="og:url" content={og.url} />
      <meta property="og:site_name" content={og.site_name} />
      {og.image && <meta property="og:image" content={og.image} />}
      <meta name="twitter:card" content={twitter.card} />
      <meta name="twitter:title" content={twitter.title} />
      <meta name="twitter:description" content={twitter.description} />
      {twitter.image && <meta name="twitter:image" content={twitter.image} />}
      {twitter.site && <meta name="twitter:site" content={twitter.site} />}
    </Helmet>
  );
}
