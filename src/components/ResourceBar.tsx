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
  bellsUntilNextMeal, resourceFlow
} from '../utils/resourceReport';

const OPEN_KEY = 'ankicaster.resourceBarOpen';

function fmt(n: number): string {
  const abs = Math.abs(n);
  const text = abs >= 10 ? abs.toFixed(0) : abs.toFixed(1);
  return `${n < 0 ? '−' : '+'}${text}`;
}

const Tip: React.FC<{ state: FullGameState; resource: string; label: string; amount: number }> = ({ state, resource, label, amount }) => {
  const flow = resourceFlow(state, resource);
  const recent = (state.resourceLedger?.recent?.[resource] || []).slice(-5).reverse();
  const cap = CAPPED_RESOURCES.has(resource);
  const out = flow.net < -0.0001 && amount > 0 ? Math.ceil(amount / -flow.net) : 0;
  return (
    <div className="pointer-events-none absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-slate-700 bg-slate-950 p-2 text-left text-[11px] leading-snug text-slate-200 shadow-xl" data-testid="resource-tip">
      <div className="font-bold text-amber-200">{label} · {Math.floor(amount)}{cap ? ' · cap 500' : ''}</div>
      <div className="mt-1 text-slate-400">Income per bell</div>
      {flow.income.length === 0 ? <div className="text-slate-500">None</div> : flow.income.map(l => (
        <div key={l.label}>{l.label}: {fmt(l.per)}</div>
      ))}
      <div className="mt-1 text-slate-400">Use per bell</div>
      {flow.use.length === 0 ? <div className="text-slate-500">None</div> : flow.use.map(l => (
        <div key={l.label}>{l.label}: {fmt(l.per)}</div>
      ))}
      <div className={`mt-1 font-bold ${flow.net > 0.0001 ? 'text-emerald-300' : flow.net < -0.0001 ? 'text-rose-300' : 'text-slate-300'}`}>
        Net {fmt(flow.net)} per bell
      </div>
      {out > 0 && <div className="text-rose-300">runs out in about {out} bells ({out * 10} reviews)</div>}
      {resource === 'provisions' && (
        <div className="mt-1 text-amber-100">Next meal in {bellsUntilNextMeal(state.bellIndex)} bells, needs {state.characters.length}</div>
      )}
      {recent.length > 0 && (
        <>
          <div className="mt-1 text-slate-400">Recent</div>
          {recent.map((r, i) => <div key={i}>{r.label} {fmt(r.amount)} {label.toLowerCase()}</div>)}
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

const Chip: React.FC<{ state: FullGameState; resource: string; label: string; icon: React.ReactNode; amount: number; dim?: boolean }> = ({
  state, resource, label, icon, amount, dim
}) => (
  <span className={`relative group inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-slate-800 bg-slate-900/80 ${dim ? 'opacity-40' : ''}`} data-resource={resource}>
    <span aria-hidden>{icon}</span>
    <span className="font-mono text-[12px] text-slate-100">{Math.floor(amount)}</span>
    <span className="sr-only">{label}</span>
    <span className="hidden group-hover:block">
      <Tip state={state} resource={resource} label={label} amount={amount} />
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
  const amount = (key: string) => (r as unknown as Record<string, number>)[key] || 0;
  const potionNames: Record<string, string> = {};
  for (const p of (Array.isArray(POTION_RECIPES) ? POTION_RECIPES : Object.values(POTION_RECIPES)) as Array<{ id: string; name: string }>) potionNames[p.id] = p.name;
  const potions = Object.entries(r.potions || {});

  const group = (title: string, rows: Array<[string, string, string]>) => (
    <div>
      <div className="px-1 pt-1 text-[10px] uppercase tracking-wider font-bold text-slate-500">{title}</div>
      <div className="grid grid-cols-2 gap-1">
        {rows.map(([key, label, icon]) => (
          <Chip key={key} state={state} resource={key} label={label} icon={ESSENCE_ICON[key] || icon} amount={amount(key)} dim={amount(key) <= 0} />
        ))}
      </div>
    </div>
  );

  return (
    <div className="relative flex items-center gap-1" ref={ref} data-testid="resource-strip">
      {STRIP_RESOURCES.map(([key, label, icon]) => (
        <Chip key={key} state={state} resource={key} label={label} icon={icon} amount={amount(key)} />
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
