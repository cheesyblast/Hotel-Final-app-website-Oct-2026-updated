// Public-website-only analytics: GA4, GTM, Meta Pixel and custom snippets (never loaded in the CRM)

const appendHTML = (target, html) => {
  if (!html) return;
  target.appendChild(document.createRange().createContextualFragment(html));
};

const addScript = (attrs, code) => {
  const el = document.createElement("script");
  Object.entries(attrs).forEach(([k, v]) => (el[k] = v));
  if (code) el.text = code;
  document.head.appendChild(el);
};

let injected = false;

export const injectTracking = (t) => {
  // Skip if the server already injected tracking into the HTML (production SSR)
  if (injected || !t || document.querySelector("[data-seo-tracking]")) return;
  injected = true;
  window.dataLayer = window.dataLayer || [];

  if (t.gtm_id) {
    window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
    addScript({ async: true, src: `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(t.gtm_id)}` });
  }
  if (t.ga4_id) {
    addScript({ async: true, src: `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(t.ga4_id)}` });
    window.gtag = function gtag() { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", t.ga4_id);
  }
  if (t.pixel_id) {
    /* eslint-disable */
    !function(f,b,e,v,n,t2,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t2=b.createElement(e);t2.async=!0;t2.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t2,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    window.fbq("init", t.pixel_id);
    window.fbq("track", "PageView");
  }
  const marker = document.createElement("meta");
  marker.setAttribute("name", "seo-tracking");
  marker.setAttribute("data-seo-tracking", "");
  marker.setAttribute("content", "client");
  document.head.appendChild(marker);
  appendHTML(document.head, t.head_code);
  appendHTML(document.body, t.body_code);
};

// SPA route changes (GA4 enhanced measurement tracks history changes itself)
export const trackPageView = () => {
  if (window.fbq) window.fbq("track", "PageView");
};

const TRACKED_KEY = "tracked_purchase_orders";

export const trackPurchase = ({ transaction_id, value, currency = "LKR", item_name }) => {
  const done = JSON.parse(localStorage.getItem(TRACKED_KEY) || "[]");
  if (!transaction_id || done.includes(transaction_id)) return false;
  const items = [{ item_id: item_name || "room", item_name: item_name || "Room Booking", price: value, quantity: 1 }];
  if (window.gtag) window.gtag("event", "purchase", { transaction_id, value, currency, items });
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ ecommerce: null });
  window.dataLayer.push({ event: "purchase", ecommerce: { transaction_id, value, currency, items } });
  if (window.fbq) window.fbq("track", "Purchase", { value, currency, content_name: item_name, content_type: "hotel" }, { eventID: transaction_id });
  localStorage.setItem(TRACKED_KEY, JSON.stringify([...done, transaction_id].slice(-50)));
  return true;
};
