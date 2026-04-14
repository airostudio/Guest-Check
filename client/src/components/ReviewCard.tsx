import { format } from 'date-fns';
import { Review } from '../types';
import StarRating from './StarRating';

interface ReviewCardProps {
  review: Review;
  showProperty?: boolean;
  showPrivateNote?: boolean;
}

const MONTH_NAMES = [
  '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export default function ReviewCard({ review, showProperty = true, showPrivateNote = false }: ReviewCardProps) {
  const categories = [
    { label: 'Cleanliness', value: review.cleanliness },
    { label: 'Communication', value: review.communication },
    { label: 'House Rules', value: review.ruleAdherence },
    { label: 'Noise Level', value: review.noiseLevel },
    { label: 'Property Respect', value: review.propertyRespect },
  ].filter((c) => c.value !== undefined && c.value !== null);

  const stayPeriod = review.stayMonth && review.stayYear
    ? `${MONTH_NAMES[review.stayMonth]} ${review.stayYear}`
    : null;

  return (
    <div className="card p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <StarRating value={review.overallRating} readonly size="sm" />
            <span className="font-semibold text-slate-800">{review.overallRating}/6</span>
            {review.isVerifiedStay && (
              <span className="badge bg-emerald-50 text-emerald-700 text-xs">
                ✓ Verified Stay
              </span>
            )}
          </div>
          {stayPeriod && <p className="text-xs text-slate-500">Stay: {stayPeriod}</p>}
        </div>

        <div className="flex items-center gap-2">
          {review.wouldWelcomeBack === true && (
            <span className="badge bg-emerald-100 text-emerald-700 text-xs">Would welcome back</span>
          )}
          {review.wouldWelcomeBack === false && (
            <span className="badge bg-red-100 text-red-700 text-xs">Would not welcome back</span>
          )}
        </div>
      </div>

      {/* Category ratings */}
      {categories.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4 p-3 bg-slate-50 rounded-lg">
          {categories.map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">{label}</span>
              <div className="flex items-center gap-1">
                <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all"
                    style={{ width: `${((value ?? 0) / 6) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-slate-700 w-4">{value}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Public comment */}
      {review.publicComment && (
        <p className="text-sm text-slate-700 mb-3 leading-relaxed">
          "{review.publicComment}"
        </p>
      )}

      {/* Private note */}
      {showPrivateNote && review.privateNote && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-3">
          <p className="text-xs font-semibold text-amber-800 mb-1">Private Note (only visible to your property)</p>
          <p className="text-sm text-amber-900">{review.privateNote}</p>
        </div>
      )}

      {/* Footer */}
      {showProperty && review.property && (
        <div className="flex items-center gap-2 pt-3 border-t border-slate-100 mt-3">
          <div className="w-7 h-7 rounded-md bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-bold">
            {review.property.name[0]}
          </div>
          <div>
            <p className="text-xs font-medium text-slate-700">{review.property.name}</p>
            <p className="text-xs text-slate-400">{review.property.city}, {review.property.country}</p>
          </div>
          <span className="ml-auto text-xs text-slate-400">
            {format(new Date(review.createdAt), 'dd MMM yyyy')}
          </span>
        </div>
      )}
    </div>
  );
}
