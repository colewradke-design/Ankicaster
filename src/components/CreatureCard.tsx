/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Creature character card opened by clicking any creature on the map,
 * inside a pen's RoomWindow, or in the Bestiary.
 */

import React, { useEffect, useState } from 'react';
import { X, Heart, Compass, Sparkles, AlertTriangle, Utensils } from 'lucide-react';
import type { CreatureInstance, FullGameState } from '../types/ankicaster';
import { CREATURE_DEFINITIONS, roomDisplayName } from '../data/content';
import { careerAffinityMultiplier, wizardMasteredSchools } from '../utils/formulas';
import {
  HABITAT_LABELS,
  arrivalStage,
  arrivalStageLabel,
  isRoamingCompanion,
  originLabel,
  resolveAllCreatureRooms
} from '../utils/creatures';
import { describeCreatureActivity } from '../visual/creatures/creatureActivity';
import type { CreatureVisualAgent } from '../visual/creatures/creatureChoreographer';
import { CreaturePortrait } from './CreaturePortrait';

export interface CreatureCardProps {
  state: FullGameState;
  creatureId: number;
  /** Optional live sentence from the canvas creature choreographer. */
  activityText?: string;
  /** Optional live visual agent (useful in tests/headless mode). */
  agent?: CreatureVisualAgent;
  onFeed: (creatureId: number) => void;
  onAssignTamer?: (creatureId: number, tamerId: number) => void;
  onAssignAdventurer?: (creatureId: number, adventurerId?: number) => void;
  onRelease: (creatureId: number) => void;
  onClose: () => void;
}

export const CreatureCard: React.FC<CreatureCardProps> = ({
  state,
  creatureId,
  activityText,
  agent,
  onFeed,
  onAssignTamer,
  onAssignAdventurer,
  onRelease,
  onClose
}) => {
  const [confirmRelease, setConfirmRelease] = useState(false);

  useEffect(() => {
    setConfirmRelease(false);
  }, [creatureId]);

  useEffect(() => {
    if (!confirmRelease) return;
    const t = setTimeout(() => setConfirmRelease(false), 5000);
    return () => clearTimeout(t);
  }, [confirmRelease]);

  const creature: CreatureInstance | undefined = (state.creatures || []).find(c => c.id === creatureId);
  if (!creature) return null;
  const def = CREATURE_DEFINITIONS[creature.defId];
  if (!def) return null;

  const roaming = isRoamingCompanion(creature);
  const displayName = creature.nickname || def.name;
  const doingSentence =
    activityText && activityText.trim().length > 0
      ? activityText
      : describeCreatureActivity(agent, creature, state);

  const resolution = resolveAllCreatureRooms(state.creatures || [], state.rooms || []).get(creature.id);
  const shelvedPen =
    creature.roomId != null
      ? (state.shelvedRooms || []).find(r => r.id === creature.roomId)
      : undefined;
  const homeRoom = resolution?.room ?? shelvedPen;

  const characters = state.characters || [];
  const tamers = characters.filter(c => c.career === 'tamer');
  const adventurers = characters.filter(c => c.career === 'adventurer');
  const pairedAdventurer =
    creature.adventurerId != null
      ? adventurers.find(a => a.id === creature.adventurerId)
      : undefined;

  const dietEntries = Object.entries(def.diet || {});
  const dietText = dietEntries.length > 0 ? dietEntries.map(([k, v]) => `${v} ${k}`).join(', ') : 'None';
  const alreadyFedThisBell = creature.lastManualFeedBell === state.bellIndex;
  const canFeed = (creature.status === 'wary' || creature.status === 'tamed') && !alreadyFedThisBell;

  const reqReviews = Math.max(1, def.tamingReviews || 40);
  const hasTamer = creature.tamerId !== undefined && creature.tamerId !== null;
  const tamerMastered = !hasTamer
    ? []
    : creature.tamerId === 0
    ? wizardMasteredSchools(state.wizard.levels)
    : (characters.find(c => c.id === creature.tamerId)?.masteredSchools || []);
  const tamerMult = hasTamer ? careerAffinityMultiplier(tamerMastered, 'tamer', def.school) : 1;

  const statusTone =
    creature.status === 'tamed'
      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      : creature.status === 'wary'
      ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
      : creature.status === 'egg'
      ? 'bg-sky-500/20 text-sky-300 border-sky-500/30'
      : creature.status === 'loose'
      ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
      : 'bg-purple-500/20 text-purple-300 border-purple-500/30';

  const statusText =
    creature.status === 'egg'
      ? originLabel(def.origin, creature.defId)
      : creature.status === 'away'
      ? 'On Expedition'
      : creature.status;

  const roleStateNote =
    creature.status === 'tamed'
      ? creature.hungry
        ? 'Halved while hungry'
        : 'Active bonus'
      : 'Unlocks once tamed';

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-label={`${displayName} card`}
        data-testid="creature-card"
        data-creature-id={String(creature.id)}
        className="bg-slate-900 border border-emerald-900/60 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-slate-800 bg-gradient-to-r from-emerald-900/25 to-transparent shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0 rounded-xl bg-slate-950/80 border border-slate-800 p-1">
              <CreaturePortrait
                defId={creature.defId}
                variant={creature.status === 'egg' ? 'egg' : 'adult'}
                hatchProgress={creature.hatchProgress}
                status={creature.status}
                bondLevel={creature.bondLevel}
                size={56}
              />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-amber-200 truncate">
                {displayName}
                {displayName !== def.name && (
                  <span className="text-xs font-normal text-slate-400"> ({def.name})</span>
                )}
              </h3>
              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                <span className={`text-[11px] px-2 py-0.5 rounded border font-bold uppercase ${statusTone}`}>
                  {statusText}
                </span>
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300 capitalize">
                  {def.rarity} · {def.school}
                </span>
                {roaming && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-700/40 text-emerald-300">
                    Roams freely
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 p-1 min-w-[28px] min-h-[28px] text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="p-4 space-y-3.5 text-[13px] overflow-y-auto">
          {/* What they are doing */}
          <p className="text-slate-200 leading-snug" data-testid="creature-doing">
            {doingSentence}
          </p>

          {/* Progress & Stats */}
          <div className="space-y-2 border-t border-slate-800/80 pt-3 text-[12px]" data-testid="creature-stats">
            {creature.status === 'egg' && (
              <div className="space-y-1">
                <div className="flex justify-between text-slate-300">
                  <span>{arrivalStageLabel(arrivalStage(creature.hatchProgress || 0))}</span>
                  <span className="font-mono">{Math.round(creature.hatchProgress || 0)}%</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700">
                  <div className="bg-sky-400 h-full" style={{ width: `${Math.min(100, creature.hatchProgress || 0)}%` }} />
                </div>
              </div>
            )}

            {creature.status === 'wary' && (
              <div className="space-y-1">
                <div className="flex justify-between text-slate-300">
                  <span>Taming Progress{hasTamer ? ` (×${tamerMult.toFixed(2)})` : ''}</span>
                  <span className="font-mono">{creature.tamingProgress} / {reqReviews} reviews</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700">
                  <div
                    className="bg-amber-400 h-full"
                    style={{ width: `${Math.min(100, (creature.tamingProgress / reqReviews) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {creature.status === 'tamed' && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-amber-300 flex items-center gap-1 font-semibold">
                  <Heart className="w-3.5 h-3.5 fill-amber-400" />
                  Bond Level {creature.bondLevel}/3 ({creature.bondProgress} pts)
                </span>
                {creature.hungry && (
                  <span className="px-2 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 font-bold text-[11px]">
                    Hungry
                  </span>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-1.5 items-center text-slate-300">
              {def.habitats.map(h => (
                <span key={h} className="text-[11px] px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800">
                  {HABITAT_LABELS[h].badge} {HABITAT_LABELS[h].label}
                </span>
              ))}
              <span className="text-slate-400">· Movement: <strong className="text-slate-200 capitalize">{def.movement}</strong></span>
              <span className="text-slate-400">· Arrived Day {creature.arrivedDay}</span>
            </div>

            <div className="text-slate-300">
              <span className="text-slate-500">Diet: </span>{dietText}
            </div>

            {homeRoom && !roaming && (
              <div className="text-slate-300">
                <span className="text-slate-500">Pen: </span>
                {roomDisplayName(homeRoom)}
                {shelvedPen ? ' (on shelf)' : ''}
              </div>
            )}
          </div>

          {/* What they do for the university */}
          <div className="space-y-1.5 border-t border-slate-800/80 pt-3 text-[12px]" data-testid="creature-university-role">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] uppercase tracking-wider font-bold text-emerald-300 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> University Role
              </span>
              <span className={`text-[11px] font-semibold ${
                creature.status === 'tamed' && !creature.hungry
                  ? 'text-emerald-300'
                  : creature.status === 'tamed'
                  ? 'text-amber-300'
                  : 'text-slate-400'
              }`}>
                {roleStateNote}
              </span>
            </div>
            <p className="text-slate-200 leading-snug">{def.buffDescription}</p>
            <div className="text-slate-400">
              <span className="text-slate-500">Expedition companion: </span>
              <strong className="text-amber-300">+{def.companionBonus} Fortune</strong>
            </div>
            {def.troubleDescription && (
              <div className="text-rose-300/85 flex items-start gap-1.5 text-[11px]">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-400" />
                <span>{def.troubleDescription}</span>
              </div>
            )}
          </div>

          {/* Options / Actions */}
          <div className="space-y-2.5 border-t border-slate-800/80 pt-3 text-[12px]" data-testid="creature-actions">
            {creature.status === 'wary' && onAssignTamer && (
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={`tamer-select-${creature.id}`} className="text-slate-300 font-semibold shrink-0">
                  Tamer
                </label>
                <select
                  id={`tamer-select-${creature.id}`}
                  aria-label="Assign Tamer"
                  value={hasTamer ? String(creature.tamerId) : ''}
                  onChange={e => e.target.value !== '' && onAssignTamer(creature.id, Number(e.target.value))}
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-xl text-xs p-2 text-slate-200"
                >
                  <option value="">Assign Tamer...</option>
                  <option value="0">Headmaster ({state.wizard.name})</option>
                  {tamers.map(t => {
                    const mult = careerAffinityMultiplier(t.masteredSchools, 'tamer', def.school);
                    return (
                      <option key={t.id} value={t.id}>
                        {t.name} (×{mult.toFixed(2)})
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {adventurers.length > 0 && onAssignAdventurer && (
              <div className="flex items-center justify-between gap-2" data-testid="creature-adventurer-assign">
                <label
                  htmlFor={`adv-select-${creature.id}`}
                  className="text-slate-300 font-semibold shrink-0 flex items-center gap-1"
                >
                  <Compass className="w-3.5 h-3.5 text-purple-300" /> Adventurer
                </label>
                <select
                  id={`adv-select-${creature.id}`}
                  aria-label="Assign to Adventurer"
                  value={pairedAdventurer ? String(pairedAdventurer.id) : ''}
                  onChange={e => onAssignAdventurer(creature.id, e.target.value ? Number(e.target.value) : undefined)}
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-xl text-xs p-2 text-slate-200"
                >
                  <option value="">None (unpaired)</option>
                  {adventurers.map(adv => (
                    <option key={adv.id} value={adv.id}>
                      {adv.name}{adv.status === 'away' ? ' (On Expedition)' : adv.injury ? ' (Injured)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                data-testid="creature-feed-btn"
                onClick={() => onFeed(creature.id)}
                disabled={!canFeed}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-600/20 hover:bg-emerald-600/40 disabled:opacity-40 text-emerald-200 border border-emerald-500/40 rounded-xl text-xs font-bold transition"
              >
                <Utensils className="w-3.5 h-3.5" />
                {alreadyFedThisBell ? 'Fed this bell' : 'Feed (+2 bond)'}
              </button>
              <button
                type="button"
                data-testid="creature-release-btn"
                onClick={() => {
                  if (!confirmRelease) {
                    setConfirmRelease(true);
                    return;
                  }
                  setConfirmRelease(false);
                  onRelease(creature.id);
                  onClose();
                }}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                  confirmRelease
                    ? 'bg-rose-700 hover:bg-rose-600 text-white border-rose-500'
                    : 'bg-rose-950/60 hover:bg-rose-900/70 text-rose-200 border-rose-800/60'
                }`}
              >
                {confirmRelease ? 'Confirm Release?' : 'Release'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
