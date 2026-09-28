import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
}

export const ExtensionLogo: React.FC<LogoProps> = ({ className = '', size = 32 }) => {
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
        <linearGradient id="extHeaderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0284C7" />
          <stop offset="50%" stopColor="#06B6D4" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
        <linearGradient id="extChamberGrad" x1="10%" y1="10%" x2="90%" y2="90%">
          <stop offset="0%" stopColor="#082F49" />
          <stop offset="100%" stopColor="#0369A1" />
        </linearGradient>
      </defs>

      {/* Rounded Squircle Container */}
      <rect
        x="2"
        y="2"
        width="44"
        height="44"
        rx="11"
        fill="url(#extChamberGrad)"
        stroke="url(#extHeaderGrad)"
        strokeWidth="1.75"
      />

      {/* Stylized J */}
      <path
        d="M20 14V27C20 30.5 17.5 32 15 31"
        stroke="#E0F2FE"
        strokeWidth="3.25"
        strokeLinecap="round"
      />

      {/* Stylized D */}
      <path
        d="M25 14H30C34.5 14 37 17.5 37 22.5C37 27.5 34.5 31 30 31H25V14Z"
        fill="url(#extHeaderGrad)"
        opacity="0.35"
      />
      <path
        d="M25 14H30C34.5 14 37 17.5 37 22.5C37 27.5 34.5 31 30 31H25V14Z"
        stroke="#FFFFFF"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Match Speed Sparkles */}
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
};
