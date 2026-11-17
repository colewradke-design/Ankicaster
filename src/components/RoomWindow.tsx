/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Room window: header (name, level, quality tier, floor, single Move/Demolish/Close)
 * and two tabs: Room and Furnishings.
 */

import React, { useEffect, useState } from 'react';
import {
  X, AlertTriangle, Sparkles, Droplets, Shield, Gauge, Hammer, Users, Briefcase, Award, Move, Trash2, Pause, Play, Lock, Bed, Armchair, PawPrint
} from 'lucide-react';
import { reviewsToGo, reviewsToGoText, computeConstructionPlan } from '../utils/construction';
import {
  SERVANT_PLOT_IDS,
  isRoomOperationalForServant,
  isServantWorkplaceDef,
  requiredSchoolsForChamberLevel,
  roomServantCapacity,
  schoolsAtLevel5Count,
  servantsAssignedToRoom,
  summonServantQuote,
  workshopBaseRate
} from '../utils/servants';
import {
  requiredSlotStatus,
  requiredInstallOption,
  costText,
  unaffordable,
  isFurnitureCompatibleWithRoom,
  maxOptionalSlots,
  optionalSlotsUsed,
  maxSameFurnitureInRoom,
  optionalSlotsCostForNewPiece,
  queuedRequiredBySlot,
  refectoryTableTotal
} from '../utils/requiredFurniture';
import { AnkicasterEngine, HAZARD_DISPEL_MANA_COST } from '../utils/engine';
import { WizardPortrait } from './WizardPortrait';
import { CharacterPortrait } from './CharacterPortrait';
import { CreaturePortrait } from './CreaturePortrait';
import { FullGameState, HabitatType, PlacedRoom, RoomDefinition, ScrollId } from '../types/ankicaster';
import { ROOM_DEFINITIONS, roomDisplayName, FURNITURE_DEFINITIONS, SPELL_DEFINITIONS, CREATURE_DEFINITIONS, TRAIT_DEFINITIONS, GREENHOUSE_CROPS, SCROLL_DEFINITIONS } from '../data/content';
import {
  calculateRoomQuality, wizardOrbQuote, academyFurnitureEffect,
  furnitureEffectForRoom, formatFurnitureEffect, FurnitureEffectKind, roomFurnitureEffects,
  careerAffinityMultiplier, classroomSchool, getFacultySummary, FURNITURE_EFFECTS
} from '../utils/formulas';
import { isPatternKnown } from '../utils/decks';
import {
  buildAcademySchedule,
  classroomDeskCount,
  effectiveWorkplaceSlots,
  libraryReaderCapacity,
  libraryReadingDeskCount,
  refectoryChairCount,
  refectoryTableCount
} from '../utils/schedule';
import { ScreenId, SCREEN_DEFS, getRoomScreens } from '../ui/screens';
import { ScreenIcon } from './ScreenIcon';
import {
  ALL_HABITATS,
  HABITAT_LABELS,
  arrivalStage,
  arrivalStageLabel,
  getPenOccupants,
  menagerieModuleCap,
  menagerieModules,
  originLabel,
  penCreatureCapacity,
  roomAcceptedHabitats
} from '../utils/creatures';

export const Chip: React.FC<{
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  title?: string;
  tone?: string;
  dataTour?: string;
}> = ({ icon, label, value, title, tone = 'text-slate-100', dataTour }) => (
  <span
    title={title || label}
    data-tour={dataTour}
    className="inline-flex items-center gap-1.5 bg-slate-950/70 border border-slate-800 px-2.5 py-1 rounded-lg text-[13px]"
  >
    {icon}
    <span className="text-slate-400">{label}</span>
    <strong className={tone}>{value}</strong>
  </span>
);

export function upgradeCost(room: PlacedRoom): number {
  return Math.round((ROOM_DEFINITIONS[room.defId]?.cost.mana ?? 100) * 0.75) + 50;
}

const STAT_LABELS: Record<string, string> = {
  comfort: 'Comfort', focus: 'Focus', order: 'Order', aura: 'Aura', charm: 'Charm'
};

function capWord(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

/** Stat points on a piece being bought, and how many quality points it would add in this room. */
function furnitureBuyTitle(room: PlacedRoom, stats: { comfort?: number; focus?: number; order?: number; aura?: number; charm?: number } | undefined): string {
  const def = ROOM_DEFINITIONS[room.defId];
  const parts = Object.entries(stats || {}).filter(([, v]) => v).map(([k, v]) => `${STAT_LABELS[k] || k} ${v}`);
  let q = 0;
  if (def && stats) {
    for (const [stat, val] of Object.entries(stats)) {
      if (!val) continue;
      if (def.stats.primary.includes(stat)) q += val;
      else if (def.stats.secondary === stat) q += 0.5 * val;
    }
  }
  const qText = Number.isInteger(q) ? String(q) : String(Math.round(q * 10) / 10);
  return `${parts.join(', ') || 'No stat points'} · +${qText} quality here`;
}

export function facultyLimitFor(state: FullGameState) {
  return getFacultySummary(state).maxAllowed;
}

function roomDefinitionSummaryLine(room: PlacedRoom, def: RoomDefinition | undefined): string | null {
  if (!def) return null;
  const parts: string[] = [];
  if (def.workplace) {
    parts.push(`${capWord(def.workplace.career)}, ${effectiveWorkplaceSlots(room)}`);
  }
  const cap = def.capacity;
  if (cap) {
    if (cap.beds) {
      const placedBeds = room.state === 'built' ? roomBedCapacityForChip(room, def) : cap.beds;
      parts.push(`${placedBeds} ${placedBeds === 1 ? 'bed' : 'beds'}`);
    }
    if (cap.facultyBeds) {
      const totalFacultyBeds = room.defId === 'faculty_quarters'
        ? cap.facultyBeds + Math.max(0, (room.level || 1) - 1)
        : cap.facultyBeds;
      parts.push(`${totalFacultyBeds} faculty beds`);
    }
    if (cap.seats) parts.push(`${cap.seats} seats`);
    if (cap.leisureSeats) parts.push(`${cap.leisureSeats} lounge seats`);
    if (cap.cropBeds) parts.push(`${room.defId === 'greenhouse' && (room.level || 1) >= 3 ? 3 : cap.cropBeds} crop beds`);
    if (cap.creatures) parts.push(`${cap.creatures} creatures`);
    if (cap.adventurers) parts.push(`${cap.adventurers} adventurers`);
    if (cap.plinths) parts.push(`${cap.plinths} plinths`);
    if (cap.readers) parts.push(`${room.defId === 'library' ? libraryReaderCapacity(room) : cap.readers} readers`);
  }
  if ((room.level || 1) >= 3 && def.level3Perk) {
    parts.push(`Lv 3: ${def.level3Perk}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

function roomBedCapacityForChip(room: PlacedRoom, def: RoomDefinition | undefined): number {
  if (!def) return 0;
  if (room.defId === 'faculty_quarters') {
    return (def.capacity?.facultyBeds || 2) + Math.max(0, (room.level || 1) - 1);
  }
  let beds = 0;
  for (const f of room.furniture || []) {
    if (f.damaged || !f.slotKind.includes('bed')) continue;
    const eff = FURNITURE_EFFECTS[f.defId];
    beds += eff?.kind === 'bed_slots' ? eff.value : 1;
  }
  return beds || def.capacity?.beds || 0;
}

/** Small room-specific summary line (status only). */
const RoomSummary: React.FC<{
  state: FullGameState;
  room: PlacedRoom;
  extraChips?: React.ReactNode[];
  onChangeLook?: () => void;
  onOpenPerson?: (personId: 'wizard' | number) => void;
}> = ({ state, room, extraChips = [], onChangeLook, onOpenPerson }) => {
  const id = room.defId;
  const chips: React.ReactNode[] = [...extraChips];
  if (id === 'faculty_quarters' || id === 'faculty_lounge') {
    const { activeFaculty, maxAllowed } = getFacultySummary(state);
    chips.push(<Chip key="f" icon={<Briefcase className="w-3.5 h-3.5 text-amber-300" />} label="Faculty" value={`${activeFaculty}/${maxAllowed}`} title="Faculty / limit (F12)" />);
  }
  if (getRoomScreens(id).includes('students')) {
    const st = state.characters.filter(c => c.status === 'student').length;
    chips.push(<Chip key="s" icon={<Users className="w-3.5 h-3.5 text-emerald-400" />} label="Students" value={st} />);
  }
  if (id === 'entrance_hall') {
    chips.push(<Chip key="r" icon={<Award className="w-3.5 h-3.5 text-amber-400" />} label="Renown" value={state.renown} />);
    chips.push(<Chip key="ch" label="Charm" value="×2" tone="text-emerald-300" title="Furniture Charm in Entrance Hall counts double toward Academy Charm & Renown." />);
    if (state.activeEvents.length) chips.push(<Chip key="v" label="Visitors" value={state.activeEvents.length} tone="text-amber-300" />);
  }
  if (id === 'courtyard_garden') {
    chips.push(<Chip key="cg-l" icon={<Armchair className="w-3.5 h-3.5 text-emerald-300" />} label="Leisure" value="3 seats" />);
    chips.push(<Chip key="cg-c" label="Charm" value="+3" tone="text-amber-300" />);
  }
  if (id === 'library') {
    chips.push(<Chip key="lib-l" icon={<Armchair className="w-3.5 h-3.5 text-sky-300" />} label="Readers" value={libraryReaderCapacity(room)} />);
  }
  if (id === 'menagerie') {
    chips.push(<Chip key="men-l" icon={<Armchair className="w-3.5 h-3.5 text-emerald-300" />} label="Leisure" value="6 seats" />);
  }

  if (id === 'wizard_study') {
    const s = state.wizard.activeSession;
    const queued = state.wizard.queuedSessions?.length || 0;
    const total = Object.values(state.wizard.levels).reduce((a, b) => a + b, 0);
    return (
      <div className="space-y-2">
        <div className="bg-purple-950/40 border border-purple-500/30 rounded-xl p-3 space-y-2" data-testid="study-summary">
          <div className="flex items-center gap-3">
            {onOpenPerson ? (
              <button
                type="button"
                onClick={() => onOpenPerson('wizard')}
                data-testid="study-wizard-portrait-btn"
                title={`View ${state.wizard.title} ${state.wizard.name}`}
                className="rounded-lg bg-gradient-to-b from-sky-300/25 to-slate-800 border border-purple-500/30 hover:border-amber-400/70 transition cursor-pointer"
              >
                <WizardPortrait appearance={state.wizard.appearance} size={48} title={`${state.wizard.title} ${state.wizard.name}`} />
              </button>
            ) : (
              <div className="rounded-lg bg-gradient-to-b from-sky-300/25 to-slate-800 border border-purple-500/30">
                <WizardPortrait appearance={state.wizard.appearance} size={48} title={`${state.wizard.title} ${state.wizard.name}`} />
              </div>
            )}
            <div className="flex-1 min-w-0 text-[13px]">
              <div className="font-bold text-amber-200 truncate">{state.wizard.title} {state.wizard.name}</div>
              <div className="text-slate-400 text-[12px]">Headmaster of {state.wizard.academyName}</div>
            </div>
            {onChangeLook && (
              <button onClick={onChangeLook} className="shrink-0 px-2.5 py-1 min-h-[28px] rounded-lg border border-purple-500/40 text-purple-200 hover:bg-purple-900/40 text-[12px] font-bold" data-testid="change-look">
                Change look
              </button>
            )}
          </div>
          <div className="flex items-center justify-between text-[13px]">
            <span className="font-bold text-purple-200 capitalize flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-purple-400" />
              {s
                ? s.kind === 'orb'
                  ? `${s.school} orb · Lv ${s.targetLevel}`
                  : s.kind === 'summon'
                  ? 'Summoning Servant'
                  : `Grimoire: ${SPELL_DEFINITIONS[s.spellId || '']?.name || 'Spell'}`
                : 'Orb idle'}
            </span>
            <span className="text-slate-400">
              Mastery <strong className="text-amber-300">{total}/50</strong>
              {queued > 0 && <> · <strong className="text-purple-300">{queued}</strong> queued</>}
            </span>
          </div>
          {s && (
            <div title={`${s.progress} / ${s.required} honest reviews. Pauses safely during breaks.`}>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-purple-500 to-amber-400 h-full"
                  style={{ width: `${Math.min(100, (s.progress / Math.max(1, s.required)) * 100)}%` }}
                />
              </div>
              <div className="text-[12px] text-slate-400 mt-1 font-mono">{s.progress}/{s.required} reviews</div>
            </div>
          )}
        </div>
        {chips.length > 0 && <div className="flex flex-wrap gap-2">{chips}</div>}
      </div>
    );
  }

  if (!chips.length) return null;
  return <div className="flex flex-wrap gap-2">{chips}</div>;
};

export interface RoomWindowProps {
  state: FullGameState;
  room: PlacedRoom;
  onClose: () => void;
  onOpenScreen: (id: ScreenId) => void;
  onResolveHazard: (roomId: number, method: 'warder' | 'spell') => void;
  onUpgrade: (roomId: number) => void;
  onAddFurniture: (roomId: number, furnitureDefId: string) => void;
  onRemoveFurniture: (roomId: number, furnitureId: number) => void;
  /** Open the PersonCard for a resident, staff member, or Headmaster. */
  onOpenPerson?: (personId: 'wizard' | number) => void;
  /** Open the CreatureCard for a pen occupant. */
  onOpenCreature?: (creatureId: number) => void;
  /** Assign or replace a staff member in this room's workplace. */
  onAssignStaff?: (roomId: number, charId: number, replaceCharId?: number) => void;
  /** Clear a staff member from this room (returns them to auto placement). */
  onClearStaff?: (roomId: number, charId: number) => void;
  /** Enter Move mode (ghost placement) for this room. */
  onMove?: (roomId: number) => void;
  /** Ask to demolish (opens the confirm dialog). */
  onDemolish?: (roomId: number) => void;
  /** Wizard's Study: reopen "Choose your look". */
  onChangeLook?: () => void;
  /** Construction site: pause / resume (GDD 15.4). */
  onTogglePause?: (roomId: number, paused: boolean) => void;
  /** Install one empty required slot (by its index in the room's required slots). */
  onInstallRequired?: (roomId: number, slotIndex: number) => void;
  /** Enter manual placement mode for an unplaced item waiting in `room.unplacedFurniture`. */
  onPlaceFurniture?: (roomId: number, furnitureId: number) => void;
  /** Enter manual move mode for an installed furniture piece inside `room.furniture`. */
  onMoveFurniture?: (roomId: number, furnitureId: number) => void;
  /** Return an unplaced optional piece back to storage. */
  onCancelUnplacedFurniture?: (roomId: number, furnitureId: number) => void;
  /** Warding Chamber: Reinforce the Veil (1x daily upkeep -> +15% strength). */
  onReinforceVeil?: () => void;
  /** Wanderer from Beyond breach resolution ('feed' 20 Provisions or 'tame' via Tamer). */
  onResolveWanderer?: (roomId: number, method: 'feed' | 'tame') => void;
  /** Observatory / Foresight: Skip a forecasted incoming event. */
  onSkipForecastEvent?: (day: number) => void;
  /** Sunlit Sanctum: Perform Rite of Renewal to remove 1 troublesome trait (50 Radiance, 7d cooldown). */
  onPerformRiteOfRenewal?: (characterId: number, traitId: string) => void;
  /** Furnishings tab: Repair damaged furniture (25% material cost). */
  onRepairFurniture?: (roomId: number, furnitureId: number) => void;
  /** Menagerie: Configure accepted habitat modules (2/3/4 slots by level). */
  onSetMenagerieModules?: (roomId: number, modules: HabitatType[]) => void;
  /** Workshop: Awaken a Geode Golem (3 Golem Cores). */
  onAwakenGeodeGolem?: () => void;
  /** Greenhouse: Configure crop beds (2 at Lv 1-2, 3 at Lv 3). */
  onSetGreenhouseCrops?: (roomId: number, crops: string[]) => void;
  /** Glassworks: Toggle active Stone-to-Glass conversion. */
  onSetGlassworksActive?: (roomId: number, active: boolean) => void;
  /** Library: Spend Insight to research a recipe ingredient hint. */
  onResearchRecipe?: (roomId: number, recipeId?: string) => void;
  /** Scriptorium: Start crafting a scroll. */
  onStartScrollCraft?: (roomId: number, scrollId: ScrollId) => void;
  /** Summoning Chamber: Queue a goblin servant summon. */
  onQueueSummonServant?: () => void;
  /** Assign or clear a goblin servant's workplace (`roomId === undefined` clears). */
  onAssignServant?: (servantId: number, roomId?: number) => void;
  /** Assign or unassign the Headmaster Wizard to help at the Workshop. */
  onSetWizardWorkshopAssigned?: (assigned: boolean) => void;
  /** Initial tab for tests or pre-selected navigation. */
  initialTab?: 'room' | 'furnishings';
  /** Guided tour override to open a specific tab when spotlighting its controls. */
  forcedTab?: 'room' | 'furnishings';
  /** Optional initial state for the Assign staff picker (defaults to false). */
  initialAssignOpen?: boolean;
}

export const RoomWindow: React.FC<RoomWindowProps> = ({
  state,
  room,
  onClose,
  onOpenScreen,
  onResolveHazard,
  onUpgrade,
  onAddFurniture,
  onRemoveFurniture,
  onOpenPerson,
  onOpenCreature,
  onAssignStaff,
  onClearStaff,
  onMove,
  onDemolish,
  onChangeLook,
  onTogglePause,
  onInstallRequired,
  onPlaceFurniture,
  onMoveFurniture,
  onCancelUnplacedFurniture,
  onReinforceVeil,
  onResolveWanderer,
  onSkipForecastEvent,
  onPerformRiteOfRenewal,
  onRepairFurniture,
  onSetMenagerieModules,
  onAwakenGeodeGolem,
  onSetGreenhouseCrops,
  onSetGlassworksActive,
  onResearchRecipe,
  onStartScrollCraft,
  onQueueSummonServant,
  onAssignServant,
  onSetWizardWorkshopAssigned,
  initialTab = 'room',
  forcedTab,
  initialAssignOpen = false
}) => {
  const [activeTab, setActiveTab] = useState<'room' | 'furnishings'>(forcedTab ?? initialTab);
  const [assignOpen, setAssignOpen] = useState(initialAssignOpen);
  const [pendingCandidateId, setPendingCandidateId] = useState<number | null>(null);
  const [servantPickId, setServantPickId] = useState<string>('');

  useEffect(() => {
    if (forcedTab) setActiveTab(forcedTab);
  }, [forcedTab]);

  useEffect(() => {
    setAssignOpen(false);
    setPendingCandidateId(null);
    setServantPickId('');
  }, [room.id]);

  const moveBlock = AnkicasterEngine.roomActionBlock(state, room.id, 'move');
  const demolishBlock = AnkicasterEngine.roomActionBlock(state, room.id, 'demolish');
  const stored = state.furnitureInventory || {};
  const def = ROOM_DEFINITIONS[room.defId];
  const { q, tier } = calculateRoomQuality(room);
  const detail = AnkicasterEngine.roomEfficiencyDetail(state, room);
  const eff = detail.efficiency;
  const bedRoom = !!(def?.capacity?.beds || def?.capacity?.facultyBeds);
  const restTarget = Math.round(AnkicasterEngine.restTargetForRoom(state, room));
  const factorLine = `Lv ×${detail.level.toFixed(2)} · Q ×${detail.quality.toFixed(2)} · Clean ×${detail.cleanliness.toFixed(2)} · Staff ×${detail.staff.toFixed(2)} · Adj ×${detail.adjacency.toFixed(2)}${bedRoom ? ` · Rest target ${restTarget}` : ''}`;

  const screens = room.state === 'built' ? getRoomScreens(room.defId, state) : [];
  const primary = screens.slice(0, 3);
  const extra = screens.slice(3);
  const isSite = room.state === 'site';
  const sitePlan = isSite ? computeConstructionPlan(state).find(p => p.roomId === room.id) : undefined;
  const siteSlotRate = sitePlan?.rate;
  const reqStatus = requiredSlotStatus(room);
  const reqMissing = reqStatus.filter(s => !s.filled).length;
  const unfinished = !isSite && reqMissing > 0;
  const unplaced = room.unplacedFurniture || [];
  const queuedReq = queuedRequiredBySlot(room);
  const maxSlots = maxOptionalSlots(room);
  const usedSlots = optionalSlotsUsed(room);
  const tableTotal = refectoryTableTotal(room);

  const acceptedHabitats = roomAcceptedHabitats(room);
  const penOccupants = acceptedHabitats.length > 0 ? getPenOccupants(state, room) : [];
  const penCap = acceptedHabitats.length > 0 ? penCreatureCapacity(room) : 0;

  const classSch = !isSite ? classroomSchool(room.defId) : undefined;
  const countChips: React.ReactNode[] = [];
  if (!isSite) {
    if (bedRoom) {
      const bedCap = roomBedCapacityForChip(room, def);
      const bedUsed = state.characters.filter(c => c.bedRoomId === room.id).length;
      countChips.push(
        <Chip key="beds" icon={<Bed className="w-3.5 h-3.5 text-sky-300" />} label="Beds" value={`${bedUsed}/${bedCap}`} title={`Rest target: ${restTarget}`} />
      );
    }
    if (classSch) {
      countChips.push(
        <Chip key="desks" icon={<Armchair className="w-3.5 h-3.5 text-amber-300" />} label="Desks" value={`${classroomDeskCount(room)}/4`} title="Student desks in this classroom (4 periods per desk)" />
      );
    } else if (room.defId === 'refectory') {
      const chairs = refectoryChairCount(room);
      const tables = refectoryTableCount(room);
      countChips.push(
        <Chip key="seats" icon={<Armchair className="w-3.5 h-3.5 text-amber-300" />} label="Seats" value={tables > 0 ? `${chairs}/${6 * tables}` : chairs} title="Dining chairs seated at long tables" />
      );
    } else if (room.defId === 'library') {
      countChips.push(
        <Chip key="seats" icon={<Armchair className="w-3.5 h-3.5 text-amber-300" />} label="Desks" value={libraryReadingDeskCount(room)} title="Reading desks" />
      );
    } else if (def?.capacity?.leisureSeats) {
      countChips.push(
        <Chip key="seats" icon={<Armchair className="w-3.5 h-3.5 text-amber-300" />} label="Seats" value={def.capacity.leisureSeats} title="Lounge seats" />
      );
    }
    if (acceptedHabitats.length > 0) {
      countChips.push(
        <Chip key="creatures" icon={<PawPrint className="w-3.5 h-3.5 text-emerald-300" />} label="Creatures" value={`${penOccupants.length}/${penCap}`} title="Pen occupants / capacity" />
      );
    }
  }

  const compatible = Object.values(FURNITURE_DEFINITIONS)
    .filter(fDef => fDef.role !== 'required' && isFurnitureCompatibleWithRoom(fDef, room.defId))
    .sort((a, b) => (isPatternKnown(state, a.id) ? 0 : 1) - (isPatternKnown(state, b.id) ? 0 : 1));

  // Level tier label + Now / Next copy for Furnishings tab
  const lvl = Math.max(1, Math.min(3, room.level || 1));
  const tierName = room.defId === 'spiral_stair'
    ? roomDisplayName(room)
    : lvl === 1 ? 'Bare' : lvl === 2 ? 'Cozy' : 'Fine';

  let nowText = '';
  let nextText = '';
  if (room.defId === 'spiral_stair') {
    if (lvl === 1) {
      nowText = 'Spiral Stair. Standard vertical climb between stacked floors.';
      nextText = 'Magical Elevator. Faster travel between stacked floors.';
    } else if (lvl === 2) {
      nowText = 'Magical Elevator. Fast vertical travel between stacked floors.';
      nextText = `Teleportation Portal. ${def?.level3Perk || 'Instant travel across unstacked portals.'}`;
    } else {
      nowText = `Teleportation Portal. ${def?.level3Perk || 'Instant travel across unstacked portals.'}`;
      nextText = 'This room is finished.';
    }
  } else if (maxSlots === 0) {
    if (lvl === 1) {
      nowText = 'Bare. Holds no furniture.';
      nextText = 'Cozy. The room works better.';
    } else if (lvl === 2) {
      nowText = 'Cozy. The better rate.';
      nextText = `Fine. ${def?.level3Perk || 'Maximum level.'}`;
    } else {
      nowText = `Fine. ${def?.level3Perk || 'Maximum level.'}`;
      nextText = 'This room is finished.';
    }
  } else {
    if (lvl === 1) {
      nowText = 'Bare. Optional slots as built.';
      nextText = 'Cozy. +2 optional slots, and the room works better.';
    } else if (lvl === 2) {
      nowText = 'Cozy. The extra slots and the better rate.';
      nextText = `Fine. ${def?.level3Perk || 'Maximum level.'}`;
    } else {
      nowText = `Fine. ${def?.level3Perk || 'Maximum level.'}`;
      nextText = 'This room is finished.';
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        role="dialog"
        aria-label={`${roomDisplayName(room)} window`}
        data-room-window={room.defId}
        className="bg-slate-900 border border-amber-900/50 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
      >
        {/* 1. Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-800 bg-gradient-to-r from-amber-900/30 to-transparent shrink-0" data-tour="room-header">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <h3 className="text-base font-bold text-amber-300 truncate">{roomDisplayName(room)}</h3>
            <span className="text-[12px] bg-amber-500/20 border border-amber-500/40 text-amber-200 px-2 py-0.5 rounded-md font-bold">Lv {room.level}</span>
            <span className="text-[12px] bg-slate-800 border border-slate-700 text-slate-200 px-2 py-0.5 rounded-md capitalize" title={`Quality ${Math.round(q)}`}>{tier}</span>
            <span className="text-[12px] text-slate-500 font-mono">{room.area === 'castle' ? `F${room.y}` : 'Grounds'}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {onMove && (
              <button
                onClick={() => !moveBlock && onMove(room.id)}
                disabled={!!moveBlock}
                aria-label="Move room"
                data-action="move"
                data-tour="room-move"
                title={moveBlock ? `Can't move: ${moveBlock}` : 'Move this room (keeps level, furniture and progress)'}
                className="p-1.5 min-w-[32px] min-h-[32px] text-slate-300 hover:text-amber-200 rounded-lg hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Move className="w-4 h-4" />
              </button>
            )}
            {onDemolish && (
              <button
                onClick={() => !demolishBlock && onDemolish(room.id)}
                disabled={!!demolishBlock}
                aria-label={isSite ? 'Cancel construction' : 'Demolish room'}
                data-action="demolish"
                data-tour="room-demolish"
                title={demolishBlock ? `Can't demolish: ${demolishBlock}` : isSite ? 'Cancel or demolish this construction site' : 'Demolish this room'}
                className="p-1.5 min-w-[32px] min-h-[32px] text-slate-300 hover:text-rose-300 rounded-lg hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} aria-label="Close" data-tour="room-close" className="p-1.5 min-w-[32px] min-h-[32px] text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div role="tablist" aria-label="Room sections" data-tour="room-tabs" className="flex border-b border-slate-800 bg-slate-950/40 px-5 gap-1 shrink-0">
          <button
            type="button"
            role="tab"
            data-tab="room"
            aria-selected={activeTab === 'room'}
            onClick={() => setActiveTab('room')}
            className={`px-3 py-2 text-[13px] font-bold border-b-2 transition ${
              activeTab === 'room'
                ? 'border-amber-400 text-amber-200'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Room
          </button>
          <button
            type="button"
            role="tab"
            data-tab="furnishings"
            aria-selected={activeTab === 'furnishings'}
            onClick={() => setActiveTab('furnishings')}
            className={`px-3 py-2 text-[13px] font-bold border-b-2 transition inline-flex items-center gap-1.5 ${
              activeTab === 'furnishings'
                ? 'border-amber-400 text-amber-200'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Furnishings</span>
            {!isSite && unplaced.length > 0 && (
              <span className="text-[11px] font-mono px-1.5 py-0.2 rounded-full bg-amber-500/20 border border-amber-500/50 text-amber-200" data-testid="unplaced-tab-badge">
                {unplaced.length}
              </span>
            )}
          </button>
        </div>

        {/* Scrollable body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {activeTab === 'room' ? (
            <div data-testid="room-tab-panel" className="space-y-4">
              {/* 1. Stats */}
              <div className="flex flex-wrap gap-2" data-testid="room-stats" data-tour="room-stats">
                {isSite ? (
                  <Chip
                    icon={<Hammer className="w-3.5 h-3.5 text-amber-400" />}
                    label="Building"
                    value={`${room.buildProgress}/${room.buildRequired}`}
                    title={siteSlotRate ? reviewsToGoText(room, 0, siteSlotRate) : room.buildPaused ? 'Paused' : 'Queued (waiting for Workshop worker)'}
                  />
                ) : (
                  <Chip
                    icon={<Gauge className={`w-3.5 h-3.5 ${unfinished ? 'text-amber-400' : 'text-emerald-400'}`} />}
                    label="Eff"
                    value={`${(eff * 100).toFixed(0)}%`}
                    title={unfinished ? 'Unfinished: runs at 0% until every required fixture is installed' : factorLine}
                    tone={unfinished ? 'text-amber-300' : 'text-emerald-300'}
                    dataTour="efficiency"
                  />
                )}
                <Chip icon={<Droplets className="w-3.5 h-3.5 text-sky-400" />} label="Clean" value={`${Math.round(room.cleanliness)}%`} title="Cleanliness" />
                {(() => {
                  const baseVeil = def?.veil ?? 4;
                  const levelMult = lvl === 3 ? 1.5 : lvl === 2 ? 1.25 : 1.0;
                  const sizePts = Math.round(baseVeil * levelMult * 10) / 10;
                  const baseMana = Math.round(sizePts * 3 * 10) / 10;
                  return (
                    <Chip
                      icon={<Shield className="w-3.5 h-3.5 text-indigo-300" />}
                      label="Veil"
                      value={`${sizePts} pts`}
                      title={`Veil size points: ${sizePts} (${baseMana} base Mana/day before academy reductions)`}
                      tone="text-indigo-300"
                    />
                  );
                })()}
                <Chip label="Q" value={Math.round(q)} title="Quality score" tone="text-amber-300" />
              </div>

              {!isSite && (
                <RoomSummary
                  state={state}
                  room={room}
                  extraChips={countChips}
                  onChangeLook={onChangeLook}
                  onOpenPerson={onOpenPerson}
                />
              )}

              {/* 2. Required fixtures (only while something required is missing) */}
              {!isSite && reqMissing > 0 && (
                <div
                  className="rounded-xl px-3 py-2 text-[13px] border bg-amber-950/30 border-amber-600/50"
                  data-testid="required-fixtures"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="font-bold text-amber-200">Required fixtures</span>
                    <span className="text-[12px] bg-amber-500/20 border border-amber-500/50 text-amber-200 px-2 py-0.5 rounded-md font-bold" data-testid="unfinished-badge" title="A room missing required furniture runs at 0% (GDD 15.4)">
                      Unfinished · 0%
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {reqStatus.map(slot => {
                      const opt = requiredInstallOption(slot.role);
                      const storedN = !opt.free ? stored[opt.defId] || 0 : 0;
                      const why = opt.free || storedN > 0 ? undefined : unaffordable(state, opt.cost);
                      const installed = slot.filled ? room.furniture[slot.furnitureIndex] : undefined;
                      const installedName = installed ? FURNITURE_DEFINITIONS[installed.defId]?.name || slot.name : '';
                      const queuedId = !slot.filled ? queuedReq.get(slot.index) : undefined;
                      return (
                        <li key={slot.index} className="flex items-center justify-between gap-2" data-required-slot={slot.role} data-filled={slot.filled ? 'yes' : 'no'}>
                          <span className={slot.filled ? 'text-slate-200' : 'text-amber-100'}>
                            {slot.filled ? '✓' : '○'} {slot.name}
                            {slot.filled && installedName && installedName !== slot.name && <span className="text-slate-500"> ({installedName})</span>}
                          </span>
                          {slot.filled ? (
                            <span className="text-[12px] text-emerald-400">Installed</span>
                          ) : queuedId !== undefined ? (
                            onPlaceFurniture ? (
                              <button
                                data-action="place-required"
                                onClick={() => onPlaceFurniture(room.id, queuedId)}
                                title={`Place ${slot.name} inside this room`}
                                className="shrink-0 px-2.5 py-1 min-h-[28px] bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-200 border border-emerald-500/50 rounded-md text-[12px] font-bold"
                              >
                                Place
                              </button>
                            ) : (
                              <span className="text-[12px] text-amber-300">Ready to place</span>
                            )
                          ) : onInstallRequired && (
                            <button
                              data-action="install-required"
                              onClick={() => !why && onInstallRequired(room.id, slot.index)}
                              disabled={!!why}
                              title={why || (opt.free ? `Install ${slot.name} (no catalog cost: free)` : storedN > 0 ? `Install a stored ${opt.name}` : `Install ${opt.name} for ${costText(opt.cost)}`)}
                              className="shrink-0 px-2.5 py-1 min-h-[28px] bg-amber-500/20 hover:bg-amber-500/35 text-amber-200 border border-amber-500/50 rounded-md text-[12px] font-bold disabled:opacity-40"
                            >
                              Install · {opt.free ? 'Free' : storedN > 0 ? `Stored ×${storedN}` : costText(opt.cost)}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  <div className="text-[12px] text-amber-300/80 mt-1.5">Unfinished rooms run at 0% until every required fixture is in place.</div>
                </div>
              )}

              {/* 3. Hazard / Lockout */}
              {(room.hazard || (room.lockedUntilReviewIndex || 0) > state.reviewIndex) && (
                <div className="bg-rose-950/40 border border-rose-500/50 p-3 rounded-xl space-y-2 text-rose-200" data-testid="hazard-banner">
                  <div className="flex items-center gap-2 flex-wrap">
                    {room.hazard ? (
                      <AlertTriangle className="w-4 h-4 text-rose-300" />
                    ) : (
                      <Lock className="w-4 h-4 text-rose-300" />
                    )}
                    <span className="font-bold text-[13px] capitalize" title={room.hazard?.description || 'This room is temporarily locked'}>
                      {room.hazard ? room.hazard.type.replace(/_/g, ' ') : 'Room Locked'}
                    </span>
                    {((room.lockedUntilReviewIndex || 0) > state.reviewIndex || (room.hazard?.expiresAtReviewIndex || 0) > state.reviewIndex) && (
                      <span className="text-[12px] bg-rose-900/60 px-2 py-0.5 rounded font-mono" title="Honest reviews remaining">
                        🔒 {Math.max(
                          0,
                          (room.lockedUntilReviewIndex || 0) - state.reviewIndex,
                          (room.hazard?.expiresAtReviewIndex || 0) - state.reviewIndex
                        )} reviews
                      </span>
                    )}
                  </div>
                  {(room.hazard?.effect || room.hazard?.description) && (
                    <div className="text-[12px] text-rose-100/90" data-testid="hazard-effect">
                      {room.hazard.effect || room.hazard.description}
                    </div>
                  )}
                  {room.hazard?.type === 'wanderer' && (
                    <div className="space-y-1.5 pt-1 border-t border-rose-500/30" data-testid="wanderer-controls">
                      <div className="text-[12px] font-mono text-amber-200">
                        Taming progress: {Math.round(room.hazard.tamingProgress || 0)}/{room.hazard.tamingRequired || 160} reviews
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          data-action="wanderer-feed"
                          onClick={() => onResolveWanderer?.(room.id, 'feed')}
                          disabled={state.resources.provisions < 20}
                          className="flex-1 min-h-[32px] px-3 py-1.5 bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white font-bold text-[12px] rounded-lg"
                          title="Offer 20 Provisions so the Wanderer leaves peacefully"
                        >
                          Feed (20 Provisions)
                        </button>
                        <button
                          type="button"
                          data-action="wanderer-tame"
                          onClick={() => onResolveWanderer?.(room.id, 'tame')}
                          className="flex-1 min-h-[32px] px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-[12px] rounded-lg"
                          title="Assign an active Tamer to coax the Wanderer into a rare familiar"
                        >
                          Tame (Tamer)
                        </button>
                      </div>
                    </div>
                  )}
                  {room.hazard && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => onResolveHazard(room.id, 'warder')}
                        className="flex-1 min-h-[32px] px-3 py-1.5 bg-rose-800 hover:bg-rose-700 text-white font-bold text-[13px] rounded-lg"
                        title="Send an active Warder to cleanse the room"
                      >
                        {room.hazard.isBreach ? 'Contain (Warder)' : 'Dispel (Warder)'}
                      </button>
                      <button
                        onClick={() => onResolveHazard(room.id, 'spell')}
                        className="flex-1 min-h-[32px] px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white font-bold text-[13px] rounded-lg"
                        title={`Dispel immediately using ${HAZARD_DISPEL_MANA_COST} Mana`}
                      >
                        Dispel ({HAZARD_DISPEL_MANA_COST} Mana)
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* 4. Site countdown OR "What this room is" */}
              {isSite ? (
                <div className="flex items-center justify-between gap-2 bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 text-[13px]" data-testid="site-countdown">
                  <span className={room.buildPaused || !siteSlotRate ? 'text-slate-400' : 'text-emerald-300'}>
                    {room.buildPaused
                      ? `Paused · ${reviewsToGo(room, 0, siteSlotRate)} honest reviews left (progress is kept)`
                      : siteSlotRate
                      ? `${reviewsToGoText(room, 0, siteSlotRate)} (${siteSlotRate} pts/rev)`
                      : `Queued · ${reviewsToGoText(room)} (assign Workshop workers)`}
                  </span>
                  {onTogglePause && (
                    <button
                      data-action="toggle-pause"
                      onClick={() => onTogglePause(room.id, !room.buildPaused)}
                      className="flex items-center gap-1 px-2.5 py-1 min-h-[30px] rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800"
                      title={room.buildPaused ? 'Resume construction' : 'Pause construction: progress is kept forever'}
                    >
                      {room.buildPaused ? <><Play className="w-3.5 h-3.5" /> Resume</> : <><Pause className="w-3.5 h-3.5" /> Pause</>}
                    </button>
                  )}
                </div>
              ) : (() => {
                const defLine = roomDefinitionSummaryLine(room, def);
                return (
                  <div className="space-y-2.5" data-testid="room-what">
                    {def?.description && (
                      <p className="text-[13px] text-slate-300 leading-relaxed" data-testid="room-description">
                        {def.description}
                      </p>
                    )}
                    {defLine && (
                      <p className="text-[12px] text-slate-400" data-testid="room-definition-line">
                        {defLine}
                      </p>
                    )}
                    {(primary.length > 0 || extra.length > 0) && (
                      <div className="flex flex-wrap items-stretch gap-2" data-testid="room-actions">
                        {primary.map((id, i) => (
                          <button
                            key={id}
                            data-screen={id}
                            onClick={() => onOpenScreen(id)}
                            title={SCREEN_DEFS[id].hint}
                            className={`flex-1 min-w-[110px] flex flex-col items-center justify-center gap-1 min-h-[64px] px-2 py-2 rounded-xl text-[13px] font-bold transition border-b-2 ${
                              i === 0
                                ? 'bg-amber-600 hover:bg-amber-500 text-slate-950 border-amber-800'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-950 border border-slate-700'
                            }`}
                          >
                            <ScreenIcon id={id} className="w-5 h-5" />
                            {SCREEN_DEFS[id].label}
                            {id === 'ponder' && wizardOrbQuote({
                              foundingSchool: state.wizard.foundingSchool,
                              levels: state.wizard.levels,
                              active: state.wizard.activeSession,
                              queued: state.wizard.queuedSessions,
                              school: state.wizard.foundingSchool || ''
                            }).free && (
                              <span className="font-mono text-[11px] leading-none" data-testid="study-ponder-free">Free</span>
                            )}
                          </button>
                        ))}
                        {extra.map(id => (
                          <button
                            key={id}
                            data-screen={id}
                            onClick={() => onOpenScreen(id)}
                            title={SCREEN_DEFS[id].hint}
                            className="flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] self-center rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 text-[12px] font-semibold"
                          >
                            <ScreenIcon id={id} className="w-4 h-4" />
                            {SCREEN_DEFS[id].label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 4b. Warding Chamber & Observatory room actions */}
              {!isSite && room.defId === 'warding_chamber' && (
                <div className="bg-indigo-950/35 border border-indigo-500/40 rounded-xl p-3 space-y-2" data-testid="warding-chamber-controls">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-bold text-indigo-200">Veil Defense</span>
                    <span className="font-mono text-indigo-300">
                      Strength {state.veil.strength}% · Upkeep {Math.max(1, state.veil.costToday)} Mana/day
                    </span>
                  </div>
                  <div className="text-[12px] text-slate-300">
                    Reduces daily Veil upkeep (-5% per chamber, max 3) and wards nearby rooms within 3 steps (-20% hazard chance).
                  </div>
                  <button
                    type="button"
                    data-action="reinforce-veil"
                    onClick={() => onReinforceVeil?.()}
                    disabled={!onReinforceVeil || unfinished || state.mana < Math.max(1, state.veil.costToday)}
                    className="w-full min-h-[34px] px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-[12px]"
                    title="Spend 1x today's Veil upkeep Mana to restore +15% Veil strength and seal Veil Rents"
                  >
                    Reinforce Veil ({Math.max(1, state.veil.costToday)} Mana → +15% Strength)
                  </button>
                </div>
              )}

              {!isSite && room.defId === 'observatory' && (() => {
                const forecast = AnkicasterEngine.getVisibleForecast(state);
                const depth = AnkicasterEngine.getForecastDepth(state);
                const skips = state.activeBuffs?.foresightSkips || 0;
                return (
                  <div className="bg-indigo-950/35 border border-indigo-500/40 rounded-xl p-3 space-y-2" data-testid="observatory-forecast">
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="font-bold text-indigo-200">Astral Event Forecast</span>
                      <span className="font-mono text-indigo-300">Horizon: {depth}d</span>
                    </div>
                    {unfinished ? (
                      <div className="text-[12px] text-amber-300">Install required fixtures to reveal tomorrow&apos;s incoming visitors and events.</div>
                    ) : forecast.length === 0 ? (
                      <div className="text-[12px] text-slate-400">No forecasted events queued yet.</div>
                    ) : (
                      <div className="space-y-1.5">
                        {forecast.map(item => (
                          <div key={item.day} className="flex items-center justify-between gap-2 bg-slate-950/60 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[12px]">
                            <div className="min-w-0">
                              <div className="font-bold text-indigo-100">Day {item.day}: {item.eventName}</div>
                              <div className="text-slate-400 truncate">{item.description}</div>
                            </div>
                            {skips > 0 && item.eventId !== 'none' && (
                              <button
                                type="button"
                                data-action="skip-forecast-event"
                                onClick={() => onSkipForecastEvent?.(item.day)}
                                disabled={!onSkipForecastEvent}
                                className="shrink-0 px-2 py-1 rounded bg-purple-700 hover:bg-purple-600 disabled:opacity-40 text-white font-bold text-[11px]"
                              >
                                Skip (Foresight)
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {!isSite && room.defId === 'sunlit_sanctum' && (() => {
                const lastDay = state.sanctumRenewalLastDay;
                const cooldownLeft = lastDay !== undefined ? Math.max(0, 7 - (state.day - lastDay)) : 0;
                const charsWithTroublesome = state.characters
                  .map(c => ({
                    char: c,
                    troublesome: (c.traits || []).filter(t => TRAIT_DEFINITIONS[t]?.category === 'troublesome')
                  }))
                  .filter(x => x.troublesome.length > 0);
                return (
                  <div className="bg-amber-950/30 border border-amber-500/40 rounded-xl p-3 space-y-2" data-testid="sunlit-sanctum-rite">
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="font-bold text-amber-200">Rite of Renewal</span>
                      <span className="font-mono text-amber-300">
                        50 Radiance · {cooldownLeft > 0 ? `${cooldownLeft}d cooldown` : 'Ready'}
                      </span>
                    </div>
                    <div className="text-[12px] text-slate-300">
                      Purifies one troublesome trait from a resident (once every 7 days).
                    </div>
                    {unfinished ? (
                      <div className="text-[12px] text-amber-300">Install required fixtures to perform the Rite of Renewal.</div>
                    ) : charsWithTroublesome.length === 0 ? (
                      <div className="text-[12px] text-slate-400">No residents currently carry troublesome traits.</div>
                    ) : (
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {charsWithTroublesome.map(({ char: ch, troublesome }) => (
                          <div key={ch.id} className="bg-slate-950/60 border border-slate-800 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-[12px] font-semibold text-slate-200">{ch.name}</span>
                            <div className="flex flex-wrap gap-1.5">
                              {troublesome.map(tr => (
                                <button
                                  key={tr}
                                  type="button"
                                  data-action="rite-of-renewal"
                                  data-char-id={ch.id}
                                  data-trait-id={tr}
                                  disabled={!onPerformRiteOfRenewal || cooldownLeft > 0 || state.resources.radiance < 50}
                                  onClick={() => onPerformRiteOfRenewal?.(ch.id, tr)}
                                  title={TRAIT_DEFINITIONS[tr]?.effect || tr}
                                  className="px-2 py-0.5 rounded bg-amber-600/80 hover:bg-amber-500 disabled:opacity-40 text-slate-950 font-bold text-[11px]"
                                >
                                  Purify &ldquo;{tr}&rdquo;
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {!isSite && room.defId === 'menagerie' && (() => {
                const modCap = menagerieModuleCap(room.level);
                const currentMods = menagerieModules(room);
                const toggleMod = (h: HabitatType) => {
                  if (!onSetMenagerieModules) return;
                  if (currentMods.includes(h)) {
                    if (currentMods.length <= 1) return;
                    onSetMenagerieModules(room.id, currentMods.filter(m => m !== h));
                  } else {
                    if (currentMods.length >= modCap) return;
                    onSetMenagerieModules(room.id, [...currentMods, h]);
                  }
                };
                return (
                  <div className="bg-emerald-950/25 border border-emerald-500/40 rounded-xl p-3 space-y-2" data-testid="menagerie-modules">
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="font-bold text-emerald-200">Habitat Modules</span>
                      <span className="font-mono text-emerald-300">{currentMods.length} / {modCap} slots (Lv {room.level})</span>
                    </div>
                    <div className="text-[11px] text-slate-300">
                      Select which biomes this Grand Menagerie supports. Philosopher&apos;s Chimera requires both Ember and Crystal active. Creatures housed here gain +10% buff strength.
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {ALL_HABITATS.map(h => {
                        const checked = currentMods.includes(h);
                        const disabled = !onSetMenagerieModules || (!checked && currentMods.length >= modCap) || (checked && currentMods.length <= 1);
                        return (
                          <label
                            key={h}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[12px] cursor-pointer transition ${
                              checked
                                ? 'bg-emerald-900/40 border-emerald-500/50 text-emerald-100 font-semibold'
                                : 'bg-slate-950/60 border-slate-800 text-slate-400'
                            } ${disabled && !checked ? 'opacity-45 cursor-not-allowed' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled}
                              onChange={() => toggleMod(h)}
                              className="accent-emerald-400"
                            />
                            <span>{HABITAT_LABELS[h].badge} {HABITAT_LABELS[h].label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {!isSite && room.defId === 'summoning_chamber' && (() => {
                const lvl = room.level || 1;
                const schoolsLv5 = schoolsAtLevel5Count(state.wizard?.levels);
                const quote = summonServantQuote((state.servants || []).length, lvl);
                const startsImmediately = !state.wizard?.activeSession;
                const canQueueSummon = !unfinished && !!onQueueSummonServant && (!startsImmediately || state.mana >= quote.mana);
                const servants = state.servants || [];
                const workplaces = (state.rooms || []).filter(r => isServantWorkplaceDef(r.defId) && isRoomOperationalForServant(state, r));
                return (
                  <div className="bg-purple-950/25 border border-purple-500/40 rounded-xl p-3 space-y-3" data-testid="summoning-chamber-controls">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <div className="text-[12px] font-bold text-purple-200">Summoning Ritual (Chamber Lv {lvl})</div>
                        <div className="text-[11px] text-slate-300">
                          {quote.mana} Mana · {quote.reviews} reviews · Schools Lv 5+: {schoolsLv5}/3. Mana is charged when ritual reaches top of Services queue.
                        </div>
                      </div>
                      <button
                        type="button"
                        data-testid="summon-servant-btn"
                        disabled={!canQueueSummon}
                        onClick={() => onQueueSummonServant?.()}
                        className="shrink-0 px-3 py-1.5 rounded-lg bg-purple-600/85 hover:bg-purple-500 disabled:opacity-40 text-white font-bold text-[12px]"
                      >
                        {startsImmediately ? `Summon Servant (${quote.mana}m)` : `Queue Summon (${quote.mana}m on start)`}
                      </button>
                    </div>

                    <div className="border-t border-purple-500/25 pt-2.5 space-y-2" data-testid="servant-roster">
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="font-bold text-slate-200">Servant Roster ({servants.length})</span>
                        <span className="text-[11px] text-slate-400">Assign to any operational workplace</span>
                      </div>
                      {servants.length === 0 ? (
                        <div className="text-[11px] text-slate-400">No goblin servants summoned yet.</div>
                      ) : (
                        <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
                          {servants.map(sv => {
                            const wpRoom = sv.workplaceRoomId != null ? state.rooms.find(r => r.id === sv.workplaceRoomId) : undefined;
                            return (
                              <div
                                key={sv.id}
                                data-testid={`roster-servant-${sv.id}`}
                                className="flex items-center justify-between gap-2 bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[12px]"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    className="w-3 h-3 rounded-sm border border-slate-700 shrink-0"
                                    style={{ backgroundColor: sv.look.skin }}
                                    aria-hidden="true"
                                  />
                                  <div className="min-w-0">
                                    <div className="font-semibold text-slate-100 truncate">{sv.name}</div>
                                    <div className="text-[10px] text-slate-400 truncate">
                                      {wpRoom ? `Assigned: ${roomDisplayName(wpRoom)}` : 'Idle'}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {onAssignServant && (
                                    <select
                                      aria-label={`Workplace for ${sv.name}`}
                                      value={sv.workplaceRoomId != null ? String(sv.workplaceRoomId) : ''}
                                      onChange={e => {
                                        const val = e.target.value;
                                        onAssignServant(sv.id, val === '' ? undefined : Number(val));
                                      }}
                                      className="bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-[11px] text-slate-100 max-w-[140px]"
                                    >
                                      <option value="">Idle</option>
                                      {workplaces.map(w => {
                                        const wCap = roomServantCapacity(w);
                                        const taken = servantsAssignedToRoom(servants, w.id, sv.id).length;
                                        const full = Number.isFinite(wCap) && taken >= wCap;
                                        return (
                                          <option key={w.id} value={String(w.id)} disabled={full}>
                                            {roomDisplayName(w)}{full ? ' (full)' : ''}
                                          </option>
                                        );
                                      })}
                                    </select>
                                  )}
                                  {sv.workplaceRoomId != null && onAssignServant && (
                                    <button
                                      type="button"
                                      onClick={() => onAssignServant(sv.id, undefined)}
                                      className="px-2 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800 text-[11px]"
                                    >
                                      Clear
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {!isSite && room.defId === 'workshop' && (() => {
                const cores = state.resources.golem_core || 0;
                const canAwaken = !unfinished && cores >= 3 && !!onAwakenGeodeGolem;
                const wizAssigned = state.wizard?.workshopAssigned !== false;
                const activePlan = computeConstructionPlan(state)[0];
                const wizActiveOnSite = activePlan?.crew.some(m => m.kind === 'wizard') ?? false;
                return (
                  <div className="space-y-2">
                    <div className="bg-amber-950/25 border border-amber-500/40 rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap" data-testid="workshop-wizard-toggle-box">
                      <div className="space-y-0.5 min-w-0">
                        <div className="text-[12px] font-bold text-amber-200">Headmaster Construction Duty</div>
                        <div className="text-[11px] text-slate-300">
                          {wizAssigned
                            ? wizActiveOnSite
                              ? 'Wizard is hammering on the active site (Services queue paused with progress saved).'
                              : 'Wizard assigned to Workshop (steps in when an unpaused site is ready; 4 bodies max total).'
                            : 'Assign the Wizard to build at Workshop rate. Services pause only while actually on a site.'}
                        </div>
                      </div>
                      <button
                        type="button"
                        data-testid="wizard-workshop-toggle"
                        disabled={!onSetWizardWorkshopAssigned || (unfinished && !wizAssigned)}
                        onClick={() => onSetWizardWorkshopAssigned?.(!wizAssigned)}
                        className={`shrink-0 px-3 py-1.5 rounded-lg font-bold text-[12px] disabled:opacity-40 ${
                          wizAssigned
                            ? 'bg-amber-600 hover:bg-amber-500 text-slate-950'
                            : 'bg-slate-800 hover:bg-slate-700 text-amber-200 border border-amber-500/40'
                        }`}
                      >
                        {wizAssigned ? 'Take Wizard Off Workshop' : 'Assign Wizard to Workshop'}
                      </button>
                    </div>
                    <div className="bg-sky-950/25 border border-sky-500/40 rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap" data-testid="workshop-golem">
                      <div className="space-y-0.5 min-w-0">
                        <div className="text-[12px] font-bold text-sky-200">Awaken Geode Golem</div>
                        <div className="text-[11px] text-slate-300">
                          Forge a wary Geode Golem (+10% construction speed &amp; storage cap when tamed) from 3 Golem Cores ({cores} owned). Requires an open Crystal habitat.
                        </div>
                      </div>
                      <button
                        type="button"
                        data-action="awaken-geode-golem"
                        disabled={!canAwaken}
                        onClick={() => onAwakenGeodeGolem?.()}
                        className="shrink-0 px-3 py-1.5 rounded-lg bg-sky-600/85 hover:bg-sky-500 disabled:opacity-40 text-white font-bold text-[12px]"
                      >
                        Awaken (3 Cores)
                      </button>
                    </div>
                  </div>
                );
              })()}

              {!isSite && room.defId === 'greenhouse' && (() => {
                const bedCap = (room.level || 1) >= 3 ? 3 : 2;
                const defaultBeds = (room.level || 1) >= 3 ? ['hearthroot', 'silverleaf', 'moonbeans'] : ['hearthroot', 'silverleaf'];
                const currentBeds = room.settings?.crops?.length
                  ? room.settings.crops.slice(0, bedCap)
                  : room.settings?.crop
                  ? Array(bedCap).fill(room.settings.crop)
                  : [...defaultBeds];
                while (currentBeds.length < bedCap) {
                  currentBeds.push(defaultBeds[currentBeds.length] || 'hearthroot');
                }
                const natureLvl = state.wizard?.levels?.nature || 0;
                const unlockedSeeds = new Set(state.resources?.seedsUnlocked || []);
                const availableCrops = Object.values(GREENHOUSE_CROPS).filter(c => {
                  if (c.unlock === 'start') return true;
                  if (c.unlock === 'nature_l3') return natureLvl >= 3;
                  return unlockedSeeds.has(c.id);
                });
                const updateBed = (idx: number, cropId: string) => {
                  if (!onSetGreenhouseCrops) return;
                  const nextBeds = [...currentBeds];
                  nextBeds[idx] = cropId;
                  onSetGreenhouseCrops(room.id, nextBeds);
                };
                return (
                  <div className="bg-emerald-950/25 border border-emerald-500/40 rounded-xl p-3 space-y-2" data-testid="greenhouse-crops">
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="font-bold text-emerald-200">Greenhouse Crop Beds</span>
                      <span className="font-mono text-emerald-300">{bedCap} beds (Lv {room.level})</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {currentBeds.map((cropId, idx) => {
                        const chosenDef = GREENHOUSE_CROPS[cropId];
                        return (
                          <div key={idx} className="space-y-1">
                            <label className="block text-[11px] font-semibold text-slate-300">
                              Bed {idx + 1}
                            </label>
                            <select
                              aria-label={`Greenhouse Bed ${idx + 1}`}
                              data-testid={`greenhouse-bed-${idx}`}
                              value={cropId}
                              disabled={!onSetGreenhouseCrops || unfinished}
                              onChange={e => updateBed(idx, e.target.value)}
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-[12px] text-slate-100 disabled:opacity-40"
                            >
                              {availableCrops.map(c => (
                                <option key={c.id} value={c.id}>
                                  {c.name} ({Object.entries(c.outputs).map(([k, v]) => `+${v} ${k}`).join(', ')})
                                </option>
                              ))}
                            </select>
                            {chosenDef?.conditionNote && (
                              <div className="text-[10px] text-amber-300/90">{chosenDef.conditionNote}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {!isSite && room.defId === 'glassworks' && (() => {
                const isActive = room.settings?.glassworksActive !== false;
                return (
                  <div className="bg-cyan-950/25 border border-cyan-500/40 rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap" data-testid="glassworks-controls">
                    <div className="space-y-0.5 min-w-0">
                      <div className="text-[12px] font-bold text-cyan-200">Glassworks Furnace</div>
                      <div className="text-[11px] text-slate-300">
                        {isActive ? 'Active: converting Stone into Glass every bell.' : 'Paused: furnace banked (preserving Stone).'}
                      </div>
                    </div>
                    <button
                      type="button"
                      data-action="toggle-glassworks"
                      disabled={!onSetGlassworksActive || unfinished}
                      onClick={() => onSetGlassworksActive?.(room.id, !isActive)}
                      className={`shrink-0 px-3 py-1.5 rounded-lg font-bold text-[12px] disabled:opacity-40 ${
                        isActive
                          ? 'bg-emerald-600/80 hover:bg-emerald-500 text-white'
                          : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                      }`}
                    >
                      {isActive ? 'Conversion Active' : 'Conversion Paused'}
                    </button>
                  </div>
                );
              })()}

              {!isSite && room.defId === 'library' && (() => {
                const activeLibScholars = state.characters.filter(
                  c => c.career === 'scholar' && c.careerState === 'active' && c.status !== 'away' && !c.injury && c.workplaceRoomId === room.id
                ).length;
                const insightCost = Math.max(21, Math.round(30 * (1 - Math.min(0.3, activeLibScholars * 0.1))));
                const hintsMap = state.discoveredHints || {};
                const canResearchTarget = state.potions.some(
                  p => !p.discovered && p.ingredients.some(ing => !(hintsMap[p.id] || []).includes(ing))
                );
                const canAfford = (state.resources.insight || 0) >= insightCost;
                return (
                  <div className="bg-sky-950/25 border border-sky-500/40 rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap" data-testid="library-research">
                    <div className="space-y-0.5 min-w-0">
                      <div className="text-[12px] font-bold text-sky-200">Recipe Research</div>
                      <div className="text-[11px] text-slate-300">
                        Spend {insightCost} Insight ({Math.floor(state.resources.insight || 0)} owned) to uncover 1 ingredient of an undiscovered potion.
                      </div>
                    </div>
                    <button
                      type="button"
                      data-action="research-recipe"
                      disabled={!onResearchRecipe || unfinished || !canResearchTarget || !canAfford}
                      onClick={() => onResearchRecipe?.(room.id)}
                      className="shrink-0 px-3 py-1.5 rounded-lg bg-sky-600/85 hover:bg-sky-500 disabled:opacity-40 text-white font-bold text-[12px]"
                    >
                      {canResearchTarget ? `Research (${insightCost} Insight)` : 'All Recipes Hinted'}
                    </button>
                  </div>
                );
              })()}

              {!isSite && room.defId === 'scriptorium' && (() => {
                const activeJob = (state.scrollQueue || []).find(j => j.roomId === room.id);
                const bag = state.resources as unknown as Record<string, number>;
                return (
                  <div className="bg-purple-950/25 border border-purple-500/40 rounded-xl p-3 space-y-2" data-testid="scriptorium-controls">
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="font-bold text-purple-200">Scriptorium Scroll Desk</span>
                      <span className="text-[11px] text-purple-300 font-mono">
                        {activeJob ? `${SCROLL_DEFINITIONS[activeJob.scrollId]?.name || activeJob.scrollId}: ${Math.round(activeJob.progress * 10) / 10}/${activeJob.required}r` : 'Desk Idle'}
                      </span>
                    </div>
                    {activeJob ? (
                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-purple-500 h-full transition-all"
                          style={{ width: `${Math.min(100, (activeJob.progress / Math.max(1, activeJob.required)) * 100)}%` }}
                        />
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {Object.values(SCROLL_DEFINITIONS).map(sc => {
                          const canPay = Object.entries(sc.cost).every(([k, amt]) => (bag[k] || 0) >= amt);
                          const owned = state.scrolls?.[sc.id] || 0;
                          return (
                            <button
                              key={sc.id}
                              type="button"
                              data-action={`craft-scroll-${sc.id}`}
                              disabled={!onStartScrollCraft || unfinished || !canPay}
                              onClick={() => onStartScrollCraft?.(room.id, sc.id)}
                              title={`${sc.effect} · ${sc.craftReviews} reviews`}
                              className="text-left px-2.5 py-1.5 rounded-lg bg-slate-950/70 hover:bg-purple-900/40 border border-slate-800 hover:border-purple-500/50 disabled:opacity-40 transition"
                            >
                              <div className="flex items-center justify-between text-[12px] font-bold text-slate-100">
                                <span>{sc.name}</span>
                                <span className="text-[11px] font-mono text-amber-300">×{owned}</span>
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {Object.entries(sc.cost).map(([k, v]) => `${v} ${k}`).join(' + ')} · {sc.craftReviews}r
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 5. Who is here: Residents + classroom line, then Staff block if workplace */}
              {!isSite && (() => {
                const schedule = classSch ? buildAcademySchedule(state) : undefined;
                const roomSched = schedule?.classrooms.get(room.id);
                const hasQualifyingTeacher =
                  !classSch ||
                  !!roomSched?.isStaffed ||
                  state.characters.some(c =>
                    c.workplaceRoomId === room.id &&
                    c.career === 'teacher' &&
                    c.careerState !== 'sabbatical' &&
                    c.masteredSchools.includes(classSch)
                  );
                const residents = state.characters.filter(
                  c => c.bedRoomId === room.id || c.seatRoomId === room.id
                );
                const capSch = classSch ? classSch[0].toUpperCase() + classSch.slice(1) : '';
                const wp = def?.workplace;
                const staff = wp
                  ? state.characters.filter(
                      c => c.workplaceRoomId === room.id && c.career === wp.career && c.careerState !== 'sabbatical'
                    )
                  : [];
                const wpMax = wp ? effectiveWorkplaceSlots(room) : 0;
                const staffCap = wp ? Math.max(wpMax, staff.length) : 0;
                const eligibleStaff = wp
                  ? state.characters.filter(
                      c =>
                        c.career === wp.career &&
                        c.careerState !== 'sabbatical' &&
                        c.status !== 'away' &&
                        c.workplaceRoomId !== room.id &&
                        (wp.career !== 'teacher' || (!!classSch && c.masteredSchools.includes(classSch)))
                    )
                  : [];
                const isStaffFull = wp ? staff.length >= wpMax : false;
                const hasClassLine = !hasQualifyingTeacher || !!roomSched?.coveredByHeadmaster || (!!roomSched && roomSched.teacherIds.length > 0);
                if (!residents.length && !hasClassLine && !wp) return null;

                return (
                  <div className="space-y-3" data-testid="room-who">
                    {hasClassLine && (
                      <div className="space-y-1.5">
                        {!hasQualifyingTeacher && (
                          <div className="bg-amber-950/40 border border-amber-600/50 rounded-xl px-3 py-2 text-[12px] text-amber-200 font-semibold" data-testid="classroom-needs-teacher">
                            Needs a {capSch} master teacher
                          </div>
                        )}
                        {roomSched?.coveredByHeadmaster && (
                          <div className="bg-indigo-950/50 border border-indigo-500/50 rounded-xl px-3 py-2 text-[12px] text-indigo-200 font-semibold flex items-center justify-between" data-testid="classroom-headmaster-covered">
                            <span>Covered by Headmaster (All 4 Periods)</span>
                            <span className="text-[11px] font-mono text-indigo-300">Desks: {roomSched.deskCount} · Cap {roomSched.deskCount * 4}</span>
                          </div>
                        )}
                        {roomSched && !roomSched.coveredByHeadmaster && roomSched.teacherIds.length > 0 && (
                          <div className="bg-emerald-950/30 border border-emerald-700/40 rounded-xl px-3 py-1.5 text-[12px] text-emerald-200 flex items-center justify-between" data-testid="classroom-schedule-info">
                            <span>
                              {roomSched.teacherIds.length === 2
                                ? 'Staffed by 2 teachers (Periods 1–2 / 3–4)'
                                : 'Staffed (Periods 1–4)'}
                            </span>
                            <span className="text-[11px] font-mono text-emerald-300">Desks: {roomSched.deskCount} · Cap {roomSched.deskCount * 4}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {residents.length > 0 && (
                      <div className="space-y-1.5" data-testid="room-residents">
                        <div className="text-[12px] uppercase tracking-wider font-bold text-slate-400">Residents</div>
                        <div className="flex flex-wrap gap-2" data-testid="room-occupants">
                          {residents.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => onOpenPerson?.(c.id)}
                              data-testid={`resident-person-${c.id}`}
                              className="flex items-center gap-2 bg-slate-950/60 border border-slate-800 hover:border-amber-500/50 rounded-full pr-3 transition cursor-pointer"
                              title={`Inspect ${c.name}`}
                            >
                              <CharacterPortrait character={c} size={36} />
                              <span className="text-[12px] text-slate-200">{c.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {wp && (
                      <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-2" data-testid="room-staff">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12px] uppercase tracking-wider font-bold text-slate-300">
                            {capWord(wp.career)}
                          </span>
                          <span className="text-[12px] font-mono text-slate-300" data-testid="room-staff-count">
                            {staff.length} / {staffCap}
                          </span>
                        </div>

                        {staff.length > 0 && (
                          <div className="space-y-1.5">
                            {staff.map(c => {
                              const mult = c.career !== 'teacher'
                                ? careerAffinityMultiplier(c.masteredSchools, c.career, def?.school)
                                : 1;
                              const bonusPct = Math.round((mult - 1) * 100);
                              return (
                                <div
                                  key={c.id}
                                  data-testid={`staff-row-${c.id}`}
                                  className="flex items-center justify-between gap-2 bg-slate-900/90 border border-slate-800 rounded-lg px-2 py-1.5"
                                >
                                  <button
                                    type="button"
                                    onClick={() => onOpenPerson?.(c.id)}
                                    className="flex items-center gap-2 min-w-0 text-left hover:text-amber-200 transition cursor-pointer"
                                    title={`Inspect ${c.name}`}
                                  >
                                    <CharacterPortrait character={c} size={36} />
                                    <span className="text-[13px] font-semibold text-slate-100 truncate">{c.name}</span>
                                    {bonusPct > 0 && (
                                      <span
                                        className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-700/50 text-emerald-300 font-semibold shrink-0"
                                        data-testid={`staff-affinity-${c.id}`}
                                      >
                                        +{bonusPct}%
                                      </span>
                                    )}
                                  </button>
                                  {onClearStaff && (
                                    <button
                                      type="button"
                                      data-action="clear-staff"
                                      data-char-id={c.id}
                                      onClick={() => {
                                        setPendingCandidateId(null);
                                        onClearStaff(room.id, c.id);
                                      }}
                                      className="shrink-0 px-2.5 py-1 min-h-[28px] rounded-md border border-slate-700 text-slate-300 hover:text-amber-200 hover:bg-slate-800 text-[12px] font-semibold"
                                      title="Return this person to auto placement"
                                    >
                                      Clear
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {onAssignStaff && (
                          <div className="space-y-1.5">
                            <button
                              type="button"
                              data-action="toggle-assign-staff"
                              disabled={eligibleStaff.length === 0 || !!unfinished}
                              onClick={() => {
                                setAssignOpen(o => !o);
                                setPendingCandidateId(null);
                              }}
                              title={unfinished ? 'Finish required fixtures first' : eligibleStaff.length === 0 ? `No other active ${wp.career}s available` : `Assign a ${wp.career} here`}
                              className="px-3 py-1.5 min-h-[30px] rounded-lg border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 text-[12px] font-bold disabled:opacity-40"
                            >
                              {assignOpen ? 'Cancel' : 'Assign'}
                            </button>

                            {assignOpen && eligibleStaff.length > 0 && (
                              <div className="space-y-1.5 pt-1 border-t border-slate-800" data-testid="staff-assign-list">
                                {eligibleStaff.map(cand => {
                                  const prevRoom = cand.workplaceRoomId != null ? state.rooms.find(r => r.id === cand.workplaceRoomId) : undefined;
                                  const mult = cand.career !== 'teacher'
                                    ? careerAffinityMultiplier(cand.masteredSchools, cand.career, def?.school)
                                    : 1;
                                  const bonusPct = Math.round((mult - 1) * 100);
                                  const showingReplaceChoices = isStaffFull && pendingCandidateId === cand.id;
                                  return (
                                    <div key={cand.id} className="bg-slate-900 border border-slate-800 rounded-lg p-2 space-y-1.5" data-assign-candidate={cand.id}>
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                          <CharacterPortrait character={cand} size={32} />
                                          <div className="min-w-0">
                                            <div className="text-[12px] font-semibold text-slate-100 truncate">
                                              {cand.name}
                                              {bonusPct > 0 && <span className="ml-1.5 text-[11px] text-emerald-300">+{bonusPct}%</span>}
                                            </div>
                                            <div className="text-[11px] text-slate-400 truncate">
                                              {prevRoom ? `Currently in ${roomDisplayName(prevRoom)}` : 'Unassigned'}
                                            </div>
                                          </div>
                                        </div>
                                        {!isStaffFull ? (
                                          <button
                                            type="button"
                                            data-action="confirm-assign-staff"
                                            onClick={() => {
                                              onAssignStaff(room.id, cand.id);
                                              setAssignOpen(false);
                                            }}
                                            className="shrink-0 px-2.5 py-1 min-h-[28px] rounded-md bg-amber-600 hover:bg-amber-500 text-slate-950 text-[12px] font-bold"
                                          >
                                            Assign
                                          </button>
                                        ) : staff.length === 1 ? (
                                          <button
                                            type="button"
                                            data-action="confirm-assign-staff"
                                            onClick={() => {
                                              onAssignStaff(room.id, cand.id, staff[0].id);
                                              setAssignOpen(false);
                                              setPendingCandidateId(null);
                                            }}
                                            className="shrink-0 px-2.5 py-1 min-h-[28px] rounded-md bg-amber-600/90 hover:bg-amber-500 text-slate-950 text-[12px] font-bold"
                                          >
                                            Replace {staff[0].name}
                                          </button>
                                        ) : (
                                          <button
                                            type="button"
                                            data-action="choose-replace-staff"
                                            onClick={() => setPendingCandidateId(showingReplaceChoices ? null : cand.id)}
                                            className="shrink-0 px-2.5 py-1 min-h-[28px] rounded-md border border-amber-500/40 text-amber-200 hover:bg-amber-500/20 text-[12px] font-bold"
                                          >
                                            {showingReplaceChoices ? 'Cancel' : 'Assign…'}
                                          </button>
                                        )}
                                      </div>

                                      {showingReplaceChoices && (
                                        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-800/70" data-testid="replace-who-choices">
                                          <span className="text-[11px] text-slate-400 mr-1">Replace:</span>
                                          {staff.map(occ => (
                                            <button
                                              key={occ.id}
                                              type="button"
                                              data-action="confirm-replace-staff"
                                              data-replace-id={occ.id}
                                              onClick={() => {
                                                onAssignStaff(room.id, cand.id, occ.id);
                                                setAssignOpen(false);
                                                setPendingCandidateId(null);
                                              }}
                                              className="px-2 py-1 rounded bg-amber-600/90 hover:bg-amber-500 text-slate-950 text-[11px] font-bold"
                                            >
                                              {occ.name}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 5b. Goblin Servants Workplace Panel */}
              {!isSite && isServantWorkplaceDef(room.defId) && (() => {
                const allServants = state.servants || [];
                const assigned = servantsAssignedToRoom(allServants, room.id);
                const cap = roomServantCapacity(room);
                const candidates = allServants.filter(s => s.workplaceRoomId !== room.id);
                const canAddMore = !Number.isFinite(cap) || assigned.length < cap;
                const chosenId = servantPickId !== '' && candidates.some(c => String(c.id) === servantPickId)
                  ? servantPickId
                  : candidates[0] ? String(candidates[0].id) : '';
                const statusHint =
                  room.defId === 'workshop'
                    ? `Construction crew (${workshopBaseRate(room.level || 1)} pts/rev base per worker, max 4 bodies active on sites).`
                    : SERVANT_PLOT_IDS.has(room.defId) || room.defId === 'glassworks' || room.defId === 'weaving_room'
                    ? assigned.length > 0
                      ? 'Staffed: producing at 100% bell output.'
                      : 'Unstaffed: producing at 25% bell output. Assign 1 servant for full yield.'
                    : room.defId === 'kitchen'
                    ? assigned.length > 0
                      ? 'Staffed: Kitchen bonuses (Hearty Meal, meal discount, stewpot/spice perks) active.'
                      : 'Unstaffed: Kitchen grants NO bonuses until a servant is assigned.'
                    : room.defId === 'refectory'
                    ? assigned.length > 0
                      ? 'Staffed: eating hunger recovery is 2× faster (same food cost).'
                      : 'Unstaffed: standard eating recovery speed.'
                    : assigned.length > 0
                    ? `Staffed (${assigned.length}/${cap} janitors): cleans dirtiest unclaimed built room (+5%/review).`
                    : `Unstaffed (0/${cap} janitors): assign servants to walk & clean dirty rooms.`;

                return (
                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-2.5" data-testid="room-servants">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] uppercase tracking-wider font-bold text-emerald-300">
                        Goblin Servants
                      </span>
                      <span className="text-[12px] font-mono text-slate-300" data-testid="room-servant-count">
                        {Number.isFinite(cap) ? `${assigned.length} / ${cap}` : `${assigned.length} assigned`}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-300">{statusHint}</div>

                    {assigned.length > 0 && (
                      <div className="space-y-1.5">
                        {assigned.map(sv => {
                          const targetRoom = sv.cleaningRoomId != null ? state.rooms.find(r => r.id === sv.cleaningRoomId) : undefined;
                          return (
                            <div
                              key={sv.id}
                              data-testid={`room-servant-row-${sv.id}`}
                              className="flex items-center justify-between gap-2 bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[12px]"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className="w-3 h-3 rounded-sm border border-slate-700 shrink-0"
                                  style={{ backgroundColor: sv.look.skin }}
                                  aria-hidden="true"
                                />
                                <div className="min-w-0">
                                  <div className="font-semibold text-slate-100 truncate">{sv.name}</div>
                                  {room.defId === 'janitors_closet' && (
                                    <div className="text-[10px] text-slate-400 truncate">
                                      {targetRoom ? `Cleaning ${roomDisplayName(targetRoom)} (${Math.round(targetRoom.cleanliness)}%)` : 'Waiting in closet (all rooms clean)'}
                                    </div>
                                  )}
                                </div>
                              </div>
                              {onAssignServant && (
                                <button
                                  type="button"
                                  data-action="clear-servant"
                                  onClick={() => onAssignServant(sv.id, undefined)}
                                  className="shrink-0 px-2.5 py-1 min-h-[28px] rounded-md border border-slate-700 text-slate-300 hover:text-amber-200 hover:bg-slate-800 text-[11px] font-semibold"
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {onAssignServant && canAddMore && (
                      allServants.length === 0 ? (
                        <div className="text-[11px] text-slate-400">
                          No goblin servants summoned yet (build &amp; finish a Summoning Chamber).
                        </div>
                      ) : candidates.length > 0 ? (
                        <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
                          <select
                            aria-label={`Assign servant to ${roomDisplayName(room)}`}
                            data-testid="room-servant-select"
                            value={chosenId}
                            disabled={unfinished}
                            onChange={e => setServantPickId(e.target.value)}
                            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-[12px] text-slate-100 disabled:opacity-40"
                          >
                            {candidates.map(c => {
                              const prev = c.workplaceRoomId != null ? state.rooms.find(r => r.id === c.workplaceRoomId) : undefined;
                              return (
                                <option key={c.id} value={String(c.id)}>
                                  {c.name} ({prev ? `in ${roomDisplayName(prev)}` : 'Idle'})
                                </option>
                              );
                            })}
                          </select>
                          <button
                            type="button"
                            data-testid="room-servant-assign-btn"
                            disabled={unfinished || !chosenId}
                            onClick={() => chosenId && onAssignServant(Number(chosenId), room.id)}
                            className="shrink-0 px-3 py-1.5 min-h-[30px] rounded-lg bg-emerald-600/85 hover:bg-emerald-500 disabled:opacity-40 text-white text-[12px] font-bold"
                          >
                            Assign
                          </button>
                        </div>
                      ) : null
                    )}
                  </div>
                );
              })()}

              {/* 6. Pen Occupants (Habitat rooms) */}
              {acceptedHabitats.length > 0 && (
                <div className="bg-slate-950/60 border border-emerald-900/40 rounded-xl p-3 space-y-2.5" data-testid="pen-occupants">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-bold text-emerald-300">Occupants</span>
                      <span
                        data-testid="pen-occupancy-count"
                        className="text-[12px] font-mono px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-700/40 text-emerald-200"
                      >
                        {penOccupants.length} / {penCap}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {acceptedHabitats.map(h => (
                        <span
                          key={h}
                          className="text-[11px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300"
                          title={`Accepts ${HABITAT_LABELS[h].label} creatures`}
                        >
                          {HABITAT_LABELS[h].badge} {HABITAT_LABELS[h].label}
                        </span>
                      ))}
                    </div>
                  </div>

                  {penOccupants.length === 0 ? (
                    <div className="text-[12px] text-slate-500">
                      Empty pen. Roaming companions wander the Academy once tamed and do not take pen slots.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {penOccupants.map(c => {
                        const cDef = c?.defId ? CREATURE_DEFINITIONS[c.defId] : undefined;
                        const req = Math.max(1, cDef?.tamingReviews ?? 40);
                        const statusLabel = c.status === 'egg'
                          ? `${originLabel(cDef?.origin, c.defId)} · ${Math.round(c.hatchProgress || 0)}%`
                          : c.status;
                        const dietText = cDef?.diet
                          ? Object.entries(cDef.diet).map(([k, v]) => `${v} ${k}`).join(', ')
                          : '—';
                        return (
                          <div
                            key={c.id}
                            data-testid="pen-occupant-card"
                            className="flex items-start gap-2.5 bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 text-[12px]"
                          >
                            {onOpenCreature ? (
                              <button
                                type="button"
                                onClick={() => onOpenCreature(c.id)}
                                data-testid={`pen-open-creature-${c.id}`}
                                title={`Inspect ${c.nickname || cDef?.name || 'Creature'}`}
                                className="shrink-0 rounded-lg border border-transparent hover:border-emerald-400/70 transition cursor-pointer"
                              >
                                <CreaturePortrait
                                  defId={c.defId}
                                  variant={c.status === 'egg' ? 'egg' : 'adult'}
                                  hatchProgress={c.hatchProgress}
                                  status={c.status}
                                  bondLevel={c.bondLevel}
                                  size={40}
                                />
                              </button>
                            ) : (
                              <CreaturePortrait
                                defId={c.defId}
                                variant={c.status === 'egg' ? 'egg' : 'adult'}
                                hatchProgress={c.hatchProgress}
                                status={c.status}
                                bondLevel={c.bondLevel}
                                size={40}
                              />
                            )}
                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                {onOpenCreature ? (
                                  <button
                                    type="button"
                                    onClick={() => onOpenCreature(c.id)}
                                    className="font-bold text-slate-100 hover:text-amber-200 truncate text-left transition cursor-pointer"
                                  >
                                    {c.nickname || cDef?.name || 'Creature'}
                                    {c.nickname && cDef?.name && c.nickname !== cDef.name && (
                                      <span className="font-normal text-slate-400"> ({cDef.name})</span>
                                    )}
                                  </button>
                                ) : (
                                  <span className="font-bold text-slate-100 truncate">
                                    {c.nickname || cDef?.name || 'Creature'}
                                    {c.nickname && cDef?.name && c.nickname !== cDef.name && (
                                      <span className="font-normal text-slate-400"> ({cDef.name})</span>
                                    )}
                                  </span>
                                )}
                                <div className="flex items-center gap-1">
                                  {c.hungry && (
                                    <span className="px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 font-bold text-[11px]">
                                      Hungry
                                    </span>
                                  )}
                                  <span className={`px-1.5 py-0.5 rounded font-bold uppercase text-[11px] ${
                                    c.status === 'tamed'
                                      ? 'bg-emerald-500/20 text-emerald-300'
                                      : c.status === 'wary'
                                      ? 'bg-amber-500/20 text-amber-300'
                                      : 'bg-sky-500/20 text-sky-300'
                                  }`}>
                                    {statusLabel}
                                  </span>
                                </div>
                              </div>

                              {c.status === 'egg' && (
                                <div className="space-y-0.5">
                                  <div className="flex justify-between text-[11px] text-slate-400">
                                    <span>{arrivalStageLabel(arrivalStage(c.hatchProgress || 0))}</span>
                                    <span>{Math.round(c.hatchProgress || 0)}%</span>
                                  </div>
                                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                    <div className="bg-sky-400 h-full" style={{ width: `${Math.min(100, c.hatchProgress || 0)}%` }} />
                                  </div>
                                </div>
                              )}

                              {c.status === 'wary' && (
                                <div className="space-y-0.5">
                                  <div className="flex justify-between text-[11px] text-slate-400">
                                    <span>Taming</span>
                                    <span>{c.tamingProgress || 0} / {req} reviews</span>
                                  </div>
                                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                    <div className="bg-amber-400 h-full" style={{ width: `${Math.min(100, ((c.tamingProgress || 0) / req) * 100)}%` }} />
                                  </div>
                                </div>
                              )}

                              {c.status === 'tamed' && (
                                <div className="text-[11px] text-amber-300">
                                  Bond {'♥'.repeat(c.bondLevel ?? 1)} ({c.bondLevel ?? 1}/3)
                                </div>
                              )}

                              <div className="text-[11px] text-slate-400">
                                <span className="text-slate-500">Diet:</span> {dietText}
                              </div>
                              {cDef?.buffDescription && (
                                <div className="text-[11px] text-emerald-300/90">
                                  <span className="text-slate-500">Buff:</span> {cDef.buffDescription}
                                </div>
                              )}
                              {cDef?.troubleDescription && (
                                <div className="text-[11px] text-rose-300/80">
                                  <span className="text-slate-500">Trouble:</span> {cDef.troubleDescription}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div data-testid="furnishings-tab-panel" className="space-y-4 text-[13px]">
              {/* 1. Level + Renovate */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-100">{tierName}</span>
                  <span className="text-[12px] text-slate-400">Level {room.level}</span>
                </div>
                {!isSite && room.level < 3 && (() => {
                  const needSchools = room.defId === 'summoning_chamber' ? requiredSchoolsForChamberLevel(room.level + 1) : 0;
                  const haveSchools = room.defId === 'summoning_chamber' ? schoolsAtLevel5Count(state.wizard?.levels) : 0;
                  const chamberLocked = room.defId === 'summoning_chamber' && haveSchools < needSchools;
                  return (
                    <div className="flex items-center gap-2" data-tour="room-renovate">
                      <span
                        className="text-[12px] text-slate-300"
                        title={
                          room.defId === 'spiral_stair'
                            ? room.level === 1
                              ? 'Upgrades Spiral Stairs to a fast Magical Elevator'
                              : 'Upgrades to a Teleportation Portal (instant travel, no stacking needed)'
                            : room.defId === 'summoning_chamber'
                            ? `Requires ${needSchools} magic schools at Level 5+ (${haveSchools}/${needSchools})`
                            : '+2 optional furniture slots, better efficiency; Level 3 unlocks the room perk'
                        }
                      >
                        {room.defId === 'spiral_stair'
                          ? room.level === 1
                            ? 'Upgrade → Magical Elevator (Lv 2)'
                            : 'Upgrade → Teleportation Portal (Lv 3)'
                          : chamberLocked
                          ? `Locked · Needs ${needSchools} schools Lv 5+ (${haveSchools}/${needSchools})`
                          : `Renovate → Lv ${room.level + 1}`}
                      </span>
                      <button
                        onClick={() => onUpgrade(room.id)}
                        disabled={chamberLocked}
                        data-testid="room-renovate-btn"
                        className="px-3 py-1.5 min-h-[32px] bg-amber-600/90 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold rounded-lg"
                      >
                        {upgradeCost(room)} Mana
                      </button>
                    </div>
                  );
                })()}
              </div>

              {/* 2. Now and next */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2.5 space-y-1 text-[12px]" data-testid="furnishings-now-next">
                <div className="text-slate-200">
                  <span className="text-slate-400 font-semibold">Now: </span>
                  {nowText}
                </div>
                <div className="text-slate-300">
                  <span className="text-slate-400 font-semibold">Next: </span>
                  {nextText}
                </div>
              </div>

              {isSite ? (
                <div className="text-[13px] text-slate-400 bg-slate-950/40 border border-slate-800 rounded-xl px-3 py-3" data-testid="site-furnishings-notice">
                  Furnishings arrive when the room is built.
                </div>
              ) : (
                <>
                  {/* 3. Unplaced items waiting for placement */}
                  {unplaced.length > 0 && (
                    <div className="rounded-xl px-3 py-2 text-[13px] border bg-amber-950/25 border-amber-600/40 space-y-1.5" data-testid="to-place-furniture">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-amber-200">To place ({unplaced.length})</span>
                        <span className="text-[11px] text-slate-400">Pick Place to drop on canvas</span>
                      </div>
                      <div className="space-y-1.5">
                        {unplaced.map(u => {
                          const uDef = FURNITURE_DEFINITIONS[u.defId];
                          const uReq = u.slotKind.startsWith('required:');
                          const uName = uDef?.name || u.defId.replace(/_/g, ' ');
                          return (
                            <div
                              key={u.id}
                              data-unplaced-id={u.id}
                              className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border ${uReq ? 'border-amber-700/60 text-amber-200 bg-slate-900/80' : 'border-slate-700 text-slate-200 bg-slate-900/80'}`}
                            >
                              <span className="truncate">{uName}</span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {onPlaceFurniture && (
                                  <button
                                    data-action="place-furniture"
                                    onClick={() => onPlaceFurniture(room.id, u.id)}
                                    className="px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-200 border border-emerald-500/40 text-[11px] font-bold"
                                    title={`Place ${uName}`}
                                  >
                                    Place
                                  </button>
                                )}
                                {!uReq && onCancelUnplacedFurniture && (
                                  <button
                                    data-action="cancel-unplaced"
                                    onClick={() => onCancelUnplacedFurniture(room.id, u.id)}
                                    className="text-slate-400 hover:text-rose-300"
                                    aria-label={`Store ${uName}`}
                                    title="Return to storage"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 4. Installed (one column) */}
                  <div className="space-y-1.5" data-tour="room-installed">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] uppercase tracking-wider font-bold text-slate-400">Installed</span>
                      <span className="text-[11px] font-mono text-slate-400" data-testid="room-slots-usage">
                        Slots {usedSlots}/{maxSlots}
                        {room.defId === 'refectory' && tableTotal > 0 ? ` · ${6 * tableTotal} table seats free` : ''}
                      </span>
                    </div>

                    {maxSlots === 0 && compatible.length === 0 && room.furniture.length === 0 ? (
                      <div className="text-slate-500 text-[12px]" data-testid="no-furniture-room">
                        This room holds no furniture.
                      </div>
                    ) : room.furniture.length === 0 ? (
                      <div className="text-slate-500 text-[12px]">Nothing yet.</div>
                    ) : (
                      <div className="space-y-1.5">
                        {room.furniture.map(f => {
                          const fDef = FURNITURE_DEFINITIONS[f.defId];
                          const req = f.slotKind.startsWith('required:');
                          const eff = furnitureEffectForRoom(f.defId, room.defId);
                          const effText = eff ? formatFurnitureEffect(eff.kind, eff.value * (f.damaged ? 0.5 : 1)) : null;
                          const pieceName = fDef?.name || f.defId;
                          return (
                            <div
                              key={f.id}
                              data-installed-id={f.id}
                              className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border ${req ? 'border-amber-800/50 bg-amber-950/15 text-amber-100' : 'border-slate-800 bg-slate-950/50 text-slate-200'}`}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="truncate font-medium">{pieceName}</span>
                                  {req && (
                                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.2 rounded bg-amber-500/20 border border-amber-500/40 text-amber-200 font-bold">
                                      Required
                                    </span>
                                  )}
                                  {f.damaged && (
                                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.2 rounded bg-rose-500/20 border border-rose-500/40 text-rose-200 font-bold">
                                      Damaged (-50%)
                                    </span>
                                  )}
                                </div>
                                {effText && (
                                  <div className="text-[11px] text-emerald-300/90 truncate">{effText}</div>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {f.damaged && onRepairFurniture && (
                                  <button
                                    data-action="repair-furniture"
                                    onClick={() => onRepairFurniture(room.id, f.id)}
                                    className="px-2 py-1 min-h-[26px] rounded border border-amber-500/50 bg-amber-950/40 text-amber-200 hover:bg-amber-900/60 text-[11px] font-semibold inline-flex items-center gap-1"
                                    aria-label={`Repair ${pieceName}`}
                                    title="Repair at 25% material cost"
                                  >
                                    Repair (25%)
                                  </button>
                                )}
                                {onMoveFurniture && (
                                  <button
                                    data-action="move-furniture"
                                    onClick={() => onMoveFurniture(room.id, f.id)}
                                    className="px-2 py-1 min-h-[26px] rounded border border-slate-700 text-sky-300 hover:text-sky-200 hover:bg-slate-800 text-[11px] font-semibold inline-flex items-center gap-1"
                                    aria-label={`Move ${pieceName}`}
                                    title={`Move ${pieceName}`}
                                  >
                                    <Move className="w-3 h-3" />
                                  </button>
                                )}
                                {!req && (
                                  <button
                                    data-action="remove-furniture"
                                    onClick={() => onRemoveFurniture(room.id, f.id)}
                                    className="px-2 py-1 min-h-[26px] rounded border border-slate-700 text-rose-400 hover:text-rose-300 hover:bg-slate-800 text-[11px] font-semibold inline-flex items-center gap-1"
                                    aria-label={`Remove ${pieceName}`}
                                    title="Remove"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {(() => {
                          const totals = Object.entries(roomFurnitureEffects(room)) as Array<[FurnitureEffectKind, number]>;
                          if (totals.length === 0) return null;
                          return (
                            <div className="text-[12px] text-emerald-300/90 bg-emerald-950/20 border border-emerald-900/30 rounded-lg px-2.5 py-1.5" data-testid="room-furniture-totals">
                              <span className="font-bold text-emerald-200 mr-1.5">Room total:</span>
                              {totals.map(([k, v]) => formatFurnitureEffect(k, v)).join(' · ')}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  {/* 5. Available (one column stack) */}
                  {compatible.length > 0 && (
                    <div className="space-y-1.5" data-tour="room-furnish">
                      <div className="text-[12px] uppercase tracking-wider font-bold text-slate-400">Available</div>
                      <div className="space-y-1.5">
                        {compatible.map(fDef => {
                          const known = isPatternKnown(state, fDef.id);
                          const eff = furnitureEffectForRoom(fDef.id, room.defId);
                          const effText = eff ? formatFurnitureEffect(eff.kind, eff.value) : null;
                          if (!known) {
                            const deckLabel = fDef.deck[0].toUpperCase() + fDef.deck.slice(1);
                            return (
                              <div
                                key={fDef.id}
                                data-testid={`locked-pattern-${fDef.id}`}
                                className="flex items-center justify-between gap-2 bg-slate-950/60 border border-slate-800/70 px-2.5 py-1.5 rounded-lg opacity-65"
                                title={`Pattern needed (${deckLabel} deck)`}
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 text-slate-400 truncate">
                                    <Lock className="w-3 h-3 shrink-0" />
                                    <span className="truncate">{fDef.name}</span>
                                  </div>
                                  <div className="text-[11px] text-slate-500 truncate">Pattern needed ({deckLabel} deck)</div>
                                </div>
                              </div>
                            );
                          }
                          const slotCost = optionalSlotsCostForNewPiece(room, fDef.id);
                          const capLimit = maxSameFurnitureInRoom(room, fDef.id);
                          const buyTitle = [
                            furnitureBuyTitle(room, fDef.stats),
                            effText,
                            slotCost === 0 ? 'Uses 0 slots (long table seat)' : `Max ${capLimit}/room`
                          ].filter(Boolean).join(' · ');
                          return (
                            <div key={fDef.id} title={buyTitle} className="flex items-center justify-between gap-2 bg-slate-950/50 border border-slate-800 px-2.5 py-1.5 rounded-lg">
                              <div className="min-w-0">
                                <div className="text-slate-200 truncate">{fDef.name}</div>
                                {(effText || slotCost === 0) && (
                                  <div className="text-[11px] text-emerald-400/80 truncate">
                                    {effText || (slotCost === 0 ? 'No slot cost at Long Table' : '')}
                                  </div>
                                )}
                              </div>
                              <button
                                onClick={() => onAddFurniture(room.id, fDef.id)}
                                className="shrink-0 px-2.5 py-1 min-h-[28px] bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-md text-[12px] font-bold"
                                title={`${buyTitle} · Place ${fDef.name}`}
                              >
                                {(stored[fDef.id] || 0) > 0 ? `Stored ×${stored[fDef.id]}` : costText(fDef.cost)}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
