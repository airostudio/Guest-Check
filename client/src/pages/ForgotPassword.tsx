import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { getErrorMessage } from '../api/errors';
import toast from 'react-hot-toast';
import { Mail } from 'lucide-react';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 to-brand-700 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center justify-center">
            <img src="/logo.png" alt="GuestCheck" style={{ width: 170, mixBlendMode: "multiply" as const }} />
          </Link>
        </div>

        <div className="card p-8">
          {sent ? (
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <div className="w-14 h-14 bg-brand-50 rounded-2xl flex items-center justify-center">
                  <Mail className="w-7 h-7 text-brand-600" />
                </div>
              </div>
              <h1 className="text-xl font-bold text-slate-900 mb-2">Check your email</h1>
              <p className="text-slate-600 text-sm mb-6">
                If an account exists for <strong>{email}</strong>, you'll receive a password reset link shortly.
              </p>
              <Link to="/login" className="btn-secondary w-full py-3">Back to login</Link>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-slate-900 mb-1">Reset your password</h1>
              <p className="text-sm text-slate-500 mb-6">Enter your work email and we'll send you a reset link.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">Email address</label>
                  <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full py-3">
                  {loading ? 'Sending...' : 'Send reset link'}
                </button>
              </form>
              <p className="text-center text-sm text-slate-500 mt-4">
                <Link to="/login" className="text-brand-600 hover:underline">Back to login</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
