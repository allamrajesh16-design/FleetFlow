import React, { useState, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import ErrorBoundary from '../common/ErrorBoundary';
import PageTransition from '../common/PageTransition';
import useBreakpoint from '../../hooks/useBreakpoint';
import './DashboardLayout.css';

export default function DashboardLayout({ title }) {
  const { layout, isPhone, isTablet } = useBreakpoint();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [manualCollapsed, setManualCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem('ff_sidebar_collapsed');
      if (saved !== null) return saved === 'true';
    } catch {}
    return false;
  });

  // Tablet tier strictly enforces 72px rail mode per RESPONSIVE.md
  const isCollapsed = isTablet || (!isPhone && manualCollapsed);

  const handleToggleCollapse = useCallback(() => {
    setManualCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('ff_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  }, []);

  return (
    <div
      className={`dashboard-layout ${isCollapsed ? 'sidebar-collapsed' : ''}`}
      data-layout={layout}
    >
      {/* Sidebar (Full, 72px Rail on Tablet, or Slide-in Drawer on Phone) */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isCollapsed={isCollapsed}
        onToggleCollapse={handleToggleCollapse}
      />

      {/* Main Content Area */}
      <div className="dashboard-main">
        <Topbar
          title={title}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        />
        <main id="main-content" className="dashboard-content">
          <ErrorBoundary componentName="this page">
            <PageTransition>
              <Outlet />
            </PageTransition>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
