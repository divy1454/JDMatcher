import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
}

export function LoginBrandLogo({ className = '', size = 56 }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="loginMainGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4F46E5" />
          <stop offset="45%" stopColor="#7C3AED" />
          <stop offset="80%" stopColor="#2563EB" />
          <stop offset="100%" stopColor="#06B6D4" />
        </linearGradient>
        <linearGradient id="loginDarkGrad" x1="15%" y1="10%" x2="85%" y2="90%">
          <stop offset="0%" stopColor="#1E1B4B" />
          <stop offset="50%" stopColor="#0F172A" />
          <stop offset="100%" stopColor="#020617" />
        </linearGradient>
        <linearGradient id="loginFacetA" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#818CF8" />
          <stop offset="100%" stopColor="#4F46E5" />
        </linearGradient>
        <linearGradient id="loginFacetB" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#A78BFA" />
          <stop offset="100%" stopColor="#7C3AED" />
        </linearGradient>
        <linearGradient id="loginCoreBeam" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="50%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#818CF8" />
        </linearGradient>
        <filter id="loginGlow" x="-25%" y="-25%" width="150%" height="150%">
          <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#6366F1" floodOpacity="0.45" />
        </filter>
      </defs>

      {/* Outer Hex-Shield Chamber */}
      <rect
        x="3"
        y="3"
        width="58"
        height="58"
        rx="18"
        fill="url(#loginDarkGrad)"
        stroke="url(#loginMainGrad)"
        strokeWidth="2.25"
        filter="url(#loginGlow)"
      />

      {/* Geometric Energy Matrix Grid */}
      <circle cx="32" cy="32" r="21" stroke="#334155" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
      <circle cx="32" cy="32" r="14" stroke="#475569" strokeWidth="1" opacity="0.5" />

      {/* Left Shield Wing (JD Document Parsing) */}
      <path
        d="M20 18L32 24V46L20 40V18Z"
        fill="url(#loginFacetA)"
        opacity="0.85"
      />

      {/* Right Shield Wing (Candidate Bench Vector) */}
      <path
        d="M44 18L32 24V46L44 40V18Z"
        fill="url(#loginFacetB)"
        opacity="0.95"
      />

      {/* Top Diamond Cap */}
      <path
        d="M32 14L44 18L32 24L20 18L32 14Z"
        fill="#C7D2FE"
        opacity="0.9"
      />

      {/* Central Match Nexus Core Beam */}
      <path
        d="M32 23V46"
        stroke="url(#loginCoreBeam)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Center AI Ignition Spark */}
      <circle cx="32" cy="32" r="3" fill="#FFFFFF" />
      <circle cx="32" cy="32" r="1.5" fill="#38BDF8" />

      {/* High-Tech Orbital Accents */}
      <circle cx="20" cy="18" r="2" fill="#38BDF8" />
      <circle cx="44" cy="18" r="2" fill="#F472B6" />
      <circle cx="32" cy="48" r="2" fill="#818CF8" />
    </svg>
  );
}
