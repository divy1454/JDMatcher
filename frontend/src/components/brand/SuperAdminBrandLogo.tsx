import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
}

export function SuperAdminBrandLogo({ className = '', size = 36 }: LogoProps) {
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
        <linearGradient id="saGlowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4F46E5" />
          <stop offset="50%" stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#06B6D4" />
        </linearGradient>
        <linearGradient id="saShieldGrad" x1="20%" y1="10%" x2="80%" y2="90%">
          <stop offset="0%" stopColor="#1E1B4B" />
          <stop offset="100%" stopColor="#0F172A" />
        </linearGradient>
        <linearGradient id="saCoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#818CF8" />
        </linearGradient>
        <filter id="saShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#4F46E5" floodOpacity="0.4" />
        </filter>
      </defs>

      {/* Rounded Hexagonal Shield Frame */}
      <rect
        x="2"
        y="2"
        width="44"
        height="44"
        rx="12"
        fill="url(#saShieldGrad)"
        stroke="url(#saGlowGrad)"
        strokeWidth="1.75"
        filter="url(#saShadow)"
      />

      {/* Security Outer Nodes */}
      <circle cx="24" cy="9" r="2" fill="#38BDF8" />
      <circle cx="9" cy="24" r="2" fill="#818CF8" />
      <circle cx="39" cy="24" r="2" fill="#818CF8" />
      <circle cx="24" cy="39" r="2" fill="#A78BFA" />

      {/* Interconnecting Circuit Lines */}
      <path
        d="M24 9V17M9 24H17M39 24H31M24 39V31"
        stroke="url(#saGlowGrad)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray="2 2"
      />

      {/* Main Governance Shield */}
      <path
        d="M24 15L32 19V26C32 31 28.5 34.5 24 36C19.5 34.5 16 31 16 26V19L24 15Z"
        fill="url(#saGlowGrad)"
        opacity="0.25"
      />
      <path
        d="M24 15L32 19V26C32 31 28.5 34.5 24 36C19.5 34.5 16 31 16 26V19L24 15Z"
        stroke="#60A5FA"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />

      {/* Central Platform Key / Core Pulse */}
      <circle cx="24" cy="24" r="3.5" fill="url(#saCoreGrad)" />
      <circle cx="24" cy="24" r="1.5" fill="#FFFFFF" />
      <path
        d="M24 27.5V31"
        stroke="#FFFFFF"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
