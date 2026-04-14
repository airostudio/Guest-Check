import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../api/client';
import RiskBadge from '../components/RiskBadge';
import { Booking, BookingStatus, RiskLevel } from '../types';
import { format } from 'date-fns';

const STATUS_COLORS: Record<BookingStatus, string> = {
  CONFIRMED: 'bg-blue-100 text-blue-700',
  CHECKED_IN: 'bg-emerald-100 text-emerald-700',
  CHECKED_OUT: 'bg-slate-100 text-slate-600',
  CANCELLED: 'bg-red-100 text-red-600',
  NO_SHOW: 'bg-orange-100 text-orange-700',
};

export default function Bookings() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [upcoming, setUpcoming] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['bookings', statusFilter, upcoming, page],
    queryFn: () =>
      api.get(`/bookings?page=${page}&limit=20${statusFilter ? `&status=${statusFilter}` : ''}${upcoming ? '&upcoming=true' : ''}`).then((r) => r.data),
  });

  const bookings: (Booking & { guest: { id: string; firstName: string; lastName: string; riskLevel: RiskLevel; averageRating?: number }; reviews: { id: string }[] })[] = data?.data || [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bookings</h1>
          <p className="text-slate-500 mt-1">Manage guest bookings and post-checkout reviews</p>
        </div>
        <Link to="/reviews/new" className="btn-primary text-sm">+ Leave Review</Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          className="input w-auto text-sm"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          <option value="">All statuses</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="CHECKED_IN">Checked In</option>
          <option value="CHECKED_OUT">Checked Out</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="NO_SHOW">No Show</option>
        </select>
        <button
          onClick={() => { setUpcoming(!upcoming); setPage(1); }}
          className={`btn text-sm ${upcoming ? 'btn-primary' : 'btn-secondary'}`}
        >
          Upcoming only
        </button>
      </div>

      {/* Bookings table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="card overflow-hidden">
          {bookings.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">No bookings found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Guest</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Check-in</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Check-out</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Risk</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bookings.map((booking) => (
                    <tr key={booking.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link to={`/guests/${booking.guest.id}`} className="font-medium text-slate-900 hover:text-brand-600">
                          {booking.guest.firstName} {booking.guest.lastName}
                        </Link>
                        {booking.source !== 'MANUAL' && (
                          <p className="text-xs text-slate-400 capitalize">{booking.source.replace('_', '.')}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {format(new Date(booking.checkIn), 'dd MMM yyyy')}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {format(new Date(booking.checkOut), 'dd MMM yyyy')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge text-xs ${STATUS_COLORS[booking.status]}`}>
                          {booking.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <RiskBadge level={booking.guest.riskLevel} size="sm" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link to={`/guests/${booking.guest.id}`} className="text-xs text-brand-600 hover:underline">
                            View guest
                          </Link>
                          {booking.status === 'CHECKED_OUT' && booking.reviews?.length === 0 && (
                            <Link to={`/reviews/new/${booking.guest.id}`} className="text-xs text-emerald-600 hover:underline">
                              Review
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} bookings)
          </p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary text-sm py-1.5">← Prev</button>
            <button onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))} disabled={page === pagination.totalPages} className="btn-secondary text-sm py-1.5">Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
