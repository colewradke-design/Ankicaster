/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Room-based navigation (UI declutter pass).
 *
 * Pure, read-only helpers: they decide which management screens a room window offers and
 * which screens the slim top bar's "Academy" menu lists. Nothing here writes state or calls
 * the engine; it only reads FullGameState.
 */

import type { FullGameState } from '../types/ankicaster';

/** Every management screen the UI can open in a screen window. */
export type ScreenId =
  | 'reviewer'   // Anki Gateway / Study Desk (former "Anki Gateway" tab)
  | 'ponder'     // Ponder Orb picker (former "Wizard Study" tab: orb training)
  | 'grimoire'   // Grimoire of known spells (former "Wizard Study" tab: spells)
  | 'students'   // Roster filtered to students (former "Students & Faculty" tab)
  | 'faculty'    // Roster filtered to faculty + faculty limit (former "Students & Faculty" tab)
  | 'alumni'     // Alumni Gallery (former "Students & Faculty" > Alumni sub-tab)
  | 'admissions' // Admissions (former "Admissions" tab)
  | 'build'      // Architect / build catalogue (former "Architect" tab)
  | 'draft'      // Card Draft decks (former "Grimoire Draft" tab)
  | 'bestiary'   // Bestiary / menagerie (former "Bestiary" tab)
  | 'alchemy'    // Alchemy Lab brewing + potions (former "Alchemy Lab" tab)
  | 'rift'       // Rift expedition planner (former "The Rift" tab)
  | 'stores'     // Stores: essences, materials, potions (moved out of the old top bar)
  | 'events'     // Gate visitors: pending school events (engine had them; UI never opened them)
  | 'journal'    // Journal: recent notices (state.notices; previously not shown)
  | 'codex'      // Codex (old top bar button)
  | 'settings';  // Settings (old top bar gear)

export const ALL_SCREENS: ScreenId[] = [
  'reviewer', 'ponder', 'grimoire', 'students', 'faculty', 'alumni', 'admissions', 'build',
  'draft', 'bestiary', 'alchemy', 'rift', 'stores', 'events', 'journal', 'codex', 'settings'
];

export interface ScreenDef {
  id: ScreenId;
  /** Short label used on buttons and in the Academy menu. */
  label: string;
  /** One-line tooltip. */
  hint: string;
  /** Rooms (defIds) whose window offers this screen. Empty = belongs to no room. */
  rooms: string[];
}

const HABITATS = [
  'menagerie', 'meadow_paddock', 'tide_tank', 'aviary', 'gloom_hutch', 'ember_pit',
  'crystal_vivarium', 'pond'
];
const CLASSROOMS = ['class_arcane', 'class_nature', 'class_light', 'class_shadow', 'class_alchemy'];

export const SCREEN_DEFS: Record<ScreenId, ScreenDef> = {
  reviewer: { id: 'reviewer', label: 'Study Desk', hint: 'Review Anki cards to earn mana', rooms: [] },
  ponder: { id: 'ponder', label: 'Ponder Orb', hint: 'Pick a school to study', rooms: ['wizard_study'] },
  grimoire: { id: 'grimoire', label: 'Grimoire', hint: 'Your known spells', rooms: ['wizard_study', 'library'] },
  students: {
    id: 'students', label: 'Students', hint: 'Roster, constellations, needs',
    rooms: ['dormitory', 'grand_dormitory', 'common_room', 'infirmary', ...CLASSROOMS]
  },
  faculty: { id: 'faculty', label: 'Faculty', hint: 'Careers and faculty limit', rooms: ['faculty_quarters', 'faculty_lounge'] },
  alumni: { id: 'alumni', label: 'Alumni', hint: 'Retired masters', rooms: ['trophy_hall'] },
  admissions: { id: 'admissions', label: 'Admissions', hint: 'Enroll new students', rooms: ['entrance_hall'] },
  build: { id: 'build', label: 'Build', hint: 'Plan new rooms', rooms: [] },
  draft: { id: 'draft', label: 'Card Draft', hint: 'Draw 3, keep 1', rooms: ['wizard_study', 'library', 'scriptorium'] },
  bestiary: { id: 'bestiary', label: 'Bestiary', hint: 'Creatures, feeding, tamers', rooms: HABITATS },
  alchemy: { id: 'alchemy', label: 'Alchemy', hint: 'Brew and use potions', rooms: ['alchemy_lab'] },
  rift: { id: 'rift', label: 'Rift', hint: 'Expeditions', rooms: ['rift_gate', 'training_yard'] },
  stores: { id: 'stores', label: 'Stores', hint: 'Essences, materials, potions', rooms: ['storage_vault'] },
  events: { id: 'events', label: 'Visitors', hint: 'Who is at the gate', rooms: ['entrance_hall'] },
  journal: { id: 'journal', label: 'Journal', hint: 'Recent academy notices', rooms: [] },
  codex: { id: 'codex', label: 'Codex', hint: 'How Ankicaster works', rooms: [] },
  settings: { id: 'settings', label: 'Settings', hint: 'Sound, term, reduce motion, reset', rooms: [] }
};

/**
 * The tab bar that this pass removes, and where each tab's features now live.
 * Used by the report and by the reachability tests.
 */
export const FORMER_TABS: Array<{ tab: string; features: string[]; screens: ScreenId[] }> = [
  { tab: 'Castle & Grounds', features: ['academy map', 'room windows', 'dev review buttons', 'Open Study Desk'], screens: [] },
  { tab: 'Anki Gateway', features: ['flashcard reviewer / add-on info'], screens: ['reviewer'] },
  { tab: 'Wizard Study', features: ['orb training (5 schools)', 'active/queued sessions', 'known spells + cast'], screens: ['ponder', 'grimoire'] },
  { tab: 'Students & Faculty', features: ['roster', 'constellation', 'needs', 'careers', 'second school', 'retire', 'faculty limit', 'alumni gallery'], screens: ['students', 'faculty', 'alumni'] },
  { tab: 'Admissions', features: ['enrollment tracker', 'applicants', 'admit'], screens: ['admissions'] },
  { tab: 'Architect', features: ['room catalogue', 'construct plan'], screens: ['build'] },
  { tab: 'Grimoire Draft', features: ['6 decks', 'draw 3 keep 1', 'price growth'], screens: ['draft'] },
  { tab: 'Bestiary', features: ['creature list', 'feed', 'assign tamer', 'taming/bond'], screens: ['bestiary'] },
  { tab: 'Alchemy Lab', features: ['brew', 'drink/use potion'], screens: ['alchemy'] },
  { tab: 'The Rift', features: ['destinations', 'party', 'companion', 'chance meter', 'launch', 'active expedition'], screens: ['rift'] }
];

function builtDefIds(state: FullGameState): Set<string> {
  // Only completed rooms unlock their screens; construction sites ('site') do not.
  return new Set(state.rooms.filter(r => r.state === 'built').map(r => r.defId));
}

export function isRoomBuilt(room: { state: string }): boolean {
  return room.state === 'built';
}

export function totalMasters(state: FullGameState): number {
  return state.characters.filter(c => c.masteredSchools.length > 0).length + state.alumniGallery.length;
}

export function hazardRooms(state: FullGameState) {
  return state.rooms.filter(r => !!r.hazard);
}

/** Screens that belong to no room: always in the top bar or the Academy menu. */
export const ROOMLESS_SCREENS: ScreenId[] = ALL_SCREENS.filter(id => SCREEN_DEFS[id].rooms.length === 0);

/** Screens a room window offers (its primary/secondary action buttons), in display order. */
export function getRoomScreens(defId: string, state?: FullGameState): ScreenId[] {
  const out = ALL_SCREENS.filter(id => SCREEN_DEFS[id].rooms.includes(defId));
  // Visitors button only when someone is actually waiting.
  return state ? out.filter(id => id !== 'events' || state.activeEvents.length > 0) : out;
}

export function isScreenUnlocked(state: FullGameState, id: ScreenId): boolean {
  const def = SCREEN_DEFS[id];
  if (def.rooms.length === 0) return true;
  const built = builtDefIds(state);
  if (!def.rooms.some(r => built.has(r))) return false; // hidden until its room is built; data is kept
  if (id === 'events') return state.activeEvents.length > 0;
  return true;
}

/** Room-backed screens the Academy menu lists right now: only those whose room has finished construction. */
export function getAcademyMenuScreens(state: FullGameState): ScreenId[] {
  return ALL_SCREENS.filter(id => SCREEN_DEFS[id].rooms.length > 0 && isScreenUnlocked(state, id));
}
