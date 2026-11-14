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
import { reviewsToGo, reviewsToGoText } from '../utils/construction';
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
import { FullGameState, PlacedRoom, RoomDefinition } from '../types/ankicaster';
import { ROOM_DEFINITIONS, roomDisplayName, FURNITURE_DEFINITIONS, SPELL_DEFINITIONS, CREATURE_DEFINITIONS } from '../data/content';
import {
  calculateRoomQuality, wizardOrbQuote,
  furnitureEffectForRoom, formatFurnitureEffect, FurnitureEffectKind, roomFurnitureEffects,
  careerAffinityMultiplier, classroomSchool, getFacultySummary, FURNITURE_EFFECTS
} from '../utils/formulas';
import { isPatternKnown } from '../utils/decks';
import {
  buildAcademySchedule,
  classroomDeskCount,
  libraryReadingDeskCount,
  refectoryChairCount,
  refectoryTableCount
} from '../utils/schedule';
import { ScreenId, SCREEN_DEFS, getRoomScreens } from '../ui/screens';
import { ScreenIcon } from './ScreenIcon';
import {
  HABITAT_LABELS,
  arrivalStage,
  arrivalStageLabel,
  getPenOccupants,
  originLabel,
  penAcceptedHabitats,
  penCreatureCapacity
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
  return Math.round((ROOM_DEFINITIONS[room.defId]?.cost.mana || 100) * 0.75) + 50;
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
    parts.push(`${capWord(def.workplace.career)}, ${def.workplace.slots}`);
  }
  const cap = def.capacity;
  if (cap) {
    if (cap.beds) parts.push(`${cap.beds} beds`);
    if (cap.facultyBeds) parts.push(`${cap.facultyBeds} faculty beds`);
    if (cap.seats) parts.push(`${cap.seats} seats`);
    if (cap.leisureSeats) parts.push(`${cap.leisureSeats} lounge seats`);
    if (cap.cropBeds) parts.push(`${cap.cropBeds} crop beds`);
    if (cap.creatures) parts.push(`${cap.creatures} creatures`);
    if (cap.adventurers) parts.push(`${cap.adventurers} adventurers`);
    if (cap.plinths) parts.push(`${cap.plinths} plinths`);
    if (cap.readers) parts.push(`${cap.readers} readers`);
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
    const st = state.characters.filter(c => !c.career).length;
    chips.push(<Chip key="s" icon={<Users className="w-3.5 h-3.5 text-emerald-400" />} label="Students" value={st} />);
  }
  if (id === 'entrance_hall') {
    chips.push(<Chip key="r" icon={<Award className="w-3.5 h-3.5 text-amber-400" />} label="Renown" value={state.renown} />);
    if (state.activeEvents.length) chips.push(<Chip key="v" label="Visitors" value={state.activeEvents.length} tone="text-amber-300" />);
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
  initialTab = 'room',
  forcedTab,
  initialAssignOpen = false
}) => {
  const [activeTab, setActiveTab] = useState<'room' | 'furnishings'>(forcedTab ?? initialTab);
  const [assignOpen, setAssignOpen] = useState(initialAssignOpen);
  const [pendingCandidateId, setPendingCandidateId] = useState<number | null>(null);

  useEffect(() => {
    if (forcedTab) setActiveTab(forcedTab);
  }, [forcedTab]);

  useEffect(() => {
    setAssignOpen(false);
    setPendingCandidateId(null);
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
  const reqStatus = requiredSlotStatus(room);
  const reqMissing = reqStatus.filter(s => !s.filled).length;
  const unfinished = !isSite && reqMissing > 0;
  const unplaced = room.unplacedFurniture || [];
  const queuedReq = queuedRequiredBySlot(room);
  const maxSlots = maxOptionalSlots(room);
  const usedSlots = optionalSlotsUsed(room);
  const tableTotal = refectoryTableTotal(room);

  const acceptedHabitats = penAcceptedHabitats(room.defId);
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
                  <Chip icon={<Hammer className="w-3.5 h-3.5 text-amber-400" />} label="Building" value={`${room.buildProgress}/${room.buildRequired}`} title={reviewsToGoText(room)} />
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
                <Chip icon={<Shield className="w-3.5 h-3.5 text-indigo-300" />} label="Veil" value={`${def?.veil ?? 4}/day`} title="Daily Veil upkeep (mana)" tone="text-indigo-300" />
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

              {/* 3. Hazard */}
              {room.hazard && (
                <div className="bg-rose-950/40 border border-rose-500/50 p-3 rounded-xl space-y-2 text-rose-200" data-testid="hazard-banner">
                  <div className="flex items-center gap-2 flex-wrap">
                    <AlertTriangle className="w-4 h-4 text-rose-300" />
                    <span className="font-bold text-[13px] capitalize" title={room.hazard.description}>
                      {room.hazard.type.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[12px] bg-rose-900/60 px-2 py-0.5 rounded font-mono" title="Room locked for this many honest reviews">
                      🔒 {Math.max(0, (room.lockedUntilReviewIndex || 0) - state.reviewIndex)} reviews
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onResolveHazard(room.id, 'warder')}
                      className="flex-1 min-h-[32px] px-3 py-1.5 bg-rose-800 hover:bg-rose-700 text-white font-bold text-[13px] rounded-lg"
                      title="Send an active Warder to cleanse the room"
                    >
                      Dispel (Warder)
                    </button>
                    <button
                      onClick={() => onResolveHazard(room.id, 'spell')}
                      className="flex-1 min-h-[32px] px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white font-bold text-[13px] rounded-lg"
                      title={`Dispel immediately using ${HAZARD_DISPEL_MANA_COST} Mana`}
                    >
                      Dispel ({HAZARD_DISPEL_MANA_COST} Mana)
                    </button>
                  </div>
                </div>
              )}

              {/* 4. Site countdown OR "What this room is" */}
              {isSite ? (
                <div className="flex items-center justify-between gap-2 bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 text-[13px]" data-testid="site-countdown">
                  <span className={room.buildPaused ? 'text-slate-400' : 'text-emerald-300'}>
                    {room.buildPaused ? `Paused · ${reviewsToGo(room)} honest reviews left (progress is kept)` : reviewsToGoText(room)}
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
                const staffCap = wp ? Math.max(wp.slots, staff.length) : 0;
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
                const isStaffFull = wp ? staff.length >= wp.slots : false;
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
                              const mult = c.career !== 'teacher' && c.career !== 'builder'
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
                                  const mult = cand.career !== 'teacher' && cand.career !== 'builder'
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
                            <CreaturePortrait
                              defId={c.defId}
                              variant={c.status === 'egg' ? 'egg' : 'adult'}
                              hatchProgress={c.hatchProgress}
                              status={c.status}
                              bondLevel={c.bondLevel}
                              size={40}
                            />
                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="font-bold text-slate-100 truncate">
                                  {c.nickname || cDef?.name || 'Creature'}
                                  {cDef?.name && c.nickname !== cDef.name && (
                                    <span className="font-normal text-slate-400"> ({cDef.name})</span>
                                  )}
                                </span>
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
                {!isSite && room.level < 3 && (
                  <div className="flex items-center gap-2" data-tour="room-renovate">
                    <span
                      className="text-[12px] text-slate-300"
                      title={
                        room.defId === 'spiral_stair'
                          ? room.level === 1
                            ? 'Upgrades Spiral Stairs to a fast Magical Elevator'
                            : 'Upgrades to a Teleportation Portal (instant travel, no stacking needed)'
                          : '+2 optional furniture slots, better efficiency; Level 3 unlocks the room perk'
                      }
                    >
                      {room.defId === 'spiral_stair'
                        ? room.level === 1
                          ? 'Upgrade → Magical Elevator (Lv 2)'
                          : 'Upgrade → Teleportation Portal (Lv 3)'
                        : `Renovate → Lv ${room.level + 1}`}
                    </span>
                    <button
                      onClick={() => onUpgrade(room.id)}
                      className="px-3 py-1.5 min-h-[32px] bg-amber-600/90 hover:bg-amber-500 text-slate-950 font-bold rounded-lg"
                    >
                      {upgradeCost(room)} Mana
                    </button>
                  </div>
                )}
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
                                </div>
                                {effText && (
                                  <div className="text-[11px] text-emerald-300/90 truncate">{effText}</div>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
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
