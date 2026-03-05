import React from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Navbar from './components/Navbar';
import ErrorBoundary from './components/ErrorBoundary';
import DashboardPage from './pages/DashboardPage';
import ScanPage from './pages/ScanPage';
import ScanResultPage from './pages/ScanResultPage';
import HistoryPage from './pages/HistoryPage';

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

export default function App() {
  const location = useLocation();

  return (
    <ErrorBoundary>
      <Navbar />
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/"         element={<AnimatedPage><DashboardPage  /></AnimatedPage>} />
          <Route path="/scan"     element={<AnimatedPage><ScanPage       /></AnimatedPage>} />
          <Route path="/scan/:id" element={<AnimatedPage><ScanResultPage /></AnimatedPage>} />
          <Route path="/history"  element={<AnimatedPage><HistoryPage    /></AnimatedPage>} />
        </Routes>
      </AnimatePresence>
    </ErrorBoundary>
  );
}
