import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { getErrorMessage } from '../api/errors';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

// `webhook` is the real receiver path, or null where no handler exists yet.
// Advertising a URL for a platform without a handler meant customers pasted a
// 404 into their channel manager and reservations silently never arrived.
const PLATFORMS = [
  { id: 'BOOKING_COM', name: 'Booking.com', logo: '🏨', desc: 'Sync reservations via channel manager API', webhook: '/api/integrations/webhooks/booking-com' },
  { id: 'AIRBNB', name: 'Airbnb', logo: '🏠', desc: 'Connect Airbnb hosting account via OAuth', webhook: '/api/integrations/webhooks/airbnb' },
  { id: 'EXPEDIA', name: 'Expedia', logo: '✈️', desc: 'Push bookings via the GuestCheck API', webhook: null },
  { id: 'HOTELS_COM', name: 'Hotels.com', logo: '🌐', desc: 'Push bookings via the GuestCheck API', webhook: null },
];

interface ApiKey {
  id: string;
  name: string;
  key: string;
  permissions: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

interface Integration {
  id: string;
  platform: string;
  isActive: boolean;
  lastSyncAt: string | null;
  externalId: string | null;
}

export default function Integrations() {
  const qc = useQueryClient();
  const [showNewKey, setShowNewKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [connectPlatform, setConnectPlatform] = useState<string | null>(null);
  const [platformConfig, setPlatformConfig] = useState({ accessToken: '', externalId: '' });

  const { data: apiKeys = [] } = useQuery<ApiKey[]>({
    queryKey: ['api-keys'],
    queryFn: () => api.get('/integrations/api-keys').then((r) => r.data.data),
  });

  const { data: integrations = [] } = useQuery<Integration[]>({
    queryKey: ['integrations'],
    queryFn: () => api.get('/integrations/platforms').then((r) => r.data.data),
  });

  const createKey = useMutation({
    mutationFn: (name: string) => api.post('/integrations/api-keys', { name }),
    onSuccess: ({ data }) => {
      setCreatedKey(data.data.key);
      qc.invalidateQueries({ queryKey: ['api-keys'] });
      setShowNewKey(false);
      setNewKeyName('');
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err, 'Failed to create API key')),
  });

  const revokeKey = useMutation({
    mutationFn: (id: string) => api.delete(`/integrations/api-keys/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('API key revoked');
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err, 'Failed to revoke API key')),
  });

  const connectMutation = useMutation({
    mutationFn: () =>
      api.post(`/integrations/platforms/${connectPlatform}`, platformConfig),
    onSuccess: ({ data }) => {
      qc.invalidateQueries({ queryKey: ['integrations'] });
      setConnectPlatform(null);
      setPlatformConfig({ accessToken: '', externalId: '' });
      toast.success('Platform connected successfully!');
      if (data.data.webhookUrl) {
        toast.success(`Webhook URL: ${data.data.webhookUrl}`, { duration: 8000 });
      } else if (data.data.message) {
        toast(data.data.message, { duration: 8000 });
      }
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err, 'Failed to connect platform')),
  });

  const getIntegration = (platformId: string) =>
    integrations.find((i) => i.platform === platformId);

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Integrations</h1>
        <p className="text-slate-500 mt-1">Connect your booking platforms and configure API access.</p>
      </div>

      {/* Booking Platforms */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Booking Platforms</h2>
        <div className="space-y-3">
          {PLATFORMS.map(({ id, name, logo, desc }) => {
            const integration = getIntegration(id);
            return (
              <div key={id} className="card p-5">
                <div className="flex items-center gap-4">
                  <span className="text-3xl">{logo}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{name}</h3>
                      {integration?.isActive && (
                        <span className="badge bg-emerald-100 text-emerald-700 text-xs">Connected</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5">{desc}</p>
                    {integration?.lastSyncAt && (
                      <p className="text-xs text-slate-400 mt-1">
                        Last sync: {format(new Date(integration.lastSyncAt), 'dd MMM yyyy HH:mm')}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setConnectPlatform(id)}
                    className={integration?.isActive ? 'btn-secondary text-sm' : 'btn-primary text-sm'}
                  >
                    {integration?.isActive ? 'Reconfigure' : 'Connect'}
                  </button>
                </div>

                {/* Connect modal */}
                {connectPlatform === id && (
                  <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                    <p className="text-sm text-slate-600">
                      Enter your {name} API credentials. See our{' '}
                      <a href="#" className="text-brand-600 hover:underline">integration guide</a>{' '}
                      for where to find these.
                    </p>
                    <div>
                      <label className="label">API Access Token / Key</label>
                      <input
                        type="text"
                        className="input font-mono text-sm"
                        placeholder="Paste your API token..."
                        value={platformConfig.accessToken}
                        onChange={(e) => setPlatformConfig({ ...platformConfig, accessToken: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="label">Property / Listing ID on {name}</label>
                      <input
                        type="text"
                        className="input"
                        placeholder="Your property ID on this platform"
                        value={platformConfig.externalId}
                        onChange={(e) => setPlatformConfig({ ...platformConfig, externalId: e.target.value })}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setConnectPlatform(null)} className="btn-secondary flex-1">Cancel</button>
                      <button
                        onClick={() => connectMutation.mutate()}
                        disabled={connectMutation.isPending || !platformConfig.accessToken}
                        className="btn-primary flex-1"
                      >
                        {connectMutation.isPending ? 'Connecting...' : 'Save Connection'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Webhook Info */}
      <section className="card p-5">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Webhook Endpoints</h2>
        <p className="text-sm text-slate-500 mb-4">
          Use these webhook URLs in your booking platform settings to automatically sync reservations:
        </p>
        {PLATFORMS.map(({ id, name, webhook }) => (
          <div key={id} className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 last:border-0">
            <span className="text-sm text-slate-600 font-medium">{name}</span>
            {webhook ? (
              <code className="text-xs bg-slate-100 px-2 py-1 rounded font-mono text-slate-700">
                {webhook}
              </code>
            ) : (
              <span className="text-xs text-slate-400 italic">
                Direct webhook coming soon — use the API
              </span>
            )}
          </div>
        ))}
      </section>

      {/* Phone Integration */}
      <section className="card p-5">
        <div className="flex items-start gap-4">
          <span className="text-3xl">📞</span>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-900">Phone / PBX Integration</h2>
            <p className="text-sm text-slate-500 mt-1 mb-3">
              Connect your phone system (PABX/VOIP) to automatically look up callers. When a known number calls reception, the guest's review profile pops up instantly.
            </p>
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs font-semibold text-slate-700 mb-1">Caller lookup API endpoint:</p>
              <code className="text-xs font-mono text-brand-700">GET /api/phone/caller/:phoneNumber</code>
              <p className="text-xs text-slate-500 mt-2">Pass your API key in <code>X-API-Key</code> header. Returns guest profile + risk level within 50ms.</p>
            </div>
            <div className="mt-3 flex gap-2">
              <a href="/reception" className="btn-primary text-sm">Try Caller Lookup</a>
            </div>
          </div>
        </div>
      </section>

      {/* API Keys */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">API Keys</h2>
          <button onClick={() => setShowNewKey(!showNewKey)} className="btn-primary text-sm">
            + New API Key
          </button>
        </div>

        {/* Created key display */}
        {createdKey && (
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-sm font-semibold text-amber-900 mb-1">⚠ Save this API key now — it will not be shown again</p>
            <div className="flex items-center gap-2 mt-2">
              <code className="flex-1 text-xs font-mono bg-white border border-amber-200 px-3 py-2 rounded text-slate-800 overflow-x-auto">
                {createdKey}
              </code>
              <button
                onClick={() => { navigator.clipboard.writeText(createdKey); toast.success('Copied!'); }}
                className="btn-secondary text-xs py-2"
              >
                Copy
              </button>
            </div>
            <button onClick={() => setCreatedKey(null)} className="text-xs text-amber-700 mt-2 hover:underline">
              I've saved it, dismiss
            </button>
          </div>
        )}

        {/* New key form */}
        {showNewKey && (
          <div className="card p-4 mb-4">
            <label className="label">API key name</label>
            <div className="flex gap-2">
              <input
                type="text"
                className="input flex-1"
                placeholder="e.g. Booking.com integration"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
              />
              <button
                onClick={() => createKey.mutate(newKeyName)}
                disabled={createKey.isPending || !newKeyName}
                className="btn-primary"
              >
                {createKey.isPending ? 'Creating...' : 'Create'}
              </button>
              <button onClick={() => setShowNewKey(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        )}

        {/* Keys list */}
        <div className="space-y-2">
          {apiKeys.length === 0 && (
            <div className="card p-6 text-center text-slate-400 text-sm">
              No API keys yet. Create one to start integrating with your booking systems.
            </div>
          )}
          {apiKeys.map((key) => (
            <div key={key.id} className="card p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900 text-sm">{key.name}</p>
                  <code className="text-xs font-mono text-slate-500">{key.key}</code>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                    <span>Created {format(new Date(key.createdAt), 'dd MMM yyyy')}</span>
                    {key.lastUsedAt && <span>Last used {format(new Date(key.lastUsedAt), 'dd MMM yyyy')}</span>}
                    {key.expiresAt && <span>Expires {format(new Date(key.expiresAt), 'dd MMM yyyy')}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`badge text-xs ${key.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {key.isActive ? 'Active' : 'Revoked'}
                  </span>
                  {key.isActive && (
                    <button
                      onClick={() => revokeKey.mutate(key.id)}
                      className="btn-danger text-xs py-1 px-2"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
