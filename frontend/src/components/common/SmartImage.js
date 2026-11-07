import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import './SmartImage.css';

/**
 * SmartImage component
 * Tries the primary photo first; falls back smoothly through a list of fallback URLs,
 * and finally to SVG or inline icon if all sources fail.
 * Prevents layout shift, supports eager/lazy loading, and soft fade-in.
 * Handles cached images (img.complete check), 8-second safety timeout,
 * and guaranteed skeleton removal.
 */
export default function SmartImage({
  src,
  fallback,
  fallbacks,
  fallbackIcon,
  alt = '',
  aspectRatio = '16 / 9',
  objectFit = 'cover',
  objectPosition = 'center',
  className = '',
  style = {},
  imageStyle = {},
  priority = false,
  overlay = null,
  children = null,
  width,
  height,
  loading: loadingProp,
  fetchPriority,
  ...props
}) {
  const imgRef = useRef(null);

  // Build ordered list of candidate image URLs (primary src followed by fallbacks)
  const candidateSources = useMemo(() => {
    const list = [];
    if (typeof src === 'string' && src.trim()) {
      list.push(src.trim());
    }

    const appendCandidate = (item) => {
      if (Array.isArray(item)) {
        item.forEach(appendCandidate);
      } else if (typeof item === 'string' && item.trim()) {
        const trimmed = item.trim();
        if (!list.includes(trimmed)) {
          list.push(trimmed);
        }
      }
    };

    if (fallback) appendCandidate(fallback);
    if (fallbacks) appendCandidate(fallbacks);

    return list;
  }, [src, fallback, fallbacks]);

  const [candidateIndex, setCandidateIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [useIconFallback, setUseIconFallback] = useState(false);

  // Reset state whenever candidate sources or icon fallback changes
  useEffect(() => {
    setCandidateIndex(0);
    if (candidateSources.length > 0) {
      setLoading(true);
      setUseIconFallback(false);
    } else if (fallbackIcon || (fallback && React.isValidElement(fallback))) {
      setLoading(false);
      setUseIconFallback(true);
    } else {
      setLoading(false);
      setUseIconFallback(false);
    }
  }, [candidateSources, fallback, fallbackIcon]);

  const handleLoad = useCallback(() => {
    setLoading(false);
  }, []);

  const handleError = useCallback(() => {
    // If there is another fallback image in the chain, advance to it
    if (candidateIndex + 1 < candidateSources.length) {
      setCandidateIndex((prevIndex) => prevIndex + 1);
      setLoading(true);
    } else if (fallbackIcon || (fallback && React.isValidElement(fallback))) {
      // Reached end of string fallbacks; switch to icon or element fallback
      setUseIconFallback(true);
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, [candidateIndex, candidateSources.length, fallbackIcon, fallback]);

  // Check img.complete immediately on mount or src change (fixes cached images where onLoad never fires)
  useEffect(() => {
    if (imgRef.current && imgRef.current.complete) {
      if (imgRef.current.naturalWidth > 0) {
        setLoading(false);
      } else {
        // Cached failed load
        handleError();
      }
    }
  }, [candidateIndex, handleError]);

  // 8-second safety limit to give up and remove skeleton
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => {
      setLoading((currentLoading) => {
        if (currentLoading) {
          if (candidateIndex + 1 < candidateSources.length) {
            setCandidateIndex((prev) => prev + 1);
            return true;
          }
          if (fallbackIcon || (fallback && React.isValidElement(fallback))) {
            setUseIconFallback(true);
          }
          return false;
        }
        return false;
      });
    }, 8000);

    return () => clearTimeout(timer);
  }, [loading, candidateIndex, candidateSources.length, fallbackIcon, fallback]);

  const currentSrc = candidateSources[candidateIndex] || null;
  const isFallback = candidateIndex > 0;

  return (
    <div
      className={`smart-image-container ${className}`}
      style={{
        aspectRatio: aspectRatio !== 'auto' ? aspectRatio : undefined,
        ...style,
      }}
    >
      {/* Skeleton placeholder while image loads */}
      {loading && !useIconFallback && (
        <div className="smart-image-skeleton" aria-hidden="true" />
      )}

      {/* Inline Icon Fallback */}
      {useIconFallback ? (
        <div className="smart-image-icon-fallback">
          {fallbackIcon || (React.isValidElement(fallback) ? fallback : null)}
        </div>
      ) : (
        currentSrc && (
          <img
            ref={imgRef}
            src={currentSrc}
            alt={alt}
            width={width}
            height={height}
            loading={loadingProp || (priority ? 'eager' : 'lazy')}
            fetchpriority={fetchPriority || (priority ? 'high' : undefined)}
            onLoad={handleLoad}
            onError={handleError}
            className={`smart-image-img ${loading ? 'loading' : 'loaded'} ${
              isFallback ? 'is-fallback' : ''
            }`}
            style={{
              objectFit,
              objectPosition,
              filter: isFallback ? 'brightness(1.05) saturate(1.1)' : undefined,
              ...imageStyle,
            }}
            {...props}
          />
        )
      )}

      {/* Optional Gradient or Backdrop Overlay */}
      {overlay && <div className="smart-image-overlay">{overlay}</div>}

      {/* Children content rendered on top of image */}
      {children && <div className="smart-image-content">{children}</div>}
    </div>
  );
}
