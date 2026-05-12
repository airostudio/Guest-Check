import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import { useAuth } from '../contexts/AuthContext';

export default function Layout() {
  const { user } = useAuth();

  // Show a banner if property is pending verification
  const showPendingBanner =
    user?.property?.status === 'PENDING_VERIFICATION';

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />

      {showPendingBanner && (
        <div className="bg-amber-500 text-white text-center text-sm py-2 px-4">
          <strong>Verification pending</strong> — Your property is being reviewed by our team. Most verifications complete within 24 hours.
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-slate-400">© {new Date().getFullYear()} GuestCheck. All rights reserved.</p>
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <a href="#" className="hover:text-slate-600">Privacy</a>
              <a href="#" className="hover:text-slate-600">Terms</a>
              <a href="#" className="hover:text-slate-600">Support</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
