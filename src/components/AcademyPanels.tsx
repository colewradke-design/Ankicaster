/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Small read-only screens added by the UI declutter pass:
 *  - StoresPanel (Storage Vault): essences, materials, potions (moved out of the old top bar)
 *  - JournalPanel: recent state.notices
 *  - VisitorsPanel (Entrance Hall): pending school events; choosing one opens the existing
 *    event modal, which resolves it through the same engine call as before.
 */

import React from 'react';
import { FullGameState, SchoolEvent } from '../types/ankicaster';
import { POTION_RECIPES, SCHOOL_EVENTS } from '../data/content';
import {
  COMMON_RESOURCES, ESSENCE_RESOURCES, RARE_RESOURCES,
  formatRecentLine, formatSigned, recentChanges, resourceBrief, runsOutText
} from '../utils/resourceReport';

const Stat: React.FC<{ icon: React.ReactNode; label: string; value: number }> = ({ icon, label, value }) => (
  <div className="flex items-center gap-2 bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2 text-[13px]" title={label}>
    <span className="w-5 text-center">{icon}</span>
    <span className="text-slate-400 flex-1">{label}</span>
    <strong className="text-slate-100 font-mono">{Math.floor(value || 0)}</strong>
  </div>
);

export const StoresPanel: React.FC<{ state: FullGameState }> = ({ state }) => {
  const r = state.resources;
  const potionNames: Record<string, string> = {};
  for (const p of (Array.isArray(POTION_RECIPES) ? POTION_RECIPES : Object.values(POTION_RECIPES)) as any[]) potionNames[p.id] = p.name;
  const potions = Object.entries(r.potions || {}).filter(([, n]) => (n || 0) > 0);
  const recent = recentChanges(state);

  const group = (title: string, rows: Array<[string, string, string]>) => (
    <section>
      <h4 className="text-[12px] uppercase tracking-wider font-bold text-slate-400 mb-2">{title}</h4>
      <div className="space-y-2">
        {rows.map(([key, label]) => {
          const brief = resourceBrief(state, key);
          const atCap = brief.cap !== undefined && brief.amount >= brief.cap;
          return (
            <div key={key} className={`rounded-lg border px-3 py-2 text-[13px] ${atCap ? 'border-amber-400/70 bg-amber-500/10' : 'border-slate-800 bg-slate-950/60'}`} data-resource={key} data-at-cap={atCap ? 'true' : undefined}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-bold text-slate-100">{label}</span>
                <span className={`font-mono ${atCap ? 'text-amber-100' : 'text-slate-100'}`}>
                  {brief.cap !== undefined ? `${Math.floor(brief.amount)} / ${brief.cap}` : Math.floor(brief.amount)}
                </span>
              </div>
              <div className="mt-1 text-slate-400">Income per bell</div>
              {brief.income.length === 0 ? <div className="text-slate-500">None</div> : brief.income.map(l => (
                <div key={l.label} className="text-slate-200">{l.label}: {formatSigned(l.per)}</div>
              ))}
              <div className="mt-1 text-slate-400">Use per bell</div>
              {brief.use.length === 0 ? <div className="text-slate-500">None</div> : brief.use.map(l => (
                <div key={l.label} className="text-slate-200">{l.label}: {formatSigned(l.per)}</div>
              ))}
              <div className={`mt-1 font-bold ${brief.net > 0.0001 ? 'text-emerald-300' : brief.net < -0.0001 ? 'text-rose-300' : 'text-slate-300'}`}>
                Net {formatSigned(brief.net)} per bell
              </div>
              {brief.runsOutBells > 0 && <div className="text-rose-300">{runsOutText(brief.runsOutBells)}</div>}
              {brief.mealText && <div className="text-amber-100">{brief.mealText}</div>}
            </div>
          );
        })}
      </div>
    </section>
  );

  return (
    <div className="space-y-4" data-testid="stores-panel">
      {group('Common materials', COMMON_RESOURCES as unknown as Array<[string, string, string]>)}
      {group('Essences', ESSENCE_RESOURCES as unknown as Array<[string, string, string]>)}
      {group('Rare', RARE_RESOURCES as unknown as Array<[string, string, string]>)}
      <section>
        <h4 className="text-[12px] uppercase tracking-wider font-bold text-slate-400 mb-2">Recent changes</h4>
        {recent.length === 0 ? (
          <div className="text-[13px] text-slate-500">None yet.</div>
        ) : (
          <div className="space-y-1" data-testid="stores-recent">
            {recent.map((entry, i) => (
              <div key={i} className="text-[13px] text-slate-200 bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-1.5">
                {formatRecentLine(entry)}
              </div>
            ))}
          </div>
        )}
      </section>
      <section>
        <h4 className="text-[12px] uppercase tracking-wider font-bold text-slate-400 mb-2">Potions</h4>
        {potions.length === 0 ? (
          <div className="text-[13px] text-slate-500">None. Brew them in an Alchemy Lab.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {potions.map(([id, n]) => <Stat key={id} icon="🧪" label={potionNames[id] || id} value={n as number} />)}
          </div>
        )}
      </section>
    </div>
  );
};

export const JournalPanel: React.FC<{ state: FullGameState }> = ({ state }) => {
  const notices = [...(state.notices || [])].slice(-40).reverse();
  return (
    <div className="space-y-1.5" data-testid="journal-panel">
      {notices.length === 0 ? (
        <div className="text-[13px] text-slate-500 text-center py-8">Nothing recorded yet.</div>
      ) : (
        notices.map(n => (
          <div key={n.id} className="text-[13px] text-slate-200 bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2">
            {n.text}
          </div>
        ))
      )}
    </div>
  );
};

export function pendingEvents(state: FullGameState): SchoolEvent[] {
  return state.activeEvents
    .map(e => SCHOOL_EVENTS.find(ev => ev.id === e.eventId))
    .filter((e): e is SchoolEvent => !!e);
}

export const VisitorsPanel: React.FC<{ state: FullGameState; onOpenEvent: (ev: SchoolEvent) => void }> = ({ state, onOpenEvent }) => {
  const events = pendingEvents(state);
  return (
    <div className="space-y-2" data-testid="visitors-panel">
      {events.length === 0 ? (
        <div className="text-[13px] text-slate-500 text-center py-8">No one at the gate.</div>
      ) : (
        events.map(ev => (
          <button
            key={ev.id}
            onClick={() => onOpenEvent(ev)}
            className="w-full text-left flex items-center gap-3 bg-slate-950/60 border border-slate-800 hover:border-amber-500/40 rounded-xl px-3 py-2.5 min-h-[44px]"
            title={ev.description}
          >
            <span className="text-xl">📜</span>
            <span className="text-[13px] font-bold text-amber-200 flex-1">{ev.name}</span>
            <span className="text-[12px] text-slate-400">{ev.options.length} choices</span>
          </button>
        ))
      )}
    </div>
  );
};
