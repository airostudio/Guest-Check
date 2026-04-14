import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import toast from 'react-hot-toast';

type Step = 1 | 2 | 3;

const PROPERTY_TYPES = [
  { value: 'HOTEL', label: 'Hotel' },
  { value: 'HOSTEL', label: 'Hostel' },
  { value: 'BED_AND_BREAKFAST', label: 'B&B' },
  { value: 'VACATION_RENTAL', label: 'Vacation Rental' },
  { value: 'APARTMENT', label: 'Apartment / Serviced Apartments' },
  { value: 'BOUTIQUE_HOTEL', label: 'Boutique Hotel' },
  { value: 'RESORT', label: 'Resort' },
  { value: 'OTHER', label: 'Other' },
];

export default function Register() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    propertyName: '',
    propertyType: '',
    propertyAddress: '',
    propertyCity: '',
    propertyCountry: '',
    propertyPostcode: '',
    propertyPhone: '',
    propertyWebsite: '',
    vatNumber: '',
  });

  const update = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const nextStep = () => setStep((s) => (s < 3 ? (s + 1) as Step : s));
  const prevStep = () => setStep((s) => (s > 1 ? (s - 1) as Step : s));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/register', form);
      toast.success('Registration successful! Please check your email to verify your account.');
      navigate('/login');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Registration failed';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 to-brand-700 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 text-white">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            </div>
            <span className="text-2xl font-bold">GuestCheck</span>
          </Link>
          <p className="text-brand-200 mt-2 text-sm">Register your accommodation business</p>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                s === step ? 'bg-white text-brand-700' : s < step ? 'bg-emerald-400 text-white' : 'bg-white/20 text-white/60'
              }`}>
                {s < step ? '✓' : s}
              </div>
              {s < 3 && <div className={`w-8 h-0.5 ${s < step ? 'bg-emerald-400' : 'bg-white/20'}`} />}
            </div>
          ))}
        </div>

        <div className="card p-8">
          <form onSubmit={handleSubmit}>
            {/* Step 1: Personal Info */}
            {step === 1 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Your Account</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">First name</label>
                    <input type="text" className="input" value={form.firstName} onChange={(e) => update('firstName', e.target.value)} required />
                  </div>
                  <div>
                    <label className="label">Last name</label>
                    <input type="text" className="input" value={form.lastName} onChange={(e) => update('lastName', e.target.value)} required />
                  </div>
                </div>
                <div>
                  <label className="label">Work email</label>
                  <input type="email" className="input" placeholder="you@myproperty.com" value={form.email} onChange={(e) => update('email', e.target.value)} required />
                </div>
                <div>
                  <label className="label">Password</label>
                  <input type="password" className="input" value={form.password} onChange={(e) => update('password', e.target.value)} required minLength={8} />
                  <p className="text-xs text-slate-500 mt-1">Min 8 chars with uppercase, number, and special character</p>
                </div>
                <div>
                  <label className="label">Confirm password</label>
                  <input type="password" className="input" value={form.confirmPassword} onChange={(e) => update('confirmPassword', e.target.value)} required />
                </div>
                <button type="button" onClick={nextStep} disabled={!form.firstName || !form.email || !form.password} className="btn-primary w-full py-3">
                  Continue →
                </button>
              </div>
            )}

            {/* Step 2: Property Info */}
            {step === 2 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Your Property</h2>
                <div>
                  <label className="label">Property name</label>
                  <input type="text" className="input" placeholder="The Grand Hotel" value={form.propertyName} onChange={(e) => update('propertyName', e.target.value)} required />
                </div>
                <div>
                  <label className="label">Property type</label>
                  <select className="input" value={form.propertyType} onChange={(e) => update('propertyType', e.target.value)} required>
                    <option value="">Select type...</option>
                    {PROPERTY_TYPES.map(({ value, label }) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Street address</label>
                  <input type="text" className="input" value={form.propertyAddress} onChange={(e) => update('propertyAddress', e.target.value)} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">City</label>
                    <input type="text" className="input" value={form.propertyCity} onChange={(e) => update('propertyCity', e.target.value)} required />
                  </div>
                  <div>
                    <label className="label">Country</label>
                    <input type="text" className="input" placeholder="GB" value={form.propertyCountry} onChange={(e) => update('propertyCountry', e.target.value)} required />
                  </div>
                </div>
                <div className="flex gap-2 mt-6">
                  <button type="button" onClick={prevStep} className="btn-secondary flex-1 py-3">← Back</button>
                  <button type="button" onClick={nextStep} disabled={!form.propertyName || !form.propertyType || !form.propertyCity} className="btn-primary flex-1 py-3">Continue →</button>
                </div>
              </div>
            )}

            {/* Step 3: Verification */}
            {step === 3 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Verification Details</h2>
                <p className="text-sm text-slate-500 mb-4">
                  GuestCheck is a vetted platform. We verify all properties before activation to maintain the integrity of our review network.
                </p>
                <div>
                  <label className="label">Property phone number</label>
                  <input type="tel" className="input" placeholder="+44 20 1234 5678" value={form.propertyPhone} onChange={(e) => update('propertyPhone', e.target.value)} />
                </div>
                <div>
                  <label className="label">Property website</label>
                  <input type="url" className="input" placeholder="https://myproperty.com" value={form.propertyWebsite} onChange={(e) => update('propertyWebsite', e.target.value)} />
                </div>
                <div>
                  <label className="label">VAT / Business registration number</label>
                  <input type="text" className="input" placeholder="GB123456789" value={form.vatNumber} onChange={(e) => update('vatNumber', e.target.value)} />
                  <p className="text-xs text-slate-500 mt-1">Optional but helps speed up verification</p>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  <strong>Important:</strong> By registering, you agree to GuestCheck's Terms of Service and Privacy Policy. All reviews must be based on real guest stays. False reviews will result in immediate account suspension.
                </div>

                <div className="flex gap-2 mt-6">
                  <button type="button" onClick={prevStep} className="btn-secondary flex-1 py-3">← Back</button>
                  <button type="submit" disabled={loading} className="btn-primary flex-1 py-3">
                    {loading ? 'Registering...' : 'Submit Registration'}
                  </button>
                </div>
              </div>
            )}
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-brand-600 font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
