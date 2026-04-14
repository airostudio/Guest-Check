import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import RiskBadge from '../components/RiskBadge';
import StarRating from '../components/StarRating';
import { CallerCard, RiskLevel } from '../types';
import { format } from 'date-fns';

export default function Reception() {
  const [phoneInput, setPhoneInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [callerCards, setCallerCards] = useState<CallerCard[] | null>(null);
  const [noMatch, setNoMatch] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleLookup = async (number?: string) => {
    const num = number || phoneInput;
    if (!num.trim()) return;

    setSearching(true);
    setCallerCards(null);
    setNoMatch(false);

    try {
      const { data } = await api.get(`/phone/caller/${encodeURIComponent(num.trim())}`);
      if (data.data && data.data.length > 0) {
        setCallerCards(data.data);
      } else {
        setNoMatch(true);
      }
    } catch {
      setNoMatch(true);
    } finally {
      setSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLookup();
  };

  const reset = () => {
    setPhoneInput('');
    setCallerCards(null);
    setNoMatch(false);
    inputRef.current?.focus();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reception Caller Lookup</h1>
        <p className="text-slate-500 mt-1">
          Enter an incoming caller's phone number to instantly view their guest review profile.
        </p>
      </div>

      {/* Phone input panel */}
      <div className="card p-6">
        <label className="label text-base mb-2">Caller phone number</label>
        <div className="flex gap-3">
          <input
            ref={inputRef}
            type="tel"
            className="input flex-1 text-lg py-3"
            placeholder="+44 7700 123456"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            onClick={() => handleLookup()}
            disabled={searching || !phoneInput.trim()}
            className="btn-primary px-6 py-3 text-base"
          >
            {searching ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              'Lookup'
            )}
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          Press Enter or click Lookup. Supports all international formats.
        </p>

        {/* Quick test numbers */}
        <div className="mt-4 pt-4 border-t border-slate-100">
          <p className="text-xs text-slate-400 mb-2">Recent lookups (demo):</p>
          <div className="flex flex-wrap gap-2">
            {['+44 7700 900123', '+1 555 123 4567'].map((num) => (
              <button
                key={num}
                onClick={() => { setPhoneInput(num); handleLookup(num); }}
                className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600"
              >
                {num}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      {callerCards && callerCards.map((caller) => (
        <CallerProfileCard key={caller.id} caller={caller} />
      ))}

      {noMatch && (
        <div className="card p-8 text-center">
          <div className="text-4xl mb-3">📵</div>
          <h2 className="font-semibold text-slate-700 mb-1">Unknown caller</h2>
          <p className="text-slate-500 text-sm mb-4">
            No guest profile found for <strong>{phoneInput}</strong>.
          </p>
          <div className="flex gap-3 justify-center">
            <button onClick={reset} className="btn-secondary text-sm">New lookup</button>
            <Link to="/reviews/new" className="btn-primary text-sm">Add new guest</Link>
          </div>
        </div>
      )}

      {callerCards && (
        <div className="text-center">
          <button onClick={reset} className="btn-secondary text-sm">New lookup</button>
        </div>
      )}

      {/* Integration tip */}
      <div className="p-4 bg-brand-50 border border-brand-100 rounded-xl">
        <div className="flex items-start gap-3">
          <span className="text-xl">💡</span>
          <div>
            <p className="text-sm font-semibold text-brand-900">Automate caller ID lookups</p>
            <p className="text-xs text-brand-700 mt-1">
              Connect your phone system via our API to automatically pop up guest profiles when a known number calls.{' '}
              <Link to="/integrations" className="font-medium hover:underline">Set up integration →</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function CallerProfileCard({ caller }: { caller: CallerCard }) {
  const alertStyles = {
    danger: 'bg-red-50 border-red-300 text-red-800',
    warning: 'bg-orange-50 border-orange-300 text-orange-800',
    success: 'bg-emerald-50 border-emerald-300 text-emerald-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  };

  return (
    <div className={`card overflow-hidden ${
      caller.alert?.type === 'danger' ? 'border-red-300 border-2' :
      caller.alert?.type === 'warning' ? 'border-orange-300 border-2' : ''
    }`}>
      {/* Alert banner */}
      {caller.alert && (
        <div className={`p-3 border-b font-semibold text-sm flex items-center gap-2 ${alertStyles[caller.alert.type]}`}>
          {caller.alert.type === 'danger' ? '⚠️' : caller.alert.type === 'warning' ? '!' : caller.alert.type === 'success' ? '★' : 'ℹ'}
          <span>{caller.alert.title}</span>
        </div>
      )}

      <div className="p-6">
        {/* Guest header */}
        <div className="flex items-start gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
            {caller.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
          </div>
          <div className="flex-1">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{caller.name}</h2>
                {caller.nationality && <p className="text-slate-500 text-sm">{caller.nationality}</p>}
              </div>
              <RiskBadge level={caller.riskLevel} showScore={caller.averageRating ?? undefined} />
            </div>

            {caller.averageRating ? (
              <div className="flex items-center gap-2 mt-2">
                <StarRating value={Math.round(caller.averageRating)} readonly size="sm" />
                <span className="font-semibold text-slate-700">{caller.averageRating.toFixed(1)}/6</span>
                <span className="text-sm text-slate-500">from {caller.totalReviews} review{caller.totalReviews !== 1 ? 's' : ''}</span>
              </div>
            ) : (
              <p className="text-slate-400 text-sm mt-2">No reviews on file</p>
            )}

            {/* Welcome back stats */}
            {(caller.recommendCount > 0 || caller.notRecommendCount > 0) && (
              <div className="flex gap-3 mt-2">
                {caller.recommendCount > 0 && (
                  <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                    ✓ {caller.recommendCount} would welcome back
                  </span>
                )}
                {caller.notRecommendCount > 0 && (
                  <span className="text-xs text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
                    ✗ {caller.notRecommendCount} would not welcome back
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Alert message */}
        {caller.alert && (
          <div className={`p-3 rounded-lg border mb-5 text-sm ${alertStyles[caller.alert.type]}`}>
            {caller.alert.message}
          </div>
        )}

        {/* Recent reviews */}
        {caller.recentReviews.length > 0 && (
          <div className="mb-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Recent reviews from other properties:</h3>
            <div className="space-y-2">
              {caller.recentReviews.map((review, i) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                  <div className="text-xs flex-shrink-0 mt-0.5">
                    <div className="flex gap-0.5">
                      {[1,2,3,4,5,6].map((s) => (
                        <span key={s} className={s <= review.overallRating ? 'text-amber-400' : 'text-slate-200'}>★</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    {review.publicComment && (
                      <p className="text-xs text-slate-600 truncate">"{review.publicComment}"</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-slate-400">
                        {(review as typeof review & { property?: { name?: string } }).property?.name || 'Another property'}
                      </span>
                      {review.wouldWelcomeBack !== null && review.wouldWelcomeBack !== undefined && (
                        <span className={`text-xs ${review.wouldWelcomeBack ? 'text-emerald-600' : 'text-red-600'}`}>
                          {review.wouldWelcomeBack ? '✓ Would welcome back' : '✗ Would not welcome back'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Previous bookings at this property */}
        {caller.previousBookings.length > 0 && (
          <div className="mb-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Previous stays at your property:</h3>
            <div className="space-y-1">
              {caller.previousBookings.map((booking) => (
                <div key={booking.id} className="flex items-center gap-3 text-xs text-slate-600 p-2 bg-slate-50 rounded">
                  <span>{format(new Date(booking.checkIn), 'dd MMM yyyy')}</span>
                  <span>→</span>
                  <span>{format(new Date(booking.checkOut), 'dd MMM yyyy')}</span>
                  {booking.roomNumber && <span className="text-slate-400">Room {booking.roomNumber}</span>}
                  <span className={`ml-auto badge text-xs ${
                    booking.status === 'CHECKED_OUT' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {booking.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-slate-100">
          <Link to={`/guests/${caller.id}`} className="btn-secondary flex-1 text-sm py-2">
            Full Profile
          </Link>
          <Link to={`/reviews/new/${caller.id}`} className="btn-primary flex-1 text-sm py-2">
            Write Review
          </Link>
        </div>
      </div>
    </div>
  );
}
