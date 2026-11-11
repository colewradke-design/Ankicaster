/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Generic window for a management screen opened from a room window or the Academy menu.
 * Opens over the map with the map dimmed behind it (Addendum 11.1).
 */
import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { ScreenId, SCREEN_DEFS } from '../ui/screens';
import { ScreenIcon } from './ScreenIcon';

const RIBBON: Partial<Record<ScreenId, string>> = {
  build: 'from-orange-800/60', students: 'from-rose-900/60', faculty: 'from-rose-900/60', alumni: 'from-rose-900/60',
  admissions: 'from-emerald-900/60', draft: 'from-violet-900/60', alchemy: 'from-orange-900/60', rift: 'from-purple-900/70',
  bestiary: 'from-emerald-900/60', reviewer: 'from-sky-900/60', stores: 'from-yellow-900/50', events: 'from-amber-900/50'
};

export const ScreenWindow: React.FC<{
  id: ScreenId;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
}> = ({ id, subtitle, onClose, children, width = 'max-w-5xl' }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-[55] bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-3 md:p-6"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-label={SCREEN_DEFS[id].label}
        data-screen-window={id}
        className={`bg-slate-900 border border-amber-900/50 rounded-2xl w-full ${width} max-h-[92vh] flex flex-col shadow-2xl`}
      >
        <div className={`flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-800 bg-gradient-to-r ${RIBBON[id] || 'from-amber-900/40'} to-transparent rounded-t-2xl`}>
          <h3 className="font-bold text-amber-200 flex items-center gap-2 text-base">
            <ScreenIcon id={id} className="w-5 h-5" />
            {SCREEN_DEFS[id].label}
            {subtitle && <span className="text-[13px] font-normal text-slate-400">· {subtitle}</span>}
          </h3>
          <button onClick={onClose} aria-label="Close" className="p-1.5 min-w-[32px] min-h-[32px] text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 md:p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};
