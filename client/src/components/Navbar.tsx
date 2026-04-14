import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ChevronDown, Menu, X } from 'lucide-react';

const navLinks = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/guests/search', label: 'Guests' },
  { to: '/bookings', label: 'Bookings' },
  { to: '/reception', label: 'Reception' },
];

const adminLinks = [{ to: '/admin', label: 'Admin' }];

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/dashboard">
            <img src="/logo.png" alt="GuestCheck" style={{ width: 170 }} />
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive(to)
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {label}
              </Link>
            ))}
            {user?.role === 'SUPER_ADMIN' &&
              adminLinks.map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive(to) ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {label}
                </Link>
              ))}
          </div>

          {/* Right side */}
          <div className="hidden md:flex items-center gap-3">
            <Link to="/reviews/new" className="btn-primary text-sm px-3 py-1.5">
              + Leave Review
            </Link>

            {/* User menu */}
            <div className="relative group">
              <button className="flex items-center gap-2 p-1 rounded-lg hover:bg-slate-100 transition-colors">
                <div className="w-8 h-8 bg-brand-600 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                  {user?.firstName?.[0]}{user?.lastName?.[0]}
                </div>
                <span className="text-sm font-medium text-slate-700">{user?.firstName}</span>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>

              <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl border border-slate-200 shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50">
                <div className="p-3 border-b border-slate-100">
                  <p className="text-xs font-medium text-slate-900">{user?.firstName} {user?.lastName}</p>
                  <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                  {user?.property && (
                    <p className="text-xs text-brand-600 font-medium mt-1 truncate">{user.property.name}</p>
                  )}
                </div>
                <div className="p-1">
                  <Link to="/settings" className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg">
                    Settings
                  </Link>
                  <Link to="/subscription" className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg">
                    Subscription
                  </Link>
                  <Link to="/integrations" className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg">
                    Integrations
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-slate-100"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-slate-100 bg-white px-4 py-3 space-y-1">
          {[...navLinks, ...(user?.role === 'SUPER_ADMIN' ? adminLinks : [])].map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className="block px-3 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-100"
              onClick={() => setMenuOpen(false)}
            >
              {label}
            </Link>
          ))}
          <Link to="/reviews/new" className="block px-3 py-2 text-sm font-medium text-brand-600" onClick={() => setMenuOpen(false)}>
            + Leave Review
          </Link>
          <Link to="/settings" className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-md" onClick={() => setMenuOpen(false)}>Settings</Link>
          <button onClick={handleLogout} className="block w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md">Sign out</button>
        </div>
      )}
    </nav>
  );
}
