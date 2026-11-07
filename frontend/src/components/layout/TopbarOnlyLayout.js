import React from 'react';
import { Outlet } from 'react-router-dom';
import Topbar from './Topbar';
import ErrorBoundary from '../common/ErrorBoundary';
import PageTransition from '../common/PageTransition';
import './DashboardLayout.css';
import './TopbarOnlyLayout.css';

/**
 * TopbarOnlyLayout
 * Standalone layout that places ONLY the Topbar across the top and removes all navigation (sidebar / bottom nav).
 * Used for Profile and Notifications pages.
 */
export default function TopbarOnlyLayout({ title }) {
  return (
    <div className="dashboard-layout topbar-only-layout">
      <div className="dashboard-main topbar-only-main">
        <Topbar title={title} hideSidebarToggle />
        <main className="dashboard-content topbar-only-content">
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

