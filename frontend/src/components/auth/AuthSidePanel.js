import React from 'react';
import Logo from '../common/Logo';
import SmartImage from '../common/SmartImage';
import './AuthSidePanel.css';

/**
 * AuthSidePanel
 * Fixed full-height left side panel for Login and Register pages.
 * Displays portrait photo with soft fade-in, dark navy-to-blue gradient overlay,
 * top-left FleetFlow logo, and bottom headline, tagline sentence, and 3 feature points.
 */
export default function AuthSidePanel({
  imageConfig,
  headline,
  sentence,
  points = [],
}) {
  return (
    <aside className="auth-side-panel" aria-label="FleetFlow Overview">
      <SmartImage
        src={imageConfig?.src}
        fallback={imageConfig?.fallback}
        fallbacks={imageConfig?.fallbacks}
        alt={imageConfig?.alt || 'FleetFlow Connected Transit'}
        aspectRatio="auto"
        objectFit="cover"
        objectPosition="center"
        width={900}
        height={1200}
        priority
        loading="eager"
        className="auth-side-smart-image"
        overlay={<div className="auth-side-gradient-overlay" aria-hidden="true" />}
      />

      <div className="auth-side-content">
        {/* Top Left Logo */}
        <div className="auth-side-top motion-auth-logo">
          <Logo light size="large" />
        </div>

        {/* Bottom Headline, Sentence and Feature Points */}
        <div className="auth-side-bottom">
          <div className="auth-side-accent-line motion-auth-accent" aria-hidden="true" />
          <div className="auth-side-hero-text motion-auth-text">
            <h2 className="auth-side-headline">{headline}</h2>
            <p className="auth-side-sentence">{sentence}</p>
          </div>

          {points.length > 0 && (
            <ul className="auth-side-features" aria-label="Highlights">
              {points.map((point, index) => (
                <li
                  key={index}
                  className="auth-side-feature-item motion-auth-point"
                  style={{ animationDelay: `${280 + index * 90}ms` }}
                >
                  <span className="auth-side-check-badge" aria-hidden="true">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </span>
                  <span className="auth-side-feature-label">{point}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}

/**
 * AuthMobileHeader
 * Slim gradient header displayed above the form on mobile screens (<= 900px)
 */
export function AuthMobileHeader({ sentence }) {
  return (
    <header className="auth-mobile-header" role="banner">
      <Logo light size="medium" />
      {sentence && <p className="auth-mobile-tagline">{sentence}</p>}
    </header>
  );
}
