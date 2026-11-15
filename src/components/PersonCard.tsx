/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Small read-only person card opened by clicking any person doll on the map
 * or any person portrait inside a room window.
 */

import React from 'react';
import { X, AlertTriangle } from 'lucide-react';
import type { Character, FullGameState, PlacedRoom, SchoolType } from '../types/ankicaster';
import { roomDisplayName, PERSONALITY_DEFINITIONS, TRAIT_DEFINITIONS } from '../data/content';
import { wizardMasteredSchools } from '../utils/formulas';
import { describePersonActivity } from '../visual/agents/personActivity';
import type { VisualAgent } from '../visual/agents/Choreographer';
import { CharacterPortrait } from './CharacterPortrait';
import { WizardPortrait } from './WizardPortrait';

function capWord(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

function formatSchoolName(s: SchoolType): string {
  return capWord(s);
}

function formatInjuryName(type: string): string {
  return type
    .split('_')
    .map(w => capWord(w))
    .join(' ');
}

export interface PersonCardProps {
  state: FullGameState;
  personId: 'wizard' | number;
  /** Optional live sentence from the canvas choreographer. */
  activityText?: string;
  /** Optional live visual agent (useful in tests/headless mode). */
  agent?: VisualAgent;
  onClose: () => void;
}

export const PersonCard: React.FC<PersonCardProps> = ({
  state,
  personId,
  activityText,
  agent,
  onClose
}) => {
  const isWizard = personId === 'wizard';
  const char: Character | undefined = !isWizard
    ? state.characters.find(c => c.id === personId)
    : undefined;

  if (!isWizard && !char) return null;

  const findRoom = (id: number | undefined): { room: PlacedRoom; shelved: boolean } | undefined => {
    if (id == null) return undefined;
    const active = state.rooms.find(r => r.id === id);
    if (active) return { room: active, shelved: false };
    const shelved = (state.shelvedRooms || []).find(r => r.id === id);
    if (shelved) return { room: shelved, shelved: true };
    return undefined;
  };
  const formatRoomRef = (entry: { room: PlacedRoom; shelved: boolean }) =>
    entry.shelved ? `${roomDisplayName(entry.room)} (on shelf)` : roomDisplayName(entry.room);

  const displayName = isWizard
    ? [state.wizard.title, state.wizard.name].filter(Boolean).join(' ')
    : char!.name;

  // One line for who they are
  let whoLine = '';
  if (isWizard) {
    const founding = state.wizard.foundingSchool;
    if (founding) {
      const lvl = state.wizard.levels?.[founding] ?? 1;
      whoLine = `Headmaster · ${formatSchoolName(founding)} Lv ${lvl}`;
    } else {
      whoLine = 'Headmaster';
    }
  } else if (char!.status === 'student') {
    const parts: string[] = [];
    if (char!.currentSchool) parts.push(formatSchoolName(char!.currentSchool));
    if (char!.period) parts.push(`Period ${char!.period}`);
    parts.push('Student');
    whoLine = parts.join(' · ');
  } else if (char!.career) {
    const parts = [capWord(char!.career)];
    if (char!.careerState === 'sabbatical') parts.push('On leave');
    whoLine = parts.join(' · ');
  } else {
    whoLine = char!.status === 'away' ? 'Resident · Away' : 'Resident';
  }

  // One sentence for what they are doing
  const doingSentence =
    activityText && activityText.trim().length > 0
      ? activityText
      : describePersonActivity(agent, isWizard ? 'wizard' : char!, state);

  // Mastered schools (only shown when non-empty)
  const mastered: SchoolType[] = isWizard
    ? wizardMasteredSchools(state.wizard.levels)
    : char!.masteredSchools || [];

  // Rooms (only non-blank)
  const bedRoom = !isWizard ? findRoom(char!.bedRoomId) : undefined;
  const classRoom = !isWizard ? findRoom(char!.classRoomId) : undefined;
  const workplaceRoom = !isWizard ? findRoom(char!.workplaceRoomId) : undefined;

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
        data-testid="person-card"
        data-person-id={String(personId)}
        className="bg-slate-900 border border-amber-900/50 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-slate-800 bg-gradient-to-r from-amber-900/25 to-transparent">
          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0 rounded-xl bg-slate-950/80 border border-slate-800 p-1">
              {isWizard ? (
                <WizardPortrait appearance={state.wizard.appearance} size={56} title={displayName} />
              ) : (
                <CharacterPortrait character={char} size={56} />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-amber-200 truncate">{displayName}</h3>
              <p className="text-[12px] text-slate-400 truncate" data-testid="person-who">
                {whoLine}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 p-1 min-w-[28px] min-h-[28px] text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 text-[13px]">
          <p className="text-slate-200 leading-snug" data-testid="person-doing">
            {doingSentence}
          </p>

          <div className="space-y-1.5 border-t border-slate-800/80 pt-3 text-[12px]" data-testid="person-stats">
            {!isWizard && char && (
              <>
                <div className="flex items-center gap-4 text-slate-300">
                  <span>
                    <span className="text-slate-500">Morale </span>
                    <strong className="text-slate-100">{Math.round(char.morale)}%</strong>
                  </span>
                  <span>
                    <span className="text-slate-500">Hunger </span>
                    <strong className="text-slate-100">{Math.round(char.needs?.hunger ?? 50)}%</strong>
                  </span>
                </div>

                {char.injury && (
                  <div className="flex items-center gap-1.5 text-rose-300 font-semibold" data-testid="person-injury">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{formatInjuryName(char.injury.type)}</span>
                  </div>
                )}

                <div className="text-slate-300 space-y-1" data-testid="person-personality">
                  <div title={PERSONALITY_DEFINITIONS[char.personality]?.flavour}>
                    <span className="font-semibold text-slate-200">
                      {`${char.personality}${char.traits && char.traits.length > 0 ? ` · ${char.traits.join(', ')}` : ''}`}
                    </span>
                    {PERSONALITY_DEFINITIONS[char.personality] && (
                      <div className="text-[11px] text-slate-400">{PERSONALITY_DEFINITIONS[char.personality].flavour}</div>
                    )}
                  </div>
                  {char.traits && char.traits.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {char.traits.map(t => {
                        const tDef = TRAIT_DEFINITIONS[t];
                        const tone =
                          tDef?.category === 'positive'
                            ? 'bg-emerald-950/70 border-emerald-700/50 text-emerald-300'
                            : tDef?.category === 'troublesome'
                            ? 'bg-rose-950/70 border-rose-700/50 text-rose-300'
                            : 'bg-slate-800/80 border-slate-700 text-slate-300';
                        return (
                          <span
                            key={t}
                            title={tDef?.effect || t}
                            className={`text-[11px] px-1.5 py-0.5 rounded border ${tone}`}
                          >
                            {t}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {char.cosmeticStatus && (
                    <div className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-fuchsia-950/60 border border-fuchsia-600/50 text-fuchsia-200" data-testid="person-cosmetic">
                      ✨ {char.cosmeticStatus.label}
                    </div>
                  )}
                  {char.misbehaviorChains && char.misbehaviorChains.length > 0 && (
                    <div className="text-[11px] text-amber-300" data-testid="person-misbehavior-chain">
                      ⚠️ Active prank trail ({char.misbehaviorChains.length}) — clear with Calming Tonic or Hush
                    </div>
                  )}
                </div>
              </>
            )}

            {mastered.length > 0 && (
              <div className="text-amber-200/90" data-testid="person-mastered">
                <span className="text-slate-500">Mastered: </span>
                {mastered.map(formatSchoolName).join(', ')}
              </div>
            )}

            {bedRoom && (
              <div className="text-slate-300" data-testid="person-bed">
                <span className="text-slate-500">Bed: </span>
                {formatRoomRef(bedRoom)}
              </div>
            )}
            {classRoom && (
              <div className="text-slate-300" data-testid="person-class">
                <span className="text-slate-500">Class: </span>
                {formatRoomRef(classRoom)}
              </div>
            )}
            {workplaceRoom && (
              <div className="text-slate-300" data-testid="person-workplace">
                <span className="text-slate-500">Workplace: </span>
                {formatRoomRef(workplaceRoom)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
