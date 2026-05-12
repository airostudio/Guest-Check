import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import RiskBadge from '../components/RiskBadge';
import StarRating from '../components/StarRating';
import { RiskLevel } from '../types';
import { format } from 'date-fns';

export default function Dashboard() {
  const { user } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ['review-stats'],
    queryFn: () => api.get('/reviews/stats/mine').then((r) => r.data.data),
  });

  const { data: arrivals } = useQuery({
    queryKey: ['upcoming-arrivals'],
    queryFn: () => api.get('/bookings/upcoming/arrivals?days=7').then((r) => r.data.data),
  });

  const propertyStatus = user?.property?.status;
  const isPending = propertyStatus === 'PENDING_VERIFICATION';

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Good morning, {user?.firstName} 👋
          </h1>
          {user?.property && (
            <p className="text-slate-500 mt-1">{user.property.name} · {user.property.city}</p>
          )}
        </div>
        <div className="flex gap-3">
          <Link to="/guests/search" className="btn-secondary text-sm">Search Guest</Link>
          <Link to="/reviews/new" className="btn-primary text-sm">+ Leave Review</Link>
        </div>
      </div>

      {/* Pending verification notice */}
      {isPending && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⏳</span>
            <div>
              <p className="font-semibold text-amber-900">Your property is pending verification</p>
              <p className="text-sm text-amber-700 mt-1">
                Our team is reviewing your registration. This typically takes under 24 hours. You'll receive an email once approved.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Reviews Written"
          value={stats?.totalReviews ?? '—'}
          icon="★"
          color="brand"
        />
        <StatCard
          label="Average Rating Given"
          value={stats?.averages?.overallRating ? `${stats.averages.overallRating.toFixed(1)}/6` : '—'}
          icon="📊"
          color="emerald"
        />
        <StatCard
          label="Upcoming Arrivals (7d)"
          value={arrivals?.length ?? '—'}
          icon="🏨"
          color="blue"
        />
        <StatCard
          label="High-Risk Alerts"
          value={arrivals?.filter((a: { alert: unknown }) => a.alert)?.length ?? 0}
          icon="⚠️"
          color="red"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Upcoming arrivals */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Upcoming Arrivals</h2>
            <Link to="/bookings?upcoming=true" className="text-sm text-brand-600 hover:underline">View all</Link>
          </div>

          <div className="space-y-3">
            {arrivals?.length === 0 && (
              <div className="card p-6 text-center text-slate-400 text-sm">
                No arrivals in the next 7 days
              </div>
            )}
            {arrivals?.map((booking: {
              id: string;
              checkIn: string;
              checkOut: string;
              guest: { id: string; firstName: string; lastName: string; riskLevel: RiskLevel; averageRating?: number; totalReviews: number };
              alert?: { type: 'danger' | 'warning' | 'success' | 'info'; title: string; message: string };
            }) => (
              <div
                key={booking.id}
                className={`card p-4 ${
                  booking.alert?.type === 'danger'
                    ? 'border-l-4 border-l-red-500'
                    : booking.alert?.type === 'warning'
                    ? 'border-l-4 border-l-orange-400'
                    : ''
                }`}
              >
                {booking.alert && (
                  <div className={`text-xs font-semibold mb-2 px-2 py-1 rounded ${
                    booking.alert.type === 'danger' ? 'bg-red-50 text-red-700' : 'bg-orange-50 text-orange-700'
                  }`}>
                    {booking.alert.type === 'danger' ? '⚠ ' : '! '}{booking.alert.title}
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-semibold text-sm">
                      {booking.guest.firstName?.[0]}{booking.guest.lastName?.[0]}
                    </div>
                    <div>
                      <Link to={`/guests/${booking.guest.id}`} className="font-medium text-slate-900 hover:text-brand-600 text-sm">
                        {booking.guest.firstName} {booking.guest.lastName}
                      </Link>
                      <p className="text-xs text-slate-500">
                        Check-in: {format(new Date(booking.checkIn), 'dd MMM yyyy')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <RiskBadge level={booking.guest.riskLevel} size="sm" />
                    {booking.guest.averageRating && (
                      <span className="text-xs text-slate-500">{booking.guest.averageRating.toFixed(1)}/6</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Recent reviews */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Recent Reviews</h2>
            <Link to="/reviews/new" className="text-sm text-brand-600 hover:underline">Write review</Link>
          </div>

          <div className="space-y-3">
            {stats?.recentActivity?.length === 0 && (
              <div className="card p-6 text-center text-slate-400 text-sm">
                No reviews yet. <Link to="/reviews/new" className="text-brand-600">Write your first review</Link>
              </div>
            )}
            {stats?.recentActivity?.map((review: {
              id: string;
              overallRating: number;
              publicComment?: string;
              createdAt: string;
              guest: { id: string; firstName: string; lastName: string; riskLevel: RiskLevel };
            }) => (
              <div key={review.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-semibold text-sm">
                    {review.guest.firstName?.[0]}{review.guest.lastName?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link to={`/guests/${review.guest.id}`} className="font-medium text-sm text-slate-900 hover:text-brand-600">
                        {review.guest.firstName} {review.guest.lastName}
                      </Link>
                      <StarRating value={review.overallRating} readonly size="sm" />
                    </div>
                    {review.publicComment && (
                      <p className="text-xs text-slate-500 mt-1 truncate">"{review.publicComment}"</p>
                    )}
                    <p className="text-xs text-slate-400 mt-1">{format(new Date(review.createdAt), 'dd MMM yyyy')}</p>
                  </div>
                  <RiskBadge level={review.guest.riskLevel} size="sm" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Risk breakdown */}
      {stats?.riskBreakdown && stats.riskBreakdown.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Guest Risk Profile</h2>
          <div className="card p-6">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              {stats.riskBreakdown.map(({ riskLevel, _count }: { riskLevel: RiskLevel; _count: { riskLevel: number } }) => (
                <div key={riskLevel} className="text-center">
                  <RiskBadge level={riskLevel} />
                  <p className="text-2xl font-bold text-slate-900 mt-2">{_count.riskLevel}</p>
                  <p className="text-xs text-slate-400">guests</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Quick actions */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Quick Actions</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { to: '/reviews/new', icon: '★', label: 'Write a Review', desc: 'Rate a recent guest' },
            { to: '/guests/search', icon: '🔍', label: 'Search Guest', desc: 'Look up arriving guest' },
            { to: '/reception', icon: '📞', label: 'Caller Lookup', desc: 'Identify caller by phone' },
            { to: '/integrations', icon: '🔗', label: 'Integrations', desc: 'Connect booking systems' },
          ].map(({ to, icon, label, desc }) => (
            <Link key={to} to={to} className="card p-4 hover:shadow-md transition-shadow flex items-center gap-4">
              <span className="text-2xl">{icon}</span>
              <div>
                <p className="font-medium text-slate-900 text-sm">{label}</p>
                <p className="text-xs text-slate-500">{desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: string; color: string }) {
  const colorMap: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    red: 'bg-red-50 text-red-600',
  };
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500 mb-1">{label}</p>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${colorMap[color] || colorMap.brand}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}
