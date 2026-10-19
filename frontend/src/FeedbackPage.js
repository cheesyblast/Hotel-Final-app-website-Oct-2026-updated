import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { Star, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { LOGO_URL, FONT_SERIF, FONT_SANS } from "./Website";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ASPECTS = [
  { key: "cleanliness_rating", label: "Cleanliness" },
  { key: "staff_rating", label: "Staff & Service" },
  { key: "food_rating", label: "Food & Dining" },
  { key: "comfort_rating", label: "Room Comfort" },
];
const LABELS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

const StarInput = ({ value, onChange, size = 28, testId }) => {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)} data-testid={testId}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n === value ? null : n)} onMouseEnter={() => setHover(n)}
          className="transition-transform duration-150 hover:scale-110 focus:outline-none" aria-label={`${n} star`} data-testid={`${testId}-${n}`}>
          <Star style={{ width: size, height: size }} strokeWidth={1.5}
            className={(hover || value) >= n ? "fill-[#e41e2e] text-[#e41e2e]" : "text-gray-300"} />
        </button>
      ))}
    </div>
  );
};

const Shell = ({ children }) => (
  <div className="min-h-screen bg-[#f7f6f2]" style={{ fontFamily: FONT_SANS }}>
    <nav className="bg-white border-b border-gray-100">
      <div className="max-w-2xl mx-auto flex items-center justify-between px-6 py-3">
        <a href="/"><img src={LOGO_URL} alt="Kreation Hotels" className="h-10 sm:h-12" /></a>
        <a href="/" className="text-[#1a1464] text-sm font-semibold hover:text-[#e41e2e] transition-colors">Visit website</a>
      </div>
    </nav>
    <main className="max-w-2xl mx-auto px-5 py-10 sm:py-16">{children}</main>
  </div>
);

const Message = ({ icon: Icon, color, title, text, testId }) => (
  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center" data-testid={testId}>
    <Icon className={`w-14 h-14 mx-auto mb-4 ${color}`} strokeWidth={1.5} />
    <h1 className="text-2xl sm:text-3xl font-bold text-[#1a1464] mb-2" style={{ fontFamily: FONT_SERIF }}>{title}</h1>
    <p className="text-gray-600">{text}</p>
  </div>
);

export default function FeedbackPage() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ overall_rating: null, comment: "" });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    axios.get(`${API}/public/feedback/${token}`)
      .then((r) => { setInfo(r.data); if (r.data.status === "submitted") setDone(true); })
      .catch((e) => setError(e.response?.data?.detail || "Unable to load this feedback link."));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.overall_rating) { setError("Please choose an overall rating."); return; }
    setSubmitting(true); setError("");
    try {
      await axios.post(`${API}/public/feedback/${token}`, form);
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.detail || "Something went wrong. Please try again.");
    } finally { setSubmitting(false); }
  };

  if (!info && error) return <Shell><Message icon={AlertCircle} color="text-[#e41e2e]" title="Link not found" text={error} testId="feedback-invalid" /></Shell>;
  if (!info) return <Shell><div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-[#1a1464]" /></div></Shell>;
  if (done) return <Shell><Message icon={CheckCircle2} color="text-emerald-600" title="Thank you!" text={`Your feedback helps us make every stay at ${info.hotel_name} better.`} testId="feedback-thank-you" /></Shell>;

  return (
    <Shell>
      <div className="mb-8" style={{ animation: "fadeUp .5s ease both" }}>
        <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}`}</style>
        <p className="text-xs uppercase tracking-[0.25em] text-[#e41e2e] font-semibold mb-3">Guest feedback</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-[#1a1464] leading-tight" style={{ fontFamily: FONT_SERIF }} data-testid="feedback-title">
          How was your stay, {info.guest_name?.split(" ")[0] || "Guest"}?
        </h1>
        <p className="text-gray-600 mt-3 text-sm sm:text-base">
          Room {info.room_number} · {info.check_in_date} → {info.check_out_date}
        </p>
      </div>

      <form onSubmit={submit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-10 space-y-8" data-testid="feedback-form">
        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-3">Overall experience <span className="text-[#e41e2e]">*</span></label>
          <div className="flex flex-wrap items-center gap-4">
            <StarInput value={form.overall_rating} onChange={(v) => { setForm({ ...form, overall_rating: v }); setError(""); }} size={38} testId="feedback-overall" />
            <span className="text-sm font-medium text-[#1a1464] min-w-[80px]">{LABELS[form.overall_rating || 0]}</span>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-6">
          <p className="text-sm font-semibold text-gray-800 mb-4">Tell us a bit more <span className="text-gray-400 font-normal">(optional)</span></p>
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-5">
            {ASPECTS.map((a) => (
              <div key={a.key}>
                <p className="text-sm text-gray-600 mb-1.5">{a.label}</p>
                <StarInput value={form[a.key]} onChange={(v) => setForm({ ...form, [a.key]: v })} size={24} testId={`feedback-${a.key}`} />
              </div>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="fb-comment" className="block text-sm font-semibold text-gray-800 mb-2">Comments <span className="text-gray-400 font-normal">(optional)</span></label>
          <textarea id="fb-comment" rows={4} maxLength={2000} value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })}
            placeholder="What did you enjoy? What could we do better?"
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1464]/30 focus:border-[#1a1464] transition-colors"
            data-testid="feedback-comment" />
        </div>

        {error && <p className="text-sm text-[#e41e2e]" data-testid="feedback-error">{error}</p>}

        <button type="submit" disabled={submitting}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-[#1a1464] px-10 py-3.5 text-sm font-semibold uppercase tracking-wider text-white hover:bg-[#e41e2e] transition-colors disabled:opacity-60"
          data-testid="feedback-submit">
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Submit feedback
        </button>
      </form>
    </Shell>
  );
}
