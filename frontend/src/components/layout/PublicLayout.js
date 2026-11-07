import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { SunIcon, MoonIcon } from '../common/Icons';
import IconButton from '../common/IconButton';
import ErrorBoundary from '../common/ErrorBoundary';
import PageTransition from '../common/PageTransition';
import './PublicLayout.css';

export default function PublicLayout() {
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();
  const isLanding = location.pathname === '/';

  return (
    <div className="public-layout">
      {!isLanding && (
        <div className="public-floating-theme-toggle">
          <IconButton
            icon={isDark ? <SunIcon size={20} color="var(--amber-500, #f59e0b)" /> : <MoonIcon size={20} />}
            onClick={toggleTheme}
            ariaLabel={`Switch to ${isDark ? 'light' : 'dark'} theme`}
            title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
            variant="ghost"
            shape="round"
            className="public-theme-btn"
          />
        </div>
      )}
      <main className="public-content">
        <ErrorBoundary componentName="this page">
          <PageTransition>
            <Outlet />
          </PageTransition>
        </ErrorBoundary>
      </main>
    </div>
  );
}
