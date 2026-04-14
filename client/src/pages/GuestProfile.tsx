import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import ReviewCard from '../components/ReviewCard';
import RiskBadge from '../components/RiskBadge';
import StarRating from '../components/StarRating';
import { Guest, Review } from '../types';

export default function GuestProfile() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ['guest', id],
    queryFn: () => api.get(`/guests/${id}`).then((r) => r.data.data),
  });

  const guest: (Guest & { reviews: Review[] }) | undefined = data;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!guest) {
    return (
      <div className="text-center py-24">
        <p className="text-slate-500">Guest not found</p>
        <Link to="/guests/search" className="btn-primary mt-4">Back to search</Link>
      </div>
    );
  }

  const initials = `${guest.firstName[0]}${guest.lastName[0]}`.toUpperCase();

  // Category averages
  const reviews = guest.reviews || [];
  const avgCategory = (key: keyof Review) => {
    const vals = reviews.map((r) => r[key] as number).filter((v) => typeof v === 'number');
    if (!vals.length) return null;
    return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
  };

  const categories = [
    { label: 'Cleanliness', value: avgCategory('cleanliness') },
    { label: 'Communication', value: avgCategory('communication') },
    { label: 'House Rules', value: avgCategory('ruleAdherence') },
    { label: 'Noise Level', value: avgCategory('noiseLevel') },
    { label: 'Property Respect', value: avgCategory('propertyRespect') },
  ].filter((c) => c.value !== null);

  const wouldWelcomeBack = reviews.filter((r) => r.wouldWelcomeBack === true).length;
  const wouldNotWelcomeBack = reviews.filter((r) => r.wouldWelcomeBack === false).length;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Back */}
      <Link to="/guests/search" className="text-sm text-brand-600 hover:underline flex items-center gap-1">
        ← Back to search
      </Link>

      {/* Guest header */}
      <div className="card p-6">
        <div className="flex items-start gap-6 flex-wrap">
          {/* Avatar */}
          {guest.profileImage ? (
            <img src={guest.profileImage} alt="" className="w-20 h-20 rounded-full object-cover" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white text-2xl font-bold">
              {initials}
            </div>
          )}

          {/* Info */}
          <div className="flex-1">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">{guest.firstName} {guest.lastName}</h1>
                {guest.nationality && <p className="text-slate-500 text-sm mt-0.5">{guest.nationality}</p>}
              </div>
              <RiskBadge level={guest.riskLevel} showScore={guest.averageRating ?? undefined} />
            </div>

            {/* Rating */}
            {guest.averageRating !== null && guest.averageRating !== undefined ? (
              <div className="mt-3 flex items-center gap-3">
                <StarRating value={Math.round(guest.averageRating)} readonly size="md" />
                <span className="text-lg font-bold text-slate-700">{guest.averageRating.toFixed(1)}/6</span>
                <span className="text-sm text-slate-500">({guest.totalReviews} review{guest.totalReviews !== 1 ? 's' : ''})</span>
              </div>
            ) : (
              <p className="text-slate-400 text-sm mt-3">No reviews yet</p>
            )}

            {/* Welcome back stats */}
            {(wouldWelcomeBack > 0 || wouldNotWelcomeBack > 0) && (
              <div className="flex gap-4 mt-3">
                {wouldWelcomeBack > 0 && (
                  <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">
                    ✓ {wouldWelcomeBack} would welcome back
                  </span>
                )}
                {wouldNotWelcomeBack > 0 && (
                  <span className="text-xs text-red-700 bg-red-50 px-2 py-1 rounded-full">
                    ✗ {wouldNotWelcomeBack} would not welcome back
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Category averages */}
        {categories.length > 0 && (
          <div className="mt-6 pt-5 border-t border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Average Ratings</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {categories.map(({ label, value }) => (
                <div key={label} className="text-center">
                  <p className="text-2xl font-bold text-slate-900">{value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
                    <div
                      className="h-full bg-brand-500 rounded-full"
                      style={{ width: `${(parseFloat(value!) / 6) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <Link to={`/reviews/new/${guest.id}`} className="btn-primary flex-1 py-3 text-center">
          + Leave a Review
        </Link>
        <Link to={`/bookings?guestId=${guest.id}`} className="btn-secondary flex-1 py-3 text-center">
          Add Booking
        </Link>
      </div>

      {/* Reviews */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Reviews ({reviews.length})
        </h2>

        {reviews.length === 0 && (
          <div className="card p-8 text-center">
            <p className="text-slate-400 text-sm">No reviews for this guest yet.</p>
            <p className="text-xs text-slate-400 mt-1">
              Be the first to review {guest.firstName} {guest.lastName}.
            </p>
          </div>
        )}

        <div className="space-y-4">
          {reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              showProperty
              showPrivateNote
            />
          ))}
        </div>
      </section>
    </div>
  );
}
