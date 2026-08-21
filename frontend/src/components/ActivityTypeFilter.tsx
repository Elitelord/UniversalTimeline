'use client';

import { useEffect, useRef, useState } from 'react';
import { ListFilter, Check, ChevronDown } from 'lucide-react';
import {
  DURATION_ACTIVITY_TYPES,
  SIGNAL_ACTIVITY_TYPES,
  RADIUS,
} from '@/lib/design-tokens';

interface ActivityTypeFilterProps {
  activeTypes: string[];
  onToggle: (type: string) => void;
  onClear: () => void;
}

/**
 * Multiselect dropdown for activity-type filtering. Replaced an inline chip row,
 * which grew unwieldy once the taxonomy expanded from 5 to 12 types. Reuses the
 * activity/signal grouping — signals (notifications, screen, idle) are point-in-time
 * events, shown under a labelled divider.
 */
export default function ActivityTypeFilter({
  activeTypes,
  onToggle,
  onClear,
}: ActivityTypeFilterProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const count = activeTypes.length;
  const label = count === 0 ? 'All activity' : `${count} type${count === 1 ? '' : 's'}`;

  const renderRow = (
    t: (typeof DURATION_ACTIVITY_TYPES)[number],
    dashed = false
  ) => {
    const checked = activeTypes.includes(t.value);
    return (
      <button
        key={t.value}
        role="menuitemcheckbox"
        aria-checked={checked}
        onClick={() => onToggle(t.value)}
        className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs text-zinc-300 hover:bg-zinc-800/60 transition-colors duration-100 cursor-pointer"
        type="button"
      >
        <span
          className={`flex items-center justify-center w-4 h-4 rounded border shrink-0 ${
            checked ? 'bg-zinc-100 border-zinc-100' : 'border-zinc-600 bg-transparent'
          }`}
        >
          {checked && <Check className="w-3 h-3 text-zinc-900" strokeWidth={3} />}
        </span>
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${t.color} ${dashed ? 'opacity-70' : ''}`}
        />
        <span className="flex-1 text-left">{t.label}</span>
      </button>
    );
  };

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center gap-2 px-3 py-2 ${RADIUS.control} text-xs font-medium border transition-colors duration-150 cursor-pointer ${
          count > 0
            ? 'bg-zinc-800 text-zinc-100 border-zinc-700'
            : 'bg-zinc-900/50 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700'
        }`}
        type="button"
      >
        <ListFilter className="w-3.5 h-3.5" />
        <span>{label}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute z-50 mt-1.5 w-56 ${RADIUS.surface} border border-zinc-800 bg-zinc-950 shadow-xl shadow-black/40 p-1.5`}
        >
          <div className="flex items-center justify-between px-2.5 py-1">
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-[0.15em]">
              Activities
            </span>
            {count > 0 && (
              <button
                onClick={onClear}
                className="text-[11px] text-zinc-500 hover:text-zinc-300 cursor-pointer"
                type="button"
              >
                Clear
              </button>
            )}
          </div>
          {DURATION_ACTIVITY_TYPES.map((t) => renderRow(t))}

          <div className="mt-1 mb-1 border-t border-zinc-800/80" />
          <div className="px-2.5 py-1">
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-[0.15em]">
              Signals
            </span>
            <p className="text-[10px] text-zinc-600 mt-0.5 leading-tight">
              Point-in-time, not counted as time spent
            </p>
          </div>
          {SIGNAL_ACTIVITY_TYPES.map((t) => renderRow(t, true))}
        </div>
      )}
    </div>
  );
}
