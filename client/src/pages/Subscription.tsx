import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import api from '../api/client';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';

const PLANS = [
  {
    id: 'basic',
    name: 'Basic',
    price: '$29',
    period: '/month',
    features: ['50 reviews/month', '100 guest lookups/month', '3 team members', 'Webhook integrations', 'Email support'],
  },
  {
    id: 'professional',
    name: 'Professional',
    price: '$79',
    period: '/month',
    popular: true,
    features: ['500 reviews/month', '1,000 guest lookups/month', '10 team members', 'Full API access', 'Caller ID phone integration', 'High-risk email alerts', 'Priority support'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: '$199',
    period: '/month',
    features: ['Unlimited reviews & lookups', 'Unlimited team members', 'Dedicated account manager', 'Custom SLA', '24/7 phone support'],
  },
];

export default function Subscription() {
  const { user } = useAuth();
  const location = useLocation();
  const isSuccess = location.pathname.includes('/success');

  const { data: subData } = useQuery({
    queryKey: ['subscription'],
    queryFn: () => api.get('/subscriptions/current').then((r) => r.data.data),
  });

  const checkoutMutation = useMutation({
    mutationFn: (tier: string) => api.post('/subscriptions/checkout', { tier }),
    onSuccess: ({ data }) => {
      window.location.href = data.data.url;
    },
    onError: () => toast.error('Failed to start checkout'),
  });

  const portalMutation = useMutation({
    mutationFn: () => api.post('/subscriptions/portal'),
    onSuccess: ({ data }) => {
      window.location.href = data.data.url;
    },
    onError: () => toast.error('Failed to open billing portal'),
  });

  const currentTier = subData?.subscriptionTier?.toLowerCase();
  const isActive = subData?.isActive;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Success banner */}
      {isSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3">
          <span className="text-2xl">🎉</span>
          <div>
            <p className="font-semibold text-emerald-900">Subscription activated!</p>
            <p className="text-sm text-emerald-700">Welcome to GuestCheck. Your plan is now active.</p>
          </div>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Subscription</h1>
        <p className="text-slate-500 mt-1">Manage your GuestCheck subscription plan.</p>
      </div>

      {/* Current status */}
      {subData && (
        <div className="card p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Current Plan</h2>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="text-xl font-bold text-slate-900">
                  {subData.plan?.name || 'Free Trial'}
                </span>
                <span className={`badge text-xs ${
                  isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                }`}>
                  {subData.subscriptionStatus?.replace('_', ' ')}
                </span>
              </div>
              {subData.trialEndsAt && (
                <p className="text-sm text-amber-600 mt-1">
                  Trial ends {format(new Date(subData.trialEndsAt), 'dd MMM yyyy')}
                </p>
              )}
              {subData.plan && (
                <ul className="mt-3 space-y-1">
                  {subData.plan.features?.map((f: string) => (
                    <li key={f} className="text-sm text-slate-600 flex items-center gap-2">
                      <span className="text-emerald-500">✓</span>{f}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {subData.stripeSubscriptionId && (
              <button
                onClick={() => portalMutation.mutate()}
                disabled={portalMutation.isPending}
                className="btn-secondary text-sm"
              >
                {portalMutation.isPending ? 'Loading...' : 'Manage Billing →'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Plans */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-6">
          {currentTier && currentTier !== 'free_trial' ? 'Change Plan' : 'Choose a Plan'}
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {PLANS.map(({ id, name, price, period, popular, features }) => {
            const isCurrent = currentTier === id;
            return (
              <div
                key={id}
                className={`rounded-2xl p-6 relative ${
                  popular
                    ? 'bg-brand-700 text-white ring-2 ring-brand-500'
                    : 'card'
                } ${isCurrent ? 'ring-2 ring-emerald-500' : ''}`}
              >
                {popular && !isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-400 text-slate-900 text-xs font-bold px-3 py-1 rounded-full">
                    Most Popular
                  </div>
                )}
                {isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                    Current Plan
                  </div>
                )}
                <h3 className={`text-lg font-bold mb-1 ${popular ? 'text-white' : 'text-slate-900'}`}>{name}</h3>
                <div className="flex items-end gap-1 mb-4">
                  <span className={`text-3xl font-extrabold ${popular ? 'text-white' : 'text-slate-900'}`}>{price}</span>
                  <span className={`text-sm mb-0.5 ${popular ? 'text-brand-200' : 'text-slate-500'}`}>{period}</span>
                </div>
                <ul className="space-y-2 mb-6">
                  {features.map((f) => (
                    <li key={f} className={`flex items-center gap-2 text-sm ${popular ? 'text-brand-100' : 'text-slate-600'}`}>
                      <span className={popular ? 'text-emerald-300' : 'text-emerald-500'}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => !isCurrent && checkoutMutation.mutate(id)}
                  disabled={isCurrent || checkoutMutation.isPending}
                  className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-all ${
                    isCurrent
                      ? 'bg-emerald-100 text-emerald-700 cursor-default'
                      : popular
                      ? 'bg-white text-brand-700 hover:bg-brand-50'
                      : 'bg-brand-600 text-white hover:bg-brand-700'
                  }`}
                >
                  {isCurrent ? 'Current Plan' : checkoutMutation.isPending ? 'Loading...' : 'Select Plan'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Billing info */}
      <div className="card p-5 text-sm text-slate-500">
        <p className="font-medium text-slate-700 mb-2">Billing & Cancellation</p>
        <ul className="space-y-1 list-disc list-inside">
          <li>All plans include a 14-day free trial.</li>
          <li>Billing is monthly. Cancel anytime — no long-term contracts.</li>
          <li>Downgrading takes effect at the end of your current billing period.</li>
          <li>For enterprise pricing, invoicing, or annual plans, <a href="mailto:billing@guestcheck.io" className="text-brand-600 hover:underline">contact us</a>.</li>
        </ul>
      </div>
    </div>
  );
}
