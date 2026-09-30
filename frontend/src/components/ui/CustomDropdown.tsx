'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface DropdownOption {
  value: string;
  label: string;
  sublabel?: string;
  badge?: string;
  icon?: React.ReactNode;
  color?: string;
}

interface CustomDropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  size?: 'sm' | 'md';
}

export function CustomDropdown({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  icon,
  disabled = false,
  className = '',
  buttonClassName = '',
  menuClassName = '',
  size = 'md',
}: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('touchstart', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  const isSmall = size === 'sm';

  return (
    <div
      ref={containerRef}
      className={`relative inline-block w-full select-none ${className}`}
    >
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`group relative flex w-full items-center justify-between gap-2 rounded-xl border transition-all duration-200 outline-none backdrop-blur-xl ${
          isOpen
            ? 'border-indigo-500 bg-slate-900/90 shadow-lg shadow-indigo-500/10 ring-2 ring-indigo-500/20'
            : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900/80 hover:shadow-md'
        } ${
          isSmall ? 'py-1.5 px-2.5 text-xs' : 'py-2.5 px-3.5 text-xs sm:text-sm'
        } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${buttonClassName}`}
      >
        <div className="flex items-center gap-2.5 overflow-hidden text-left min-w-0">
          {icon && (
            <span
              className={`shrink-0 transition-colors ${
                isOpen ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-300'
              }`}
            >
              {icon}
            </span>
          )}

          {selectedOption ? (
            <div className="flex items-center gap-2 overflow-hidden truncate">
              {selectedOption.icon && (
                <span className="shrink-0">{selectedOption.icon}</span>
              )}
              <span
                className={`truncate font-medium ${
                  selectedOption.color || 'text-slate-200'
                }`}
              >
                {selectedOption.label}
              </span>
              {selectedOption.badge && (
                <span className="shrink-0 rounded-md bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300 border border-indigo-500/20">
                  {selectedOption.badge}
                </span>
              )}
            </div>
          ) : (
            <span className="truncate text-slate-400 font-normal">{placeholder}</span>
          )}
        </div>

        <ChevronDown
          className={`shrink-0 text-slate-400 transition-transform duration-200 group-hover:text-slate-300 ${
            isSmall ? 'h-3.5 w-3.5' : 'h-4 w-4'
          } ${isOpen ? 'rotate-180 text-indigo-400' : ''}`}
        />
      </button>

      {/* Custom Dropdown Popover Options Menu */}
      {isOpen && (
        <div
          role="listbox"
          className={`absolute left-0 z-50 mt-1.5 w-full min-w-[200px] overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950/95 p-1.5 shadow-2xl shadow-black/80 backdrop-blur-2xl ring-1 ring-white/10 animate-in fade-in-0 zoom-in-95 duration-150 ${menuClassName}`}
          style={{ maxHeight: '280px' }}
        >
          <div className="overflow-y-auto max-h-[260px] space-y-0.5 pr-0.5 custom-dropdown-scroll">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-center text-xs text-slate-400">
                No options available
              </div>
            ) : (
              options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <div
                    key={opt.value}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(opt.value)}
                    className={`group/opt flex cursor-pointer items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-xs sm:text-sm transition-all duration-150 ${
                      isSelected
                        ? 'bg-indigo-600/20 font-semibold text-white border border-indigo-500/30 shadow-sm'
                        : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden min-w-0">
                      {opt.icon && (
                        <span className="shrink-0 transition-transform group-hover/opt:scale-110">
                          {opt.icon}
                        </span>
                      )}
                      <div className="flex flex-col overflow-hidden min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`truncate ${
                              isSelected ? 'text-white' : opt.color || 'text-slate-200'
                            }`}
                          >
                            {opt.label}
                          </span>
                          {opt.badge && (
                            <span className="shrink-0 rounded-md bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300 border border-indigo-500/20">
                              {opt.badge}
                            </span>
                          )}
                        </div>
                        {opt.sublabel && (
                          <span className="truncate text-[11px] text-slate-400">
                            {opt.sublabel}
                          </span>
                        )}
                      </div>
                    </div>

                    {isSelected && (
                      <Check className="h-4 w-4 shrink-0 text-indigo-400" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
