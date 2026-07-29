import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { createPortal } from 'react-dom';

export type StyledSelectOption = {
  label: string;
  value: string;
  disabled?: boolean;
};

interface StyledSelectProps {
  value: string;
  options: StyledSelectOption[];
  onChange: (value: string) => void;
  className?: string;
  buttonClassName?: string;
  disabled?: boolean;
  variant?: 'light' | 'dark';
  size?: 'sm' | 'md';
  menuPosition?: 'top' | 'bottom';
  searchable?: boolean;
  searchPlaceholder?: string;
}

const StyledSelect: React.FC<StyledSelectProps> = ({
  value,
  options,
  onChange,
  className = '',
  buttonClassName = '',
  disabled = false,
  variant = 'light',
  size = 'md',
  menuPosition = 'bottom',
  searchable = false,
  searchPlaceholder = 'Search...',
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [menuStyles, setMenuStyles] = useState<React.CSSProperties>({});

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? options[0],
    [options, value]
  );
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!searchable || normalizedQuery.length === 0) {
      return options;
    }

    return options.filter((option) => option.label.toLowerCase().includes(normalizedQuery));
  }, [options, query, searchable]);

  useEffect(() => {
    if (!open) return;

    const updateMenuPosition = () => {
      const trigger = wrapperRef.current?.querySelector('button');
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const estimatedHeight = Math.min(Math.max(options.length * 48, 56), 320);
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const shouldOpenTop = menuPosition === 'top' || (menuPosition !== 'bottom' && spaceBelow < estimatedHeight && spaceAbove > spaceBelow);

      setMenuStyles({
        position: 'fixed',
        left: rect.left,
        top: shouldOpenTop ? Math.max(12, rect.top - estimatedHeight - 8) : rect.bottom + 8,
        width: rect.width,
        maxHeight: Math.min(estimatedHeight, window.innerHeight - 24),
      });
    };

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!wrapperRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    updateMenuPosition();
    if (searchable) {
      window.setTimeout(() => searchInputRef.current?.focus(), 0);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [menuPosition, open, options.length, searchable]);

  useEffect(() => {
    if (!open) {
      setQuery('');
    }
  }, [open]);

  const variantClasses = variant === 'dark'
    ? {
        trigger: 'border-slate-600 bg-slate-950 text-white hover:border-slate-500 focus:border-blue-400 focus:ring-blue-500/30',
        menu: 'border-slate-600 bg-slate-950 shadow-[0_22px_60px_rgba(15,23,42,0.45)]',
        option: 'text-slate-200 hover:bg-slate-900 hover:text-white',
        active: 'bg-blue-500/20 text-blue-100',
        icon: 'text-slate-400',
      }
    : {
        trigger: 'border-gray-300 bg-white text-gray-900 hover:border-gray-400 focus:border-blue-500 focus:ring-blue-500/20',
        menu: 'border-gray-200 bg-white shadow-xl',
        option: 'text-gray-700 hover:bg-blue-50 hover:text-gray-900',
        active: 'bg-blue-100 text-blue-700',
        icon: 'text-gray-400',
      };

  const sizeClasses = size === 'sm'
    ? 'rounded-lg px-3 py-2 text-sm'
    : 'rounded-lg px-4 py-2.5 text-sm';

  return (
    <div ref={wrapperRef} data-no-tilt="true" className={`relative ${open ? 'z-[120]' : 'z-10'} ${className}`.trim()}>
      <button
        type="button"
        data-no-tilt="true"
        disabled={disabled}
        onClick={() => !disabled && setOpen((current) => !current)}
        className={`flex w-full items-center justify-between border outline-none transition focus:ring-2 ${sizeClasses} ${variantClasses.trigger} ${disabled ? 'cursor-not-allowed opacity-60' : ''} ${buttonClassName}`.trim()}
      >
        <span className="truncate">{selectedOption?.label ?? value}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${variantClasses.icon} ${open ? 'rotate-180' : ''}`} />
      </button>

      {open
        ? createPortal(
            <div
              ref={menuRef}
              data-no-tilt="true"
              className={`z-[9999] overflow-auto rounded-xl border ${variantClasses.menu}`}
              style={menuStyles}
            >
              {searchable ? (
                <div className={`sticky top-0 z-10 border-b px-3 py-3 ${variant === 'dark' ? 'border-slate-700 bg-slate-950' : 'border-gray-200 bg-white'}`}>
                  <label className="relative block">
                    <Search className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${variantClasses.icon}`} />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={searchPlaceholder}
                      className={`w-full rounded-lg border py-2 pl-9 pr-3 text-sm outline-none ${
                        variant === 'dark'
                          ? 'border-slate-700 bg-slate-900 text-white placeholder:text-slate-500'
                          : 'border-gray-200 bg-gray-50 text-gray-900 placeholder:text-gray-400'
                      }`}
                    />
                  </label>
                </div>
              ) : null}
              {filteredOptions.length === 0 ? (
                <div className={`px-4 py-3 text-sm ${variant === 'dark' ? 'text-slate-400' : 'text-gray-500'}`}>
                  No results found
                </div>
              ) : null}
              {filteredOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  data-no-tilt="true"
                  disabled={option.disabled}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (option.disabled) return;
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center px-4 py-3 text-left text-sm transition ${
                    option.value === value ? variantClasses.active : variantClasses.option
                  } ${option.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <span className="truncate">{option.label}</span>
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  );
};

export default StyledSelect;
