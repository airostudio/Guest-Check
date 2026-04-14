import { Link } from 'react-router-dom';
import { Search, Phone, Plug, ShieldAlert, Building2, Check, Star } from 'lucide-react';

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
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <img src="/logo.png" alt="GuestCheck" style={{ width: 170 }} />
          <div className="flex items-center gap-3">
            <Link to="/login" className="btn-secondary text-sm">Sign in</Link>
            <Link to="/register" className="btn-primary text-sm">Register property</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-white rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-28 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5 text-sm mb-6">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            Trusted by 2,400+ accommodation businesses
          </div>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6 leading-tight">
            Know Your Guests
            <br />
            <span className="text-brand-300">Before They Arrive</span>
          </h1>
          <p className="text-xl text-brand-100 max-w-3xl mx-auto mb-10 leading-relaxed">
            The verified review platform built for accommodation businesses. Leave and read guest reviews,
            get real-time caller ID alerts at reception, and connect with every major booking system.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/register" className="btn bg-white text-brand-700 hover:bg-brand-50 font-semibold px-8 py-3 text-lg">
              Register Your Property — Free Trial
            </Link>
            <a href="#features" className="btn border border-white/30 text-white hover:bg-white/10 px-8 py-3 text-lg">
              Learn More
            </a>
          </div>
          <p className="text-sm text-brand-200 mt-6">No credit card required • 14-day free trial • Verified properties only</p>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-slate-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
          {[
            { value: '2,400+', label: 'Properties' },
            { value: '180K+', label: 'Guest Reviews' },
            { value: '98%', label: 'Would Recommend' },
            { value: '£2.1M', label: 'Damage Prevented' },
          ].map(({ value, label }) => (
            <div key={label}>
              <div className="text-3xl font-bold text-brand-300">{value}</div>
              <div className="text-sm text-slate-400 mt-1">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-slate-900 mb-4">Everything You Need to Protect Your Property</h2>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto">
              Built by hoteliers, for hoteliers. GuestCheck gives you the insights you need to make confident decisions.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="p-6 rounded-2xl border border-slate-100 hover:border-brand-200 hover:shadow-lg transition-all">
                <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-brand-600" />
                </div>
                <h3 className="font-semibold text-lg text-slate-900 mb-2">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl font-bold text-center text-slate-900 mb-16">How GuestCheck Works</h2>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { step: '1', title: 'Register & Verify', desc: 'Apply as an accommodation business. Our team verifies your property within 24 hours.' },
              { step: '2', title: 'Connect Your Systems', desc: 'Integrate with Booking.com, Airbnb, or any booking system via API or webhook.' },
              { step: '3', title: 'Leave Reviews', desc: 'After checkout, leave a 0–6 star review with detailed ratings and comments.' },
              { step: '4', title: 'Make Informed Decisions', desc: 'Look up arriving guests, see their history, and act on real-time caller ID alerts.' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="text-center">
                <div className="w-12 h-12 bg-brand-600 text-white rounded-xl flex items-center justify-center text-xl font-bold mx-auto mb-4">{step}</div>
                <h3 className="font-semibold text-slate-900 mb-2">{title}</h3>
                <p className="text-sm text-slate-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl font-bold text-center text-slate-900 mb-16">Trusted by Property Managers</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {TESTIMONIALS.map(({ quote, name, role, rating }) => (
              <div key={name} className="p-6 rounded-2xl bg-slate-50">
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: rating }).map((_, i) => (
                    <Star key={i} className="w-4 h-4 text-amber-400" fill="currentColor" />
                  ))}
                </div>
                <p className="text-slate-700 italic mb-4">"{quote}"</p>
                <div>
                  <p className="font-semibold text-slate-900 text-sm">{name}</p>
                  <p className="text-xs text-slate-500">{role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-slate-900 mb-4">Simple, Transparent Pricing</h2>
            <p className="text-slate-500">All plans include a 14-day free trial. No credit card required.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {PLANS.map(({ name, price, period, popular, features }) => (
              <div
                key={name}
                className={`rounded-2xl p-8 relative ${
                  popular
                    ? 'bg-brand-700 text-white shadow-2xl scale-105'
                    : 'bg-white border border-slate-200'
                }`}
              >
                {popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-400 text-slate-900 text-xs font-bold px-3 py-1 rounded-full">
                    Most Popular
                  </div>
                )}
                <h3 className={`text-lg font-bold mb-2 ${popular ? 'text-white' : 'text-slate-900'}`}>{name}</h3>
                <div className="flex items-end gap-1 mb-6">
                  <span className={`text-4xl font-extrabold ${popular ? 'text-white' : 'text-slate-900'}`}>{price}</span>
                  <span className={`text-sm mb-1 ${popular ? 'text-brand-200' : 'text-slate-500'}`}>{period}</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {features.map((f) => (
                    <li key={f} className={`flex items-center gap-2 text-sm ${popular ? 'text-brand-100' : 'text-slate-600'}`}>
                      <Check className={`w-4 h-4 flex-shrink-0 ${popular ? 'text-emerald-300' : 'text-emerald-500'}`} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/register"
                  className={`w-full block text-center py-3 rounded-xl font-semibold transition-all ${
                    popular
                      ? 'bg-white text-brand-700 hover:bg-brand-50'
                      : 'bg-brand-600 text-white hover:bg-brand-700'
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
      <section className="py-20 bg-brand-700 text-white text-center">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="text-4xl font-bold mb-4">Ready to Protect Your Property?</h2>
          <p className="text-brand-200 text-lg mb-8">Join thousands of accommodation businesses that rely on GuestCheck.</p>
          <Link to="/register" className="btn bg-white text-brand-700 hover:bg-brand-50 font-semibold px-10 py-4 text-lg">
            Register Your Property Today
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-brand-600 rounded-md" />
              <span className="font-bold text-white">GuestCheck</span>
            </div>
            <p className="text-xs">© {new Date().getFullYear()} GuestCheck Ltd. All rights reserved.</p>
            <div className="flex gap-4 text-xs">
              <a href="#" className="hover:text-white">Privacy Policy</a>
              <a href="#" className="hover:text-white">Terms of Service</a>
              <a href="#" className="hover:text-white">GDPR</a>
              <a href="#" className="hover:text-white">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
