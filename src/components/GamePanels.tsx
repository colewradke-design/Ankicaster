/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Interactive Sub-Panels for Ankicaster:
 * 1. WizardStudyPanel: School levels (25xn reviews), Buffs, Grimoire Spells
 * 2. RosterPanel: Students, Constellations (50 cards), Needs, Careers, Retirement, Second Schools, Alumni Gallery
 * 3. RecruitmentPanel: Enrollment Tracker, Free Young Cards vs Needed, Admissions
 * 4. BuildMenuPanel: Standard Plans & Blueprint Cards
 * 5. CardDraftPanel: Foundation & 5 School Decks, Draw 3 Keep 1, Price Growth
 * 6. BestiaryPanel: 40 Creatures, Tamers, Diets, Buffs, Taming Progress, Companions
 * 7. AlchemyPanel: Brewing & Active Potion Consumption
 * 8. RiftPanel: 5 Destinations, 3-Master Seal, Party Skill, Companions, Expedition Launch
 */

import { roomLimitStatus } from '../utils/placement';
import { WizardPortrait } from './WizardPortrait';
import { CharacterPortrait } from './CharacterPortrait';
import { CreaturePortrait } from './CreaturePortrait';
import {
  HABITAT_LABELS,
  ORIGIN_LABELS,
  arrivalStage,
  arrivalStageLabel,
  compatiblePenNames,
  getDiscoveredCreatureIds,
  isRoamingCompanion,
  originLabel
} from '../utils/creatures';
import type { CreatureRarity, HabitatType } from '../types/ankicaster';
import React, { useEffect, useState } from 'react';
import {
  FullGameState,
  SchoolType,
  CareerType,
  PlacedRoom,
  Character,
  RiftDestination,
  CreatureInstance
} from '../types/ankicaster';
import {
  ROOM_DEFINITIONS,
  FURNITURE_DEFINITIONS,
  POTION_RECIPES,
  RIFT_DESTINATIONS,
  SPELL_DEFINITIONS,
  CREATURE_DEFINITIONS
} from '../data/content';
import {
  calculateStudentSkill,
  isMasteryReady,
  calculateTeacherDelay,
  calculateRiftChance,
  calculateFacultyLimit,
  careerAffinityMultiplier,
  classroomSchool,
  describeCareerAffinity,
  wizardMasteredSchools,
  wizardOrbQuote
} from '../utils/formulas';
import {
  Sparkles,
  BookOpen,
  Leaf,
  Sun,
  Moon,
  FlaskConical,
  GraduationCap,
  Hammer,
  Shield,
  Layers,
  Compass,
  AlertTriangle,
  Heart,
  Coffee,
  CheckCircle2,
  X,
  Lock,
  Award,
  PawPrint,
  Clock,
  ShieldAlert,
  ChevronRight,
  UserCheck
} from 'lucide-react';
import { reviewsToGoText } from '../utils/construction';
import { blueprintLockHint, isRoomUnlocked, isStructure } from '../utils/engine';
import { DECK_LIST, deckPrice, magicSchoolOdds } from '../utils/decks';
import { canAffordMaterials, formatMaterialCost } from '../utils/resourceReport';
import type { DraftDeckId } from '../utils/decks';

// ==========================================
// 1. WIZARD STUDY PANEL
// ==========================================
export const WizardStudyPanel: React.FC<{
  state: FullGameState;
  onQueueSession: (school: SchoolType, isGrimoire?: boolean, spellId?: string) => void;
  onCastSpell: (spellId: string) => void;
}> = ({ state, onQueueSession, onCastSpell }) => {
  const { wizard, mana } = state;
  const schools: SchoolType[] = ['arcane', 'nature', 'light', 'shadow', 'alchemy'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-slate-900/80 p-5 rounded-2xl border border-amber-900/30 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-purple-800 to-amber-500 flex items-center justify-center shadow-inner border-2 border-amber-300/50 overflow-hidden">
            <WizardPortrait appearance={wizard.appearance} size={52} />
          </div>
          <div>
            <h3 className="text-base md:text-lg font-bold text-amber-200">
              {wizard.title} {wizard.name} ({wizard.pronouns})
            </h3>
            <p className="text-xs text-slate-300">
              Headmaster of {wizard.academyName} · Arcane Study Tier {wizard.studyLevel}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-400">Total Wizard Mastery</div>
          <div className="text-xl font-bold text-amber-300">
            {Object.values(wizard.levels).reduce((a, b) => a + b, 0)} / 50
          </div>
        </div>
      </div>

      {/* Active Training Session */}
      <div className="bg-gradient-to-r from-purple-950/60 to-slate-900 p-5 rounded-2xl border border-purple-500/30 shadow-md">
        <h4 className="text-xs font-bold uppercase tracking-wider text-purple-300 mb-2 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-400" /> Active Arcane Meditation
        </h4>
        {wizard.activeSession ? (
          <div>
            <div className="flex justify-between text-xs font-medium mb-1.5">
              <span className="text-slate-100 font-bold capitalize">
                {wizard.activeSession.kind === 'orb'
                  ? `Pondering the ${wizard.activeSession.school} Orb (Level ${wizard.activeSession.targetLevel})`
                  : `Studying Grimoire: ${SPELL_DEFINITIONS[wizard.activeSession.spellId || '']?.name || 'Spell'}`}
              </span>
              <span className="text-purple-300 font-mono text-xs">
                {wizard.activeSession.progress} / {wizard.activeSession.required} reviews
              </span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden border border-purple-500/30">
              <div
                className="bg-gradient-to-r from-purple-500 to-amber-400 h-full transition-all"
                style={{ width: `${Math.min(100, (wizard.activeSession.progress / wizard.activeSession.required) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Rule BR-06/07: Completes strictly from honest reviews (25 × target level reviews). Pauses safely during breaks.
            </p>
          </div>
        ) : (
          <div className="text-xs text-slate-400 py-2">
            No active session. Choose an orb below to ponder and enhance your magical mastery.
          </div>
        )}
      </div>

      {/* 5 Schools of Magic Training Dials */}
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3">
          The Five Schools of Magic (Maximum Level 10 per School)
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {schools.map(sch => {
            const quote = wizardOrbQuote({
              foundingSchool: wizard.foundingSchool,
              levels: wizard.levels,
              active: wizard.activeSession,
              queued: wizard.queuedSessions,
              school: sch
            });
            const currentLvl = wizard.levels[sch] || 0;
            const targetLvl = quote.targetLevel;
            const isMax = quote.capped;
            const req = { mana: quote.mana, reviews: quote.reviews };
            const totalSessions = (wizard.activeSession ? 1 : 0) + (wizard.queuedSessions ? wizard.queuedSessions.length : 0);
            const canAfford = mana >= req.mana;
            const canQueue = !isMax && canAfford && totalSessions < 5;

            const icon =
              sch === 'arcane' ? <BookOpen className="w-4 h-4 text-purple-400" /> :
              sch === 'nature' ? <Leaf className="w-4 h-4 text-emerald-400" /> :
              sch === 'light' ? <Sun className="w-4 h-4 text-amber-400" /> :
              sch === 'shadow' ? <Moon className="w-4 h-4 text-indigo-400" /> :
              <FlaskConical className="w-4 h-4 text-orange-400" />;

            const buffText =
              sch === 'arcane' ? `+${Math.max(0, currentLvl - 5) * 2}% Mana` :
              sch === 'nature' ? `+${Math.max(0, currentLvl - 5) * 3}% Food, Herbs, Taming` :
              sch === 'light' ? `+${Math.max(0, currentLvl - 5) * 3}% Recovery & Teaching` :
              sch === 'shadow' ? `-${Math.max(0, currentLvl - 5) * 3}% Veil & Hazards` :
              `-${Math.max(0, currentLvl - 5) * 3}% Build, +${Math.max(0, currentLvl - 5) * 3}% Potions`;

            return (
              <div key={sch} className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col justify-between shadow">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-slate-100 capitalize flex items-center gap-1.5 text-xs">
                      {icon} {sch}
                    </span>
                    <span className="text-xs font-bold text-amber-300">Level {currentLvl}/10</span>
                  </div>
                  <div className="text-xs text-slate-300 mb-2">
                    {currentLvl >= 5 ? (
                      <span className="text-emerald-400 font-semibold">Classroom Teaching Unlocked</span>
                    ) : (
                      <span className="text-slate-400">Unlocks Classroom at Level 5</span>
                    )}
                  </div>
                  {currentLvl >= 6 && (
                    <div className="text-xs text-amber-300 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 mb-2">
                      Passive Buff: {buffText}
                    </div>
                  )}
                </div>

                {!isMax ? (
                  <button
                    onClick={() => onQueueSession(sch, false)}
                    disabled={!canQueue}
                    className="w-full mt-2 py-2 px-3 bg-purple-600/20 hover:bg-purple-600/40 text-purple-200 border border-purple-500/40 rounded-xl text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    {totalSessions > 0
                      ? `Queue Level ${targetLvl} (${quote.free ? 'Free' : `${req.mana}m`} · ${req.reviews} revs)`
                      : `Ponder Level ${targetLvl} (${quote.free ? 'Free' : `${req.mana}m`} · ${req.reviews} revs)`}
                  </button>
                ) : (
                  <span className="text-center text-xs text-amber-400 font-bold py-1.5 bg-amber-500/10 rounded-lg border border-amber-500/20">
                    {currentLvl >= 10 ? `Archmagus of ${sch.toUpperCase()}` : `Level 10 Queued`}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Spells & Grimoires Known */}
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3">
          Known Wizard Spells (Instant Cast with Mana)
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {wizard.knownSpells.map(spId => {
            const sp = SPELL_DEFINITIONS[spId];
            if (!sp) return null;
            const onCooldown = !!wizard.spellCooldowns[spId];
            return (
              <div key={spId} className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl flex items-center justify-between shadow">
                <div>
                  <div className="font-bold text-xs text-slate-100 flex items-center gap-2">
                    <span>{sp.name}</span>
                    <span className="text-xs text-purple-300 uppercase font-mono">({sp.school} {sp.tier})</span>
                  </div>
                  <div className="text-xs text-slate-300 mt-0.5 leading-relaxed">{sp.effect}</div>
                  <div className="text-xs text-amber-400 font-mono mt-1">Cost: {sp.manaCost} Mana</div>
                </div>
                <button
                  onClick={() => onCastSpell(spId)}
                  disabled={mana < sp.manaCost || onCooldown}
                  className="px-3.5 py-1.5 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 rounded-xl text-xs font-bold disabled:opacity-40 transition shrink-0 ml-2 shadow"
                >
                  {onCooldown ? `${wizard.spellCooldowns[spId]}r CD` : 'Cast'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 2. ROSTER & CONSTELLATION PANEL
// ==========================================
export const RosterPanel: React.FC<{
  state: FullGameState;
  onAssignCareer: (charId: number, career: CareerType) => void;
  onAssignTeacherRoom?: (charId: number, roomId: number) => void;
  onRetireCharacter?: (charId: number) => void;
  onEnrollSecondSchool?: (charId: number, school: SchoolType) => void;
  /** Room-based view: dorms show students, Faculty Quarters shows faculty, Trophy Hall alumni. */
  view?: 'all' | 'students' | 'faculty' | 'alumni';
}> = ({ state, onAssignCareer, onAssignTeacherRoom, onRetireCharacter, onEnrollSecondSchool, view = 'all' }) => {
  const { cardSets, allCards, alumniGallery } = state;
  const characters =
    view === 'students' ? state.characters.filter(c => !c.career) :
    view === 'faculty' ? state.characters.filter(c => !!c.career || c.masteredSchools.length > 0) :
    state.characters;
  const [selectedCharId, setSelectedCharId] = useState<number | null>(characters[0]?.id || null);
  const [activeSubTab, setActiveSubTab] = useState<'roster' | 'alumni'>(view === 'alumni' ? 'alumni' : 'roster');

  const selectedChar = characters.find(c => c.id === selectedCharId);
  const studySet = cardSets.find(s => s.id === selectedChar?.studySetId && !s.released);
  const studyCardIds = studySet?.cardIds || [];

  const ivls = studyCardIds.map(id => allCards[id]?.honestIvl || 0);
  const skill = calculateStudentSkill(ivls, state.settings.cardsPerStudent);
  const ready = isMasteryReady(ivls, state.settings.cardsPerStudent);

  // Retirement eligibility: all cards > retirementAgeDays
  const retirementThreshold = state.settings.retirementAgeDays || 90;
  const canRetire = selectedChar && selectedChar.masteredSchools.length > 0 && ivls.length > 0 && ivls.every(ivl => ivl >= retirementThreshold);

  // Faculty limit calculation (Formula F12)
  const totalWiz = Object.values(state.wizard.levels).reduce((a, b) => a + b, 0);
  const facBeds = state.rooms.reduce((acc, r) => acc + (r.defId === 'faculty_quarters' ? 2 : 0), 0);
  const classCount = state.rooms.filter(r => r.defId.startsWith('class_') || r.defId.startsWith('hall_')).length;
  const studentCount = state.characters.filter(c => c.status === 'student').length;
  const { limit: facultyLimit, breakdown } = calculateFacultyLimit(totalWiz, facBeds, classCount, studentCount);

  return (
    <div className="space-y-4">
      {/* Sub-tab navigation */}
      <div className="flex items-center gap-3 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveSubTab('roster')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            activeSubTab === 'roster'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>{view === 'students' ? 'Students' : view === 'faculty' ? 'Faculty' : 'Students & Faculty'} ({characters.length})</span>
        </button>
        <button
          onClick={() => setActiveSubTab('alumni')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            activeSubTab === 'alumni'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          <span>Alumni Gallery ({alumniGallery.length})</span>
        </button>
      </div>

      {activeSubTab === 'alumni' ? (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-xs text-slate-300">
            <h4 className="text-sm font-bold text-amber-300" title={`Graduated Masters whose flashcards matured past the ${retirementThreshold}-day retirement age. Their cards return to the free pool; they grant permanent Renown.`}>🏛️ Alumni ⓘ</h4>
          </div>

          {alumniGallery.length === 0 ? (
            <div className="text-center py-12 text-xs text-slate-500 bg-slate-900/40 rounded-xl border border-dashed border-slate-800">
              No retired alumni yet. Once a master's linked flashcards all exceed {retirementThreshold} days, they can retire here with high honors.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {alumniGallery.map(al => (
                <div key={al.id} className="bg-slate-900 border border-amber-900/40 p-4 rounded-xl shadow">
                  <div className="flex items-center gap-3 mb-2">
                    <CharacterPortrait name={al.name} role="resident" size={48} />
                    <div>
                      <h4 className="font-bold text-sm text-slate-100">{al.name}</h4>
                      <span className="text-xs text-amber-300">Retired Day {al.retiredDay}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {al.titles.map((t, idx) => (
                      <span key={idx} className="text-xs bg-slate-800 text-slate-200 px-2 py-0.5 rounded border border-slate-700 font-semibold">
                        {t}
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-emerald-400 font-semibold border-t border-slate-800 pt-2">
                    ✨ +{al.bonusValue} Permanent Renown
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Student List */}
          <div className="space-y-2 border-r border-slate-800 pr-4">
            <div className="flex items-center justify-between text-xs font-bold text-slate-300 pb-2 border-b border-slate-800">
              <span>Academy Roster ({characters.length})</span>
              <span className="text-amber-400 text-xs">
                Faculty: {state.characters.filter(c => c.career).length}/{facultyLimit}
              </span>
            </div>

            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
              {characters.map(char => {
                const isSelected = char.id === selectedCharId;
                return (
                  <div
                    key={char.id}
                    onClick={() => setSelectedCharId(char.id)}
                    className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                      isSelected
                        ? 'bg-amber-950/40 border-amber-500/80 shadow'
                        : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <CharacterPortrait character={char} size={40} />
                      <div>
                      <div className="font-bold text-xs text-slate-100">{char.name}</div>
                      <div className="text-xs text-slate-400 capitalize">
                        {char.currentSchool
                          ? `Student · ${char.currentSchool}`
                          : char.career
                          ? `Faculty · ${char.career}`
                          : char.status}
                      </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-amber-400">
                        {char.morale}% Morale
                      </div>
                      {char.masteredSchools.length > 0 && (
                        <span className="text-xs bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-bold border border-amber-500/30">
                          {char.masteredSchools.length}x Master
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected Student Detail & Constellation */}
          {selectedChar ? (
            <div className="md:col-span-2 space-y-4">
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between shadow">
                <div className="flex items-center gap-3">
                  <CharacterPortrait character={selectedChar} size={64} />
                  <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-amber-200">{selectedChar.name}</h3>
                    {selectedChar.title && (
                      <span className="text-xs bg-purple-950/80 text-purple-300 px-2 py-0.5 rounded border border-purple-800 font-bold">
                        {selectedChar.title}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    Personality: <strong className="text-slate-100">{selectedChar.personality}</strong> · Traits: {selectedChar.traits.join(', ')}
                  </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400">School Skill:</span>
                  <div className="text-xl font-bold text-amber-300">{skill} / 100</div>
                </div>
              </div>

              {/* 50-Card Constellation Grid */}
              <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl shadow-inner">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-200 mb-2">
                  <span title="Rule BR-13/14: Cards are never shared. Intervals directly mirror your real memory retention and reset honestly on lapses.">Constellation · 50 cards ⓘ</span>
                  <span className="text-xs text-amber-300 font-mono">Gold = &gt;30d interval (Mastery)</span>
                </div>

                <div className="grid grid-cols-10 gap-2 p-3 bg-slate-900/70 rounded-xl border border-slate-800">
                  {studyCardIds.map((cid, idx) => {
                    const c = allCards[cid];
                    const ivl = c ? c.honestIvl : 0;
                    const isMature = ivl > 30;
                    const dotColor = isMature
                      ? 'bg-amber-400 shadow-amber-400/50 shadow-sm text-slate-950'
                      : ivl >= 15
                      ? 'bg-emerald-400 text-slate-950'
                      : ivl >= 5
                      ? 'bg-sky-400 text-slate-950'
                      : 'bg-slate-700 text-slate-200';

                    return (
                      <div
                        key={cid}
                        className={`w-6 h-6 rounded-full ${dotColor} flex items-center justify-center text-xs font-mono font-bold cursor-help transition transform hover:scale-125`}
                        title={`Card #${cid}: "${c?.front?.slice(0, 50)}..."\nInterval: ${ivl} days`}
                      >
                        {idx + 1}
                      </div>
                    );
                  })}
                </div>

                {ready && (
                  <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-200">
                    ✨ <strong>Mastery Ready!</strong> All 50 cards exceed 30 days interval. Waiting on teacher delay before graduation ceremony.
                  </div>
                )}
              </div>

              {/* Character Lifecycle Actions: Retirement & Second School */}
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Character Lifecycle Actions
                </h4>
                <div className="flex flex-wrap gap-2.5">
                  {/* Second School Enrollment */}
                  {selectedChar.masteredSchools.length >= 1 && onEnrollSecondSchool && (
                    <div className="flex items-center gap-1.5">
                      {(['arcane', 'nature', 'light', 'shadow', 'alchemy'] as SchoolType[])
                        .filter(s => !selectedChar.masteredSchools.includes(s) && selectedChar.currentSchool !== s)
                        .map(sch => (
                          <button
                            key={sch}
                            onClick={() => onEnrollSecondSchool(selectedChar.id, sch)}
                            className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-200 border border-indigo-500/40 rounded-xl text-xs font-bold transition capitalize"
                          >
                            + Enroll in {sch} (50 Cards)
                          </button>
                        ))}
                    </div>
                  )}

                  {/* Retirement to Alumni */}
                  {selectedChar.masteredSchools.length > 0 && onRetireCharacter && (
                    <button
                      onClick={() => onRetireCharacter(selectedChar.id)}
                      disabled={!canRetire}
                      className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/40 text-amber-200 border border-amber-500/50 rounded-xl text-xs font-bold disabled:opacity-40 transition"
                      title={canRetire ? 'Retire to Alumni Gallery (+10 Renown)' : `Requires all 50 cards ≥ ${retirementThreshold}d interval`}
                    >
                      🏛️ Retire to Alumni (+10 Renown)
                    </button>
                  )}
                </div>
              </div>

              {/* Student Needs Breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-900 border border-slate-800 p-3.5 rounded-xl text-xs">
                <div>
                  <span className="text-slate-400">Hunger:</span>
                  <div className="font-bold text-slate-100">{selectedChar.needs.hunger}%</div>
                </div>
                <div>
                  <span className="text-slate-400">Rest:</span>
                  <div className="font-bold text-slate-100">{selectedChar.needs.rest}%</div>
                </div>
                <div>
                  <span className="text-slate-400">Leisure:</span>
                  <div className="font-bold text-slate-100">{selectedChar.needs.leisure}%</div>
                </div>
                <div>
                  <span className="text-slate-400">Composure:</span>
                  <div className="font-bold text-slate-100">{selectedChar.needs.composure}%</div>
                </div>
              </div>

              {/* Career Assignment & Switching for Masters */}
              {selectedChar.masteredSchools.length > 0 && (() => {
                const matchingClassrooms = state.rooms.filter(r => {
                  if (r.state !== 'built') return false;
                  const sch = classroomSchool(r.defId);
                  return !!sch && selectedChar.masteredSchools.includes(sch);
                });
                const canBeTeacher = matchingClassrooms.length > 0;
                const careerList = (['teacher', 'scholar', 'gardener', 'tamer', 'healer', 'warder', 'alchemist', 'builder', 'adventurer'] as CareerType[])
                  .filter(car => car !== 'teacher' || canBeTeacher || selectedChar.career === 'teacher');
                return (
                <div className="bg-slate-900 border border-amber-900/40 p-4 rounded-xl space-y-3" data-testid="career-picker">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-amber-300">
                      Master Career Appointment (+20 Career Flashcards)
                    </h4>
                    {selectedChar.career && selectedChar.masteredSchools.length < 2 && (
                      <span className="text-xs text-rose-400 flex items-center gap-1 font-semibold">
                        <Lock className="w-3.5 h-3.5" /> Career switching requires 2+ Mastered Schools
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {careerList.map(car => {
                      const isCurrent = selectedChar.career === car;
                      const isSwitchBlocked = selectedChar.career && !isCurrent && selectedChar.masteredSchools.length < 2;
                      const affinityText = describeCareerAffinity(selectedChar.masteredSchools, car);
                      return (
                        <button
                          key={car}
                          data-career-option={car}
                          onClick={() => onAssignCareer(selectedChar.id, car)}
                          disabled={isCurrent || !!isSwitchBlocked}
                          className={`text-left px-3 py-2 rounded-xl text-xs transition ${
                            isCurrent
                              ? 'bg-amber-600 text-slate-950 font-bold'
                              : isSwitchBlocked
                              ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                              : 'bg-amber-600/20 hover:bg-amber-600/40 text-amber-200 border border-amber-500/40'
                          }`}
                        >
                          <div className="capitalize font-bold">{car} {isCurrent && '✔'}</div>
                          <div className={`text-[11px] mt-0.5 ${isCurrent ? 'text-slate-900' : 'text-slate-300/80'}`}>
                            {car === 'teacher' ? 'Teacher: ' : `${car[0].toUpperCase() + car.slice(1)}: `}{affinityText}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {selectedChar.career === 'teacher' && onAssignTeacherRoom && (
                    <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-300 font-semibold">Assigned Classroom:</span>
                      <select
                        data-testid="teacher-classroom-picker"
                        value={selectedChar.workplaceRoomId ?? ''}
                        onChange={e => e.target.value && onAssignTeacherRoom(selectedChar.id, Number(e.target.value))}
                        className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200"
                      >
                        <option value="">Select matching classroom...</option>
                        {matchingClassrooms.map(r => (
                          <option key={r.id} value={r.id}>
                            {ROOM_DEFINITIONS[r.defId]?.name || r.defId}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                );
              })()}
            </div>
          ) : (
            <div className="col-span-2 text-center text-slate-500 py-12 text-xs">
              {view === 'faculty'
                ? 'No faculty yet. Graduated Masters can be appointed to a career here.'
                : 'No students yet. Admit apprentices from the Entrance Hall (Admissions).'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ==========================================
// 3. RECRUITMENT & ENROLLMENT TRACKER
// ==========================================
export const RecruitmentPanel: React.FC<{
  state: FullGameState;
  onEnroll: (school: SchoolType, name: string, personality: Character['personality'], traits: string[]) => void;
}> = ({ state, onEnroll }) => {
  const { allCards, cardSets, wizard } = state;
  const [selectedSchool, setSelectedSchool] = useState<SchoolType>('nature');

  const linkedCardIds = new Set<number>();
  for (const set of cardSets) {
    if (!set.released) {
      for (const cid of set.cardIds) linkedCardIds.add(cid);
    }
  }

  const eligibleYoungCards = Object.values(allCards).filter(c => c.honestIvl <= 30 && c.queue !== -1);
  const freeYoungCards = eligibleYoungCards.filter(c => !linkedCardIds.has(c.id));
  const needed = state.settings.cardsPerStudent;
  const canEnroll = freeYoungCards.length >= needed;

  const sampleApplicants = [
    { name: 'Tamsin Reed', personality: 'Gentle' as const, traits: ['Green Thumb', 'Tidy'], bio: 'Loves tending mossy paddocks and gentle forest familiars.' },
    { name: 'Corin Blackwood', personality: 'Bold' as const, traits: ['Brave', 'Lucky'], bio: 'Eager adventurer with an insatiable appetite for discovery.' },
    { name: 'Lyra Starling', personality: 'Bookish' as const, traits: ['Star-Touched', 'Well-Read'], bio: 'Fascinated by ancient astronomical charts and celestial runes.' },
    { name: 'Rowan Vale', personality: 'Steadfast' as const, traits: ['Keen Eye', 'Disciplined'], bio: 'Patient scholar interested in architectural runes and wards.' }
  ];

  return (
    <div className="space-y-5">
      {/* Permanent Enrollment Tracker Widget (BR-23) */}
      <div className="bg-slate-900 border-2 border-indigo-500/40 p-5 rounded-2xl shadow-xl">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-2">
            📊 Enrollment Tracker (Rule BR-23)
          </span>
          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-lg ${canEnroll ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
            {canEnroll ? '✔ Free Young Cards Available' : '❌ Enrollment Blocked'}
          </span>
        </div>

        <div className="text-sm md:text-base font-bold text-slate-100 mb-1.5">
          Free Young Cards: <span className="text-amber-300">{freeYoungCards.length}</span> / {needed} needed for 1 Student
        </div>

        <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden mb-3 border border-slate-700">
          <div
            className={`h-full transition-all ${canEnroll ? 'bg-emerald-400' : 'bg-red-400'}`}
            style={{ width: `${Math.min(100, (freeYoungCards.length / Math.max(1, needed)) * 100)}%` }}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-slate-300">
          <div>Eligible Young Cards (≤30d): <strong className="text-slate-100">{eligibleYoungCards.length}</strong></div>
          <div>Linked to Students: <strong className="text-slate-100">{linkedCardIds.size}</strong></div>
          <div>Enrollment Fee: <strong className="text-amber-300 font-bold">60 Mana</strong></div>
        </div>
      </div>

      {/* School Tab Selector */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
        {(['arcane', 'nature', 'light', 'shadow', 'alchemy'] as SchoolType[]).map(sch => {
          const isUnlocked = (wizard.levels[sch] || 0) >= 5;
          return (
            <button
              key={sch}
              onClick={() => setSelectedSchool(sch)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold capitalize transition flex items-center gap-1.5 shrink-0 ${
                selectedSchool === sch
                  ? 'bg-amber-500/20 border border-amber-500/50 text-amber-200'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>{sch}</span>
              {!isUnlocked && <span className="text-xs text-rose-400">(Req L5)</span>}
            </button>
          );
        })}
      </div>

      {/* Applicant Board */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {sampleApplicants.map((app, idx) => (
          <div key={idx} className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col justify-between shadow">
            <div>
              <div className="flex items-center justify-between mb-1 gap-2">
                <CharacterPortrait name={app.name} school={selectedSchool} role="student" size={40} />
                <span className="font-bold text-sm text-slate-100">{app.name}</span>
                <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                  {app.personality}
                </span>
              </div>
              <p className="text-xs text-slate-300 mb-2 leading-relaxed">{app.bio}</p>
              <div className="flex flex-wrap gap-1 mb-3">
                {app.traits.map(t => (
                  <span key={t} className="text-xs bg-emerald-950/60 border border-emerald-800/40 text-emerald-300 px-2 py-0.5 rounded">
                    {t}
                  </span>
                ))}
              </div>
            </div>

            <button
              onClick={() => onEnroll(selectedSchool, app.name, app.personality, app.traits)}
              disabled={!canEnroll || (wizard.levels[selectedSchool] || 0) < 5 || state.mana < 60}
              className="w-full py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 rounded-xl text-xs font-bold transition disabled:opacity-40 disabled:cursor-not-allowed shadow"
            >
              Admit Student (60 Mana)
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

// ==========================================
// 4. BUILD MENU & BLUEPRINT CATALOG
// ==========================================
export const BuildMenuPanel: React.FC<{
  state: FullGameState;
  onPlaceRoom: (defId: string, area: 'castle' | 'grounds') => void;
  onAutoPlace?: (defId: string) => void;
  onOpenDraft?: () => void;
}> = ({ state, onPlaceRoom, onAutoPlace, onOpenDraft }) => {
  const [category, setCategory] = useState<string>('all');
  const roomList = Object.values(ROOM_DEFINITIONS);
  const listed = roomList.filter(r => isStructure(r.id) || (state.roomPlans?.[r.id] || 0) > 0);
  const hasPlans = Object.values(state.roomPlans || {}).some(n => (n || 0) > 0);
  const tabs = ['all', 'core', 'living', 'arcane', 'nature', 'light', 'shadow', 'alchemy', 'craft', 'rift', 'grounds'].filter(cat => {
    if (cat === 'all') return listed.length > 0;
    return listed.some(r => r.category === cat || (cat === 'grounds' && r.area === 'grounds'));
  });
  const tabKey = tabs.join(',');
  useEffect(() => {
    if (tabKey && !tabKey.split(',').includes(category)) setCategory(tabKey.split(',')[0]);
  }, [tabKey, category]);

  const filtered = listed.filter(
    r => category === 'all' || r.category === category || (category === 'grounds' && r.area === 'grounds')
  );

  const sites = state.rooms.filter(r => r.state === 'site');

  return (
    <div className="space-y-4">
      {sites.length > 0 && (
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-1.5" data-testid="build-sites">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Under construction</div>
          {sites.map(site => (
            <div key={site.id} className="flex items-center justify-between gap-3 text-[13px]" data-site={site.defId}>
              <span className="text-slate-200">{ROOM_DEFINITIONS[site.defId]?.name || site.defId} <span className="text-slate-500 font-mono">{site.buildProgress}/{site.buildRequired}</span></span>
              <span className={site.buildPaused ? 'text-slate-400' : 'text-emerald-300'} data-testid="site-to-go">
                {site.buildPaused ? 'Paused · ' : ''}{reviewsToGoText(site)}
              </span>
            </div>
          ))}
        </div>
      )}
      {!hasPlans && (
        <div className="flex items-center justify-between gap-3 bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2" data-testid="build-no-plans">
          <p className="text-[13px] text-slate-200">Draw room cards to unlock more rooms</p>
          <button
            type="button"
            onClick={() => onOpenDraft?.()}
            className="px-3 py-1.5 min-h-[32px] rounded-lg bg-purple-600/30 hover:bg-purple-600/50 text-purple-100 border border-purple-500/40 text-xs font-bold"
          >
            Draw
          </button>
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap border-b border-slate-800 pb-2 text-xs">
        {tabs.map(cat => (
          <button
            key={cat}
            type="button"
            data-build-tab={cat}
            onClick={() => setCategory(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs capitalize font-semibold transition ${
              category === cat
                ? 'bg-amber-500/20 border border-amber-500/50 text-amber-200'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[520px] overflow-y-auto pr-1">
        {filtered.map(room => {
          const canAfford = canAffordMaterials(state, room.cost);
          // Per-room limits come from the engine rules (content maxCount), sites included
          const limit = roomLimitStatus(state.rooms, room.id);
          const unlocked = isRoomUnlocked(state, room.id);
          const structure = isStructure(room.id);
          const founding = room.id === 'entrance_hall' || room.id === 'wizard_study';
          const plans = state.roomPlans?.[room.id] || 0;
          const disabled = !canAfford || limit.capped || !unlocked;
          const costLine = formatMaterialCost(room.cost);
          return (
            <div
              key={room.id}
              data-build-card={room.id}
              data-capped={limit.capped ? 'true' : undefined}
              data-locked={unlocked ? undefined : 'true'}
              className={`bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col justify-between shadow ${!unlocked || limit.capped ? 'opacity-50 grayscale' : ''}`}
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-sm text-slate-100 flex items-center gap-1">
                    {!unlocked && <Lock className="w-3.5 h-3.5 text-slate-400" />}
                    {room.name}
                  </span>
                  <span className="text-xs text-slate-400 capitalize">{room.area} ({room.size.join('x')})</span>
                </div>
                <p className="text-xs text-slate-300 mb-2 line-clamp-2 leading-relaxed">{room.description}</p>
                {!structure && !founding && (
                  <div className="text-xs font-mono text-amber-200/90 mb-1" data-testid="plan-count">{plans} plan{plans === 1 ? '' : 's'}</div>
                )}
                <div className="text-xs text-slate-400 font-mono mb-2">
                  Cost: <strong className="text-amber-300">{costLine}</strong>
                  {' · '}Build: {room.buildReviews} revs
                </div>
                {!unlocked && (
                  <div className="text-xs text-slate-400 mb-2" data-testid="blueprint-lock">{blueprintLockHint(room.id)}</div>
                )}
                {limit.capped && (
                  <div className="text-xs text-amber-300/90 mb-2" data-testid="build-cap-reason">🔒 {limit.reason} ({limit.count}/{limit.max})</div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => onPlaceRoom(room.id, room.area)}
                  disabled={disabled}
                  title={!unlocked ? blueprintLockHint(room.id) : limit.capped ? limit.reason : !canAfford ? `Need ${costLine}` : 'Choose where to build it on the map'}
                  className="flex-1 py-2 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-200 border border-indigo-500/30 rounded-xl text-xs font-bold disabled:opacity-40 transition shadow"
                >
                  {!unlocked ? 'Locked' : limit.capped ? 'Limit reached' : 'Place…'}
                </button>
                {onAutoPlace && (
                  <button
                    onClick={() => onAutoPlace(room.id)}
                    disabled={disabled}
                    title="Place it in the first free valid spot"
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold disabled:opacity-40 transition"
                  >
                    Auto
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ==========================================
// 5. CARD DRAFT PANEL
// ==========================================
export const CardDraftPanel: React.FC<{
  state: FullGameState;
  onDrawDeck: (deck: DraftDeckId) => void;
}> = ({ state, onDrawDeck }) => {
  const odds = magicSchoolOdds(state.wizard.levels);
  const oddsLine = (['arcane', 'nature', 'light', 'shadow', 'alchemy'] as const)
    .map(s => `${s[0].toUpperCase()}${s.slice(1)} ${Math.round(odds[s])}%`)
    .join(' · ');

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold text-amber-200" title="Draw 3, keep 1. Each room card is one build.">Draw 3, keep 1 ⓘ</h3>
        <p className="text-[12px] text-slate-400 mt-1">Foundation and Grounds are the living academy and the grounds. Magic holds every school. A room card builds that room once.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {DECK_LIST.map(d => {
          const currentPrice = deckPrice(state, d.id);
          const canAfford = state.mana >= currentPrice;

          return (
            <div key={d.id} className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col justify-between shadow" data-deck={d.id} data-tour={d.id === 'foundation' ? 'deck-foundation' : undefined}>
              <div>
                <h4 className="font-bold text-xs text-slate-100 mb-1">{d.name} deck</h4>
                <div className="text-xs font-mono text-amber-300 mb-3" data-testid="deck-price" title="Each draw from this deck this term raises the price by 5%. Prices reset at the end of the term.">
                  Current Cost: <strong>{currentPrice} Mana</strong>
                </div>
                {d.id === 'magic' && (
                  <p className="text-[11px] text-slate-400 mb-3 leading-relaxed" data-testid="magic-odds">{oddsLine}</p>
                )}
              </div>
              <button
                onClick={() => onDrawDeck(d.id)}
                disabled={!canAfford}
                className="w-full py-2 bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 rounded-xl text-xs font-bold disabled:opacity-40 transition shadow"
              >
                Draft From Deck
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const RARITY_ORDER: Record<CreatureRarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4
};

const RARITY_STYLE: Record<CreatureRarity, { frame: string; badge: string }> = {
  common: { frame: 'border-slate-700', badge: 'bg-slate-800 text-slate-300 border-slate-700' },
  uncommon: { frame: 'border-emerald-700/60', badge: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/50' },
  rare: { frame: 'border-sky-600/60', badge: 'bg-sky-950/80 text-sky-300 border-sky-600/50' },
  epic: { frame: 'border-purple-600/70', badge: 'bg-purple-950/80 text-purple-300 border-purple-600/50' },
  legendary: { frame: 'border-amber-500/70', badge: 'bg-amber-950/80 text-amber-300 border-amber-500/50' }
};

export const BestiaryPanel: React.FC<{
  state: FullGameState;
  onFeedCreature: (creatureId: number) => void;
  onAssignTamer: (creatureId: number, tamerId: number) => void;
}> = ({ state, onFeedCreature, onAssignTamer }) => {
  const creatures = state.creatures || [];
  const characters = state.characters || [];
  const [statusFilter, setStatusFilter] = useState<'all' | 'tamed' | 'wary' | 'loose' | 'egg'>('all');
  const [habitatFilter, setHabitatFilter] = useState<'all' | HabitatType>('all');
  const [rarityFilter, setRarityFilter] = useState<'all' | CreatureRarity>('all');

  const discovered = getDiscoveredCreatureIds(state);
  const allSpecies = Object.values(CREATURE_DEFINITIONS).sort(
    (a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || a.name.localeCompare(b.name)
  );
  const filteredBook = allSpecies.filter(def => {
    if (habitatFilter !== 'all' && !def.habitats.includes(habitatFilter)) return false;
    if (rarityFilter !== 'all' && def.rarity !== rarityFilter) return false;
    return true;
  });

  const tamers = characters.filter(c => c.career === 'tamer');
  const filteredOwned = creatures.filter(c => statusFilter === 'all' || c.status === statusFilter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap bg-slate-900/80 p-5 rounded-2xl border border-emerald-900/40 shadow-lg">
        <div>
          <h3 className="text-base font-bold text-emerald-300 flex items-center gap-2">
            <PawPrint className="w-5 h-5" /> The Academy Bestiary &amp; Menagerie
          </h3>
          <p className="text-xs text-slate-400 mt-1" title="40 species (GDD 22). Tamed creatures grant passive buffs, help clean, and join Rift expeditions.">
            Collector&apos;s Book &amp; Companions · Tamed creatures give buffs ⓘ
          </p>
        </div>
        <div className="flex items-center gap-5 text-right">
          <div>
            <div className="text-xs text-slate-400">Bestiary</div>
            <div className="text-xl font-bold text-amber-300" data-testid="bestiary-discovered-count">
              Discovered {discovered.size} / 40
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400">In Academy</div>
            <div className="text-xl font-bold text-emerald-400">{creatures.length}</div>
          </div>
        </div>
      </div>

      {/* Owned Menagerie Care */}
      {creatures.length > 0 && (
        <section className="space-y-3" data-testid="bestiary-owned-section">
          <div className="flex items-center justify-between gap-2 flex-wrap border-b border-slate-800 pb-2">
            <h4 className="text-sm font-bold text-slate-200">In Your Academy</h4>
            <div className="flex items-center gap-1.5 flex-wrap">
              {(['all', 'tamed', 'wary', 'egg', 'loose'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold capitalize transition ${
                    statusFilter === f
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {f === 'egg' ? 'Arriving' : f}
                </button>
              ))}
            </div>
          </div>

          {filteredOwned.length === 0 ? (
            <div className="text-center py-6 text-xs text-slate-500 bg-slate-900/40 rounded-xl border border-dashed border-slate-800">
              No creatures in this category right now.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredOwned.map(c => {
                const def = c?.defId ? CREATURE_DEFINITIONS[c.defId] : undefined;
                if (!def) return null;
                const roaming = isRoamingCompanion(c);

                return (
                  <div key={c.id} className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col justify-between shadow space-y-3">
                    <div className="space-y-2">
                      <div className="flex items-start gap-2.5">
                        <CreaturePortrait
                          defId={c.defId}
                          variant={c.status === 'egg' ? 'egg' : 'adult'}
                          hatchProgress={c.hatchProgress}
                          status={c.status}
                          bondLevel={c.bondLevel}
                          size={44}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold text-sm text-slate-100 truncate">
                              {c.nickname}
                              <span className="text-xs font-normal text-slate-400"> ({def.name})</span>
                            </span>
                            <span className={`text-[11px] px-2 py-0.5 rounded font-bold uppercase shrink-0 ${
                              c.status === 'tamed'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : c.status === 'wary'
                                ? 'bg-amber-500/20 text-amber-300'
                                : c.status === 'egg'
                                ? 'bg-sky-500/20 text-sky-300'
                                : 'bg-rose-500/20 text-rose-300'
                            }`}>
                              {c.status === 'egg' ? originLabel(def.origin, c.defId) : c.status}
                            </span>
                          </div>
                          {roaming && (
                            <span className="inline-block mt-1 text-[11px] px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-700/40 text-emerald-300">
                              Roaming companion (0 pen slots)
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-xs text-slate-300 leading-relaxed">{def.buffDescription}</div>

                      {c.status === 'egg' && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-slate-400">
                            <span>{arrivalStageLabel(arrivalStage(c.hatchProgress || 0))}</span>
                            <span>{Math.round(c.hatchProgress || 0)}%</span>
                          </div>
                          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700">
                            <div className="bg-sky-400 h-full transition-all" style={{ width: `${Math.min(100, c.hatchProgress || 0)}%` }} />
                          </div>
                        </div>
                      )}

                      {c.status === 'wary' && (() => {
                        const hasTamer = c.tamerId !== undefined && c.tamerId !== null;
                        const tamerMastered = !hasTamer
                          ? []
                          : c.tamerId === 0
                          ? wizardMasteredSchools(state.wizard.levels)
                          : (characters.find(ch => ch.id === c.tamerId)?.masteredSchools || []);
                        const tamerMult = hasTamer ? careerAffinityMultiplier(tamerMastered, 'tamer', def.school) : 1;
                        const tamerTitle = hasTamer
                          ? `Tamer speed: ×${tamerMult.toFixed(2)} (${def.school} creature)`
                          : 'No tamer assigned';
                        return (
                          <div className="space-y-1" title={tamerTitle} data-testid={`taming-tooltip-${c.id}`}>
                            <div className="flex justify-between text-xs text-slate-400">
                              <span>
                                Taming Progress{hasTamer ? ` (×${tamerMult.toFixed(2)})` : ''}:
                              </span>
                              <span>{c.tamingProgress} / {def.tamingReviews} reviews</span>
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700">
                              <div
                                className="bg-amber-400 h-full transition-all"
                                style={{ width: `${Math.min(100, (c.tamingProgress / def.tamingReviews) * 100)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })()}

                      {c.status === 'tamed' && (
                        <div className="text-xs text-amber-300 flex items-center gap-1">
                          <Heart className="w-3.5 h-3.5 fill-amber-400" />
                          <span>Bond Level {c.bondLevel}/3 ({c.bondProgress} bond points)</span>
                        </div>
                      )}

                      <div className="text-xs text-slate-400">
                        Diet: {Object.entries(def.diet).map(([k, v]) => `${v} ${k}`).join(', ')}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                      <button
                        onClick={() => onFeedCreature(c.id)}
                        className="flex-1 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-200 border border-emerald-500/40 rounded-xl text-xs font-bold transition"
                      >
                        Feed Diet
                      </button>
                      {c.status === 'wary' && (
                        <select
                          aria-label="Assign Tamer"
                          value={c.tamerId !== undefined && c.tamerId !== null ? String(c.tamerId) : ''}
                          onChange={e => e.target.value !== '' && onAssignTamer(c.id, Number(e.target.value))}
                          className="bg-slate-950 border border-slate-700 rounded-xl text-xs p-1.5 text-slate-200"
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
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Collector's Book: All 40 Species */}
      <section className="space-y-3" data-testid="bestiary-book">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2">
          <h4 className="text-sm font-bold text-amber-200">Collector&apos;s Book (All 40 Species)</h4>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              aria-label="Filter by habitat"
              data-testid="bestiary-habitat-filter"
              value={habitatFilter}
              onChange={e => setHabitatFilter(e.target.value as 'all' | HabitatType)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200"
            >
              <option value="all">All habitats</option>
              {(Object.keys(HABITAT_LABELS) as HabitatType[]).map(h => (
                <option key={h} value={h}>{HABITAT_LABELS[h].badge} {HABITAT_LABELS[h].label}</option>
              ))}
            </select>
            <select
              aria-label="Filter by rarity"
              data-testid="bestiary-rarity-filter"
              value={rarityFilter}
              onChange={e => setRarityFilter(e.target.value as 'all' | CreatureRarity)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 capitalize"
            >
              <option value="all">All rarities</option>
              {(['common', 'uncommon', 'rare', 'epic', 'legendary'] as CreatureRarity[]).map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredBook.map(def => {
            const isDiscovered = discovered.has(def.id);
            const rStyle = RARITY_STYLE[def.rarity];
            const ownedCount = creatures.filter(c => c.defId === def.id).length;

            if (!isDiscovered) {
              return (
                <div
                  key={def.id}
                  data-testid={`bestiary-entry-${def.id}`}
                  data-discovered="false"
                  className={`bg-slate-950/80 border ${rStyle.frame} p-3.5 rounded-xl flex items-center gap-3`}
                >
                  <CreaturePortrait variant="unknown" size={48} />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-bold text-sm text-slate-500">???</span>
                      <span className={`text-[11px] px-2 py-0.5 rounded border capitalize font-bold ${rStyle.badge}`}>
                        {def.rarity}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {def.habitats.map(h => (
                        <span key={h} className="text-[11px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                          {HABITAT_LABELS[h].badge} {HABITAT_LABELS[h].label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            }

            const pens = compatiblePenNames(def);
            return (
              <div
                key={def.id}
                data-testid={`bestiary-entry-${def.id}`}
                data-discovered="true"
                className={`bg-slate-900 border ${rStyle.frame} p-3.5 rounded-xl flex flex-col justify-between gap-2.5 shadow`}
              >
                <div className="flex items-start gap-3">
                  <CreaturePortrait defId={def.id} variant="adult" size={48} />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-1.5 flex-wrap">
                      <span className="font-bold text-sm text-slate-100">{def.name}</span>
                      <span className={`text-[11px] px-2 py-0.5 rounded border capitalize font-bold ${rStyle.badge}`}>
                        {def.rarity}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap text-[11px] text-slate-300">
                      <span className="capitalize px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800">{def.school}</span>
                      {def.habitats.map(h => (
                        <span key={h} className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800">
                          {HABITAT_LABELS[h].badge} {HABITAT_LABELS[h].label}
                        </span>
                      ))}
                      {ownedCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-950/70 border border-emerald-700/40 text-emerald-300 font-bold">
                          ×{ownedCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-slate-400 flex flex-wrap gap-x-2.5 gap-y-0.5">
                  <span>Movement: <strong className="text-slate-200 capitalize">{def.movement}</strong></span>
                  <span>Origin: <strong className="text-slate-200">{ORIGIN_LABELS[def.origin]}</strong></span>
                  <span>Taming: <strong className="text-slate-200">{def.tamingReviews} rev</strong></span>
                </div>

                <div className="text-[11px] font-medium text-emerald-300/90">
                  {def.roamsFreely ? 'Roams freely once tamed (0 pen slots)' : 'Lives in pen'}
                </div>

                <div className="text-xs text-slate-200 leading-snug">
                  <span className="text-slate-400">Buff: </span>{def.buffDescription}
                </div>
                <div className="text-[11px] text-rose-300/80 leading-snug">
                  <span className="text-slate-500">Trouble: </span>{def.troubleDescription}
                </div>
                <div className="text-[11px] text-slate-400 leading-snug">
                  <span>Diet: {Object.entries(def.diet).map(([k, v]) => `${v} ${k}`).join(', ')}</span>
                  <span className="block text-slate-500 mt-0.5">Pens: {pens.join(', ')}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

// ==========================================
// 7. ALCHEMY & BREWING PANEL
// ==========================================
export const AlchemyPanel: React.FC<{
  state: FullGameState;
  onBrewPotion: (potionId: string) => void;
  onUsePotion?: (potionId: string) => void;
}> = ({ state, onBrewPotion, onUsePotion }) => {
  const { resources, potions } = state;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold text-amber-200" title="GDD 24: Combine 3 distinct ingredients into restorative and fortifying elixirs.">Recipes ⓘ</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {potions.map(rec => {
          const count = resources.potions[rec.id] || 0;
          return (
            <div key={rec.id} className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col justify-between shadow space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-sm text-slate-100">{rec.name}</span>
                  <span className="text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    x{count} Owned
                  </span>
                </div>
                <div className="text-xs text-slate-300 leading-relaxed mb-2">{rec.effect}</div>
                <div className="text-xs text-slate-400 font-mono">
                  Ingredients: {rec.ingredients.join(' + ')}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                <button
                  onClick={() => onBrewPotion(rec.id)}
                  className="flex-1 py-2 bg-orange-600/20 hover:bg-orange-600/40 text-orange-200 border border-orange-500/30 rounded-xl text-xs font-bold transition shadow"
                >
                  Brew ({rec.reviewsToBrew} revs)
                </button>
                {count > 0 && onUsePotion && (
                  <button
                    onClick={() => onUsePotion(rec.id)}
                    className="px-3.5 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 rounded-xl text-xs font-bold transition shadow"
                  >
                    Drink / Use
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ==========================================
// 8. RIFT EXPEDITION PLANNER PANEL (5 DESTINATIONS)
// ==========================================
export const RiftPanel: React.FC<{
  state: FullGameState;
  onLaunchExpedition: (destId: string, teamIds: number[], supplies?: string[], companionId?: number) => void;
}> = ({ state, onLaunchExpedition }) => {
  const { characters, expeditions, cardSets, allCards, alumniGallery, creatures } = state;
  const [selectedDestId, setSelectedDestId] = useState<string>('mossy_hollow');
  const [selectedHeroIds, setSelectedHeroIds] = useState<number[]>([]);
  const [selectedCompanionId, setSelectedCompanionId] = useState<number | undefined>(undefined);

  // 3-Master Seal check (Rule BR-27)
  const totalMasters = characters.filter(c => c.masteredSchools.length > 0).length + alumniGallery.length;
  const isRiftLocked = totalMasters < 3;

  const dest = RIFT_DESTINATIONS[selectedDestId];
  const activeExpedition = expeditions.find(e => e.state === 'active');
  const adventurers = characters.filter(c => c.career === 'adventurer');
  const tamedCreatures = creatures.filter(c => c.status === 'tamed');

  // Calculate party skill (mean honest interval of linked adventurer career cards)
  let totalIvl = 0;
  let totalCards = 0;
  for (const hId of selectedHeroIds) {
    const hero = characters.find(c => c.id === hId);
    if (hero && hero.careerSetIds.length > 0) {
      const cSet = cardSets.find(s => s.id === hero.careerSetIds[0]);
      if (cSet) {
        for (const cid of cSet.cardIds) {
          totalIvl += allCards[cid]?.honestIvl || 0;
          totalCards++;
        }
      }
    }
  }
  const partySkillDays = totalCards > 0 ? totalIvl / totalCards : 0;
  const { chance, breakdown } = calculateRiftChance(
    dest,
    partySkillDays,
    selectedHeroIds.length,
    false,
    state.veil.strength < 50
  );

  const toggleHero = (id: number) => {
    if (selectedHeroIds.includes(id)) {
      setSelectedHeroIds(selectedHeroIds.filter(h => h !== id));
    } else if (selectedHeroIds.length < 3) {
      setSelectedHeroIds([...selectedHeroIds, id]);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold text-amber-200" title="Rules BR-27 to BR-33. Party Skill is the true average review interval of your adventurers' flashcards. Safe odds are capped; heroes never die.">Plan an expedition ⓘ</h3>
      </div>

      {/* Rift 3-Master Seal Lockdown */}
      {isRiftLocked ? (
        <div className="bg-gradient-to-b from-purple-950/80 to-slate-900 border-2 border-purple-500/60 p-8 rounded-2xl text-center shadow-2xl space-y-4">
          <div className="w-16 h-16 rounded-full bg-purple-900/50 border-2 border-purple-400 mx-auto flex items-center justify-center text-3xl shadow-lg">
            🔒
          </div>
          <div>
            <h4 className="text-lg font-bold text-amber-200">
              The Rift Portal is Sealed Under Ancient Wards
            </h4>
            <p className="text-xs text-slate-300 max-w-md mx-auto mt-1 leading-relaxed">
              Rule BR-27: The Rift requires at least <strong>3 Masters of Magic</strong> (active or alumni)
              to safely breach the Veil. You have currently graduated <strong>{totalMasters} / 3</strong> Masters.
            </p>
          </div>
          <div className="w-full max-w-xs mx-auto bg-slate-800 rounded-full h-2.5 overflow-hidden border border-slate-700">
            <div
              className="bg-purple-400 h-full transition-all"
              style={{ width: `${Math.min(100, (totalMasters / 3) * 100)}%` }}
            />
          </div>
          <div className="text-xs text-purple-300 font-mono">
            Graduate more apprentices into Masters in the Roster to break this seal.
          </div>
        </div>
      ) : activeExpedition ? (
        <div className="bg-purple-950/60 border border-purple-500/40 p-5 rounded-2xl text-center space-y-3 shadow-xl">
          <div className="text-base font-bold text-purple-200">Expedition in Progress</div>
          <p className="text-xs text-slate-300">
            Destination: {RIFT_DESTINATIONS[activeExpedition.destinationId]?.name} · Progress: {activeExpedition.progressReviews} / {activeExpedition.requiredReviews} reviews
          </p>
          <div className="w-full max-w-md mx-auto bg-slate-800 rounded-full h-3 overflow-hidden border border-purple-500/40">
            <div
              className="bg-purple-400 h-full transition-all"
              style={{ width: `${Math.min(100, (activeExpedition.progressReviews / activeExpedition.requiredReviews) * 100)}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Destination Selector (5 destinations) */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              1. Select Rift Destination
            </h4>
            {Object.values(RIFT_DESTINATIONS).map(d => {
              const isSelected = d.id === selectedDestId;
              return (
                <div
                  key={d.id}
                  onClick={() => setSelectedDestId(d.id)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition shadow ${
                    isSelected ? 'bg-amber-950/50 border-amber-500' : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold text-slate-100">
                    <span>{d.name} ({d.tier.toUpperCase()})</span>
                    <span className="text-amber-400">{d.cost} Mana</span>
                  </div>
                  <div className="text-xs text-slate-300 mt-1 leading-relaxed">{d.description}</div>
                  <div className="text-xs text-emerald-400 font-medium mt-1">
                    Rewards: {d.rewardsSummary}
                  </div>
                  <div className="text-xs text-slate-400 font-mono mt-1">
                    Req Skill: {d.skillNeeded}d · Safe Odds: {d.safeOdds}% · Countdown: {d.reviews} reviews
                  </div>
                </div>
              );
            })}
          </div>

          {/* Team Selection, Companion, & Chance Meter */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              2. Assemble Party (1–3 Adventurers)
            </h4>
            <div className="space-y-2">
              {adventurers.length === 0 ? (
                <div className="text-xs text-slate-400 p-3.5 bg-slate-900 rounded-xl border border-slate-800">
                  No Adventurers available. Graduate Masters in the Roster and assign them the Adventurer career.
                </div>
              ) : (
                adventurers.map(adv => {
                  const isSelected = selectedHeroIds.includes(adv.id);
                  return (
                    <div
                      key={adv.id}
                      onClick={() => toggleHero(adv.id)}
                      className={`p-3 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition shadow ${
                        isSelected ? 'bg-purple-950/50 border-purple-500 text-purple-200 font-bold' : 'bg-slate-900 border-slate-800 text-slate-300'
                      }`}
                    >
                      <span className="flex items-center gap-2"><CharacterPortrait character={adv} size={36} />{adv.name}</span>
                      <span className="text-xs text-slate-400 font-mono">
                        {adv.status === 'away' ? 'On Expedition' : adv.injury ? 'Injured' : 'Ready'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Companion Creature Selection */}
            {tamedCreatures.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-slate-300 uppercase mb-1">Select Familiar Companion:</h4>
                <select
                  value={selectedCompanionId || ''}
                  onChange={e => setSelectedCompanionId(e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-slate-200"
                >
                  <option value="">No Companion</option>
                  {tamedCreatures.map(c => (
                    <option key={c.id} value={c.id}>{c.nickname} (+Fortune)</option>
                  ))}
                </select>
              </div>
            )}

            {/* Semicircular Chance Meter Display */}
            <div className="bg-slate-950 border border-slate-800 p-5 rounded-2xl text-center space-y-2 shadow-inner">
              <div className="text-xs uppercase tracking-wider text-slate-400 font-bold">
                Chance of Safe Return
              </div>
              <div className="text-3xl font-black text-amber-300">
                {chance}%
              </div>
              <div className="text-xs text-slate-400 space-y-0.5">
                {breakdown.map((b, i) => (
                  <div key={i} className="flex justify-between max-w-xs mx-auto">
                    <span>{b.label}</span>
                    <span className={b.val >= 0 ? 'text-emerald-400 font-mono' : 'text-red-400 font-mono'}>
                      {b.val > 0 ? `+${b.val}%` : `${b.val}%`}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => onLaunchExpedition(dest.id, selectedHeroIds, [], selectedCompanionId)}
              disabled={selectedHeroIds.length === 0 || state.mana < dest.cost}
              className="w-full py-3 bg-gradient-to-r from-amber-600 to-purple-600 hover:from-amber-500 hover:to-purple-500 text-slate-950 font-bold rounded-xl text-xs shadow-xl transition disabled:opacity-40"
            >
              Step Through the Rift ({dest.cost} Mana)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
