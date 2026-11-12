/**
 * Compact resource strip for the top bar, plus a dropdown of every stock.
 * Open/closed lives in localStorage, not in the save.
 */
import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, ChevronDown, FlaskConical, Leaf, Moon, Sun } from 'lucide-react';
import { FullGameState } from '../types/ankicaster';
import { POTION_RECIPES } from '../data/content';
import {
  CAPPED_RESOURCES, COMMON_RESOURCES, ESSENCE_RESOURCES, RARE_RESOURCES, STRIP_RESOURCES,
  formatSigned, resourceBrief, runsOutText, storageCap
} from '../utils/resourceReport';

const OPEN_KEY = 'ankicaster.resourceBarOpen';

const Tip: React.FC<{ state: FullGameState; resource: string; label: string }> = ({ state, resource, label }) => {
  const brief = resourceBrief(state, resource);
  const recent = (state.resourceLedger?.recent?.[resource] || []).slice(-5).reverse();
  const amountText = brief.cap !== undefined ? `${Math.floor(brief.amount)} / ${brief.cap}` : `${Math.floor(brief.amount)}`;
  return (
    <div className="pointer-events-none absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-slate-700 bg-slate-950 p-2 text-left text-[11px] leading-snug text-slate-200 shadow-xl" data-testid="resource-tip">
      <div className="font-bold text-amber-200">{label} · {amountText}</div>
      <div className="mt-1 text-slate-400">Income per bell</div>
      {brief.income.length === 0 ? <div className="text-slate-500">None</div> : brief.income.map(l => (
        <div key={l.label}>{l.label}: {formatSigned(l.per)}</div>
      ))}
      <div className="mt-1 text-slate-400">Use per bell</div>
      {brief.use.length === 0 ? <div className="text-slate-500">None</div> : brief.use.map(l => (
        <div key={l.label}>{l.label}: {formatSigned(l.per)}</div>
      ))}
      <div className={`mt-1 font-bold ${brief.net > 0.0001 ? 'text-emerald-300' : brief.net < -0.0001 ? 'text-rose-300' : 'text-slate-300'}`}>
        Net {formatSigned(brief.net)} per bell
      </div>
      {brief.runsOutBells > 0 && <div className="text-rose-300">{runsOutText(brief.runsOutBells)}</div>}
      {brief.mealText && <div className="mt-1 text-amber-100">{brief.mealText}</div>}
      {recent.length > 0 && (
        <>
          <div className="mt-1 text-slate-400">Recent</div>
          {recent.map((r, i) => <div key={i}>{r.label} {formatSigned(r.amount)} {label.toLowerCase()}</div>)}
        </>
      )}
    </div>
  );
};

const ESSENCE_ICON: Record<string, React.ReactNode> = {
  insight: <BookOpen className="w-3.5 h-3.5 text-purple-400" />,
  herbs: <Leaf className="w-3.5 h-3.5 text-emerald-400" />,
  radiance: <Sun className="w-3.5 h-3.5 text-amber-400" />,
  umbra: <Moon className="w-3.5 h-3.5 text-indigo-400" />,
  reagents: <FlaskConical className="w-3.5 h-3.5 text-orange-400" />
};

const Chip: React.FC<{ state: FullGameState; resource: string; label: string; icon: React.ReactNode; amount: number; dim?: boolean; atCap?: boolean }> = ({
  state, resource, label, icon, amount, dim, atCap
}) => (
  <span className={`relative group inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border bg-slate-900/80 ${atCap ? 'border-amber-400 bg-amber-500/20' : 'border-slate-800'} ${dim ? 'opacity-40' : ''}`} data-resource={resource} data-at-cap={atCap ? 'true' : undefined}>
    <span aria-hidden>{icon}</span>
    <span className={`font-mono text-[12px] ${atCap ? 'text-amber-100' : 'text-slate-100'}`}>{Math.floor(amount)}</span>
    <span className="sr-only">{label}{atCap ? ' full' : ''}</span>
    <span className="hidden group-hover:block">
      <Tip state={state} resource={resource} label={label} />
    </span>
  </span>
);

export const ResourceBar: React.FC<{ state: FullGameState }> = ({ state }) => {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(OPEN_KEY) === '1'; } catch { return false; }
  });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try { localStorage.setItem(OPEN_KEY, open ? '1' : '0'); } catch { /* ignore */ }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const r = state.resources;
  const cap = storageCap(state);
  const amount = (key: string) => (r as unknown as Record<string, number>)[key] || 0;
  const full = (key: string) => CAPPED_RESOURCES.has(key) && amount(key) >= cap;
  const potionNames: Record<string, string> = {};
  for (const p of (Array.isArray(POTION_RECIPES) ? POTION_RECIPES : Object.values(POTION_RECIPES)) as Array<{ id: string; name: string }>) potionNames[p.id] = p.name;
  const potions = Object.entries(r.potions || {});

  const group = (title: string, rows: Array<[string, string, string]>) => (
    <div>
      <div className="px-1 pt-1 text-[10px] uppercase tracking-wider font-bold text-slate-500">{title}</div>
      <div className="grid grid-cols-2 gap-1">
        {rows.map(([key, label, icon]) => (
          <Chip key={key} state={state} resource={key} label={label} icon={ESSENCE_ICON[key] || icon} amount={amount(key)} dim={amount(key) <= 0} atCap={full(key)} />
        ))}
      </div>
    </div>
  );

  return (
    <div className="relative flex items-center gap-1" ref={ref} data-testid="resource-strip" data-tour="resources">
      {STRIP_RESOURCES.map(([key, label, icon]) => (
        <Chip key={key} state={state} resource={key} label={label} icon={icon} amount={amount(key)} atCap={full(key)} />
      ))}
      <button
        type="button"
        aria-label={open ? 'Hide all resources' : 'Show all resources'}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="p-1 min-w-[28px] min-h-[28px] rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800"
        data-testid="resource-expand"
      >
        <ChevronDown className={`w-3.5 h-3.5 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-[280px] max-h-[70vh] overflow-y-auto rounded-xl border border-amber-900/50 bg-slate-900 p-2 shadow-2xl space-y-2" data-testid="resource-dropdown">
          {group('Common', COMMON_RESOURCES as unknown as Array<[string, string, string]>)}
          {group('Essences', ESSENCE_RESOURCES as unknown as Array<[string, string, string]>)}
          {group('Rare', RARE_RESOURCES as unknown as Array<[string, string, string]>)}
          <div>
            <div className="px-1 pt-1 text-[10px] uppercase tracking-wider font-bold text-slate-500">Potions</div>
            {potions.length === 0 ? <div className="px-1 text-[11px] text-slate-500">None</div> : (
              <div className="grid grid-cols-2 gap-1">
                {potions.map(([id, n]) => (
                  <span key={id} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-slate-800 text-[12px] ${(n || 0) <= 0 ? 'opacity-40' : ''}`}>
                    <span>🧪</span>
                    <span className="truncate text-slate-300">{potionNames[id] || id}</span>
                    <span className="font-mono text-slate-100">{Math.floor(n || 0)}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
