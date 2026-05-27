import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, Phone, Plug, ShieldAlert, Star, Check,
  Building2, Users, TrendingUp, MessageCircle, Bell, Lock,
  ArrowRight, CheckCircle2,
} from 'lucide-react';

const FEATURES = [
  {
    icon: Star,
    title: 'Verified Guest Reviews',
    desc: 'Rate guests 0–6 stars across cleanliness, communication, rule adherence and property respect. Every review is tied to a confirmed stay.',
    soon: false,
  },
  {
    icon: Search,
    title: 'Instant Guest Lookup',
    desc: "Search any arriving guest by name, email or phone. See their full review history from every verified property they've ever stayed at.",
    soon: false,
  },
  {
    icon: Phone,
    title: 'Caller ID at Reception',
    desc: "When a guest calls from a known number, their full review profile surfaces instantly — before you even say hello.",
    soon: false,
  },
  {
    icon: Plug,
    title: 'Booking System Sync',
    desc: 'Webhooks and API connectors for Booking.com, Airbnb, Expedia and direct booking systems. Guests sync automatically at reservation.',
    soon: false,
  },
  {
    icon: ShieldAlert,
    title: 'High-Risk Alerts',
    desc: 'Get an email alert the moment a high-risk or below-average guest books — before they arrive at your door.',
    soon: false,
  },
  {
    icon: Lock,
    title: 'Verified Properties Only',
    desc: 'Every business on the platform is verified by our team before activation. No fake reviews, no spam accounts.',
    soon: false,
  },
];

const PAIN_POINTS = [
  {
    before: 'A guest trashes your property. You find out at checkout.',
    after: 'You see their 1.2/6 rating and three damage reports before they check in.',
  },
  {
    before: "You recognise a name from a bad stay. Can't remember which property — or prove it.",
    after: 'Their full cross-property review history is one search away, with verified stay badges.',
  },
  {
    before: 'A guest calls reception. You have no idea who they are or why they\'re calling.',
    after: 'Their profile pops up the moment their number hits your system.',
  },
  {
    before: 'Booking.com sends a new reservation. You manually check your notes. Nothing there.',
    after: 'GuestCheck auto-syncs the booking and flags any risk before your team sees the name.',
  },
];

const STATS = [
  { value: '500+', label: 'Properties on waitlist' },
  { value: '6-star', label: 'Industry-aligned rating scale' },
  { value: '24hr', label: 'Verification turnaround' },
  { value: '3', label: 'Booking platforms at launch' },
];

export default function ComingSoon() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    // Fire and forget — wire to a real list when ready
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
    }, 600);
  }

  return (
    <div className="min-h-screen bg-cream-50">

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-cream-50/90 backdrop-blur border-b border-cream-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <img src="/logo.png" alt="GuestCheck" style={{ width: 160 }} />
          <Link to="/login" className="text-sm font-medium text-brand-700 hover:text-brand-900">
            Sign in →
          </Link>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-20 lg:pt-16 lg:pb-28">
          <div className="grid lg:grid-cols-[1.1fr_1fr] gap-10 lg:gap-16 items-center">

            {/* Left */}
            <div className="relative">
              <div className="absolute -inset-x-8 -inset-y-10 bg-cream-100 rounded-[3rem] -z-0 hidden lg:block" />
              <div className="relative z-10">

                {/* Coming soon badge */}
                <div className="inline-flex items-center gap-2 bg-brand-700 text-cream-50 rounded-full px-4 py-1.5 text-sm font-medium mb-8">
                  <span className="w-2 h-2 bg-cream-200 rounded-full animate-pulse" />
                  Launching soon — join the waitlist
                </div>

                <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tight text-brand-900 leading-[1.05]">
                  Know your guests.
                </h1>

                <div className="relative inline-block mt-2 mb-6">
                  <span className="font-script text-5xl lg:text-6xl text-brand-500 leading-none">
                    Before they arrive.
                  </span>
                  <svg className="absolute left-0 -bottom-2 w-full" height="14" viewBox="0 0 360 14" preserveAspectRatio="none" fill="none">
                    <path d="M2 9 C 70 2, 150 13, 230 6 S 340 4, 358 8" stroke="#5d8142" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </div>

                <p className="mt-8 text-lg text-brand-900/70 max-w-md leading-relaxed">
                  GuestCheck is the verified guest review platform built for accommodation
                  property owners and managers. One search tells you everything you need to
                  know before you hand over the key.
                </p>

                {/* Email capture */}
                <div className="mt-10">
                  {submitted ? (
                    <div className="flex items-center gap-3 bg-brand-50 border border-brand-200 rounded-2xl px-5 py-4 max-w-md">
                      <CheckCircle2 className="w-6 h-6 text-brand-600 flex-shrink-0" />
                      <div>
                        <p className="font-semibold text-brand-900">You're on the list!</p>
                        <p className="text-sm text-brand-700/70">We'll email you the moment we launch.</p>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md">
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your@email.com"
                        className="flex-1 px-4 py-3 rounded-xl border border-cream-300 bg-white text-brand-900 placeholder-brand-900/40 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                      />
                      <button
                        type="submit"
                        disabled={loading}
                        className="btn bg-brand-700 text-cream-50 hover:bg-brand-800 font-semibold px-6 py-3 whitespace-nowrap disabled:opacity-60"
                      >
                        {loading ? 'Joining…' : 'Join waitlist'}
                      </button>
                    </form>
                  )}
                  <p className="text-xs text-brand-900/40 mt-3">No spam. One email when we launch.</p>
                </div>

              </div>
            </div>

            {/* Right: bedroom image + review card */}
            <div className="relative">
              <div className="relative aspect-[4/5] rounded-[2.5rem] overflow-hidden bg-cream-200 shadow-xl">
                <img
                  src="/hero-bedroom.jpg"
                  alt="Coastal bedroom with ocean view"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              </div>

              {/* Overlapping review card */}
              <div className="absolute -left-4 sm:-left-8 bottom-8 w-[88%] sm:w-[78%] bg-white rounded-2xl shadow-xl p-5 sm:p-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-display text-xl font-semibold text-brand-900">Oceanview Villa</p>
                    <p className="text-sm text-brand-900/60">by Seaside Stays</p>
                  </div>
                  <span className="text-xs bg-brand-50 text-brand-700 font-semibold px-2.5 py-1 rounded-full border border-brand-100">Verified</span>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="w-4 h-4 text-brand-600" fill="currentColor" />
                    ))}
                  </div>
                  <span className="font-semibold text-brand-900 text-sm">4.8/6</span>
                </div>
                <p className="text-xs text-brand-900/50 mb-3">Based on 128 guest reviews</p>
                <div className="border-t border-cream-200 pt-3 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-brand-200 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-brand-900">Sarah M. <span className="text-brand-900/40 font-normal">· May 2024</span></p>
                    <p className="text-xs text-brand-900/70 mt-0.5 italic leading-relaxed">
                      "Beautiful property, spotlessly clean. The host was incredibly helpful."
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ───────────────────────────────────────────────────────── */}
      <section className="bg-brand-900 py-10">
        <div className="max-w-5xl mx-auto px-4 grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
          {STATS.map(({ value, label }) => (
            <div key={label}>
              <div className="font-display text-3xl font-semibold text-brand-300">{value}</div>
              <div className="text-sm text-cream-50/60 mt-1">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Problem section ─────────────────────────────────────────────────── */}
      <section className="py-24 bg-brand-800 text-cream-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="font-display text-4xl sm:text-5xl font-semibold text-cream-50 mb-4">
              The hospitality industry has a blind spot.
            </h2>
            <p className="text-cream-50/60 text-lg max-w-2xl mx-auto">
              Every other industry can look up a customer's history. Accommodation properties can't.
              GuestCheck closes that gap.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-5 max-w-4xl mx-auto">
            {PAIN_POINTS.map(({ before, after }, i) => (
              <div key={i} className="bg-brand-900/50 rounded-2xl p-6 border border-brand-700">
                <div className="flex gap-3 mb-4">
                  <span className="text-red-400 text-sm font-semibold uppercase tracking-wide flex-shrink-0 mt-0.5">Before</span>
                  <p className="text-cream-50/70 text-sm leading-relaxed">{before}</p>
                </div>
                <div className="flex gap-3">
                  <span className="text-brand-300 text-sm font-semibold uppercase tracking-wide flex-shrink-0 mt-0.5">After</span>
                  <p className="text-cream-50 text-sm leading-relaxed">{after}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────────── */}
      <section id="features" className="py-24 bg-cream-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="text-brand-600 font-semibold text-sm uppercase tracking-widest mb-3">What's included at launch</p>
            <h2 className="font-display text-4xl font-semibold text-brand-900 mb-4">
              Everything you need to protect your property
            </h2>
            <p className="text-brand-900/60 text-lg max-w-2xl mx-auto">
              Built by hoteliers, for hoteliers. Every feature solves a real problem that costs properties money.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="p-7 rounded-3xl bg-white border border-cream-200 hover:shadow-lg hover:border-brand-200 transition-all group">
                <div className="w-12 h-12 bg-brand-700 rounded-full flex items-center justify-center mb-5 group-hover:bg-brand-600 transition-colors">
                  <Icon className="w-5 h-5 text-cream-50" />
                </div>
                <h3 className="font-display font-semibold text-lg text-brand-900 mb-2">{title}</h3>
                <p className="text-brand-900/60 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────────── */}
      <section className="py-24 bg-cream-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-4xl font-semibold text-center text-brand-900 mb-4">
            Up and running in minutes
          </h2>
          <p className="text-center text-brand-900/60 mb-14 max-w-xl mx-auto">
            No lengthy onboarding. No IT project. Apply, verify, connect.
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { step: '1', icon: Building2, title: 'Apply', desc: 'Register your property. Takes 5 minutes.' },
              { step: '2', icon: Check, title: 'Get verified', desc: 'Our team confirms you\'re a real accommodation business within 24 hours.' },
              { step: '3', icon: Plug, title: 'Connect', desc: 'Link Booking.com, Airbnb, or any booking system via webhook.' },
              { step: '4', icon: Search, title: 'Look up guests', desc: 'Search arriving guests and receive risk alerts before check-in.' },
            ].map(({ step, icon: Icon, title, desc }) => (
              <div key={step} className="text-center">
                <div className="w-14 h-14 bg-brand-700 text-cream-50 rounded-full flex items-center justify-center font-display text-2xl font-semibold mx-auto mb-4">
                  {step}
                </div>
                <div className="w-9 h-9 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Icon className="w-4 h-4 text-brand-700" />
                </div>
                <h3 className="font-display font-semibold text-brand-900 mb-2">{title}</h3>
                <p className="text-sm text-brand-900/60 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Who it's for ────────────────────────────────────────────────────── */}
      <section className="py-24 bg-cream-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-4xl font-semibold text-center text-brand-900 mb-4">
            Built for every type of accommodation
          </h2>
          <p className="text-center text-brand-900/60 mb-12 max-w-xl mx-auto">
            From boutique B&Bs to large hotel groups — if you take in paying guests, GuestCheck is for you.
          </p>
          <div className="grid sm:grid-cols-3 gap-5">
            {[
              { icon: Building2, type: 'Hotels & Motels', desc: 'Protect multiple rooms, coordinate reception teams, and feed data into your PMS.' },
              { icon: Users, type: 'B&Bs & Guest Houses', desc: 'Know exactly who\'s coming before you open your door. Essential for owner-operated properties.' },
              { icon: TrendingUp, type: 'Holiday & Short-Let', desc: 'Sync directly from Airbnb or Booking.com and get risk alerts before every new stay.' },
            ].map(({ icon: Icon, type, desc }) => (
              <div key={type} className="p-7 rounded-3xl bg-cream-100 border border-cream-200">
                <div className="w-12 h-12 bg-brand-700 rounded-full flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-cream-50" />
                </div>
                <h3 className="font-display font-semibold text-lg text-brand-900 mb-2">{type}</h3>
                <p className="text-sm text-brand-900/60 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing teaser ──────────────────────────────────────────────────── */}
      <section className="py-20 bg-cream-100">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-brand-600 font-semibold text-sm uppercase tracking-widest mb-3">Pricing</p>
          <h2 className="font-display text-4xl font-semibold text-brand-900 mb-4">Fair pricing. No surprises.</h2>
          <p className="text-brand-900/60 mb-10 max-w-xl mx-auto">
            Plans starting from $29/month. All plans include a 14-day free trial — no credit card required.
          </p>
          <div className="inline-flex flex-wrap justify-center gap-x-8 gap-y-4">
            {[
              'Basic — $29/mo',
              'Professional — $79/mo',
              'Enterprise — $199/mo',
            ].map((plan) => (
              <div key={plan} className="flex items-center gap-2 text-brand-900">
                <Check className="w-4 h-4 text-brand-600" />
                <span className="font-medium">{plan}</span>
              </div>
            ))}
          </div>
          <p className="text-sm text-brand-900/40 mt-6">Full pricing details available at launch.</p>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────────────── */}
      <section className="py-24 bg-brand-700 text-cream-50">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <MessageCircle className="w-12 h-12 text-brand-300 mx-auto mb-6" />
          <h2 className="font-display text-4xl sm:text-5xl font-semibold mb-4">
            Be the first to know
          </h2>
          <p className="font-script text-4xl text-brand-200 mb-6">when we launch.</p>
          <p className="text-cream-50/70 mb-10 max-w-md mx-auto leading-relaxed">
            We're putting the finishing touches on the platform. Leave your email and
            you'll be first through the door — including an extended free trial for early members.
          </p>

          {submitted ? (
            <div className="inline-flex items-center gap-3 bg-white/10 border border-white/20 rounded-2xl px-6 py-4">
              <CheckCircle2 className="w-6 h-6 text-brand-300 flex-shrink-0" />
              <div className="text-left">
                <p className="font-semibold text-cream-50">You're on the list!</p>
                <p className="text-sm text-cream-50/60">We'll be in touch very soon.</p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="flex-1 px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-cream-50 placeholder-cream-50/40 focus:outline-none focus:ring-2 focus:ring-white/40 text-sm"
              />
              <button
                type="submit"
                disabled={loading}
                className="btn bg-cream-50 text-brand-700 hover:bg-cream-100 font-semibold px-6 py-3 whitespace-nowrap disabled:opacity-60"
              >
                {loading ? 'Joining…' : (
                  <span className="flex items-center gap-2">Notify me <ArrowRight className="w-4 h-4" /></span>
                )}
              </button>
            </form>
          )}

          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-cream-50/60">
            <span className="flex items-center gap-1.5"><Bell className="w-3.5 h-3.5" /> Launch notification only</span>
            <span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> No spam, ever</span>
            <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> Extended trial for early members</span>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="bg-brand-900 text-cream-100/60 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <img src="/logo.png" alt="GuestCheck" style={{ width: 130 }} className="brightness-0 invert opacity-80" />
            <p className="text-xs">© {new Date().getFullYear()} GuestCheck Ltd. All rights reserved.</p>
            <div className="flex gap-4 text-xs">
              <a href="#" className="hover:text-cream-50">Privacy</a>
              <a href="#" className="hover:text-cream-50">Terms</a>
              <Link to="/login" className="hover:text-cream-50">Sign in</Link>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
