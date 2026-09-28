import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
}

export function OrgAdminBrandLogo({ className = '', size = 36 }: LogoProps) {
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
        <linearGradient id="orgGlowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8B5CF6" />
          <stop offset="60%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#EC4899" />
        </linearGradient>
        <linearGradient id="orgBackdropGrad" x1="10%" y1="10%" x2="90%" y2="90%">
          <stop offset="0%" stopColor="#2E1065" />
          <stop offset="100%" stopColor="#0F172A" />
        </linearGradient>
        <linearGradient id="orgTowerGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#C084FC" />
          <stop offset="100%" stopColor="#7C3AED" />
        </linearGradient>
        <filter id="orgShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#8B5CF6" floodOpacity="0.4" />
        </filter>
      </defs>

      {/* Hexagonal Enterprise Container */}
      <rect
        x="2"
        y="2"
        width="44"
        height="44"
        rx="12"
        fill="url(#orgBackdropGrad)"
        stroke="url(#orgGlowGrad)"
        strokeWidth="1.75"
        filter="url(#orgShadow)"
      />

      {/* Enterprise Agency Architectural Tiers (3-Tier Talent Towers) */}
      {/* Left Tower: Bench Candidates */}
      <rect
        x="12"
        y="21"
        width="6.5"
        height="15"
        rx="2"
        fill="url(#orgGlowGrad)"
        opacity="0.4"
        stroke="#A855F7"
        strokeWidth="1.25"
      />
      <circle cx="15.25" cy="25" r="1.2" fill="#E9D5FF" />
      <circle cx="15.25" cy="29" r="1.2" fill="#E9D5FF" />

      {/* Center Tower: Main Headquarters / Leadership */}
      <rect
        x="20.75"
        y="14"
        width="6.5"
        height="22"
        rx="2"
        fill="url(#orgTowerGrad)"
        stroke="#E9D5FF"
        strokeWidth="1.5"
      />
      <circle cx="24" cy="18" r="1.3" fill="#FFFFFF" />
      <circle cx="24" cy="23" r="1.3" fill="#FFFFFF" />
      <circle cx="24" cy="28" r="1.3" fill="#FFFFFF" />

      {/* Right Tower: Recruiter Seats */}
      <rect
        x="29.5"
        y="18"
        width="6.5"
        height="18"
        rx="2"
        fill="url(#orgGlowGrad)"
        opacity="0.55"
        stroke="#F472B6"
        strokeWidth="1.25"
      />
      <circle cx="32.75" cy="22" r="1.2" fill="#FCE7F3" />
      <circle cx="32.75" cy="26" r="1.2" fill="#FCE7F3" />

      {/* Bottom Base Rail */}
      <path
        d="M10 38H38"
        stroke="url(#orgGlowGrad)"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Top Connected AI Synchronization Node */}
      <path
        d="M24 10V14"
        stroke="#F472B6"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="24" cy="9.5" r="2" fill="#F472B6" />
    </svg>
  );
}
