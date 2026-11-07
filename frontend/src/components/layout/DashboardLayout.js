import React, { useState, useEffect, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import ErrorBoundary from '../common/ErrorBoundary';
import PageTransition from '../common/PageTransition';
import './DashboardLayout.css';

export default function DashboardLayout({ title }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem('ff_sidebar_collapsed');
      if (saved !== null) {
        return saved === 'true';
      }
      if (typeof window !== 'undefined' && window.innerWidth < 1100 && window.innerWidth > 1024) {
        return true;
      }
    } catch {}
    return false;
  });

  // Auto-collapse when viewport drops below 1100px (desktop/tablet threshold)
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1100 && window.innerWidth > 1024) {
        setIsCollapsed(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleToggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('ff_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  }, []);

  return (
    <div className={`dashboard-layout ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Sidebar with Rail Collapse Mode */}
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
