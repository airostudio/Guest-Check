import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { getErrorMessage } from '../api/errors';
import toast from 'react-hot-toast';
import { ChevronRight, ChevronLeft, Check, ShieldCheck, AlertTriangle } from 'lucide-react';

type Step = 1 | 2 | 3 | 4 | 5;

const STEP_LABELS = [
  'Your Details',
  'Property Info',
  'Business Identity',
  'Online Presence',
  'Declarations',
];

const PROPERTY_TYPES = [
  { value: 'HOTEL',           label: 'Hotel' },
  { value: 'BOUTIQUE_HOTEL',  label: 'Boutique Hotel' },
  { value: 'HOSTEL',          label: 'Hostel' },
  { value: 'BED_AND_BREAKFAST', label: 'Bed & Breakfast' },
  { value: 'VACATION_RENTAL', label: 'Holiday / Vacation Rental' },
  { value: 'APARTMENT',       label: 'Apartment / Serviced Apartments' },
  { value: 'RESORT',          label: 'Resort' },
  { value: 'CARAVAN_PARK',    label: 'Caravan / Holiday Park' },
  { value: 'OTHER',           label: 'Other' },
];

const ROLES = [
  'Owner / Co-owner',
  'Director / CEO',
  'General Manager',
  'Operations Manager',
  'Front Desk Manager',
  'Property Administrator',
  'Other',
];

const BOOKING_PLATFORMS = ['Booking.com', 'Airbnb', 'Expedia', 'TripAdvisor', 'Direct booking only', 'Other'];

const HOW_HEARD = [
  'Google search',
  'Industry association',
  'Referral from another property',
  'Social media',
  'Conference or trade show',
  'Other',
];

function Field({
  label, name, type = 'text', placeholder, required, value, error, onChange, hint,
}: {
  label: string; name: string; type?: string; placeholder?: string;
  required?: boolean; value: string; error?: string;
  onChange: (name: string, value: string) => void; hint?: string;
}) {
  return (
    <div>
      <label className="label">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {hint && <p className="text-xs text-slate-400 mb-1">{hint}</p>}
      <input
        type={type}
        className={`input ${error ? 'border-red-400 focus:ring-red-400' : ''}`}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

function Select({
  label, name, value, error, onChange, options, required, hint,
}: {
  label: string; name: string; value: string; error?: string;
  onChange: (name: string, value: string) => void;
  options: { value: string; label: string }[] | string[];
  required?: boolean; hint?: string;
}) {
  const normalised = (options as (string | { value: string; label: string })[]).map((o) =>
    typeof o === 'string' ? { value: o, label: o } : o
  );
  return (
    <div>
      <label className="label">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {hint && <p className="text-xs text-slate-400 mb-1">{hint}</p>}
      <select
        className={`input ${error ? 'border-red-400 focus:ring-red-400' : ''}`}
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
      >
        <option value="">Select…</option>
        {normalised.map(({ value: v, label: l }) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

function Checkbox({
  id, label, checked, onChange, error,
}: {
  id: string; label: string | React.ReactNode;
  checked: boolean; onChange: (checked: boolean) => void; error?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
        error
          ? 'border-red-300 bg-red-50'
          : checked
          ? 'border-brand-300 bg-brand-50'
          : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className={`w-5 h-5 flex-shrink-0 mt-0.5 rounded border-2 flex items-center justify-center transition-colors ${
        checked ? 'bg-brand-600 border-brand-600' : 'border-slate-300'
      }`}>
        {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
      </div>
      <input id={id} type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-sm text-slate-700 leading-relaxed">{label}</span>
    </label>
  );
}

const INITIAL_FORM = {
  // Step 1
  firstName: '', lastName: '', email: '', phone: '', jobTitle: '', password: '', confirmPassword: '',
  // Step 2
  propertyName: '', propertyType: '', numberOfRooms: '', starRating: '',
  propertyAddress: '', propertyCity: '', propertyCountry: '', propertyPostcode: '',
  propertyPhone: '', propertyWebsite: '',
  // Step 3
  legalBusinessName: '', businessRegNumber: '', vatNumber: '',
  countryOfIncorporation: '', yearsInOperation: '',
  // Step 4
  bookingPlatforms: [] as string[],
  listingUrlBookingCom: '', listingUrlAirbnb: '', listingUrlOther: '',
  industryMemberships: '', howHeard: '',
};

const INITIAL_DECLARATIONS = {
  isAuthorised: false,
  onlyRealReviews: false,
  noFalseReviews: false,
  agreeTerms: false,
  understandsReview: false,
};

export default function Register() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [declarations, setDeclarations] = useState(INITIAL_DECLARATIONS);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [declarationErrors, setDeclarationErrors] = useState<Record<string, boolean>>({});

  const set = (k: string, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const togglePlatform = (p: string) => {
    setForm((f) => ({
      ...f,
      bookingPlatforms: f.bookingPlatforms.includes(p)
        ? f.bookingPlatforms.filter((x) => x !== p)
        : [...f.bookingPlatforms, p],
    }));
  };

  // ── Validators ──────────────────────────────────────────────────────────────

  const validateStep1 = () => {
    const e: Record<string, string> = {};
    if (!form.firstName.trim() || form.firstName.trim().length < 2) e.firstName = 'At least 2 characters';
    if (!form.lastName.trim() || form.lastName.trim().length < 2) e.lastName = 'At least 2 characters';
    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Enter a valid email address';
    if (!form.phone || form.phone.trim().length < 7) e.phone = 'Enter a valid phone number';
    if (!form.jobTitle) e.jobTitle = 'Please select your role';
    // Collect all unmet requirements rather than letting each check overwrite
    // the previous message — an empty password used to report only
    // "Must include at least one number."
    const pwIssues: string[] = [];
    if (!form.password || form.password.length < 10) pwIssues.push('at least 10 characters');
    if (!/[A-Z]/.test(form.password)) pwIssues.push('an uppercase letter');
    if (!/[0-9]/.test(form.password)) pwIssues.push('a number');
    if (pwIssues.length) e.password = `Password needs ${pwIssues.join(', ')}`;
    if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep2 = () => {
    const e: Record<string, string> = {};
    if (!form.propertyName.trim() || form.propertyName.trim().length < 2) e.propertyName = 'At least 2 characters';
    if (!form.propertyType) e.propertyType = 'Please select a property type';
    if (!form.numberOfRooms || isNaN(Number(form.numberOfRooms)) || Number(form.numberOfRooms) < 1)
      e.numberOfRooms = 'Enter the number of rooms / units';
    if (!form.propertyAddress.trim() || form.propertyAddress.trim().length < 5) e.propertyAddress = 'Enter a full street address';
    if (!form.propertyCity.trim()) e.propertyCity = 'City is required';
    if (!form.propertyCountry.trim()) e.propertyCountry = 'Country is required';
    if (!form.propertyPhone.trim()) e.propertyPhone = 'Property phone is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep3 = () => {
    const e: Record<string, string> = {};
    if (!form.businessRegNumber.trim() || form.businessRegNumber.trim().length < 3)
      e.businessRegNumber = 'Business registration number is required';
    if (!form.countryOfIncorporation.trim()) e.countryOfIncorporation = 'Country of incorporation is required';
    if (!form.yearsInOperation) e.yearsInOperation = 'Please select years in operation';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep4 = () => {
    const e: Record<string, string> = {};
    if (form.bookingPlatforms.length === 0) e.bookingPlatforms = 'Please select at least one option';
    if (!form.howHeard) e.howHeard = 'Please tell us how you heard about us';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateDeclarations = () => {
    const e: Record<string, boolean> = {};
    (Object.keys(declarations) as (keyof typeof declarations)[]).forEach((k) => {
      if (!declarations[k]) e[k] = true;
    });
    setDeclarationErrors(e);
    return Object.keys(e).length === 0;
  };

  const goNext = () => {
    const validators: Record<number, () => boolean> = {
      1: validateStep1, 2: validateStep2, 3: validateStep3, 4: validateStep4,
    };
    if (validators[step] && validators[step]()) setStep((s) => (s + 1) as Step);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateDeclarations()) return;
    setLoading(true);
    try {
      await api.post('/auth/register', { ...form, declarations });
      toast.success('Application submitted! We\'ll review it and be in touch within 24 hours.');
      navigate('/login');
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Registration failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 to-brand-700 flex items-start justify-center p-4 py-10">
      <div className="w-full max-w-xl">

        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/">
            <img src="/logo.png" alt="GuestCheck" style={{ width: 170, mixBlendMode: 'multiply' as const }} className="mx-auto" />
          </Link>
          <p className="text-brand-200 mt-3 text-sm">Apply to join the GuestCheck network</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-1.5 mb-4">
          {([1, 2, 3, 4, 5] as Step[]).map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                s < step ? 'bg-emerald-400 text-white' : s === step ? 'bg-white text-brand-700' : 'bg-white/20 text-white/40'
              }`}>
                {s < step ? <Check className="w-3.5 h-3.5" /> : s}
              </div>
              {s < 5 && <div className={`w-8 h-0.5 transition-all ${s < step ? 'bg-emerald-400' : 'bg-white/20'}`} />}
            </div>
          ))}
        </div>
        <p className="text-center text-white/60 text-xs mb-5">
          Step {step} of 5 — {STEP_LABELS[step - 1]}
        </p>

        <div className="card p-8">
          <form onSubmit={handleSubmit}>

            {/* ── Step 1: Personal Details ────────────────────────────────── */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Your Details</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    This account will be the primary administrator for your property. All details must be accurate.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="First name" name="firstName" required value={form.firstName} error={errors.firstName} onChange={set} />
                  <Field label="Last name" name="lastName" required value={form.lastName} error={errors.lastName} onChange={set} />
                </div>
                <Field label="Work email" name="email" type="email" placeholder="you@myproperty.com" required value={form.email} error={errors.email} onChange={set} />
                <Field
                  label="Direct phone number" name="phone" type="tel" placeholder="+44 7911 000000"
                  required value={form.phone} error={errors.phone} onChange={set}
                  hint="We may call to verify your application"
                />
                <Select
                  label="Your role at this property" name="jobTitle" required
                  value={form.jobTitle} error={errors.jobTitle} onChange={set}
                  options={ROLES}
                />

                <div className="border-t border-slate-100 pt-4 space-y-4">
                  <Field
                    label="Password" name="password" type="password" placeholder="Min 10 characters"
                    required value={form.password} error={errors.password} onChange={set}
                    hint="At least 10 characters, one uppercase letter, and one number"
                  />
                  <Field label="Confirm password" name="confirmPassword" type="password" required value={form.confirmPassword} error={errors.confirmPassword} onChange={set} />
                </div>

                <button type="button" onClick={goNext} className="btn-primary w-full py-3 flex items-center justify-center gap-2 mt-2">
                  Continue <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* ── Step 2: Property Information ────────────────────────────── */}
            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Property Information</h2>
                  <p className="text-sm text-slate-500 mt-1">Tell us about the accommodation you manage.</p>
                </div>

                <Field label="Property / trading name" name="propertyName" placeholder="The Grand Hotel" required value={form.propertyName} error={errors.propertyName} onChange={set} />

                <div className="grid grid-cols-2 gap-4">
                  <Select label="Property type" name="propertyType" required value={form.propertyType} error={errors.propertyType} onChange={set} options={PROPERTY_TYPES} />
                  <Field
                    label="Number of rooms / units" name="numberOfRooms" type="number" placeholder="24"
                    required value={form.numberOfRooms} error={errors.numberOfRooms} onChange={set}
                  />
                </div>

                <Select
                  label="Star rating (if applicable)"
                  name="starRating" value={form.starRating} onChange={set}
                  options={['1 star', '2 star', '3 star', '4 star', '5 star', 'Not rated / self-classified']}
                />

                <div className="border-t border-slate-100 pt-4 space-y-4">
                  <Field label="Street address" name="propertyAddress" placeholder="123 High Street" required value={form.propertyAddress} error={errors.propertyAddress} onChange={set} />
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="City" name="propertyCity" required value={form.propertyCity} error={errors.propertyCity} onChange={set} />
                    <Field label="Country" name="propertyCountry" placeholder="e.g. Australia" required value={form.propertyCountry} error={errors.propertyCountry} onChange={set} />
                  </div>
                  <Field label="Postcode / ZIP" name="propertyPostcode" value={form.propertyPostcode} error={errors.propertyPostcode} onChange={set} />
                </div>

                <div className="border-t border-slate-100 pt-4 space-y-4">
                  <Field label="Property phone" name="propertyPhone" type="tel" placeholder="+61 3 0000 0000" required value={form.propertyPhone} error={errors.propertyPhone} onChange={set} />
                  <Field label="Property website" name="propertyWebsite" type="url" placeholder="https://myproperty.com.au" value={form.propertyWebsite} error={errors.propertyWebsite} onChange={set} />
                </div>

                <div className="flex gap-2 mt-2">
                  <button type="button" onClick={() => setStep(1)} className="btn-secondary flex items-center gap-2 px-4 py-3">
                    <ChevronLeft className="w-4 h-4" /> Back
                  </button>
                  <button type="button" onClick={goNext} className="btn-primary flex-1 py-3 flex items-center justify-center gap-2">
                    Continue <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 3: Business Identity ────────────────────────────────── */}
            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Business Identity</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    We verify every applicant as a legitimate accommodation business. These details are required for that process.
                  </p>
                </div>

                <Field
                  label="Legal business / company name"
                  name="legalBusinessName" placeholder="Acme Hospitality Pty Ltd"
                  value={form.legalBusinessName} error={errors.legalBusinessName} onChange={set}
                  hint="Leave blank if the same as your property trading name"
                />
                <Field
                  label="Business registration number" name="businessRegNumber"
                  placeholder="ABN, company number, etc." required
                  value={form.businessRegNumber} error={errors.businessRegNumber} onChange={set}
                  hint="ABN (Australia), Company Number (UK), EIN (US), or equivalent"
                />
                <Field
                  label="VAT / GST number"
                  name="vatNumber" placeholder="Optional"
                  value={form.vatNumber} error={errors.vatNumber} onChange={set}
                />
                <Field
                  label="Country of business incorporation"
                  name="countryOfIncorporation" placeholder="e.g. Australia"
                  required value={form.countryOfIncorporation} error={errors.countryOfIncorporation} onChange={set}
                />
                <Select
                  label="Years operating this property" name="yearsInOperation" required
                  value={form.yearsInOperation} error={errors.yearsInOperation} onChange={set}
                  options={['Less than 1 year', '1–2 years', '3–5 years', '6–10 years', 'More than 10 years']}
                />

                <div className="flex gap-2 mt-2">
                  <button type="button" onClick={() => setStep(2)} className="btn-secondary flex items-center gap-2 px-4 py-3">
                    <ChevronLeft className="w-4 h-4" /> Back
                  </button>
                  <button type="button" onClick={goNext} className="btn-primary flex-1 py-3 flex items-center justify-center gap-2">
                    Continue <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 4: Online Presence ──────────────────────────────────── */}
            {step === 4 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Online Presence</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    This helps us verify your property is genuine and active. Listing URLs are the fastest way to confirm legitimacy.
                  </p>
                </div>

                <div>
                  <label className="label">
                    Where is your property listed? <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-slate-400 mb-3">Select all that apply</p>
                  <div className="grid grid-cols-2 gap-2">
                    {BOOKING_PLATFORMS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => togglePlatform(p)}
                        className={`text-left px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                          form.bookingPlatforms.includes(p)
                            ? 'border-brand-400 bg-brand-50 text-brand-700'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {form.bookingPlatforms.includes(p) && <Check className="w-3 h-3 inline mr-1.5 text-brand-600" />}
                        {p}
                      </button>
                    ))}
                  </div>
                  {errors.bookingPlatforms && <p className="text-xs text-red-500 mt-1">{errors.bookingPlatforms}</p>}
                </div>

                <div className="space-y-4 border-t border-slate-100 pt-4">
                  <p className="text-sm font-medium text-slate-700">Listing URLs <span className="text-slate-400 font-normal">(optional — strongly recommended)</span></p>
                  <Field
                    label="Booking.com listing URL" name="listingUrlBookingCom" type="url"
                    placeholder="https://www.booking.com/hotel/…"
                    value={form.listingUrlBookingCom} error={errors.listingUrlBookingCom} onChange={set}
                  />
                  <Field
                    label="Airbnb listing URL" name="listingUrlAirbnb" type="url"
                    placeholder="https://www.airbnb.com.au/rooms/…"
                    value={form.listingUrlAirbnb} error={errors.listingUrlAirbnb} onChange={set}
                  />
                  <Field
                    label="Other listing URL" name="listingUrlOther" type="url"
                    placeholder="Any other platform listing"
                    value={form.listingUrlOther} error={errors.listingUrlOther} onChange={set}
                  />
                </div>

                <Field
                  label="Industry memberships / associations"
                  name="industryMemberships"
                  placeholder="e.g. Australian Hotels Association, Visit Britain, etc."
                  value={form.industryMemberships} error={errors.industryMemberships} onChange={set}
                  hint="Optional — helps with faster verification"
                />

                <Select
                  label="How did you hear about GuestCheck?" name="howHeard" required
                  value={form.howHeard} error={errors.howHeard} onChange={set}
                  options={HOW_HEARD}
                />

                <div className="flex gap-2 mt-2">
                  <button type="button" onClick={() => setStep(3)} className="btn-secondary flex items-center gap-2 px-4 py-3">
                    <ChevronLeft className="w-4 h-4" /> Back
                  </button>
                  <button type="button" onClick={goNext} className="btn-primary flex-1 py-3 flex items-center justify-center gap-2">
                    Continue <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 5: Declarations ─────────────────────────────────────── */}
            {step === 5 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Declarations</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Please read and confirm each of the following before submitting your application.
                    All boxes must be ticked.
                  </p>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800 leading-relaxed">
                    GuestCheck is a verified platform. Submitting false information or fraudulent
                    reviews may result in account suspension and potential legal action. All applications
                    are reviewed manually before activation.
                  </p>
                </div>

                <div className="space-y-3">
                  <Checkbox
                    id="isAuthorised"
                    checked={declarations.isAuthorised}
                    onChange={(v) => { setDeclarations((d) => ({ ...d, isAuthorised: v })); setDeclarationErrors((e) => ({ ...e, isAuthorised: false })); }}
                    error={declarationErrors.isAuthorised}
                    label="I confirm that I am the registered owner or an authorised representative of the property listed in this application, and I have the authority to create and manage this account."
                  />
                  <Checkbox
                    id="onlyRealReviews"
                    checked={declarations.onlyRealReviews}
                    onChange={(v) => { setDeclarations((d) => ({ ...d, onlyRealReviews: v })); setDeclarationErrors((e) => ({ ...e, onlyRealReviews: false })); }}
                    error={declarationErrors.onlyRealReviews}
                    label="I understand that all reviews submitted through my account must be based solely on genuine, verified guest stays at my registered property. I will not submit reviews for guests who did not stay at this property."
                  />
                  <Checkbox
                    id="noFalseReviews"
                    checked={declarations.noFalseReviews}
                    onChange={(v) => { setDeclarations((d) => ({ ...d, noFalseReviews: v })); setDeclarationErrors((e) => ({ ...e, noFalseReviews: false })); }}
                    error={declarationErrors.noFalseReviews}
                    label={
                      <span>
                        I acknowledge that submitting <strong>false, malicious, or defamatory reviews</strong> may
                        constitute fraud or defamation, and may result in immediate account suspension, removal
                        from the platform, and referral to relevant legal authorities.
                      </span>
                    }
                  />
                  <Checkbox
                    id="agreeTerms"
                    checked={declarations.agreeTerms}
                    onChange={(v) => { setDeclarations((d) => ({ ...d, agreeTerms: v })); setDeclarationErrors((e) => ({ ...e, agreeTerms: false })); }}
                    error={declarationErrors.agreeTerms}
                    label={
                      <span>
                        I agree to GuestCheck's{' '}
                        <a href="#" className="text-brand-600 underline">Terms of Service</a>,{' '}
                        <a href="#" className="text-brand-600 underline">Privacy Policy</a>, and{' '}
                        <a href="#" className="text-brand-600 underline">Review Guidelines</a>.
                      </span>
                    }
                  />
                  <Checkbox
                    id="understandsReview"
                    checked={declarations.understandsReview}
                    onChange={(v) => { setDeclarations((d) => ({ ...d, understandsReview: v })); setDeclarationErrors((e) => ({ ...e, understandsReview: false })); }}
                    error={declarationErrors.understandsReview}
                    label="I understand that my application will be reviewed by the GuestCheck team before my account is activated, and that activation is not guaranteed. I may be contacted for additional verification."
                  />
                </div>

                {Object.values(declarationErrors).some(Boolean) && (
                  <p className="text-sm text-red-600 font-medium">Please tick all declarations to continue.</p>
                )}

                <div className="bg-brand-50 border border-brand-200 rounded-xl p-4 flex gap-3">
                  <ShieldCheck className="w-5 h-5 text-brand-700 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-brand-800 leading-relaxed">
                    Your application will be reviewed within <strong>24 hours</strong>. We'll email you at{' '}
                    <strong>{form.email}</strong> once a decision has been made.
                  </p>
                </div>

                <div className="flex gap-2">
                  <button type="button" onClick={() => setStep(4)} className="btn-secondary flex items-center gap-2 px-4 py-3">
                    <ChevronLeft className="w-4 h-4" /> Back
                  </button>
                  <button type="submit" disabled={loading} className="btn-primary flex-1 py-3 font-semibold">
                    {loading ? 'Submitting application…' : 'Submit Application'}
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

        <p className="text-center text-white/40 text-xs mt-6 pb-6">
          GuestCheck Ltd · All applications subject to manual verification
        </p>
      </div>
    </div>
  );
}
