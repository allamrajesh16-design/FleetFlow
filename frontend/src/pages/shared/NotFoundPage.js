import AuroraBackground from "../../components/common/AuroraBackground";
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../../components/common/Button';
import Logo from '../../components/common/Logo';
import { useAuth, getHomePath } from '../../context/AuthContext';
import './StatusPages.css';

export default function NotFoundPage() {
  const navigate = useNavigate();
  const { role, isAuthenticated } = useAuth();

  return (
    <>
      <AuroraBackground />
      <div className="status-page-container fade-in">
      <div className="status-page-card">
        <div className="status-logo-wrapper">
          <Logo size="medium" />
        </div>

        <div className="status-code">404</div>
        <h1 className="status-title">Page Not Found</h1>
        <p className="status-description">
          The page you requested could not be found or may have been moved.
          Please check the URL or return to home.
        </p>

        <div className="status-actions">
          <Button variant="outline" size="medium" onClick={() => navigate(-1)}>
            Go Back
          </Button>
          <Link to={isAuthenticated ? getHomePath(role) : '/'}>
            <Button variant="primary" size="medium">
              Return to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  </>
  );
}
