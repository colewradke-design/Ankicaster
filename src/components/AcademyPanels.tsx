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
import { BookOpen, Leaf, Sun, Moon, FlaskConical } from 'lucide-react';
import { FullGameState, SchoolEvent } from '../types/ankicaster';
import { POTION_RECIPES, SCHOOL_EVENTS } from '../data/content';

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
  const rare: Array<[string, string]> = [
    ['crystal', 'Crystal'], ['heartwood', 'Heartwood'], ['sunstone', 'Sunstone'], ['void_pearl', 'Void Pearl'],
    ['ember_salt', 'Ember Salt'], ['moonsilk', 'Moonsilk'], ['starmetal', 'Starmetal'], ['golem_core', 'Golem Core'], ['phoenix_ash', 'Phoenix Ash']
  ];
  const rareOwned = rare.filter(([k]) => ((r as any)[k] || 0) > 0);
  return (
    <div className="space-y-4" data-testid="stores-panel">
      <section>
        <h4 className="text-[12px] uppercase tracking-wider font-bold text-slate-400 mb-2">Essences</h4>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <Stat icon={<BookOpen className="w-4 h-4 text-purple-400" />} label="Insight" value={r.insight} />
          <Stat icon={<Leaf className="w-4 h-4 text-emerald-400" />} label="Herbs" value={r.herbs} />
          <Stat icon={<Sun className="w-4 h-4 text-amber-400" />} label="Radiance" value={r.radiance} />
          <Stat icon={<Moon className="w-4 h-4 text-indigo-400" />} label="Umbra" value={r.umbra} />
          <Stat icon={<FlaskConical className="w-4 h-4 text-orange-400" />} label="Reagents" value={r.reagents} />
        </div>
      </section>
      <section>
        <h4 className="text-[12px] uppercase tracking-wider font-bold text-slate-400 mb-2">Materials &amp; food</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat icon="🪵" label="Timber" value={r.timber} />
          <Stat icon="🪨" label="Stone" value={r.stone} />
          <Stat icon="🪟" label="Glass" value={r.glass} />
          <Stat icon="🧵" label="Cloth" value={r.cloth} />
          <Stat icon="🍞" label="Provisions" value={r.provisions} />
          <Stat icon="🥬" label="Greens" value={r.greens} />
          <Stat icon="🐟" label="Fish" value={r.fish} />
          <Stat icon="🍯" label="Nectar" value={r.nectar} />
        </div>
      </section>
      {rareOwned.length > 0 && (
        <section>
          <h4 className="text-[12px] uppercase tracking-wider font-bold text-slate-400 mb-2">Rare</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {rareOwned.map(([k, n]) => <Stat key={k} icon="✦" label={n} value={(r as any)[k]} />)}
          </div>
        </section>
      )}
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
