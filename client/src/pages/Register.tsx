import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import toast from 'react-hot-toast';
import { ChevronRight, ChevronLeft, Check } from 'lucide-react';

type Step = 1 | 2 | 3;

const PROPERTY_TYPES = [
  { value: 'HOTEL', label: 'Hotel' },
  { value: 'HOSTEL', label: 'Hostel' },
  { value: 'BED_AND_BREAKFAST', label: 'B&B' },
  { value: 'VACATION_RENTAL', label: 'Vacation Rental' },
  { value: 'APARTMENT', label: 'Apartment / Serviced Apartments' },
  { value: 'BOUTIQUE_HOTEL', label: 'Boutique Hotel' },
  { value: 'RESORT', label: 'Resort' },
  { value: 'CARAVAN_PARK', label: 'Caravan Park' },
  { value: 'OTHER', label: 'Other' },
];

const STEP_LABELS = ['Your Account', 'Your Property', 'Verification'];

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
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: string, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const validateStep1 = () => {
    const e: Record<string, string> = {};
    if (!form.firstName.trim() || form.firstName.trim().length < 2) e.firstName = 'At least 2 characters';
    if (!form.lastName.trim() || form.lastName.trim().length < 2) e.lastName = 'At least 2 characters';
    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Enter a valid email address';
    if (!form.password || form.password.length < 8) e.password = 'At least 8 characters';
    if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep2 = () => {
    const e: Record<string, string> = {};
    if (!form.propertyName.trim() || form.propertyName.trim().length < 2) e.propertyName = 'At least 2 characters';
    if (!form.propertyType) e.propertyType = 'Please select a property type';
    if (!form.propertyAddress.trim() || form.propertyAddress.trim().length < 5) e.propertyAddress = 'Enter a full street address';
    if (!form.propertyCity.trim()) e.propertyCity = 'City is required';
    if (!form.propertyCountry.trim()) e.propertyCountry = 'Country is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const goNext = () => {
    if (step === 1 && validateStep1()) setStep(2);
    if (step === 2 && validateStep2()) setStep(3);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/register', form);
      toast.success('Registration successful! You can now sign in.');
      navigate('/login');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Registration failed. Please try again.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const Field = ({
    label, name, type = 'text', placeholder, required,
  }: {
    label: string; name: string; type?: string; placeholder?: string; required?: boolean;
  }) => (
    <div>
      <label className="label">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      <input
        type={type}
        className={`input ${errors[name] ? 'border-red-400 focus:ring-red-400' : ''}`}
        placeholder={placeholder}
        value={(form as Record<string, string>)[name]}
        onChange={(e) => set(name, e.target.value)}
      />
      {errors[name] && <p className="text-xs text-red-500 mt-1">{errors[name]}</p>}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 to-brand-700 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">

        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex flex-col items-center gap-2">
            <img src="/logo.png" alt="GuestCheck" style={{ width: 170, mixBlendMode: "multiply" as const }} />
          </Link>
          <p className="text-brand-200 mt-3 text-sm">Register your accommodation business</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                s < step
                  ? 'bg-emerald-400 text-white'
                  : s === step
                  ? 'bg-white text-brand-700'
                  : 'bg-white/20 text-white/50'
              }`}>
                {s < step ? <Check className="w-4 h-4" /> : s}
              </div>
              {s < 3 && (
                <div className={`w-10 h-0.5 transition-all ${s < step ? 'bg-emerald-400' : 'bg-white/20'}`} />
              )}
            </div>
          ))}
        </div>
        <p className="text-center text-white/70 text-xs mb-4">Step {step} of 3 — {STEP_LABELS[step - 1]}</p>

        <div className="card p-8">
          <form onSubmit={handleSubmit}>

            {/* ── Step 1: Account ── */}
            {step === 1 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-900 mb-1">Your Account</h2>
                <p className="text-sm text-slate-500 mb-4">This will be the primary admin login for your property.</p>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="First name" name="firstName" required />
                  <Field label="Last name" name="lastName" required />
                </div>
                <Field label="Work email" name="email" type="email" placeholder="you@myproperty.com" required />
                <Field label="Password" name="password" type="password" placeholder="Min 8 characters" required />
                <Field label="Confirm password" name="confirmPassword" type="password" required />

                <button type="button" onClick={goNext} className="btn-primary w-full py-3 flex items-center justify-center gap-2 mt-2">
                  Continue <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* ── Step 2: Property ── */}
            {step === 2 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-900 mb-1">Your Property</h2>
                <p className="text-sm text-slate-500 mb-4">Tell us about the accommodation you manage.</p>

                <Field label="Property name" name="propertyName" placeholder="The Grand Hotel" required />

                <div>
                  <label className="label">Property type <span className="text-red-500">*</span></label>
                  <select
                    className={`input ${errors.propertyType ? 'border-red-400 focus:ring-red-400' : ''}`}
                    value={form.propertyType}
                    onChange={(e) => set('propertyType', e.target.value)}
                  >
                    <option value="">Select type...</option>
                    {PROPERTY_TYPES.map(({ value, label }) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  {errors.propertyType && <p className="text-xs text-red-500 mt-1">{errors.propertyType}</p>}
                </div>

                <Field label="Street address" name="propertyAddress" placeholder="123 High Street" required />

                <div className="grid grid-cols-2 gap-4">
                  <Field label="City" name="propertyCity" required />
                  <Field label="Country" name="propertyCountry" placeholder="GB" required />
                </div>

                <Field label="Postcode" name="propertyPostcode" placeholder="SW1A 1AA" />

                <div className="flex gap-2 mt-2">
                  <button type="button" onClick={() => setStep(1)} className="btn-secondary flex-1 py-3 flex items-center justify-center gap-2">
                    <ChevronLeft className="w-4 h-4" /> Back
                  </button>
                  <button type="button" onClick={goNext} className="btn-primary flex-1 py-3 flex items-center justify-center gap-2">
                    Continue <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 3: Verification ── */}
            {step === 3 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-900 mb-1">Verification Details</h2>
                <p className="text-sm text-slate-500 mb-4">
                  All properties are reviewed by our team before activation. These details help speed that up.
                </p>

                <Field label="Property phone" name="propertyPhone" type="tel" placeholder="+44 20 1234 5678" />
                <Field label="Property website" name="propertyWebsite" type="text" placeholder="https://myproperty.com" />
                <Field label="VAT / Business registration number" name="vatNumber" placeholder="GB123456789" />

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 leading-relaxed">
                  By registering you agree to GuestCheck's Terms of Service and Privacy Policy.
                  All reviews must be based on real guest stays — false reviews result in immediate suspension.
                </div>

                <div className="flex gap-2 mt-2">
                  <button type="button" onClick={() => setStep(2)} className="btn-secondary flex-1 py-3 flex items-center justify-center gap-2">
                    <ChevronLeft className="w-4 h-4" /> Back
                  </button>
                  <button type="submit" disabled={loading} className="btn-primary flex-1 py-3">
                    {loading ? 'Registering...' : 'Submit Registration'}
                  </button>
                </div>
              </div>
            )}
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-brand-600 font-medium hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
