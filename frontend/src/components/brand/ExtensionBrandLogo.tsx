import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
}

export function ExtensionBrandLogo({ className = '', size = 36 }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="extGlowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0284C7" />
          <stop offset="50%" stopColor="#06B6D4" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
        <linearGradient id="extDarkGrad" x1="10%" y1="10%" x2="90%" y2="90%">
          <stop offset="0%" stopColor="#082F49" />
          <stop offset="100%" stopColor="#0369A1" />
        </linearGradient>
        <filter id="extShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#0284C7" floodOpacity="0.45" />
        </filter>
      </defs>

      {/* Rounded Squircle Container */}
      <rect
        x="2"
        y="2"
        width="44"
        height="44"
        rx="11"
        fill="url(#extDarkGrad)"
        stroke="url(#extGlowGrad)"
        strokeWidth="1.75"
        filter="url(#extShadow)"
      />

      {/* Stylized J and D Intersection */}
      {/* J stroke */}
      <path
        d="M20 14V27C20 30.5 17.5 32 15 31"
        stroke="#E0F2FE"
        strokeWidth="3.25"
        strokeLinecap="round"
      />

      {/* D curve */}
      <path
        d="M25 14H30C34.5 14 37 17.5 37 22.5C37 27.5 34.5 31 30 31H25V14Z"
        fill="url(#extGlowGrad)"
        opacity="0.3"
      />
      <path
        d="M25 14H30C34.5 14 37 17.5 37 22.5C37 27.5 34.5 31 30 31H25V14Z"
        stroke="#FFFFFF"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Fast Match Pulse Sparks */}
      <circle cx="20" cy="14" r="1.8" fill="#38BDF8" />
      <circle cx="37" cy="14" r="2.2" fill="#38BDF8" />
      <path
        d="M37 10V18M33 14H41"
        stroke="#BAE6FD"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}
