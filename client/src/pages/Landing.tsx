import { Link } from 'react-router-dom';
import { Search, Phone, Plug, ShieldAlert, Building2, Check, Star, ShieldCheck, Users, Home, TrendingUp, MessageCircle, BarChart3, Heart } from 'lucide-react';

const FEATURES = [
  {
    icon: Star,
    title: '0–6 Star Guest Reviews',
    desc: 'Rate guests on overall stay, cleanliness, communication, rule adherence, and property respect — aligned with industry-standard scales.',
  },
  {
    icon: Search,
    title: 'Instant Guest Lookup',
    desc: 'Search any arriving guest by name, email, or phone before they check in. See their full review history from verified properties.',
  },
  {
    icon: Phone,
    title: 'Caller ID Integration',
    desc: 'When a guest calls reception from a known number, their review profile pops up instantly — reward great guests or act early on problem ones.',
  },
  {
    icon: Plug,
    title: 'Booking System Integration',
    desc: 'Webhooks and API connectors for Booking.com, Airbnb, Expedia, and direct booking systems. Bookings sync automatically.',
  },
  {
    icon: ShieldAlert,
    title: 'High-Risk Alerts',
    desc: 'Get email alerts when a high-risk guest has an upcoming booking, protecting your property, NPS score, and other guests.',
  },
  {
    icon: Building2,
    title: 'Vetted Members Only',
    desc: 'All property listings are verified before activation. Only registered, genuine accommodation businesses can access the platform.',
  },
];

const TESTIMONIALS = [
  {
    quote: 'GuestCheck has transformed how we manage incoming guests. We stopped a significant property damage before it happened.',
    name: 'Sarah M.',
    role: 'General Manager, The Harbour Hotel',
    rating: 6,
  },
  {
    quote: "The caller ID popup at reception is brilliant. We know exactly who's calling before we even answer.",
    name: 'James T.',
    role: 'Owner, Coastal B&B',
    rating: 6,
  },
  {
    quote: 'Being able to reward our top guests with upgrades based on their GuestCheck score has been a real differentiator.',
    name: 'Emma L.',
    role: 'Front Desk Manager, City Apartments',
    rating: 5,
  },
];

const PLANS = [
  { name: 'Basic', price: '$29', period: '/mo', features: ['50 reviews/month', '100 lookups/month', '3 team members', 'Webhook integrations', 'Email support'] },
  { name: 'Professional', price: '$79', period: '/mo', popular: true, features: ['500 reviews/month', '1,000 lookups/month', '10 team members', 'Full API access', 'Caller ID phone integration', 'High-risk alerts', 'Priority support'] },
  { name: 'Enterprise', price: '$199', period: '/mo', features: ['Unlimited reviews', 'Unlimited lookups', 'Unlimited team members', 'Dedicated account manager', 'Custom SLA', '24/7 phone support'] },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-cream-50">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-cream-50/90 backdrop-blur border-b border-cream-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <img src="/logo.png" alt="GuestCheck" style={{ width: 170 }} />
          <div className="flex items-center gap-3">
            <Link to="/login" className="btn-secondary text-sm">Sign in</Link>
            <Link to="/register" className="btn-primary text-sm">Register property</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative bg-cream-50 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-20 lg:pt-16 lg:pb-28">
          <div className="grid lg:grid-cols-[1.1fr_1fr] gap-10 lg:gap-16 items-center">
            {/* Left: cream card with copy */}
            <div className="relative">
              {/* Soft cream blob behind the text */}
              <div className="absolute -inset-x-8 -inset-y-10 bg-cream-100 rounded-[3rem] -z-0 hidden lg:block" />

              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-8">
                  <div className="w-9 h-9 rounded-lg bg-brand-600 flex items-center justify-center">
                    <Check className="w-5 h-5 text-cream-50" strokeWidth={3} />
                  </div>
                  <span className="font-display text-2xl font-semibold text-brand-900">Guest Check</span>
                </div>

                <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tight text-brand-900 leading-[1.05]">
                  Real guests.
                  <br />
                  Real feedback.
                </h1>

                {/* Cursive script with hand-drawn underline */}
                <div className="relative inline-block mt-2">
                  <span className="font-script text-5xl lg:text-6xl text-brand-500 leading-none">
                    Better stays.
                  </span>
                  <svg
                    className="absolute left-0 -bottom-2 w-full"
                    height="14"
                    viewBox="0 0 320 14"
                    preserveAspectRatio="none"
                    fill="none"
                  >
                    <path
                      d="M2 9 C 60 2, 130 13, 200 6 S 300 4, 318 8"
                      stroke="#5d8142"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>

                <p className="mt-8 text-lg text-brand-900/70 max-w-md leading-relaxed">
                  Guest Check is a guest review site built for accommodation
                  property owners and managers.
                </p>

                <ul className="mt-8 space-y-5 max-w-md">
                  {[
                    {
                      icon: MessageCircle,
                      title: 'Collect genuine guest reviews',
                      desc: 'Showcase real experiences that build trust.',
                    },
                    {
                      icon: BarChart3,
                      title: 'Improve your property',
                      desc: 'Use feedback to make data-driven improvements.',
                    },
                    {
                      icon: Heart,
                      title: 'Build your reputation',
                      desc: 'Stand out, attract more guests and grow your bookings.',
                    },
                  ].map(({ icon: Icon, title, desc }) => (
                    <li key={title} className="flex items-start gap-4">
                      <div className="w-11 h-11 rounded-full bg-brand-700 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-5 h-5 text-cream-50" />
                      </div>
                      <div>
                        <p className="font-semibold text-brand-900">{title}</p>
                        <p className="text-sm text-brand-900/60 leading-snug">{desc}</p>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="mt-10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <Link
                    to="/register"
                    className="btn bg-brand-700 text-cream-50 hover:bg-brand-800 font-semibold px-8 py-3"
                  >
                    Register your property
                  </Link>
                  <a href="#features" className="text-brand-700 font-medium hover:text-brand-900">
                    Learn more →
                  </a>
                </div>
              </div>
            </div>

            {/* Right: coastal bedroom hero image with overlapping review card */}
            <div className="relative">
              <div className="relative aspect-[4/5] rounded-[2.5rem] overflow-hidden bg-cream-200 shadow-xl">
                <img
                  src="https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=900&q=80"
                  alt="Coastal bedroom with ocean view"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              </div>

              {/* Overlapping testimonial card */}
              <div className="absolute -left-4 sm:-left-8 bottom-8 w-[88%] sm:w-[78%] bg-white rounded-2xl shadow-xl p-5 sm:p-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-display text-xl font-semibold text-brand-900">
                      Oceanview Villa
                    </p>
                    <p className="text-sm text-brand-900/60">by Seaside Stays</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="w-5 h-5 text-brand-600" fill="currentColor" />
                    ))}
                  </div>
                  <span className="font-semibold text-brand-900">4.8/5</span>
                </div>
                <p className="text-xs text-brand-900/60 mb-4">Based on 128 guest reviews</p>

                <div className="border-t border-cream-200 pt-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-full bg-brand-200" />
                    <div>
                      <p className="text-sm font-semibold text-brand-900">Sarah M.</p>
                      <p className="text-xs text-brand-900/50">May 12, 2024</p>
                    </div>
                  </div>
                  <div className="flex gap-0.5 mb-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 text-brand-600" fill="currentColor" />
                    ))}
                  </div>
                  <p className="text-sm text-brand-900/80 italic">
                    "Beautiful property, spotlessly clean and an amazing view.
                    The host was incredibly helpful. We'll be back!"
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Pill row of trust attributes */}
          <div className="mt-16 lg:mt-20 flex justify-center">
            <div className="bg-brand-700 rounded-full px-8 py-5 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 shadow-lg">
              {[
                { icon: ShieldCheck, label: 'Trust & Transparency' },
                { icon: Users, label: 'Guest Powered' },
                { icon: Home, label: 'For Property Professionals' },
                { icon: TrendingUp, label: 'Grow Your Business' },
              ].map(({ icon: Icon, label }, i, arr) => (
                <div key={label} className="flex items-center gap-3 text-cream-50">
                  <div className="flex flex-col items-center gap-1">
                    <Icon className="w-5 h-5" />
                    <span className="text-xs font-medium text-center leading-tight max-w-[7rem]">{label}</span>
                  </div>
                  {i < arr.length - 1 && <span className="hidden sm:inline-block w-px h-10 bg-cream-50/30" />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-brand-900 text-cream-50 py-12">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
          {[
            { value: '2,400+', label: 'Properties' },
            { value: '180K+', label: 'Guest Reviews' },
            { value: '98%', label: 'Would Recommend' },
            { value: '$2.1M', label: 'Damage Prevented' },
          ].map(({ value, label }) => (
            <div key={label}>
              <div className="font-display text-3xl font-semibold text-brand-300">{value}</div>
              <div className="text-sm text-cream-50/60 mt-1">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 bg-cream-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="font-display text-4xl font-semibold text-brand-900 mb-4">Everything you need to protect your property</h2>
            <p className="text-lg text-brand-900/60 max-w-2xl mx-auto">
              Built by hoteliers, for hoteliers. Guest Check gives you the insights to make confident decisions.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="p-7 rounded-3xl bg-white border border-cream-200 hover:shadow-lg hover:border-brand-200 transition-all">
                <div className="w-12 h-12 bg-brand-700 rounded-full flex items-center justify-center mb-5">
                  <Icon className="w-5 h-5 text-cream-50" />
                </div>
                <h3 className="font-display font-semibold text-lg text-brand-900 mb-2">{title}</h3>
                <p className="text-brand-900/60 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 bg-cream-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-4xl font-semibold text-center text-brand-900 mb-16">How Guest Check works</h2>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { step: '1', title: 'Register & Verify', desc: 'Apply as an accommodation business. Our team verifies your property within 24 hours.' },
              { step: '2', title: 'Connect Your Systems', desc: 'Integrate with Booking.com, Airbnb, or any booking system via API or webhook.' },
              { step: '3', title: 'Leave Reviews', desc: 'After checkout, leave a 0–6 star review with detailed ratings and comments.' },
              { step: '4', title: 'Make Informed Decisions', desc: 'Look up arriving guests, see their history, and act on real-time caller ID alerts.' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="text-center">
                <div className="w-14 h-14 bg-brand-700 text-cream-50 rounded-full flex items-center justify-center font-display text-2xl font-semibold mx-auto mb-5">{step}</div>
                <h3 className="font-display font-semibold text-lg text-brand-900 mb-2">{title}</h3>
                <p className="text-sm text-brand-900/60 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 bg-cream-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-4xl font-semibold text-center text-brand-900 mb-16">Trusted by property managers</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {TESTIMONIALS.map(({ quote, name, role, rating }) => (
              <div key={name} className="p-7 rounded-3xl bg-cream-100 border border-cream-200">
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: rating }).map((_, i) => (
                    <Star key={i} className="w-4 h-4 text-brand-600" fill="currentColor" />
                  ))}
                </div>
                <p className="text-brand-900/80 italic mb-4 leading-relaxed">"{quote}"</p>
                <div>
                  <p className="font-semibold text-brand-900 text-sm">{name}</p>
                  <p className="text-xs text-brand-900/50">{role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 bg-cream-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="font-display text-4xl font-semibold text-brand-900 mb-4">Simple, transparent pricing</h2>
            <p className="text-brand-900/60">All plans include a 14-day free trial. No credit card required.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {PLANS.map(({ name, price, period, popular, features }) => (
              <div
                key={name}
                className={`rounded-3xl p-8 relative ${
                  popular
                    ? 'bg-brand-700 text-cream-50 shadow-2xl scale-105'
                    : 'bg-white border border-cream-200'
                }`}
              >
                {popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-cream-200 text-brand-900 text-xs font-semibold px-3 py-1 rounded-full">
                    Most Popular
                  </div>
                )}
                <h3 className={`font-display text-lg font-semibold mb-2 ${popular ? 'text-cream-50' : 'text-brand-900'}`}>{name}</h3>
                <div className="flex items-end gap-1 mb-6">
                  <span className={`font-display text-4xl font-semibold ${popular ? 'text-cream-50' : 'text-brand-900'}`}>{price}</span>
                  <span className={`text-sm mb-1 ${popular ? 'text-cream-200' : 'text-brand-900/50'}`}>{period}</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {features.map((f) => (
                    <li key={f} className={`flex items-center gap-2 text-sm ${popular ? 'text-cream-100' : 'text-brand-900/70'}`}>
                      <Check className={`w-4 h-4 flex-shrink-0 ${popular ? 'text-cream-200' : 'text-brand-600'}`} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/register"
                  className={`w-full block text-center py-3 rounded-full font-semibold transition-all ${
                    popular
                      ? 'bg-cream-50 text-brand-700 hover:bg-cream-100'
                      : 'bg-brand-700 text-cream-50 hover:bg-brand-800'
                  }`}
                >
                  Start Free Trial
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-brand-700 text-cream-50">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-cream-50 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-6 h-6 text-brand-700" />
            </div>
            <div>
              <p className="font-display text-2xl sm:text-3xl font-semibold leading-tight">Join Guest Check today</p>
              <Link
                to="/register"
                className="inline-block mt-2 bg-brand-500 hover:bg-brand-400 text-cream-50 text-sm font-medium px-5 py-2 rounded-full transition-colors"
              >
                www.guestcheck.site
              </Link>
            </div>
          </div>
          <div className="text-center sm:text-right">
            <p className="text-cream-100">Real feedback.</p>
            <p className="font-script text-3xl text-cream-50">Stronger hospitality.</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-brand-900 text-cream-100/70 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="GuestCheck" style={{ width: 140 }} className="brightness-0 invert opacity-90" />
            </div>
            <p className="text-xs">© {new Date().getFullYear()} GuestCheck Ltd. All rights reserved.</p>
            <div className="flex gap-4 text-xs">
              <a href="#" className="hover:text-cream-50">Privacy Policy</a>
              <a href="#" className="hover:text-cream-50">Terms of Service</a>
              <a href="#" className="hover:text-cream-50">GDPR</a>
              <a href="#" className="hover:text-cream-50">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
