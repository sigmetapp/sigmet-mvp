'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type ProgressiveImageProps = {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  placeholder?: 'blur' | 'empty';
  blurDataURL?: string;
  priority?: boolean;
  onLoad?: () => void;
  onError?: () => void;
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  sizes?: string;
} & React.ImgHTMLAttributes<HTMLImageElement>;

/**
 * Progressive Image Component with blur placeholder
 * 
 * Features:
 * - Blur placeholder while loading
 * - Smooth fade-in animation
 * - Lazy loading support
 * - Error handling with fallback
 */
export default function ProgressiveImage({
  src,
  alt,
  className = '',
  width,
  height,
  placeholder = 'blur',
  blurDataURL,
  priority = false,
  onLoad,
  onError,
  objectFit = 'cover',
  sizes,
  ...rest
}: ProgressiveImageProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState<string>(src);
  const imgRef = useRef<HTMLImageElement>(null);

  // Generate blur placeholder if not provided
  const defaultBlurDataURL = blurDataURL || generateBlurPlaceholder(width || 400, height || 400);

  useEffect(() => {
    setCurrentSrc(src);
    setImageLoaded(false);
    setImageError(false);
  }, [src]);

  const handleLoad = () => {
    setImageLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    setImageError(true);
    onError?.();
  };

  const imageClassName = [
    className,
    'transition-opacity duration-300',
    imageLoaded ? 'opacity-100' : 'opacity-0',
    objectFit === 'cover' && 'object-cover',
    objectFit === 'contain' && 'object-contain',
    objectFit === 'fill' && 'object-fill',
    objectFit === 'none' && 'object-none',
    objectFit === 'scale-down' && 'object-scale-down',
  ]
    .filter(Boolean)
    .join(' ');

  const placeholderClassName = [
    'absolute inset-0 transition-opacity duration-500',
    imageLoaded ? 'opacity-0' : 'opacity-100',
    'blur-sm',
    'bg-slate-200 dark:bg-slate-700',
  ]
    .filter(Boolean)
    .join(' ');

  if (imageError) {
    return (
      <div
        className={`flex items-center justify-center bg-slate-200 dark:bg-slate-700 ${className}`}
        style={{ width, height }}
        role="img"
        aria-label={alt}
      >
        <svg
          className="w-8 h-8 text-slate-400 dark:text-slate-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden" style={{ width, height }}>
      {/* Blur placeholder */}
      {placeholder === 'blur' && (
        <AnimatePresence>
          {!imageLoaded && (
            <motion.img
              src={defaultBlurDataURL}
              alt=""
              className={placeholderClassName}
              style={{ width, height }}
              aria-hidden="true"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            />
          )}
        </AnimatePresence>
      )}

      {/* Actual image */}
      <img
        ref={imgRef}
        src={currentSrc}
        alt={alt}
        width={width}
        height={height}
        className={imageClassName}
        onLoad={handleLoad}
        onError={handleError}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        sizes={sizes}
        {...rest}
      />

      {/* Loading spinner (optional, shown while loading) */}
      {!imageLoaded && !imageError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600 dark:border-slate-600 dark:border-t-slate-300" />
        </div>
      )}
    </div>
  );
}

/**
 * Generate a simple blur placeholder (base64 encoded SVG)
 * This is a fallback if no blurDataURL is provided
 */
function generateBlurPlaceholder(width: number, height: number): string {
  // Create a simple SVG with a gradient pattern
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#e2e8f0;stop-opacity:1" />
          <stop offset="50%" style="stop-color:#cbd5e1;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#e2e8f0;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#grad)" />
    </svg>
  `.trim();

  // Convert to base64
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
