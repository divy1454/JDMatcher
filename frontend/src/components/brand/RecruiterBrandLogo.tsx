import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
}

export function RecruiterBrandLogo({ className = '', size = 36 }: LogoProps) {
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
        <linearGradient id="recGlowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#10B981" />
          <stop offset="50%" stopColor="#059669" />
          <stop offset="100%" stopColor="#06B6D4" />
        </linearGradient>
        <linearGradient id="recBackdropGrad" x1="10%" y1="10%" x2="90%" y2="90%">
          <stop offset="0%" stopColor="#064E3B" />
          <stop offset="100%" stopColor="#042F2E" />
        </linearGradient>
        <linearGradient id="recSparkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#34D399" />
          <stop offset="100%" stopColor="#A7F3D0" />
        </linearGradient>
        <filter id="recShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#10B981" floodOpacity="0.4" />
        </filter>
      </defs>

      {/* Outer Squircle Container */}
      <rect
        x="2"
        y="2"
        width="44"
        height="44"
        rx="12"
        fill="url(#recBackdropGrad)"
        stroke="url(#recGlowGrad)"
        strokeWidth="1.75"
        filter="url(#recShadow)"
      />

      {/* Target Reticle Orbit Rings */}
      <circle
        cx="24"
        cy="24"
        r="14"
        stroke="#10B981"
        strokeWidth="1.25"
        strokeDasharray="4 3"
        opacity="0.45"
      />
      <circle
        cx="24"
        cy="24"
        r="8.5"
        stroke="#34D399"
        strokeWidth="1.5"
        opacity="0.75"
      />

      {/* Match Speed Crosshairs */}
      <path
        d="M24 6V11M24 37V42M6 24H11M37 24H42"
        stroke="url(#recGlowGrad)"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Precision Candidate Match Check & Spark */}
      <path
        d="M17 24.5L21.5 29L31 18.5"
        stroke="url(#recSparkGrad)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Precision Micro Sparkle Accent */}
      <circle cx="33" cy="15" r="1.5" fill="#67E8F9" />
    </svg>
  );
}
