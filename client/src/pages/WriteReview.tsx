import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../api/client';
import StarRating from '../components/StarRating';
import toast from 'react-hot-toast';
import { Guest } from '../types';

interface GuestForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  nationality: string;
}

export default function WriteReview() {
  const { guestId } = useParams<{ guestId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [step, setStep] = useState<'find_guest' | 'write_review'>(guestId ? 'write_review' : 'find_guest');
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
  const [guestSearch, setGuestSearch] = useState(searchParams.get('guestName') || '');
  const [searchResults, setSearchResults] = useState<Guest[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [guestForm, setGuestForm] = useState<GuestForm>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    nationality: '',
  });

  const [ratings, setRatings] = useState({
    overallRating: 0,
    cleanliness: 0,
    communication: 0,
    ruleAdherence: 0,
    noiseLevel: 0,
    propertyRespect: 0,
  });
  const [publicComment, setPublicComment] = useState('');
  const [privateNote, setPrivateNote] = useState('');
  const [wouldWelcomeBack, setWouldWelcomeBack] = useState<boolean | null>(null);
  const [stayMonth, setStayMonth] = useState<number | ''>('');
  const [stayYear, setStayYear] = useState<number | ''>('');

  // Load guest if guestId provided
  const { data: guestData } = useQuery({
    queryKey: ['guest', guestId],
    queryFn: () => api.get(`/guests/${guestId}`).then((r) => r.data.data),
    enabled: !!guestId,
  });

  useEffect(() => {
    if (guestData) setSelectedGuest(guestData);
  }, [guestData]);

  // Search guests
  useEffect(() => {
    if (guestSearch.length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get(`/guests/search?q=${encodeURIComponent(guestSearch)}`);
        setSearchResults(data.data || []);
      } finally {
        setIsSearching(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [guestSearch]);

  const createGuestMutation = useMutation({
    mutationFn: (data: GuestForm) => api.post('/guests', data),
    onSuccess: ({ data }) => {
      setSelectedGuest(data.data);
      setStep('write_review');
      toast.success(data.isExisting ? 'Found existing guest record' : 'Guest profile created');
    },
    onError: () => toast.error('Failed to create guest profile'),
  });

  const submitReview = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/reviews', payload),
    onSuccess: () => {
      toast.success('Review submitted successfully!');
      navigate(`/guests/${selectedGuest?.id}`);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to submit review';
      toast.error(msg);
    },
  });

  const handleSubmitReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGuest) return;
    if (ratings.overallRating === 0) {
      toast.error('Please provide an overall rating');
      return;
    }
    submitReview.mutate({
      guestId: selectedGuest.id,
      overallRating: ratings.overallRating,
      cleanliness: ratings.cleanliness || undefined,
      communication: ratings.communication || undefined,
      ruleAdherence: ratings.ruleAdherence || undefined,
      noiseLevel: ratings.noiseLevel || undefined,
      propertyRespect: ratings.propertyRespect || undefined,
      publicComment: publicComment || undefined,
      privateNote: privateNote || undefined,
      wouldWelcomeBack: wouldWelcomeBack ?? undefined,
      stayMonth: stayMonth || undefined,
      stayYear: stayYear || undefined,
    });
  };

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  // ── Step 1: Find Guest ──────────────────────────────────────────────────────

  if (step === 'find_guest') {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Write a Review</h1>
          <p className="text-slate-500 mt-1">Search for the guest you'd like to review, or add a new profile.</p>
        </div>

        <div className="card p-6 space-y-4">
          <div>
            <label className="label">Search for guest</label>
            <input
              type="text"
              className="input"
              placeholder="Name, email, or phone..."
              value={guestSearch}
              onChange={(e) => setGuestSearch(e.target.value)}
              autoFocus
            />
          </div>

          {isSearching && <p className="text-xs text-slate-400">Searching...</p>}

          {searchResults.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 font-medium">Results:</p>
              {searchResults.map((g) => (
                <button
                  key={g.id}
                  onClick={() => { setSelectedGuest(g); setStep('write_review'); }}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-brand-300 hover:bg-brand-50 text-left transition-all"
                >
                  <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-semibold text-sm">
                    {g.firstName[0]}{g.lastName[0]}
                  </div>
                  <div>
                    <p className="font-medium text-sm text-slate-900">{g.firstName} {g.lastName}</p>
                    <p className="text-xs text-slate-500">{g.email || g.phone || 'No contact info'}</p>
                  </div>
                  <span className="ml-auto text-xs text-slate-400">{g.totalReviews} reviews</span>
                </button>
              ))}
            </div>
          )}

          {guestSearch.length >= 2 && searchResults.length === 0 && !isSearching && (
            <p className="text-sm text-slate-500">No matching guests found.</p>
          )}

          <div className="pt-3 border-t border-slate-100">
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="text-sm text-brand-600 hover:underline"
            >
              + Add new guest profile
            </button>
          </div>

          {showCreateForm && (
            <form
              onSubmit={(e) => { e.preventDefault(); createGuestMutation.mutate(guestForm); }}
              className="space-y-3 pt-3 border-t border-slate-100"
            >
              <p className="text-sm font-medium text-slate-700">New guest profile</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">First name *</label>
                  <input type="text" className="input" value={guestForm.firstName} onChange={(e) => setGuestForm({ ...guestForm, firstName: e.target.value })} required />
                </div>
                <div>
                  <label className="label">Last name *</label>
                  <input type="text" className="input" value={guestForm.lastName} onChange={(e) => setGuestForm({ ...guestForm, lastName: e.target.value })} required />
                </div>
              </div>
              <div>
                <label className="label">Email</label>
                <input type="email" className="input" value={guestForm.email} onChange={(e) => setGuestForm({ ...guestForm, email: e.target.value })} />
              </div>
              <div>
                <label className="label">Phone</label>
                <input type="tel" className="input" value={guestForm.phone} onChange={(e) => setGuestForm({ ...guestForm, phone: e.target.value })} />
              </div>
              <div>
                <label className="label">Nationality</label>
                <input type="text" className="input" placeholder="e.g. British" value={guestForm.nationality} onChange={(e) => setGuestForm({ ...guestForm, nationality: e.target.value })} />
              </div>
              <button type="submit" disabled={createGuestMutation.isPending} className="btn-primary w-full">
                {createGuestMutation.isPending ? 'Creating...' : 'Create & Continue →'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // ── Step 2: Write Review ────────────────────────────────────────────────────

  if (!selectedGuest) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => setStep('find_guest')} className="text-slate-400 hover:text-slate-600">←</button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Write a Review</h1>
          <p className="text-slate-500 mt-0.5">
            Reviewing: <strong>{selectedGuest.firstName} {selectedGuest.lastName}</strong>
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmitReview} className="space-y-6">
        {/* Overall rating */}
        <div className="card p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Overall Rating *</h2>
          <StarRating
            value={ratings.overallRating}
            onChange={(v) => setRatings({ ...ratings, overallRating: v })}
            size="lg"
            showLabel
          />
          {ratings.overallRating === 0 && (
            <p className="text-xs text-red-500 mt-2">Required: please select a rating</p>
          )}
        </div>

        {/* Category ratings */}
        <div className="card p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Category Ratings (optional)</h2>
          <div className="space-y-5">
            {[
              { key: 'cleanliness', label: 'Cleanliness', desc: 'How clean did the guest keep the room/property?' },
              { key: 'communication', label: 'Communication', desc: 'Were they responsive and easy to communicate with?' },
              { key: 'ruleAdherence', label: 'House Rules', desc: 'Did they follow check-in/out times and house rules?' },
              { key: 'noiseLevel', label: 'Noise Level', desc: 'Were they considerate of noise (6 = very quiet)?' },
              { key: 'propertyRespect', label: 'Property Respect', desc: 'Did they leave the property in good condition?' },
            ].map(({ key, label, desc }) => (
              <div key={key} className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-700">{label}</p>
                  <p className="text-xs text-slate-400">{desc}</p>
                </div>
                <StarRating
                  value={ratings[key as keyof typeof ratings]}
                  onChange={(v) => setRatings({ ...ratings, [key]: v })}
                  size="sm"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Stay period */}
        <div className="card p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Stay Period (optional)</h2>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="label">Month</label>
              <select className="input" value={stayMonth} onChange={(e) => setStayMonth(e.target.value ? parseInt(e.target.value) : '')}>
                <option value="">Select month...</option>
                {months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="label">Year</label>
              <select className="input" value={stayYear} onChange={(e) => setStayYear(e.target.value ? parseInt(e.target.value) : '')}>
                <option value="">Select year...</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Comments */}
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-slate-900">Comments</h2>
          <div>
            <label className="label">
              Public comment
              <span className="text-xs text-slate-400 font-normal ml-1">(visible to all member properties)</span>
            </label>
            <textarea
              className="input resize-none"
              rows={4}
              placeholder="Describe your experience with this guest — what made them great or problematic..."
              value={publicComment}
              onChange={(e) => setPublicComment(e.target.value)}
              maxLength={2000}
            />
            <p className="text-xs text-slate-400 text-right mt-1">{publicComment.length}/2000</p>
          </div>
          <div>
            <label className="label">
              Private note
              <span className="text-xs text-slate-400 font-normal ml-1">(only visible to your property)</span>
            </label>
            <textarea
              className="input resize-none"
              rows={3}
              placeholder="Internal notes for your team only..."
              value={privateNote}
              onChange={(e) => setPrivateNote(e.target.value)}
              maxLength={2000}
            />
          </div>
        </div>

        {/* Would welcome back */}
        <div className="card p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Would you welcome this guest back?</h2>
          <div className="flex gap-3">
            {[true, false, null].map((val) => (
              <button
                key={String(val)}
                type="button"
                onClick={() => setWouldWelcomeBack(val)}
                className={`flex-1 py-3 rounded-xl border-2 font-medium text-sm transition-all ${
                  wouldWelcomeBack === val
                    ? val === true
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : val === false
                      ? 'border-red-500 bg-red-50 text-red-700'
                      : 'border-slate-300 bg-slate-50 text-slate-700'
                    : 'border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                {val === true ? '✓ Yes' : val === false ? '✗ No' : '— No opinion'}
              </button>
            ))}
          </div>
        </div>

        {/* Submit */}
        <div className="flex gap-3">
          <Link to="/guests/search" className="btn-secondary flex-1 py-3">Cancel</Link>
          <button
            type="submit"
            disabled={submitReview.isPending || ratings.overallRating === 0}
            className="btn-primary flex-1 py-3 text-base"
          >
            {submitReview.isPending ? 'Submitting...' : 'Submit Review'}
          </button>
        </div>

        <p className="text-xs text-center text-slate-400">
          Reviews must be based on real stays. False reviews violate our Terms of Service and may result in account suspension.
        </p>
      </form>
    </div>
  );
}
