import React from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Navbar from './components/Navbar';
import ErrorBoundary from './components/ErrorBoundary';
import DashboardPage from './pages/DashboardPage';
import ScanPage from './pages/ScanPage';
import ScanResultPage from './pages/ScanResultPage';
import HistoryPage from './pages/HistoryPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import OrgDashboardPage from './pages/OrgDashboardPage';
import { AuthProvider, useAuth } from './context/AuthContext';

const pageVariants = {
  initial: { opacity: 0, y: 18 },
  enter:   { opacity: 1, y: 0,  transition: { duration: 0.38, ease: 'easeOut' } },
  exit:    { opacity: 0, y: -12, transition: { duration: 0.25, ease: 'easeIn'  } },
};

function AnimatedPage({ children }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="enter"
      exit="exit"
    >
      {children}
    </motion.div>
  );
}

/**
 * Wraps a route so only authenticated users can access it.
 * Unauthenticated visitors are redirected to /login, with the
 * original destination saved in location state for post-login redirect.
 */
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location          = useLocation();

  if (loading) return null; // Avoid flash of redirect while session is restoring

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

/**
 * Redirects already-authenticated users away from auth pages (login / register).
 */
function GuestRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  const location = useLocation();
  // Only show Navbar on non-auth pages
  const hideNavbar = ['/login', '/register'].includes(location.pathname);

  return (
    <ErrorBoundary>
      {!hideNavbar && <Navbar />}
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          {/* Auth pages — accessible only when logged out */}
          <Route path="/login"    element={<GuestRoute><AnimatedPage><LoginPage    /></AnimatedPage></GuestRoute>} />
          <Route path="/register" element={<GuestRoute><AnimatedPage><RegisterPage /></AnimatedPage></GuestRoute>} />

          {/* Protected pages — require authentication */}
          <Route path="/"         element={<ProtectedRoute><AnimatedPage><DashboardPage    /></AnimatedPage></ProtectedRoute>} />
          <Route path="/org"      element={<ProtectedRoute><AnimatedPage><OrgDashboardPage /></AnimatedPage></ProtectedRoute>} />
          <Route path="/scan"     element={<ProtectedRoute><AnimatedPage><ScanPage         /></AnimatedPage></ProtectedRoute>} />
          <Route path="/scan/:id" element={<ProtectedRoute><AnimatedPage><ScanResultPage   /></AnimatedPage></ProtectedRoute>} />
          <Route path="/history"  element={<ProtectedRoute><AnimatedPage><HistoryPage      /></AnimatedPage></ProtectedRoute>} />
        </Routes>
      </AnimatePresence>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
