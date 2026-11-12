import React, { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ThemeProvider } from './context/ThemeContext';
import AppRoutes from './routes/AppRoutes';
import ScrollToTop from './components/common/ScrollToTop';
import { applyMotionLevel } from './utils/motionLevel';
import './styles/tokens.css';
import './styles/index.css';
import './styles/global.css';
import './styles/motion.css';

import ErrorBoundary from './components/common/ErrorBoundary';

export default function App() {
  useEffect(() => {
    // Initialize data-motion attribute on <html> ("full" | "lite" | "off")
    applyMotionLevel();

    // Listen for system prefers-reduced-motion changes
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      const handleChange = () => applyMotionLevel();
      mediaQuery.addEventListener?.('change', handleChange);
      return () => mediaQuery.removeEventListener?.('change', handleChange);
    }
  }, []);

  return (
    <ErrorBoundary componentName="Application">
      <ThemeProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ScrollToTop />
          <ToastProvider>
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </ToastProvider>
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
