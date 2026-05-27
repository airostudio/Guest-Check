import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';

// Pages
import Landing from './pages/Landing';
import ComingSoon from './pages/ComingSoon';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import GuestSearch from './pages/GuestSearch';
import GuestProfile from './pages/GuestProfile';
import WriteReview from './pages/WriteReview';
import Bookings from './pages/Bookings';
import Integrations from './pages/Integrations';
import Subscription from './pages/Subscription';
import Settings from './pages/Settings';
import Reception from './pages/Reception';
import AdminDashboard from './pages/AdminDashboard';
import NotFound from './pages/NotFound';

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<ComingSoon />} />
      <Route path="/platform" element={<Landing />} />
      <Route path="/verify-email/:token" element={<VerifyEmail />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password/:token" element={<ResetPassword />} />

      {/* Auth (public only) */}
      <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
      <Route path="/register" element={<PublicOnlyRoute><Register /></PublicOnlyRoute>} />

      {/* Protected app routes */}
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/guests/search" element={<GuestSearch />} />
        <Route path="/guests/:id" element={<GuestProfile />} />
        <Route path="/reviews/new" element={<WriteReview />} />
        <Route path="/reviews/new/:guestId" element={<WriteReview />} />
        <Route path="/bookings" element={<Bookings />} />
        <Route path="/integrations" element={<Integrations />} />
        <Route path="/subscription" element={<Subscription />} />
        <Route path="/subscription/success" element={<Subscription />} />
        <Route path="/settings" element={<Settings />} />
        <Route
          path="/reception"
          element={
            <ProtectedRoute roles={['SUPER_ADMIN', 'PROPERTY_ADMIN', 'PROPERTY_MANAGER', 'RECEPTIONIST']}>
              <Reception />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={['SUPER_ADMIN']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
