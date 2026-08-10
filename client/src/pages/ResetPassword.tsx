import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/client';
import { getErrorMessage } from '../api/errors';
import toast from 'react-hot-toast';

export default function ResetPassword() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) { toast.error('Passwords do not match'); return; }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password: form.password });
      toast.success('Password reset! Please log in.');
      navigate('/login');
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Reset failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 to-brand-700 flex items-center justify-center p-4">
      <div className="card p-8 max-w-md w-full">
        <h1 className="text-xl font-bold text-slate-900 mb-1">Set new password</h1>
        <p className="text-sm text-slate-500 mb-6">At least 10 characters, including an uppercase letter and a number.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">New password</label>
            <input type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={10} />
          </div>
          <div>
            <label className="label">Confirm password</label>
            <input type="password" className="input" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full py-3">
            {loading ? 'Resetting...' : 'Reset password'}
          </button>
        </form>
        <p className="text-center text-sm text-slate-500 mt-4">
          <Link to="/login" className="text-brand-600 hover:underline">Back to login</Link>
        </p>
      </div>
    </div>
  );
}
