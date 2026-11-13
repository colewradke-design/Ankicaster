/**
 * Display-only resource ledger, plus the common-material storage cap.
 * Bell production and one-off gains both stop at the cap. Stock already
 * above it is left alone.
 */
import { FullGameState, PlacedRoom, ResourceInventory } from '../types/ankicaster';
import { academyFurnitureEffect } from './formulas';
import { isRoomUnfinished } from './requiredFurniture';

export const CAPPED_RESOURCES = new Set(['timber', 'stone', 'glass', 'cloth', 'provisions', 'greens', 'fish', 'nectar']);

export const COMMON_RESOURCES: Array<[keyof ResourceInventory, string, string]> = [
  ['timber', 'Timber', '🪵'],
  ['stone', 'Stone', '🪨'],
  ['glass', 'Glass', '🪟'],
  ['cloth', 'Cloth', '🧵'],
  ['provisions', 'Provisions', '🍞'],
  ['greens', 'Greens', '🥬'],
  ['fish', 'Fish', '🐟'],
  ['nectar', 'Nectar', '🍯']
];

export const ESSENCE_RESOURCES: Array<[keyof ResourceInventory, string, string]> = [
  ['insight', 'Insight', '📖'],
  ['herbs', 'Herbs', '🌿'],
  ['radiance', 'Radiance', '☀️'],
  ['umbra', 'Umbra', '🌙'],
  ['reagents', 'Reagents', '🧪']
];

export const RARE_RESOURCES: Array<[keyof ResourceInventory, string, string]> = [
  ['crystal', 'Crystal', '✦'],
  ['heartwood', 'Heartwood', '✦'],
  ['sunstone', 'Sunstone', '✦'],
  ['void_pearl', 'Void Pearl', '✦'],
  ['ember_salt', 'Ember Salt', '✦'],
  ['moonsilk', 'Moonsilk', '✦'],
  ['starmetal', 'Starmetal', '✦'],
  ['golem_core', 'Golem Core', '✦'],
  ['phoenix_ash', 'Phoenix Ash', '✦']
];

export const TRACKED_RESOURCES: string[] = [
  ...COMMON_RESOURCES.map(r => r[0]),
  ...ESSENCE_RESOURCES.map(r => r[0]),
  ...RARE_RESOURCES.map(r => r[0])
];

export const STRIP_RESOURCES = COMMON_RESOURCES.slice(0, 6);

const RESOURCE_LABEL = new Map<string, string>(
  [...COMMON_RESOURCES, ...ESSENCE_RESOURCES, ...RARE_RESOURCES].map(([id, name]) => [id, name])
);

export function resourceLabel(resource: string): string {
  return RESOURCE_LABEL.get(resource) || resource;
}

/** 200, plus 100 for every Storage Vault that is built and not Unfinished, plus furniture storage bonuses. */
export function storageCap(state: { rooms?: PlacedRoom[] }): number {
  const vaults = (state.rooms || []).filter(r => r.defId === 'storage_vault' && r.state === 'built' && !isRoomUnfinished(r)).length;
  const bonus = academyFurnitureEffect(state.rooms || [], 'storage_bonus');
  return 200 + 100 * vaults + bonus;
}

/**
 * Add `delta` without crossing `cap`, and without throwing away stock that is
 * already over it. Spending (delta <= 0) is unchanged.
 */
export function addUpToCap(current: number, delta: number, cap: number): number {
  if (!(delta > 0)) return current + delta;
  if (current >= cap) return current;
  return Math.min(cap, current + delta);
}

/** Pull one-off gains back down to the cap. Never lowers stock that was already over it. */
export function enforceStorageCap(state: FullGameState, before: Record<string, number>): void {
  const cap = storageCap(state);
  const bag = state.resources as unknown as Record<string, number>;
  for (const k of CAPPED_RESOURCES) {
    const prev = before[k] || 0;
    const now = bag[k] || 0;
    if (now > prev) bag[k] = addUpToCap(prev, now - prev, cap);
  }
}

export interface FlowLine { label: string; per: number; }

export function emptyLedger(): NonNullable<FullGameState['resourceLedger']> {
  return { bells: [], recent: {}, recentAll: [] };
}

export function ensureLedger(state: FullGameState): NonNullable<FullGameState['resourceLedger']> {
  if (!state.resourceLedger) state.resourceLedger = emptyLedger();
  if (!state.resourceLedger.bells) state.resourceLedger.bells = [];
  if (!state.resourceLedger.recent) state.resourceLedger.recent = {};
  if (!state.resourceLedger.recentAll) state.resourceLedger.recentAll = [];
  return state.resourceLedger;
}

export function logResourceChange(state: FullGameState, resource: string, amount: number, label: string): void {
  if (!amount) return;
  const ledger = ensureLedger(state);
  const list = ledger.recent[resource] || [];
  list.push({ amount, label });
  ledger.recent[resource] = list.slice(-20);
  const all = ledger.recentAll || [];
  all.push({ resource, amount, label });
  ledger.recentAll = all.slice(-20);
}

export function resourceSnapshot(state: FullGameState): Record<string, number> {
  const out: Record<string, number> = {};
  const bag = state.resources as unknown as Record<string, number>;
  for (const k of TRACKED_RESOURCES) out[k] = bag[k] || 0;
  return out;
}

export function logResourceDiff(state: FullGameState, before: Record<string, number>, label: string): void {
  enforceStorageCap(state, before);
  const bag = state.resources as unknown as Record<string, number>;
  for (const k of TRACKED_RESOURCES) {
    const delta = (bag[k] || 0) - (before[k] || 0);
    if (delta) logResourceChange(state, k, delta, label);
  }
}

export interface BellNote { resource: string; amount: number; source: string; }

export function commitBell(state: FullGameState, entries: BellNote[]): void {
  const ledger = ensureLedger(state);
  ledger.bells.push({ entries });
  ledger.bells = ledger.bells.slice(-5);
}

/** Per-bell average over the bells kept (up to 5, one meal cycle). */
export function resourceFlow(state: FullGameState, resource: string): { income: FlowLine[]; use: FlowLine[]; net: number; bells: number } {
  const bells = state.resourceLedger?.bells || [];
  const n = bells.length;
  const bySource = new Map<string, { sum: number; count: number }>();
  for (const bell of bells) {
    const inBell = new Map<string, { sum: number; n: number }>();
    for (const e of bell.entries) {
      if (e.resource !== resource || !e.amount) continue;
      const g = inBell.get(e.source) || { sum: 0, n: 0 };
      g.sum += e.amount;
      g.n += 1;
      inBell.set(e.source, g);
    }
    for (const [src, g] of inBell) {
      const t = bySource.get(src) || { sum: 0, count: 0 };
      t.sum += g.sum;
      t.count += g.n;
      bySource.set(src, t);
    }
  }
  const lines: FlowLine[] = [];
  if (n > 0) {
    for (const [source, g] of bySource) {
      const avgN = g.count / n;
      const label = avgN > 1.01 ? `${source} ×${Math.round(avgN)}` : source;
      lines.push({ label, per: g.sum / n });
    }
  }
  return {
    income: lines.filter(l => l.per > 0),
    use: lines.filter(l => l.per < 0),
    net: lines.reduce((s, l) => s + l.per, 0),
    bells: n
  };
}

/** Bells until the next meal. ringBell runs after bellIndex increments, and meals land when that index is a multiple of 5. */
export function bellsUntilNextMeal(bellIndex: number): number {
  const mod = ((bellIndex % 5) + 5) % 5;
  const k = (5 - mod) % 5;
  return k === 0 ? 5 : k;
}

export function formatSigned(n: number): string {
  const abs = Math.abs(n);
  const text = abs >= 10 ? abs.toFixed(0) : abs.toFixed(1);
  return `${n < 0 ? '−' : '+'}${text}`;
}

export function runsOutText(bells: number): string {
  return `runs out in about ${bells} bells (${bells * 10} reviews)`;
}

export function mealNeedText(bellIndex: number, people: number): string {
  return `Next meal in ${bellsUntilNextMeal(bellIndex)} bells, needs ${people}`;
}

/** "Built Dormitory −30 timber" */
export function formatRecentLine(entry: { resource: string; amount: number; label: string }): string {
  return `${entry.label} ${formatSigned(entry.amount)} ${resourceLabel(entry.resource).toLowerCase()}`;
}

/** Last 20 one-off changes across every resource, newest first. */
export function recentChanges(state: FullGameState): Array<{ resource: string; amount: number; label: string }> {
  return [...(state.resourceLedger?.recentAll || [])].reverse();
}

export interface ResourceBrief {
  amount: number;
  cap?: number;
  income: FlowLine[];
  use: FlowLine[];
  net: number;
  runsOutBells: number;
  mealText?: string;
}

/** The numbers the top-bar tooltip and the Stores screen both show. */
export function resourceBrief(state: FullGameState, resource: string): ResourceBrief {
  const flow = resourceFlow(state, resource);
  const amount = (state.resources as unknown as Record<string, number>)[resource] || 0;
  const capped = CAPPED_RESOURCES.has(resource);
  const runsOutBells = flow.net < -0.0001 && amount > 0 ? Math.ceil(amount / -flow.net) : 0;
  return {
    amount,
    cap: capped ? storageCap(state) : undefined,
    income: flow.income,
    use: flow.use,
    net: flow.net,
    runsOutBells,
    mealText: resource === 'provisions' ? mealNeedText(state.bellIndex, state.characters.length) : undefined
  };
}

export function glassworksConversion(stone: number, harvestMult: number, glass: number, cap = 200): { stoneUsed: number; glassGain: number } {
  const room = Math.max(0, cap - glass);
  let stoneUsed = Math.min(Math.max(0, stone), 2 * harvestMult);
  let glassGain = stoneUsed / 2;
  if (glassGain > room) {
    glassGain = room;
    stoneUsed = glassGain * 2;
  }
  return { stoneUsed, glassGain };
}

export function weavingOutput(harvestMult: number, moonsheep: boolean): number {
  return 0.5 * harvestMult * (moonsheep ? 2 : 1);
}

const COST_LABELS: Record<string, string> = {
  timber: 'T', stone: 'S', glass: 'G', cloth: 'C',
  insight: 'insight', herbs: 'herbs', radiance: 'radiance', umbra: 'umbra', reagents: 'reagents',
  crystal: 'crystal', heartwood: 'heartwood', sunstone: 'sunstone', void_pearl: 'void pearl', ember_salt: 'ember salt'
};

export function formatMaterialCost(cost: { mana?: number; [k: string]: number | undefined }): string {
  const parts: string[] = [];
  for (const [k, label] of Object.entries(COST_LABELS)) {
    const n = cost[k];
    if (n) parts.push(`${n}${label.length === 1 ? label : ' ' + label}`);
  }
  return parts.length ? parts.join(' · ') : 'No materials';
}

export function canAffordMaterials(state: FullGameState, cost: { [k: string]: number | undefined }): boolean {
  const bag = state.resources as unknown as Record<string, number>;
  for (const k of Object.keys(COST_LABELS)) {
    if ((cost[k] || 0) > (bag[k] || 0)) return false;
  }
  return true;
}
