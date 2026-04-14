import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function NotFound() {
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="text-8xl mb-6">🏨</div>
        <h1 className="text-4xl font-bold text-slate-900 mb-2">404</h1>
        <p className="text-slate-600 mb-8">This page doesn't exist or has been moved.</p>
        <Link to={user ? '/dashboard' : '/'} className="btn-primary px-8 py-3">
          {user ? 'Back to Dashboard' : 'Back to Home'}
        </Link>
      </div>
    </div>
  );
}
