/**
 * Three card decks. A room card is one build (roomPlans). Structure pieces are not cards.
 * Rarity weights are fixed (the old draft shuffled a flat list). Wizard level only
 * changes the Magic deck, via the school multiplier.
 */
import { DraftCard, FullGameState, SchoolType } from '../types/ankicaster';
import { ROOM_DEFINITIONS } from '../data/content';

export type DraftDeckId = 'foundation' | 'grounds' | 'magic';

export const STRUCTURE_ROOMS = new Set(['spiral_stair', 'corridor', 'support_pillar']);

export const DECK_LIST: Array<{ id: DraftDeckId; name: string; basePrice: number }> = [
  { id: 'foundation', name: 'Foundation', basePrice: 50 },
  { id: 'grounds', name: 'Grounds', basePrice: 50 },
  { id: 'magic', name: 'Magic', basePrice: 100 }
];

const RARITY_WEIGHT: Record<string, number> = {
  common: 70,
  uncommon: 25,
  rare: 5,
  epic: 2,
  legendary: 1
};

const SCHOOLS: SchoolType[] = ['arcane', 'nature', 'light', 'shadow', 'alchemy'];

type RoomSpec = { id: string; rarity: DraftCard['rarity']; school?: SchoolType };

const FOUNDATION_ROOMS: RoomSpec[] = [
  ['dormitory', 'common'],
  ['refectory', 'common'],
  ['common_room', 'common'],
  ['storage_vault', 'common'],
  ['faculty_quarters', 'common'],
  ['kitchen', 'common'],
  ['faculty_lounge', 'common'],
  ['weaving_room', 'common'],
  ['glassworks', 'common'],
  ['training_yard', 'common'],
  ['workshop', 'uncommon'],
  ['bathhouse', 'uncommon'],
  ['grand_dormitory', 'uncommon'],
  ['trophy_hall', 'rare']
].map(([id, rarity]) => ({ id, rarity: rarity as DraftCard['rarity'] }));

const GROUNDS_ROOMS: RoomSpec[] = [
  ['vegetable_patch', 'common'],
  ['woodlot', 'common'],
  ['quarry', 'common'],
  ['herb_garden', 'common'],
  ['courtyard_garden', 'common'],
  ['pond', 'common'],
  ['orchard', 'common'],
  ['apiary', 'uncommon']
].map(([id, rarity]) => ({ id, rarity: rarity as DraftCard['rarity'] }));

const MAGIC_ROOMS: RoomSpec[] = [
  { id: 'class_arcane', rarity: 'common', school: 'arcane' },
  { id: 'library', rarity: 'common', school: 'arcane' },
  { id: 'crystal_vivarium', rarity: 'uncommon', school: 'arcane' },
  { id: 'scriptorium', rarity: 'uncommon', school: 'arcane' },
  { id: 'observatory', rarity: 'uncommon', school: 'arcane' },
  { id: 'class_nature', rarity: 'common', school: 'nature' },
  { id: 'greenhouse', rarity: 'common', school: 'nature' },
  { id: 'meadow_paddock', rarity: 'uncommon', school: 'nature' },
  { id: 'tide_tank', rarity: 'uncommon', school: 'nature' },
  { id: 'menagerie', rarity: 'rare', school: 'nature' },
  { id: 'class_light', rarity: 'common', school: 'light' },
  { id: 'infirmary', rarity: 'common', school: 'light' },
  { id: 'aviary', rarity: 'uncommon', school: 'light' },
  { id: 'sunlit_sanctum', rarity: 'uncommon', school: 'light' },
  { id: 'moonwell', rarity: 'rare', school: 'light' },
  { id: 'class_shadow', rarity: 'common', school: 'shadow' },
  { id: 'warding_chamber', rarity: 'common', school: 'shadow' },
  { id: 'gloom_hutch', rarity: 'uncommon', school: 'shadow' },
  { id: 'detention_hall', rarity: 'uncommon', school: 'shadow' },
  { id: 'standing_stones', rarity: 'uncommon', school: 'shadow' },
  { id: 'class_alchemy', rarity: 'common', school: 'alchemy' },
  { id: 'alchemy_lab', rarity: 'common', school: 'alchemy' },
  { id: 'ember_pit', rarity: 'uncommon', school: 'alchemy' }
];

/** Non-room cards kept from the old foundation list. Foundation and Grounds both use them. */
const FOUNDATION_EXTRAS: DraftCard[] = [
  { id: 'extra-bunk', deck: 'foundation', rarity: 'common', name: 'Bunk Bed Pattern', type: 'furniture_pattern', targetId: 'bunk_bed', description: 'Allows crafting space-saving Bunk Beds in Dormitories.' },
  { id: 'extra-supply', deck: 'foundation', rarity: 'common', name: 'Supply Shipment Boon', type: 'boon', description: 'Instant crate of materials: +45 Timber, +30 Stone, +10 Glass.' }
];

/** Non-room cards kept from the old school lists. Sanctuary, Ward Spire and Apothecary pointed at rooms that do not exist. */
const MAGIC_EXTRAS: DraftCard[] = [
  { id: 'extra-astral', deck: 'magic', rarity: 'rare', name: 'Astral Influx Boon', type: 'boon', school: 'arcane', description: 'Instant burst of knowledge: +35 Insight and +150 Mana.' },
  { id: 'extra-bramble', deck: 'magic', rarity: 'rare', name: 'Bramblefox Lure', type: 'lure', targetId: 'bramblefox', school: 'nature', description: 'Attracts an inquisitive Azure Bramblefox to your academy meadow habitat.' },
  { id: 'extra-seed', deck: 'magic', rarity: 'uncommon', name: 'Luminescent Seed Packet', type: 'seed', targetId: 'moonglow_fern', school: 'nature', description: 'Unlock Moonglow Fern crop in sacred plots.' },
  { id: 'extra-dawn', deck: 'magic', rarity: 'rare', name: 'Dawn Blessing Boon', type: 'boon', school: 'light', description: 'Radiant surge: +30 Radiance and fully cures one injured resident.' },
  { id: 'extra-veil', deck: 'magic', rarity: 'rare', name: 'Veil Tether Boon', type: 'boon', school: 'shadow', description: 'Instant +35% Veil Strength and +25 Umbra.' },
  { id: 'extra-elixir', deck: 'magic', rarity: 'rare', name: 'Elixir of Clarity Recipe', type: 'recipe_page', targetId: 'elixir_clarity', school: 'alchemy', description: 'Recipe for clarity draft that speeds card review progress.' }
];

const ROOM_DECK = new Map<string, DraftDeckId>();
for (const r of FOUNDATION_ROOMS) ROOM_DECK.set(r.id, 'foundation');
for (const r of GROUNDS_ROOMS) ROOM_DECK.set(r.id, 'grounds');
for (const r of MAGIC_ROOMS) ROOM_DECK.set(r.id, 'magic');

export function isStructure(defId: string): boolean {
  return STRUCTURE_ROOMS.has(defId);
}

export function deckOfRoom(defId: string): DraftDeckId | undefined {
  return ROOM_DECK.get(defId);
}

export function planHint(defId: string): string {
  if (isStructure(defId)) return '';
  if (defId === 'rift_gate') return 'Earned when the Academy has 3 masters';
  const deck = deckOfRoom(defId);
  if (deck === 'foundation') return 'Find it in the Foundation deck';
  if (deck === 'grounds') return 'Find it in the Grounds deck';
  if (deck === 'magic') return 'Find it in the Magic deck';
  return 'Not in a deck';
}

export function plansFor(state: { roomPlans?: Record<string, number> }, defId: string): number {
  return state.roomPlans?.[defId] || 0;
}

/** Structures and the two founding rooms need no card. Every other room needs a plan. */
export function isRoomUnlocked(state: { roomPlans?: Record<string, number> }, defId: string): boolean {
  if (isStructure(defId) || defId === 'entrance_hall' || defId === 'wizard_study') return true;
  return plansFor(state, defId) > 0;
}

export function deckPrice(state: { draftHistory?: Record<string, number> }, deck: DraftDeckId): number {
  const base = DECK_LIST.find(d => d.id === deck)!.basePrice;
  const k = state.draftHistory?.[deck] || 0;
  return Math.round(base * Math.pow(1.05, k));
}

/** 1 + 0.5 × level in that school, capped at ×3. An unstudied school stays at ×1. */
export function schoolMultiplier(level: number): number {
  return Math.min(3, 1 + 0.5 * Math.max(0, level || 0));
}

function roomCard(spec: RoomSpec, deck: DraftDeckId): DraftCard {
  const def = ROOM_DEFINITIONS[spec.id];
  return {
    id: `${deck}:${spec.id}`,
    deck,
    rarity: spec.rarity,
    name: `${def?.name || spec.id} Plan`,
    type: 'blueprint',
    targetId: spec.id,
    school: spec.school,
    description: def?.description || 'A room plan.'
  };
}

export function deckPool(deck: DraftDeckId): DraftCard[] {
  if (deck === 'foundation') {
    return [...FOUNDATION_ROOMS.map(r => roomCard(r, deck)), ...FOUNDATION_EXTRAS.map(c => ({ ...c, deck }))];
  }
  if (deck === 'grounds') {
    return [...GROUNDS_ROOMS.map(r => roomCard(r, deck)), ...FOUNDATION_EXTRAS.map(c => ({ ...c, deck, id: `grounds-${c.id}` }))];
  }
  return [...MAGIC_ROOMS.map(r => roomCard(r, deck)), ...MAGIC_EXTRAS.map(c => ({ ...c }))];
}

export function cardWeight(card: DraftCard, levels?: Partial<Record<SchoolType, number>>): number {
  const rarity = RARITY_WEIGHT[card.rarity] ?? 1;
  if (card.deck !== 'magic' || !card.school) return rarity;
  return rarity * schoolMultiplier(levels?.[card.school] || 0);
}

export function magicSchoolOdds(levels: Partial<Record<SchoolType, number>> | undefined): Record<SchoolType, number> {
  const pool = deckPool('magic');
  const totals: Record<SchoolType, number> = { arcane: 0, nature: 0, light: 0, shadow: 0, alchemy: 0 };
  let all = 0;
  for (const card of pool) {
    const w = cardWeight(card, levels);
    all += w;
    if (card.school) totals[card.school] += w;
  }
  const out = { ...totals };
  if (all <= 0) return out;
  for (const s of SCHOOLS) out[s] = (totals[s] / all) * 100;
  return out;
}

function pickWeighted(cards: DraftCard[], levels: Partial<Record<SchoolType, number>> | undefined, rng: () => number): DraftCard {
  const weights = cards.map(c => cardWeight(c, levels));
  let total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < cards.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return cards[i];
  }
  return cards[cards.length - 1];
}

export const DRAFT_TUTORIAL = 'Three decks: Foundation (rooms of the living academy), Grounds (plots), and Magic (every school in one deck). Draw 3, keep 1. Each room card builds that room once.';

/**
 * Three different cards. Founding draws and bad-luck protection reserve a slot first.
 */
export function dealDraft(state: FullGameState, deck: DraftDeckId, rng: () => number = Math.random): DraftCard[] {
  const levels = state.wizard?.levels;
  const pool = deckPool(deck);
  const chosen: DraftCard[] = [];
  const take = (card: DraftCard | undefined) => {
    if (!card || chosen.some(c => c.id === card.id)) return;
    chosen.push(card);
  };

  const founding = state.foundingDraws || { foundation: 0, grounds: 0 };
  if (deck === 'foundation' && (founding.foundation || 0) === 0) take(pool.find(c => c.targetId === 'dormitory'));
  else if (deck === 'foundation' && founding.foundation === 1) take(pool.find(c => c.targetId === 'refectory'));
  else if (deck === 'grounds' && (founding.grounds || 0) === 0) {
    const which = rng() < 0.5 ? 'woodlot' : 'quarry';
    take(pool.find(c => c.targetId === which));
  }

  const streak = state.roomlessStreak?.[deck] || 0;
  if (streak >= 10 && !chosen.some(c => c.type === 'blueprint')) {
    const rooms = pool.filter(c => c.type === 'blueprint');
    take(pickWeighted(rooms, levels, rng));
  }

  let guard = 0;
  while (chosen.length < 3 && guard < 40) {
    guard++;
    const left = pool.filter(c => !chosen.some(k => k.id === c.id));
    if (!left.length) break;
    take(pickWeighted(left, levels, rng));
  }
  return chosen;
}
