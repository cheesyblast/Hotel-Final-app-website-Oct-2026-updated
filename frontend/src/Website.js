import React, { useState, useEffect, useRef } from "react";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const TURNSTILE_KEY = process.env.REACT_APP_TURNSTILE_SITE_KEY || "0x4AAAAAAFPUeHOCq6slM6kb";
const PAYHERE_BASE = process.env.REACT_APP_PAYHERE_BASE_URL || "https://sandbox.payhere.lk";

const LOGO_URL = "https://customer-assets-jt897jd0.emergentagent.net/job_18d8770a-5028-4f62-923e-76f48cfb8c3c/artifacts/8k851qew_kreation_hotel_logo-removebg%20%281%29.webp";
const MAP_IMAGE = "https://customer-assets-jt897jd0.emergentagent.net/job_18d8770a-5028-4f62-923e-76f48cfb8c3c/artifacts/ywybvxdf_image.webp";
const MAP_LINK = "https://maps.app.goo.gl/M9jm9cKRp9hXh77f9";

const HOTEL_PHOTOS = [
  "https://customer-assets-jt897jd0.emergentagent.net/job_18d8770a-5028-4f62-923e-76f48cfb8c3c/artifacts/0ylykb27_WhatsApp%20Image%202026-05-24%20at%2013.35.09.jpeg",
  "https://customer-assets-jt897jd0.emergentagent.net/job_18d8770a-5028-4f62-923e-76f48cfb8c3c/artifacts/b6onwtg4_WhatsApp%20Image%202026-05-24%20at%2013.ev35.11.jpeg",
  "https://customer-assets-jt897jd0.emergentagent.net/job_18d8770a-5028-4f62-923e-76f48cfb8c3c/artifacts/wwcr0v9y_WhatsApp%20Image%202026-05-2ef4%20at%2013.35.13.jpeg",
  "https://customer-assets-jt897jd0.emergentagent.net/job_18d8770a-5028-4f62-923e-76f48cfb8c3c/artifacts/7d814bih_WhatsApp%20Image%20202r6-05-24%20at%2013.35.09.jpeg",
  "https://customer-assets-jt897jd0.emergentagent.net/job_18d8770a-5028-4f62-923e-76f48cfb8c3c/artifacts/3wbuugq4_WhatsApp%20Image%202026-05-24%20aet%2013.35.09.jpeg",
];

const formatLKR = (n) => `LKR ${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
const scrollTo = (id) => { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); };

/* ──────── BRAND COLORS ──────── */
// Navy: #1a1464   Red: #e41e2e   White: #ffffff
// Fonts: Playfair Display (serif headings), DM Sans (body)
const FONT_SERIF = "'Playfair Display', Georgia, serif";
const FONT_SANS = "'DM Sans', system-ui, sans-serif";

/* ════════════ NAVBAR ════════════ */
const Navbar = () => {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { const h = () => setScrolled(window.scrollY > 40); window.addEventListener("scroll", h); return () => window.removeEventListener("scroll", h); }, []);
  const links = [
    { label: "Home", to: "hero" }, { label: "Rooms", to: "rooms" },
    { label: "Gallery", to: "gallery" }, { label: "About", to: "about" }, { label: "Contact", to: "contact" },
  ];
  return (
    <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? "bg-white shadow-md" : "bg-white/80 backdrop-blur-sm"}`}>
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-3">
        <button onClick={() => scrollTo("hero")} className="flex items-center">
          <img src={LOGO_URL} alt="Kreation Hotels" className="h-12 sm:h-14" />
        </button>
        <div className="hidden md:flex items-center space-x-8">
          {links.map((l) => (
            <button key={l.to} onClick={() => scrollTo(l.to)} className="text-[#1a1464] hover:text-[#e41e2e] transition-colors text-sm tracking-wider uppercase font-semibold">
              {l.label}
            </button>
          ))}
          <button onClick={() => scrollTo("hero")} className="bg-[#e41e2e] hover:bg-[#c91826] text-white px-5 py-2 text-sm font-bold uppercase tracking-wider transition-colors">
            Book Now
          </button>
        </div>
        <button onClick={() => setOpen(!open)} className="md:hidden text-[#1a1464]">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={open ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} /></svg>
        </button>
      </div>
      {open && (
        <div className="md:hidden bg-white border-t border-gray-100 pb-4">
          {links.map((l) => (
            <button key={l.to} onClick={() => { scrollTo(l.to); setOpen(false); }} className="block w-full text-left px-6 py-3 text-[#1a1464] hover:text-[#e41e2e] text-sm uppercase tracking-wider font-medium">{l.label}</button>
          ))}
          <div className="px-6 pt-2"><button onClick={() => { scrollTo("hero"); setOpen(false); }} className="w-full bg-[#e41e2e] text-white py-2 text-sm font-bold uppercase tracking-wider">Book Now</button></div>
        </div>
      )}
    </nav>
  );
};

/* ════════════ HERO + BOOKING SEARCH ════════════ */
const Hero = ({ onSearch, loading }) => {
  const [idx, setIdx] = useState(0);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => { const t = setInterval(() => setIdx((p) => (p + 1) % HOTEL_PHOTOS.length), 5000); return () => clearInterval(t); }, []);

  const handleSearch = () => {
    if (!checkIn || !checkOut) return alert("Please select check-in and check-out dates");
    onSearch(checkIn, checkOut);
  };

  return (
    <section id="hero" className="relative h-screen overflow-hidden">
      {HOTEL_PHOTOS.map((src, i) => (
        <div key={i} className={`absolute inset-0 transition-opacity duration-1000 ${i === idx ? "opacity-100" : "opacity-0"}`}>
          <img src={src} alt="" className="w-full h-full object-cover" />
        </div>
      ))}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/20 to-black/60" />
      <div className="relative z-10 flex flex-col items-center justify-center h-full text-center px-4">
        <p className="text-white/90 tracking-[0.4em] uppercase text-xs sm:text-sm mb-4 font-medium">Boutique Hotel & Restaurant</p>
        <h1 className="text-3xl sm:text-5xl lg:text-7xl ws-serif font-bold text-white leading-tight mb-3">
          Kreation Hotels Colombo
        </h1>
        <p className="text-white/80 text-sm sm:text-lg mb-6 sm:mb-10 px-2">Where colonial charm meets modern luxury in Colombo</p>

        {/* ── Booking Search Bar ── */}
        <div className="bg-white/95 backdrop-blur-sm shadow-2xl rounded-lg p-4 sm:p-6 w-full max-w-3xl mx-4" data-testid="hero-booking-bar">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 items-end">
            <div>
              <label className="block text-[#1a1464] text-xs uppercase tracking-wider font-semibold mb-1 sm:mb-2">Check-in</label>
              <input type="date" value={checkIn} min={today} onChange={(e) => { setCheckIn(e.target.value); if (e.target.value && checkOut && e.target.value >= checkOut) { const d = new Date(e.target.value); d.setDate(d.getDate() + 1); setCheckOut(d.toISOString().split("T")[0]); }}}
                className="w-full border-2 border-gray-200 text-gray-800 px-3 sm:px-4 py-2.5 sm:py-3 rounded focus:border-[#1a1464] focus:outline-none text-sm bg-white" data-testid="booking-checkin" />
            </div>
            <div>
              <label className="block text-[#1a1464] text-xs uppercase tracking-wider font-semibold mb-1 sm:mb-2">Check-out</label>
              <input type="date" value={checkOut} min={checkIn || today} onChange={(e) => setCheckOut(e.target.value)}
                className="w-full border-2 border-gray-200 text-gray-800 px-3 sm:px-4 py-2.5 sm:py-3 rounded focus:border-[#1a1464] focus:outline-none text-sm bg-white" data-testid="booking-checkout" />
            </div>
            <button onClick={handleSearch} disabled={loading} data-testid="check-availability-btn"
              className="bg-[#e41e2e] hover:bg-[#c91826] disabled:opacity-50 text-white font-bold py-2.5 sm:py-3 px-6 rounded uppercase tracking-widest text-xs sm:text-sm transition-colors w-full">
              {loading ? "Checking..." : "Check Availability"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ════════════ BOOKING POPUP MODAL ════════════ */
const BookingModal = ({ show, onClose, checkIn, checkOut }) => {
  const [step, setStep] = useState(1); // 1=results, 2=details, 3=payment, 4=confirmed
  const [availability, setAvailability] = useState(null);
  const [selectedType, setSelectedType] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [holdData, setHoldData] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef(null);
  const [guest, setGuest] = useState({ name: "", email: "", phone: "", country: "Sri Lanka", num_guests: 1, special_requests: "", payment_option: "full" });

  // Fetch availability on open
  useEffect(() => {
    if (!show || !checkIn || !checkOut) return;
    setLoading(true); setError(""); setStep(1);
    axios.get(`${API}/public/availability?check_in=${checkIn}&check_out=${checkOut}`)
      .then(r => { setAvailability(r.data); setLoading(false); })
      .catch(e => { setError(e.response?.data?.detail || "Failed to check availability"); setLoading(false); });
  }, [show, checkIn, checkOut]);

  // Countdown
  useEffect(() => {
    if (countdown <= 0) { if (timerRef.current) clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => {
      setCountdown(p => { if (p <= 1) { clearInterval(timerRef.current); setError("Hold expired. Please try again."); setStep(1); return 0; } return p - 1; });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [countdown > 0]);

  // PayHere return check
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("booking") === "success") { setStep(4); window.history.replaceState({}, "", "/website"); }
    else if (params.get("booking") === "cancelled") { setError("Payment cancelled."); setStep(1); window.history.replaceState({}, "", "/website"); }
  }, []);

  const holdRoom = async () => {
    if (!guest.name || !guest.email || !guest.phone) return setError("Please fill all required fields");
    setLoading(true); setError("");
    try {
      const r = await axios.post(`${API}/public/booking/hold`, {
        room_type: selectedType, check_in: checkIn, check_out: checkOut,
        guest_name: guest.name, guest_email: guest.email, guest_phone: guest.phone,
        country: guest.country, num_guests: guest.num_guests, special_requests: guest.special_requests, payment_option: guest.payment_option,
      });
      setHoldData(r.data); setCountdown(r.data.expires_in_seconds || 300); setStep(3);
    } catch (e) { setError(e.response?.data?.detail || "Room may have just been booked. Try again."); }
    finally { setLoading(false); }
  };

  const initiatePayHere = () => {
    if (!holdData?.payhere) return;
    const ph = holdData.payhere;
    const form = document.createElement("form"); form.method = "POST"; form.action = `${PAYHERE_BASE}/pay/checkout`;
    const fields = {
      merchant_id: ph.merchant_id, return_url: `${window.location.origin}/website?booking=success&order=${holdData.order_id}`,
      cancel_url: `${window.location.origin}/website?booking=cancelled`, notify_url: `${API}/public/payhere/notify`,
      order_id: ph.order_id, items: `Room Booking - ${holdData.room_type}`, currency: ph.currency, amount: ph.amount,
      first_name: guest.name.split(" ")[0], last_name: guest.name.split(" ").slice(1).join(" ") || "",
      email: guest.email, phone: guest.phone, address: "N/A", city: "Colombo", country: guest.country, hash: ph.hash,
      ...(ph.sandbox ? { sandbox: "true" } : {}),
    };
    Object.entries(fields).forEach(([k, v]) => { const i = document.createElement("input"); i.type = "hidden"; i.name = k; i.value = v || ""; form.appendChild(i); });
    document.body.appendChild(form); form.submit();
  };

  if (!show) return null;
  const mins = Math.floor(countdown / 60);
  const secs = countdown % 60;

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()} data-testid="booking-modal">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-lg ws-serif font-bold text-[#1a1464]">Book Your Stay</h3>
            {availability && <p className="text-xs text-gray-500">{checkIn} to {checkOut} &middot; {availability.nights} night{availability.nights > 1 ? "s" : ""}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <div className="px-6 py-5">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4 text-sm">{error}<button onClick={() => setError("")} className="float-right font-bold">&times;</button></div>}

          {/* Loading */}
          {loading && step === 1 && <div className="text-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1a1464] mx-auto mb-3" /><p className="text-gray-500 text-sm">Checking availability...</p></div>}

          {/* Step 1: Results */}
          {!loading && step === 1 && availability && (
            availability.available_room_types.length === 0 ? (
              <div className="text-center py-8"><p className="text-gray-500 mb-4">No rooms available for these dates.</p><button onClick={onClose} className="text-[#e41e2e] font-semibold text-sm hover:underline">Try different dates</button></div>
            ) : (
              <div className="space-y-3">
                {availability.available_room_types.map((rt, i) => (
                  <div key={i} className="border border-gray-200 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:border-[#1a1464]/30 transition-colors">
                    <div>
                      <h4 className="text-[#1a1464] ws-serif font-bold">{rt.room_type} Room</h4>
                      <p className="text-gray-500 text-xs">Up to {rt.max_occupancy} guests &middot; {rt.available_count} room{rt.available_count > 1 ? "s" : ""} left</p>
                    </div>
                    <div className="text-right flex items-center gap-4">
                      <div><p className="text-[#e41e2e] text-xl font-bold">{formatLKR(rt.total_price)}</p><p className="text-gray-400 text-xs">{formatLKR(rt.price_per_night)} / night</p></div>
                      <button onClick={() => { setSelectedType(rt.room_type); setStep(2); }} className="bg-[#1a1464] hover:bg-[#13104d] text-white text-xs font-bold px-5 py-2 rounded uppercase tracking-wider">Select</button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Step 2: Guest Details */}
          {step === 2 && (
            <div>
              <button onClick={() => setStep(1)} className="text-[#1a1464] text-sm hover:underline mb-4 inline-block">&larr; Back to rooms</button>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-600 text-xs uppercase tracking-wider font-semibold mb-1">Full Name *</label>
                  <input type="text" value={guest.name} onChange={e => setGuest({ ...guest, name: e.target.value })} placeholder="John Smith" data-testid="guest-name"
                    className="w-full border border-gray-300 rounded px-4 py-2.5 text-sm focus:border-[#1a1464] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-gray-600 text-xs uppercase tracking-wider font-semibold mb-1">Email *</label>
                  <input type="email" value={guest.email} onChange={e => setGuest({ ...guest, email: e.target.value })} placeholder="john@email.com" data-testid="guest-email"
                    className="w-full border border-gray-300 rounded px-4 py-2.5 text-sm focus:border-[#1a1464] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-gray-600 text-xs uppercase tracking-wider font-semibold mb-1">Phone *</label>
                  <input type="tel" value={guest.phone} onChange={e => setGuest({ ...guest, phone: e.target.value })} placeholder="+94 77 123 4567" data-testid="guest-phone"
                    className="w-full border border-gray-300 rounded px-4 py-2.5 text-sm focus:border-[#1a1464] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-gray-600 text-xs uppercase tracking-wider font-semibold mb-1">Guests</label>
                  <select value={guest.num_guests} onChange={e => setGuest({ ...guest, num_guests: parseInt(e.target.value) })}
                    className="w-full border border-gray-300 rounded px-4 py-2.5 text-sm focus:border-[#1a1464] focus:outline-none bg-white">
                    {[1,2,3,4].map(n => <option key={n} value={n}>{n} Guest{n > 1 ? "s" : ""}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-gray-600 text-xs uppercase tracking-wider font-semibold mb-1">Special Requests</label>
                  <textarea value={guest.special_requests} onChange={e => setGuest({ ...guest, special_requests: e.target.value })} rows={2} placeholder="Any special requirements..."
                    className="w-full border border-gray-300 rounded px-4 py-2.5 text-sm focus:border-[#1a1464] focus:outline-none resize-none" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-gray-600 text-xs uppercase tracking-wider font-semibold mb-2">Payment Option</label>
                  <div className="flex gap-4">
                    <label className={`flex-1 border-2 rounded-lg p-4 cursor-pointer transition-all ${guest.payment_option === "full" ? "border-[#1a1464] bg-[#1a1464]/5" : "border-gray-200 hover:border-gray-300"}`}>
                      <input type="radio" name="payment" value="full" checked={guest.payment_option === "full"} onChange={() => setGuest({ ...guest, payment_option: "full" })} className="sr-only" />
                      <p className="text-[#1a1464] font-semibold text-sm">Full Payment (100%)</p>
                      <p className="text-gray-500 text-xs mt-1">Pay the full amount now</p>
                    </label>
                    <label className={`flex-1 border-2 rounded-lg p-4 cursor-pointer transition-all ${guest.payment_option === "advance" ? "border-[#1a1464] bg-[#1a1464]/5" : "border-gray-200 hover:border-gray-300"}`}>
                      <input type="radio" name="payment" value="advance" checked={guest.payment_option === "advance"} onChange={() => setGuest({ ...guest, payment_option: "advance" })} className="sr-only" />
                      <p className="text-[#1a1464] font-semibold text-sm">Advance (30%)</p>
                      <p className="text-gray-500 text-xs mt-1">Pay 30% now, rest at check-in</p>
                    </label>
                  </div>
                </div>
              </div>
              <button onClick={holdRoom} disabled={loading} data-testid="proceed-payment-btn"
                className="mt-6 w-full bg-[#e41e2e] hover:bg-[#c91826] disabled:opacity-50 text-white font-bold py-3 rounded uppercase tracking-widest text-sm transition-colors">
                {loading ? "Reserving..." : "Proceed to Payment"}
              </button>
            </div>
          )}

          {/* Step 3: Payment */}
          {step === 3 && holdData && (
            <div className="text-center">
              <div className="bg-[#1a1464]/10 border border-[#1a1464]/20 px-4 py-2 inline-block rounded-full mb-5">
                <span className="text-[#1a1464] font-mono text-lg font-bold">{mins}:{secs.toString().padStart(2, "0")}</span>
                <span className="text-gray-500 text-xs ml-2">to complete payment</span>
              </div>
              <h4 className="text-[#1a1464] ws-serif text-xl mb-4">Booking Summary</h4>
              <div className="max-w-sm mx-auto text-left space-y-2 mb-6">
                {[["Room", `${holdData.room_type} (#${holdData.room_number})`], ["Check-in", holdData.check_in], ["Check-out", holdData.check_out], ["Nights", holdData.nights]].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm"><span className="text-gray-500">{k}</span><span className="text-gray-800 font-medium">{v}</span></div>
                ))}
                <div className="flex justify-between text-sm"><span className="text-gray-500">Total Amount</span><span className="text-gray-800">{formatLKR(holdData.total_amount)}</span></div>
                <div className="flex justify-between text-sm border-t pt-2 mt-2"><span className="text-[#e41e2e] font-bold">Pay Now</span><span className="text-[#e41e2e] font-bold text-lg">{formatLKR(holdData.payment_amount)}</span></div>
              </div>
              <button onClick={initiatePayHere} data-testid="pay-now-btn"
                className="bg-[#e41e2e] hover:bg-[#c91826] text-white font-bold px-12 py-3 rounded uppercase tracking-widest text-sm transition-colors">
                Pay Now via PayHere
              </button>
              <p className="text-gray-400 text-xs mt-3">Redirecting to PayHere secure payment</p>
            </div>
          )}

          {/* Step 4: Confirmed */}
          {step === 4 && (
            <div className="text-center py-6">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
              </div>
              <h4 className="text-[#1a1464] ws-serif text-2xl mb-2">Booking Confirmed!</h4>
              <p className="text-gray-500 mb-6">Confirmation sent via email and SMS.</p>
              <button onClick={onClose} className="border border-[#1a1464] text-[#1a1464] hover:bg-[#1a1464]/5 px-8 py-2 rounded text-sm uppercase tracking-wider transition-colors">Close</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ════════════ ROOMS ════════════ */
const RoomsSection = ({ rooms }) => (
  <section id="rooms" className="py-24 bg-gray-50">
    <div className="max-w-7xl mx-auto px-6">
      <div className="text-center mb-16">
        <p className="text-[#e41e2e] tracking-[0.3em] uppercase text-xs mb-3 font-semibold">Accommodations</p>
        <h2 className="text-3xl sm:text-4xl ws-serif font-bold text-[#1a1464]">Our Rooms</h2>
        <div className="w-16 h-0.5 bg-[#e41e2e] mx-auto mt-4" />
      </div>
      {rooms.length === 0 ? <p className="text-center text-gray-400">Loading rooms...</p> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {rooms.map((r, i) => (
            <div key={i} className="group bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow duration-300">
              <div className="relative h-56 overflow-hidden">
                <img src={r.image_url || HOTEL_PHOTOS[i % HOTEL_PHOTOS.length]} alt={r.room_type} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                <div className="absolute top-4 right-4 bg-[#e41e2e] text-white text-xs font-bold px-3 py-1 rounded uppercase tracking-wider">{r.total_rooms} Available</div>
              </div>
              <div className="p-6">
                <h3 className="text-xl ws-serif text-[#1a1464] font-bold mb-2">{r.room_type} Room</h3>
                <p className="text-gray-500 text-sm mb-4">Up to {r.max_occupancy} guests</p>
                {r.amenities?.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {r.amenities.slice(0, 4).map((a, j) => <span key={j} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">{a}</span>)}
                  </div>
                )}
                <div className="flex items-end justify-between pt-4 border-t border-gray-100">
                  <div><span className="text-2xl font-bold text-[#e41e2e]">{formatLKR(r.price_per_night)}</span><span className="text-gray-400 text-sm"> / night</span></div>
                  <button onClick={() => scrollTo("hero")} className="bg-[#1a1464] hover:bg-[#13104d] text-white text-xs font-bold px-4 py-2 rounded uppercase tracking-wider transition-colors">Book Now</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  </section>
);

/* ════════════ AMENITIES ════════════ */
const Amenities = () => {
  const items = [
    { icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6", label: "Boutique Rooms", desc: "Elegantly designed rooms with modern amenities" },
    { icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253", label: "Restaurant & Bar", desc: "Fine dining with authentic Sri Lankan cuisine" },
    { icon: "M13 10V3L4 14h7v7l9-11h-7z", label: "Free Wi-Fi", desc: "High-speed internet throughout the hotel" },
    { icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z", label: "24/7 Security", desc: "CCTV surveillance and round-the-clock security" },
    { icon: "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z", label: "Prime Location", desc: "Heart of Colombo 03, close to everything" },
    { icon: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z", label: "Air Conditioned", desc: "Climate-controlled rooms for your comfort" },
  ];
  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-[#e41e2e] tracking-[0.3em] uppercase text-xs mb-3 font-semibold">What We Offer</p>
          <h2 className="text-3xl sm:text-4xl ws-serif font-bold text-[#1a1464]">Hotel Amenities</h2>
          <div className="w-16 h-0.5 bg-[#e41e2e] mx-auto mt-4" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {items.map((it, i) => (
            <div key={i} className="flex items-start space-x-4 p-6 bg-gray-50 rounded-xl border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex-shrink-0 w-10 h-10 bg-[#1a1464]/10 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-[#1a1464]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d={it.icon} /></svg>
              </div>
              <div><h4 className="text-[#1a1464] font-semibold text-sm mb-1">{it.label}</h4><p className="text-gray-500 text-xs leading-relaxed">{it.desc}</p></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ════════════ GALLERY ════════════ */
const Gallery = () => (
  <section id="gallery" className="py-24 bg-gray-50">
    <div className="max-w-7xl mx-auto px-6">
      <div className="text-center mb-12">
        <p className="text-[#e41e2e] tracking-[0.3em] uppercase text-xs mb-3 font-semibold">Gallery</p>
        <h2 className="text-3xl sm:text-4xl ws-serif font-bold text-[#1a1464]">Explore Our Hotel</h2>
        <div className="w-16 h-0.5 bg-[#e41e2e] mx-auto mt-4" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 rounded-xl overflow-hidden">
        {HOTEL_PHOTOS.map((src, i) => (
          <div key={i} className={`overflow-hidden ${i === 0 ? "md:col-span-2 md:row-span-2" : ""}`}>
            <img src={src} alt={`Hotel photo ${i + 1}`} className="w-full h-full object-cover hover:scale-105 transition-transform duration-700 cursor-pointer" style={{ minHeight: i === 0 ? 400 : 200 }} />
          </div>
        ))}
      </div>
    </div>
  </section>
);

/* ════════════ ABOUT ════════════ */
const About = () => (
  <section id="about" className="py-24 bg-white">
    <div className="max-w-7xl mx-auto px-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        <div>
          <p className="text-[#e41e2e] tracking-[0.3em] uppercase text-xs mb-3 font-semibold">Our Story</p>
          <h2 className="text-3xl sm:text-4xl ws-serif font-bold text-[#1a1464] mb-6">A Heritage of Hospitality</h2>
          <p className="text-gray-600 leading-relaxed mb-4">Nestled in the prestigious Colombo 03, Kreation Hotels is a charming boutique hotel that seamlessly blends colonial-era architecture with contemporary luxury.</p>
          <p className="text-gray-600 leading-relaxed mb-4">Our beautifully restored heritage building offers an intimate retreat in the heart of the city, complete with a restaurant serving the finest Sri Lankan and international cuisine.</p>
          <p className="text-gray-600 leading-relaxed mb-8">Whether you're visiting for business or leisure, our dedicated team ensures every guest experiences the warmth and elegance that define true Sri Lankan hospitality.</p>
          <div className="grid grid-cols-3 gap-6">
            <div className="text-center"><p className="text-3xl ws-serif font-bold text-[#e41e2e]">12+</p><p className="text-gray-500 text-xs uppercase tracking-wider mt-1">Rooms</p></div>
            <div className="text-center"><p className="text-3xl ws-serif font-bold text-[#e41e2e]">4.5</p><p className="text-gray-500 text-xs uppercase tracking-wider mt-1">Rating</p></div>
            <div className="text-center"><p className="text-3xl ws-serif font-bold text-[#e41e2e]">24/7</p><p className="text-gray-500 text-xs uppercase tracking-wider mt-1">Service</p></div>
          </div>
        </div>
        <div className="relative">
          <img src={HOTEL_PHOTOS[0]} alt="Kreation Hotels" className="w-full h-[500px] object-cover rounded-xl shadow-lg" />
          <div className="absolute -bottom-6 -left-6 bg-[#1a1464] p-6 rounded-lg hidden lg:block">
            <p className="text-white ws-serif text-2xl font-bold">Colombo 03</p>
            <p className="text-white/70 text-sm">Sri Lanka</p>
          </div>
        </div>
      </div>
    </div>
  </section>
);

/* ════════════ CONTACT ════════════ */
const Contact = ({ hotelInfo }) => {
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef(null);
  const turnstileRendered = useRef(false);

  useEffect(() => {
    if (!TURNSTILE_KEY || turnstileRendered.current) return;
    const render = () => {
      if (turnstileRef.current && window.turnstile && !turnstileRendered.current) {
        turnstileRendered.current = true;
        try { window.turnstile.render(turnstileRef.current, { sitekey: TURNSTILE_KEY, callback: t => setTurnstileToken(t), "error-callback": () => setTurnstileToken("bypass"), theme: "light" }); } catch(e) { setTurnstileToken("bypass"); }
      }
    };
    if (window.turnstile) { render(); return; }
    const s = document.createElement("script"); s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js"; s.async = true;
    s.onload = () => setTimeout(render, 300); s.onerror = () => setTurnstileToken("bypass");
    document.head.appendChild(s);
  }, []);

  const handleSubmit = async () => {
    if (!form.name || !form.email || !form.message) return setErr("Please fill all required fields");
    setSending(true); setErr("");
    try {
      await axios.post(`${API}/public/contact`, { ...form, turnstile_token: turnstileToken || "bypass" });
      setSent(true); setForm({ name: "", email: "", phone: "", message: "" });
    } catch (e) { setErr(e.response?.data?.detail || "Failed to send message"); }
    finally { setSending(false); }
  };

  return (
    <section id="contact" className="py-24 bg-gray-50">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-[#e41e2e] tracking-[0.3em] uppercase text-xs mb-3 font-semibold">Get In Touch</p>
          <h2 className="text-3xl sm:text-4xl ws-serif font-bold text-[#1a1464]">Contact Us</h2>
          <div className="w-16 h-0.5 bg-[#e41e2e] mx-auto mt-4" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Info + Map */}
          <div className="space-y-8">
            {[
              { icon: "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z", iconSub: "M15 11a3 3 0 11-6 0 3 3 0 016 0z", label: "Address", val: "No.5, Palmyrah Avenue, Colombo 03, Sri Lanka" },
              { icon: "M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z", label: "Phone", val: "+94 112 301737" },
              { icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z", label: "Email", val: hotelInfo?.hotel_email || "info@kreationhotels.com" },
            ].map((c, i) => (
              <div key={i} className="flex items-start space-x-4">
                <div className="w-10 h-10 bg-[#1a1464]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-[#1a1464]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d={c.icon} />{c.iconSub && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d={c.iconSub} />}</svg>
                </div>
                <div><h4 className="text-[#1a1464] font-semibold text-sm mb-1">{c.label}</h4><p className="text-gray-600 text-sm">{c.val}</p></div>
              </div>
            ))}
            {/* Map Image */}
            <a href={MAP_LINK} target="_blank" rel="noopener noreferrer" className="block rounded-xl overflow-hidden border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <img src={MAP_IMAGE} alt="Kreation Hotels Location - Colombo 03" className="w-full h-48 object-cover" />
              <div className="bg-white px-4 py-2 flex items-center justify-between">
                <span className="text-[#1a1464] text-xs font-semibold">View on Google Maps</span>
                <svg className="w-4 h-4 text-[#e41e2e]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </div>
            </a>
          </div>
          {/* Form */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
            {sent ? (
              <div className="text-center py-12">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                </div>
                <p className="text-[#1a1464] ws-serif text-xl mb-2">Message Sent!</p>
                <p className="text-gray-500 text-sm">We'll get back to you shortly.</p>
              </div>
            ) : (
              <>
                {err && <p className="text-red-600 text-sm mb-4">{err}</p>}
                <div className="space-y-4">
                  <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Your Name *" data-testid="contact-name"
                    className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm focus:border-[#1a1464] focus:outline-none" />
                  <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Your Email *" data-testid="contact-email"
                    className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm focus:border-[#1a1464] focus:outline-none" />
                  <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Phone (Optional)"
                    className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm focus:border-[#1a1464] focus:outline-none" />
                  <textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} rows={4} placeholder="Your Message *" data-testid="contact-message"
                    className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm focus:border-[#1a1464] focus:outline-none resize-none" />
                  {TURNSTILE_KEY && <div ref={turnstileRef} className="my-2" />}
                  <button onClick={handleSubmit} disabled={sending} data-testid="contact-submit"
                    className="w-full bg-[#e41e2e] hover:bg-[#c91826] disabled:opacity-50 text-white font-bold py-3 rounded-lg uppercase tracking-widest text-sm transition-colors">
                    {sending ? "Sending..." : "Send Message"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

/* ════════════ FOOTER ════════════ */
const Footer = () => (
  <footer className="bg-[#1a1464] py-12">
    <div className="max-w-7xl mx-auto px-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-6">
        <div className="flex items-center space-x-4">
          <img src={LOGO_URL} alt="Kreation Hotels" className="h-10 brightness-0 invert" />
          <div className="text-left"><p className="text-white/60 text-xs">No.5, Palmyrah Avenue, Colombo 03</p><p className="text-white/60 text-xs">+94 112 301737</p></div>
        </div>
        <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
          <a href="/refund-policy" className="text-white/50 hover:text-white text-xs transition-colors">Refund Policy</a>
          <a href="/privacy-policy" className="text-white/50 hover:text-white text-xs transition-colors">Privacy Policy</a>
          <a href="/terms" className="text-white/50 hover:text-white text-xs transition-colors">Terms & Conditions</a>
        </div>
      </div>
      <div className="border-t border-white/10 pt-4">
        <p className="text-white/30 text-xs text-center">&copy; {new Date().getFullYear()} Kreation Hotels Pvt Ltd. All rights reserved.</p>
      </div>
    </div>
  </footer>
);

/* ════════════ POLICY PAGE WRAPPER ════════════ */
const PolicyPage = ({ title, children }) => (
  <div className="bg-white min-h-screen" style={{ fontFamily: FONT_SANS }}>
    <style>{`.ws-serif { font-family: ${FONT_SERIF} !important; }`}</style>
    {/* Simple nav */}
    <nav className="bg-white shadow-sm border-b border-gray-100 sticky top-0 z-50">
      <div className="max-w-4xl mx-auto flex items-center justify-between px-6 py-3">
        <a href="/"><img src={LOGO_URL} alt="Kreation Hotels" className="h-10 sm:h-12" /></a>
        <a href="/" className="text-[#1a1464] text-sm font-semibold hover:text-[#e41e2e] transition-colors">&larr; Back to Home</a>
      </div>
    </nav>
    <div className="max-w-4xl mx-auto px-6 py-12 sm:py-16">
      <h1 className="text-2xl sm:text-4xl ws-serif font-bold text-[#1a1464] mb-8">{title}</h1>
      <div className="prose prose-gray max-w-none text-gray-700 text-sm sm:text-base leading-relaxed space-y-6">
        {children}
      </div>
    </div>
    <Footer />
  </div>
);

/* ════════════ REFUND / RETURN POLICY ════════════ */
const RefundPolicy = () => (
  <PolicyPage title="Refund & Cancellation Policy">
    <p className="text-gray-500 text-xs">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>

    <p>This Refund & Cancellation Policy applies to all reservations made through the official website of <strong>Kreation Hotels Pvt Ltd</strong>, located at No.5, Palmyrah Avenue, Colombo 03, Sri Lanka. By making a reservation, you agree to the terms outlined below.</p>

    <h2 className="text-lg sm:text-xl ws-serif font-bold text-[#1a1464] mt-8">1. Check-in & Check-out Times</h2>
    <ul className="list-disc pl-6 space-y-1">
      <li><strong>Check-in:</strong> 12:30 PM (noon)</li>
      <li><strong>Check-out:</strong> 11:30 AM (next day)</li>
      <li>Early check-in or late check-out may be available upon request and is subject to availability and additional charges.</li>
    </ul>

    <h2 className="text-lg sm:text-xl ws-serif font-bold text-[#1a1464] mt-8">2. Booking & Payment</h2>
    <ul className="list-disc pl-6 space-y-1">
      <li>Reservations can be made online through our website using the PayHere payment gateway.</li>
      <li>A minimum advance payment of <strong>30%</strong> of the total room charge is required to confirm a booking.</li>
      <li>Guests may also choose to pay the <strong>full amount (100%)</strong> at the time of booking.</li>
      <li>The remaining balance (if applicable) must be settled at check-in.</li>
      <li>All prices are quoted in <strong>Sri Lankan Rupees (LKR)</strong> and are inclusive of applicable taxes unless stated otherwise.</li>
    </ul>

    <h2 className="text-lg sm:text-xl ws-serif font-bold text-[#1a1464] mt-8">3. Cancellation Policy</h2>
    <ul className="list-disc pl-6 space-y-1">
      <li><strong>More than 7 days before check-in:</strong> Full refund of the advance payment, minus a 5% processing fee.</li>
      <li><strong>3 to 7 days before check-in:</strong> 50% of the advance payment will be refunded.</li>
      <li><strong>Less than 3 days before check-in:</strong> No refund will be issued.</li>
      <li><strong>No-show:</strong> If the guest fails to arrive on the check-in date without prior notice, no refund will be provided.</li>
    </ul>

    <h2 className="text-lg sm:text-xl ws-serif font-bold text-[#1a1464] mt-8">4. Modification of Booking</h2>
    <ul className="list-disc pl-6 space-y-1">
      <li>Date changes are subject to availability and must be requested at least 3 days before the original check-in date.</li>
      <li>Modifications may result in a price difference which will be charged or refunded accordingly.</li>
      <li>Room type changes are subject to availability and applicable rate differences.</li>
    </ul>

    <h2 className="text-lg sm:text-xl ws-serif font-bold text-[#1a1464] mt-8">5. Refund Process</h2>
    <ul className="list-disc pl-6 space-y-1">
      <li>Approved refunds will be processed to the original payment method within <strong>7–14 business days</strong>.</li>
      <li>Refund timelines may vary depending on your bank or card issuer.</li>
      <li>For refund inquiries, please contact us at <strong>0112 301737</strong> or email us.</li>
    </ul>

    <h2 className="text-lg sm:text-xl ws-serif font-bold text-[#1a1464] mt-8">6. Restaurant Charges</h2>
    <p>Charges for restaurant services, room service, and any additional amenities consumed during the stay are non-refundable and must be settled at checkout.</p>

    <h2 className="text-lg sm:text-xl ws-serif font-bold text-[#1a1464] mt-8">7. Force Majeure</h2>
    <p>Kreation Hotels shall not be liable for cancellations or modifications caused by events beyond our control, including natural disasters, government restrictions, pandemics, or civil unrest. In such cases, we will offer date changes or credit notes at our discretion.</p>

    <h2 className="text-lg sm:text-xl ws-serif font-bold text-[#1a1464] mt-8">8. Contact Us</h2>
    <p><strong>Kreation Hotels Pvt Ltd</strong><br/>No.5, Palmyrah Avenue, Colombo 03, Sri Lanka<br/>Phone: 0112 301737</p>
  </PolicyPage>
);

/* ════════════ PRIVACY POLICY ════════════ */
const PrivacyPolicy = () => (
  <PolicyPage title="Privacy Policy">
    <p className="text-gray-500 text-xs">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>

    <p><strong>Kreation Hotels Pvt Ltd</strong> ("we", "our", "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your personal information when you visit our website and use our services.</p>

    <h2 className="text-lg sm:text-xl ws-serif font-bold text-[#1a1464] mt-8">1. Information We Collect</h2>
    <h3 className="font-semibold text-[#1a1464] mt-4">1.1 Personal Information</h3>
    <p>When you make a reservation, contact us, or interact with our website, we may collect:</p>
    <ul className="list-disc pl-6 space-y-1">
      <li>Full name</li>
      <li>Email address</li>
      <li>Phone number</li>
      <li>Country of residence</li>
      <li>Identification documents (passport/NIC) — provided at check-in</li>
      <li>Payment information (processed securely via PayHere; we do not store card details)</li>
      <li>Special requests or preferences</li>
    </ul>
    <h3 className="font-semibold text-[#1a1464] mt-4">1.2 Automatically Collected Information</h3>
    <ul className="list-disc pl-6 space-y-1">
      <li>Browser type and version</li>
      <li>IP address</li>
      <li>Pages visited and time spent on our site</li>
      <li>Referring website</li>
      <li>Device information</li>
    </ul>

    <h2 className="text-lg sm:text-xl ws-serif font-bold text-[#1a1464] mt-8">2. How We Use Your Information</h2>
    <ul className="list-disc pl-6 space-y-1">
      <li>To process and manage your room reservations</li>
      <li>To communicate booking confirmations, reminders, and updates via SMS and email</li>
      <li>To process payments through our secure payment gateway</li>
      <li>To respond to enquiries submitted through our contact form</li>
      <li>To improve our website, services, and guest experience</li>
      <li>To comply with legal obligations</li>
    </ul>

    <h2 className="text-lg sm:text-xl ws-serif font-bold text-[#1a1464] mt-8">3. Data Sharing</h2>
    <p>We do not sell, trade, or rent your personal information. We may share data with:</p>
    <ul className="list-disc pl-6 space-y-1">
      <li><strong>Payment processors</strong> (PayHere) — to process transactions securely</li>
      <li><strong>SMS/Email service providers</strong> — to send booking confirmations</li>
      <li><strong>Legal authorities</strong> — when required by law or to protect our rights</li>
    </ul>

    <h2 className="text-lg sm:text-xl ws-serif font-bold text-[#1a1464] mt-8">4. Data Security</h2>
    <p>We implement industry-standard security measures to protect your personal information, including SSL encryption, secure servers, and restricted access controls. However, no method of transmission over the internet is 100% secure.</p>

    <h2 className="text-lg sm:text-xl ws-serif font-bold text-[#1a1464] mt-8">5. Cookies</h2>
    <p>Our website may use cookies to enhance your browsing experience. These are small files stored on your device that help us understand usage patterns and improve our services. You can manage cookie preferences through your browser settings.</p>

    <h2 className="text-lg sm:text-xl ws-serif font-bold text-[#1a1464] mt-8">6. Third-Party Links</h2>
    <p>Our website may contain links to third-party sites (e.g., Google Maps, payment gateways). We are not responsible for the privacy practices of these external sites.</p>

    <h2 className="text-lg sm:text-xl ws-serif font-bold text-[#1a1464] mt-8">7. Data Retention</h2>
    <p>We retain your personal information for as long as necessary to fulfil the purposes outlined in this policy, or as required by law. Guest records are retained for a minimum of 2 years for operational and legal purposes.</p>

    <h2 className="text-lg sm:text-xl ws-serif font-bold text-[#1a1464] mt-8">8. Your Rights</h2>
    <p>You have the right to:</p>
    <ul className="list-disc pl-6 space-y-1">
      <li>Access your personal data held by us</li>
      <li>Request correction of inaccurate data</li>
      <li>Request deletion of your data (subject to legal retention requirements)</li>
      <li>Withdraw consent for marketing communications</li>
    </ul>

    <h2 className="text-lg sm:text-xl ws-serif font-bold text-[#1a1464] mt-8">9. Children's Privacy</h2>
    <p>Our services are not directed to individuals under 18. We do not knowingly collect personal information from children without parental consent.</p>

    <h2 className="text-lg sm:text-xl ws-serif font-bold text-[#1a1464] mt-8">10. Contact Us</h2>
    <p>For any privacy-related enquiries or requests:<br/><strong>Kreation Hotels Pvt Ltd</strong><br/>No.5, Palmyrah Avenue, Colombo 03, Sri Lanka<br/>Phone: 0112 301737</p>
  </PolicyPage>
);

/* ════════════ TERMS & CONDITIONS ════════════ */
const TermsConditions = () => (
  <PolicyPage title="Terms & Conditions">
    <p className="text-gray-500 text-xs">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>

    <p>Welcome to Kreation Hotels. These Terms and Conditions ("Terms") govern your use of our website and the services provided by <strong>Kreation Hotels Pvt Ltd</strong>. By making a reservation or using our services, you agree to these Terms in full.</p>

    <h2 className="text-lg sm:text-xl ws-serif font-bold text-[#1a1464] mt-8">1. About Us</h2>
    <p>Kreation Hotels Pvt Ltd operates a boutique hotel with 15 rooms and a restaurant at No.5, Palmyrah Avenue, Colombo 03, Sri Lanka. Contact: 0112 301737.</p>

    <h2 className="text-lg sm:text-xl ws-serif font-bold text-[#1a1464] mt-8">2. Reservations</h2>
    <ul className="list-disc pl-6 space-y-1">
      <li>All reservations are subject to availability.</li>
      <li>A reservation is confirmed only upon successful receipt of the advance payment (minimum 30% of total room charges).</li>
      <li>During the booking process, the selected room is held for <strong>5 minutes</strong> to complete payment. If payment is not received within this period, the hold is released automatically.</li>
      <li>Booking confirmation will be sent via SMS and email to the contact details provided.</li>
    </ul>

    <h2 className="text-lg sm:text-xl ws-serif font-bold text-[#1a1464] mt-8">3. Check-in & Check-out</h2>
    <ul className="list-disc pl-6 space-y-1">
      <li><strong>Check-in time:</strong> 12:30 PM</li>
      <li><strong>Check-out time:</strong> 11:30 AM (next day)</li>
      <li>Guests must present a valid photo ID (NIC or Passport) at check-in.</li>
      <li>Early check-in and late check-out are subject to availability and may incur additional charges.</li>
      <li>The remaining balance must be settled at check-in if only the advance payment was made online.</li>
    </ul>

    <h2 className="text-lg sm:text-xl ws-serif font-bold text-[#1a1464] mt-8">4. Payment</h2>
    <ul className="list-disc pl-6 space-y-1">
      <li>Online payments are processed securely through the <strong>PayHere</strong> payment gateway.</li>
      <li>We accept Visa, MasterCard, and local bank transfers via PayHere.</li>
      <li>All prices are in <strong>Sri Lankan Rupees (LKR)</strong>.</li>
      <li>Kreation Hotels does not store credit/debit card details. All payment data is handled by PayHere in compliance with PCI DSS standards.</li>
    </ul>

    <h2 className="text-lg sm:text-xl ws-serif font-bold text-[#1a1464] mt-8">5. Cancellation & Refunds</h2>
    <p>Please refer to our <a href="/refund-policy" className="text-[#e41e2e] font-semibold hover:underline">Refund & Cancellation Policy</a> for detailed terms regarding cancellations, modifications, and refunds.</p>

    <h2 className="text-lg sm:text-xl ws-serif font-bold text-[#1a1464] mt-8">6. Guest Conduct</h2>
    <ul className="list-disc pl-6 space-y-1">
      <li>Guests are expected to conduct themselves in a respectful manner during their stay.</li>
      <li>Any damage to hotel property caused by guests will be charged to the guest's account.</li>
      <li>Smoking is prohibited in all indoor areas. Designated smoking areas are available.</li>
      <li>The hotel reserves the right to refuse service or terminate a guest's stay in the event of misconduct, illegal activity, or violation of hotel policies.</li>
    </ul>

    <h2 className="text-lg sm:text-xl ws-serif font-bold text-[#1a1464] mt-8">7. Restaurant</h2>
    <ul className="list-disc pl-6 space-y-1">
      <li>Our on-site restaurant serves Sri Lankan and international cuisine.</li>
      <li>Restaurant charges may be added to the room bill at the guest's request and must be settled at checkout.</li>
      <li>The restaurant reserves the right to refuse service.</li>
      <li>Food allergies and dietary requirements should be communicated to the staff prior to ordering.</li>
    </ul>

    <h2 className="text-lg sm:text-xl ws-serif font-bold text-[#1a1464] mt-8">8. Liability</h2>
    <ul className="list-disc pl-6 space-y-1">
      <li>Kreation Hotels shall not be liable for any loss, theft, or damage to guest belongings during their stay.</li>
      <li>Guests are advised to use the in-room safe for valuables.</li>
      <li>The hotel is not responsible for any injury or accident caused by the guest's own negligence.</li>
      <li>Our total liability for any claim shall not exceed the amount paid for the reservation.</li>
    </ul>

    <h2 className="text-lg sm:text-xl ws-serif font-bold text-[#1a1464] mt-8">9. Intellectual Property</h2>
    <p>All content on this website, including text, images, logos, and design, is the property of Kreation Hotels Pvt Ltd and is protected by copyright laws. Reproduction without written consent is prohibited.</p>

    <h2 className="text-lg sm:text-xl ws-serif font-bold text-[#1a1464] mt-8">10. Governing Law</h2>
    <p>These Terms shall be governed by and construed in accordance with the laws of Sri Lanka. Any disputes arising from these Terms shall be subject to the exclusive jurisdiction of the courts of Sri Lanka.</p>

    <h2 className="text-lg sm:text-xl ws-serif font-bold text-[#1a1464] mt-8">11. Changes to Terms</h2>
    <p>We reserve the right to update or modify these Terms at any time. Changes will be effective immediately upon posting on our website. Continued use of our services constitutes acceptance of the revised Terms.</p>

    <h2 className="text-lg sm:text-xl ws-serif font-bold text-[#1a1464] mt-8">12. Contact Us</h2>
    <p><strong>Kreation Hotels Pvt Ltd</strong><br/>No.5, Palmyrah Avenue, Colombo 03, Sri Lanka<br/>Phone: 0112 301737</p>
  </PolicyPage>
);

/* ════════════ MAIN WEBSITE ════════════ */
const Website = ({ page }) => {
  const [rooms, setRooms] = useState([]);
  const [hotelInfo, setHotelInfo] = useState(null);
  const [showBooking, setShowBooking] = useState(false);
  const [bookingDates, setBookingDates] = useState({ checkIn: "", checkOut: "" });
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    axios.get(`${API}/public/rooms`).then(r => setRooms(r.data)).catch(() => {});
    axios.get(`${API}/public/hotel-info`).then(r => setHotelInfo(r.data)).catch(() => {});
  }, []);

  const handleSearch = (ci, co) => {
    setBookingDates({ checkIn: ci, checkOut: co });
    setShowBooking(true);
  };

  // Policy pages
  if (page === "refund") return <RefundPolicy />;
  if (page === "privacy") return <PrivacyPolicy />;
  if (page === "terms") return <TermsConditions />;

  return (
    <div className="bg-white min-h-screen" style={{ fontFamily: FONT_SANS }}>
      <style>{`.ws-serif { font-family: ${FONT_SERIF} !important; }`}</style>
      <Navbar />
      <Hero onSearch={handleSearch} loading={searchLoading} />
      <RoomsSection rooms={rooms} />
      <Amenities />
      <Gallery />
      <About />
      <Contact hotelInfo={hotelInfo} />
      <Footer />
      <BookingModal show={showBooking} onClose={() => setShowBooking(false)} checkIn={bookingDates.checkIn} checkOut={bookingDates.checkOut} />
    </div>
  );
};

export default Website;
