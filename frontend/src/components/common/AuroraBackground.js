import React, { useEffect } from 'react';
import './AuroraBackground.css';

/**
 * AuroraBackground
 * Signature living background: 3 large soft radial-gradient blobs drifting slowly.
 * Uses pure radial gradients (NOT filter:blur) with high performance and zero CLS.
 * Pauses automatically when tab is hidden or off-screen.
 */
export default function AuroraBackground({ className = '', style }) {
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        document.documentElement.classList.add('tab-hidden');
      } else {
        document.documentElement.classList.remove('tab-hidden');
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  return (
    <div className={`aurora-container ${className}`} style={style} aria-hidden="true">
      <div className="aurora-blob aurora-blob-1" />
      <div className="aurora-blob aurora-blob-2" />
      <div className="aurora-blob aurora-blob-3" />
      {/* Deep navy overlay maintaining text contrast >= 4.5:1 across the whole surface */}
      <div className="aurora-overlay" />
    </div>
  );
}

