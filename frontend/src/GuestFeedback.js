import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Star, MessageSquare, Send, TrendingUp } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ASPECTS = [
  { key: "cleanliness_rating", stat: "avg_cleanliness", label: "Cleanliness" },
  { key: "staff_rating", stat: "avg_staff", label: "Staff" },
  { key: "food_rating", stat: "avg_food", label: "Food" },
  { key: "comfort_rating", stat: "avg_comfort", label: "Comfort" },
];

const Stars = ({ value, size = "w-4 h-4" }) => (
  <span className="inline-flex">
    {[1, 2, 3, 4, 5].map((n) => (
      <Star key={n} className={`${size} ${value >= n ? "fill-amber-400 text-amber-400" : "text-gray-600"}`} />
    ))}
  </span>
);

const StatCard = ({ icon: Icon, label, value, sub, testId }) => (
  <div className="bg-gray-800 border border-gray-700 rounded-lg p-5" data-testid={testId}>
    <div className="flex items-center gap-2 text-gray-400 text-xs uppercase tracking-wider mb-2"><Icon className="w-4 h-4" />{label}</div>
    <div className="text-3xl font-bold text-white">{value}</div>
    {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
  </div>
);

const Distribution = ({ dist, total }) => (
  <div className="bg-gray-800 border border-gray-700 rounded-lg p-5 space-y-2" data-testid="feedback-distribution">
    {[5, 4, 3, 2, 1].map((n) => {
      const c = dist?.[n] || 0;
      return (
        <div key={n} className="flex items-center gap-3 text-sm">
          <span className="w-6 text-gray-300">{n}★</span>
          <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-amber-400 rounded-full transition-[width] duration-500" style={{ width: `${total ? (c * 100) / total : 0}%` }} />
          </div>
          <span className="w-8 text-right text-gray-400">{c}</span>
        </div>
      );
    })}
  </div>
);

const FeedbackRow = ({ f }) => (
  <div className="bg-gray-800 border border-gray-700 rounded-lg p-5" data-testid={`feedback-item-${f.id}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="text-white font-medium">{f.guest_name}</div>
        <div className="text-xs text-gray-400">Room {f.room_number} · {f.check_in_date} → {f.check_out_date}</div>
      </div>
      {f.status === "submitted" ? (
        <div className="text-right">
          <Stars value={f.overall_rating} size="w-5 h-5" />
          <div className="text-xs text-gray-500 mt-1">{f.submitted_at ? new Date(f.submitted_at).toLocaleDateString() : ""}</div>
        </div>
      ) : (
        <span className="text-xs px-2 py-1 rounded-full bg-gray-700 text-gray-300">
          Awaiting response · {f.email_sent ? "Email" : ""}{f.email_sent && f.sms_sent ? " + " : ""}{f.sms_sent ? "SMS" : ""}{!f.email_sent && !f.sms_sent ? "not delivered" : " sent"}
        </span>
      )}
    </div>
    {f.status === "submitted" && (
      <>
        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-xs text-gray-400">
          {ASPECTS.filter((a) => f[a.key]).map((a) => (
            <span key={a.key} className="inline-flex items-center gap-1.5">{a.label} <Stars value={f[a.key]} size="w-3 h-3" /></span>
          ))}
        </div>
        {f.comment && <p className="mt-3 text-sm text-gray-200 border-l-2 border-amber-400 pl-3 whitespace-pre-line">{f.comment}</p>}
      </>
    )}
  </div>
);

export default function GuestFeedback() {
  const [data, setData] = useState({ items: [], stats: null });
  const [filters, setFilters] = useState({ status: "submitted", rating: "", search: "", start_date: "", end_date: "" });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = { status: filters.status || undefined, search: filters.search || undefined, start_date: filters.start_date || undefined, end_date: filters.end_date || undefined };
    if (filters.rating === "positive") params.min_rating = 4;
    else if (filters.rating === "negative") params.max_rating = 2;
    else if (filters.rating) { params.min_rating = filters.rating; params.max_rating = filters.rating; }
    try {
      const r = await axios.get(`${API}/feedback`, { params });
      setData(r.data);
    } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const s = data.stats || {};
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const input = "bg-gray-700 border border-gray-600 text-white text-sm rounded-md px-3 py-2 focus:outline-none focus:border-blue-500";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" data-testid="guest-feedback-page">
      <div className="bg-gradient-to-r from-amber-700 to-orange-700 rounded-lg p-6 mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Guest Feedback</h1>
        <p className="text-amber-100 text-sm">Ratings and comments collected automatically after each check-out</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Star} label="Average rating" value={s.avg_overall ? s.avg_overall.toFixed(1) : "–"} sub={s.avg_overall ? <Stars value={Math.round(s.avg_overall)} /> : "No ratings yet"} testId="feedback-avg-overall" />
        <StatCard icon={MessageSquare} label="Responses" value={s.total_responses ?? 0} sub={`of ${s.total_requests ?? 0} requests`} testId="feedback-total-responses" />
        <StatCard icon={TrendingUp} label="Response rate" value={`${s.response_rate ?? 0}%`} testId="feedback-response-rate" />
        <Distribution dist={s.distribution} total={s.total_responses} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {ASPECTS.map((a) => (
          <div key={a.key} className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 flex items-center justify-between" data-testid={`feedback-${a.stat}`}>
            <span className="text-sm text-gray-400">{a.label}</span>
            <span className="text-lg font-semibold text-white">{s[a.stat] ? s[a.stat].toFixed(1) : "–"}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <input className={`${input} flex-1 min-w-[200px]`} placeholder="Search guest, room or comment..." value={filters.search} onChange={set("search")} data-testid="feedback-search-input" />
        <select className={input} value={filters.status} onChange={set("status")} data-testid="feedback-status-filter">
          <option value="submitted">Responses</option>
          <option value="pending">Awaiting response</option>
          <option value="">All requests</option>
        </select>
        <select className={input} value={filters.rating} onChange={set("rating")} data-testid="feedback-rating-filter">
          <option value="">Any rating</option>
          <option value="positive">Positive (4–5★)</option>
          <option value="negative">Negative (1–2★)</option>
          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} stars</option>)}
        </select>
        <input type="date" className={input} value={filters.start_date} onChange={set("start_date")} data-testid="feedback-start-date" />
        <input type="date" className={input} value={filters.end_date} onChange={set("end_date")} data-testid="feedback-end-date" />
      </div>

      {loading && !data.items.length ? (
        <div className="text-gray-400 text-center py-12">Loading...</div>
      ) : data.items.length === 0 ? (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-10 text-center text-gray-400" data-testid="feedback-empty">
          <Send className="w-8 h-8 mx-auto mb-3 text-gray-500" />
          No feedback matches these filters yet. Requests are sent automatically by email and SMS when a guest checks out.
        </div>
      ) : (
        <div className="space-y-3" data-testid="feedback-list">{data.items.map((f) => <FeedbackRow key={f.id} f={f} />)}</div>
      )}
    </div>
  );
}
