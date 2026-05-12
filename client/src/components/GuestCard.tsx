import { Link } from 'react-router-dom';
import { Guest } from '../types';
import RiskBadge from './RiskBadge';
import StarRating from './StarRating';

interface GuestCardProps {
  guest: Guest;
  compact?: boolean;
  showReviewButton?: boolean;
}

export default function GuestCard({ guest, compact = false, showReviewButton = false }: GuestCardProps) {
  const initials = `${guest.firstName?.[0] ?? '?'}${guest.lastName?.[0] ?? '?'}`.toUpperCase();

  return (
    <div className="card p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="flex-shrink-0">
          {guest.profileImage ? (
            <img
              src={guest.profileImage}
              alt={`${guest.firstName} ${guest.lastName}`}
              className={`rounded-full object-cover ${compact ? 'w-10 h-10' : 'w-14 h-14'}`}
            />
          ) : (
            <div
              className={`rounded-full flex items-center justify-center font-semibold text-white ${
                compact ? 'w-10 h-10 text-sm' : 'w-14 h-14 text-lg'
              } bg-gradient-to-br from-brand-500 to-brand-700`}
            >
              {initials}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <Link
                to={`/guests/${guest.id}`}
                className="font-semibold text-slate-900 hover:text-brand-600 transition-colors"
              >
                {guest.firstName} {guest.lastName}
              </Link>
              {guest.nationality && (
                <p className="text-xs text-slate-500 mt-0.5">{guest.nationality}</p>
              )}
            </div>
            <RiskBadge level={guest.riskLevel} showScore={guest.averageRating ?? undefined} />
          </div>

          {!compact && (
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              {guest.averageRating ? (
                <StarRating value={Math.round(guest.averageRating)} readonly size="sm" />
              ) : (
                <span className="text-xs text-slate-400">No reviews yet</span>
              )}
              <span className="text-xs text-slate-500">
                {guest.totalReviews} review{guest.totalReviews !== 1 ? 's' : ''}
              </span>
              {guest.email && (
                <span className="text-xs text-slate-400 truncate">{guest.email}</span>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 flex-shrink-0">
          <Link to={`/guests/${guest.id}`} className="btn-secondary text-xs px-3 py-1.5">
            View Profile
          </Link>
          {showReviewButton && (
            <Link to={`/reviews/new/${guest.id}`} className="btn-primary text-xs px-3 py-1.5">
              Leave Review
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
