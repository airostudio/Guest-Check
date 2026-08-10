import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { getErrorMessage } from '../api/errors';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

type AdminTab = 'pending' | 'flagged' | 'stats';

export default function AdminDashboard() {
  const [tab, setTab] = useState<AdminTab>('pending');
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => api.get('/admin/stats').then((r) => r.data.data),
  });

  const { data: pending = [] } = useQuery({
    queryKey: ['pending-properties'],
    queryFn: () => api.get('/admin/properties/pending').then((r) => r.data.data),
    enabled: tab === 'pending',
  });

  const { data: flagged = [] } = useQuery({
    queryKey: ['flagged-reviews'],
    queryFn: () => api.get('/admin/reviews/flagged').then((r) => r.data.data),
    enabled: tab === 'flagged',
  });

  // Every mutation needs an onError: React Query v5 swallows the rejection, so
  // without one a failed approval produced no toast, no error and no UI change —
  // indistinguishable from not having clicked. Approval activates every user on
  // the property, so a silent failure locks the customer out.
  const approveMutation = useMutation({
    mutationFn: (id: string) => api.post(`/admin/properties/${id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-properties'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
      toast.success('Property approved');
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err, 'Failed to approve property')),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/admin/properties/${id}/reject`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-properties'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
      setRejectingId(null);
      setRejectReason('');
      toast.success('Property rejected');
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err, 'Failed to reject property')),
  });

  const moderateMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      api.post(`/admin/reviews/${id}/moderate`, { action }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flagged-reviews'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
      toast.success('Review moderated');
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err, 'Failed to moderate review')),
  });

  const TABS: { id: AdminTab; label: string; count?: number }[] = [
    { id: 'pending', label: 'Pending Verification', count: stats?.pendingProperties },
    { id: 'flagged', label: 'Flagged Reviews', count: stats?.flaggedReviews },
    { id: 'stats', label: 'Platform Stats' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
        <p className="text-slate-500 mt-1">Manage properties, reviews, and platform health.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map(({ id, label, count }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === id ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
            {count !== undefined && count > 0 && (
              <span className="ml-1.5 bg-red-100 text-red-700 text-xs px-1.5 py-0.5 rounded-full">{count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Pending Properties */}
      {tab === 'pending' && (
        <div className="space-y-4">
          {pending.length === 0 && (
            <div className="card p-8 text-center text-slate-400 text-sm">No properties pending verification</div>
          )}
          {pending.map((prop: {
            id: string;
            name: string;
            type: string;
            address: string;
            city: string;
            country: string;
            phone?: string;
            website?: string;
            vatNumber?: string;
            createdAt: string;
            users: { email: string; firstName: string; lastName: string }[];
          }) => (
            <div key={prop.id} className="card p-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900 text-lg">{prop.name}</h3>
                  <p className="text-sm text-slate-500 mt-0.5">{prop.type.replace('_', ' ')} · {prop.address}, {prop.city}, {prop.country}</p>
                  {prop.phone && <p className="text-sm text-slate-500">📞 {prop.phone}</p>}
                  {prop.website && <p className="text-sm text-slate-500">🌐 {prop.website}</p>}
                  {prop.vatNumber && <p className="text-sm text-slate-500">VAT: {prop.vatNumber}</p>}
                  <p className="text-xs text-slate-400 mt-2">Registered: {format(new Date(prop.createdAt), 'dd MMM yyyy HH:mm')}</p>
                  {prop.users?.[0] && (
                    <p className="text-xs text-slate-500 mt-1">
                      Contact: {prop.users[0].firstName} {prop.users[0].lastName} ({prop.users[0].email})
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => approveMutation.mutate(prop.id)}
                    disabled={approveMutation.isPending}
                    className="btn-success text-sm"
                  >
                    ✓ Approve
                  </button>
                  <button
                    onClick={() => setRejectingId(rejectingId === prop.id ? null : prop.id)}
                    className="btn-danger text-sm"
                  >
                    ✗ Reject
                  </button>
                </div>
              </div>

              {rejectingId === prop.id && (
                <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                  <label className="label">Rejection reason</label>
                  <textarea
                    className="input resize-none"
                    rows={2}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Why is this property being rejected?"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setRejectingId(null)} className="btn-secondary flex-1">Cancel</button>
                    <button
                      onClick={() => rejectMutation.mutate({ id: prop.id, reason: rejectReason })}
                      disabled={rejectMutation.isPending || !rejectReason}
                      className="btn-danger flex-1"
                    >
                      Confirm Rejection
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Flagged Reviews */}
      {tab === 'flagged' && (
        <div className="space-y-4">
          {flagged.length === 0 && (
            <div className="card p-8 text-center text-slate-400 text-sm">No flagged reviews</div>
          )}
          {flagged.map((review: {
            id: string;
            overallRating: number;
            publicComment?: string;
            flagReason?: string;
            guest: { firstName: string; lastName: string };
            property: { name: string };
            reviewer: { firstName: string; lastName: string; email: string };
          }) => (
            <div key={review.id} className="card p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-medium text-slate-900">
                    Review of {review.guest.firstName} {review.guest.lastName} at {review.property.name}
                  </p>
                  <p className="text-sm text-slate-500">Rating: {review.overallRating}/6</p>
                  {review.publicComment && (
                    <p className="text-sm text-slate-600 italic mt-1">"{review.publicComment}"</p>
                  )}
                  {review.flagReason && (
                    <p className="text-xs text-red-600 mt-1">Flag reason: {review.flagReason}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-1">
                    By: {review.reviewer.firstName} {review.reviewer.lastName} ({review.reviewer.email})
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => moderateMutation.mutate({ id: review.id, action: 'approve' })}
                    className="btn-success text-sm"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => moderateMutation.mutate({ id: review.id, action: 'remove' })}
                    className="btn-danger text-sm"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Platform Stats */}
      {tab === 'stats' && stats && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { label: 'Active Properties', value: stats.totalProperties, color: 'text-brand-600' },
            { label: 'Pending Verification', value: stats.pendingProperties, color: 'text-amber-600' },
            { label: 'Total Guests', value: stats.totalGuests, color: 'text-slate-700' },
            { label: 'Published Reviews', value: stats.totalReviews, color: 'text-emerald-600' },
            { label: 'Flagged Reviews', value: stats.flaggedReviews, color: 'text-orange-600' },
            { label: 'High-Risk Guests', value: stats.highRiskGuests, color: 'text-red-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="card p-5">
              <p className="text-sm text-slate-500">{label}</p>
              <p className={`text-3xl font-bold mt-1 ${color}`}>{value?.toLocaleString() ?? '—'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
