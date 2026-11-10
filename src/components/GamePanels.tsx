/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Interactive Sub-Panels for Ankicaster:
 * 1. WizardStudyPanel: School levels (25xn reviews), Buffs, Grimoire Spells
 * 2. RosterPanel: Students, Constellations (50 cards), Needs, Careers, Mastery Countdown
 * 3. RecruitmentPanel: Enrollment Tracker, Free Young Cards vs Needed, Admissions
 * 4. BuildMenuPanel: Standard Plans & Blueprint Cards
 * 5. CardDraftPanel: Foundation & 5 School Decks, Draw 3 Keep 1, Price Growth
 * 6. AlchemyPanel: 3-Ingredient Brewing, Discovery, Potions
 * 7. RiftPanel: 5 Destinations, Party Skill (avg ivl), Chance Meter, Outcome Resolution
 */

import React, { useState } from 'react';
import {
  FullGameState,
  SchoolType,
  CareerType,
  PlacedRoom,
  Character,
  RiftDestination
} from '../types/ankicaster';
import {
  ROOM_DEFINITIONS,
  FURNITURE_DEFINITIONS,
  POTION_RECIPES,
  RIFT_DESTINATIONS,
  SPELL_DEFINITIONS
} from '../data/content';
import {
  getWizardLevelRequirements,
  calculateStudentSkill,
  isMasteryReady,
  calculateTeacherDelay,
  calculateRiftChance,
  calculateFacultyLimit
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
  X
} from 'lucide-react';

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
      <div className="flex items-center justify-between bg-slate-900/80 p-4 rounded-xl border border-amber-900/30">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-purple-800 to-amber-500 flex items-center justify-center text-xl shadow-inner border border-amber-300/50">
            🧙‍♀️
          </div>
          <div>
            <h3 className="text-base font-bold text-amber-200">
              {wizard.title} {wizard.name} ({wizard.pronouns})
            </h3>
            <p className="text-xs text-slate-400">
              Headmaster of {wizard.academyName} · Study Tier {wizard.studyLevel}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-400">Total Wizard Mastery</div>
          <div className="text-lg font-bold text-amber-300">
            {Object.values(wizard.levels).reduce((a, b) => a + b, 0)} / 50
          </div>
        </div>
      </div>

      {/* Active Training Session */}
      <div className="bg-gradient-to-r from-purple-950/60 to-slate-900 p-4 rounded-xl border border-purple-500/30">
        <h4 className="text-xs font-bold uppercase tracking-wider text-purple-300 mb-2 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-400" /> Active Arcane Meditation
        </h4>
        {wizard.activeSession ? (
          <div>
            <div className="flex justify-between text-xs font-medium mb-1">
              <span className="text-slate-200 font-semibold capitalize">
                {wizard.activeSession.kind === 'orb'
                  ? `Pondering the ${wizard.activeSession.school} Orb (Level ${wizard.activeSession.targetLevel})`
                  : `Studying Grimoire: ${SPELL_DEFINITIONS[wizard.activeSession.spellId || '']?.name || 'Spell'}`}
              </span>
              <span className="text-purple-300 font-mono">
                {wizard.activeSession.progress} / {wizard.activeSession.required} reviews
              </span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-purple-500/30">
              <div
                className="bg-gradient-to-r from-purple-500 to-amber-400 h-full transition-all"
                style={{ width: `${Math.min(100, (wizard.activeSession.progress / wizard.activeSession.required) * 100)}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Rule BR-06/07: Completes strictly from honest reviews (25 × level reviews). Pauses safely during breaks.
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {schools.map(sch => {
            const currentLvl = wizard.levels[sch] || 0;
            const nextLvl = currentLvl + 1;
            const isMax = currentLvl >= 10;
            const req = getWizardLevelRequirements(nextLvl);
            const canAfford = mana >= req.mana;

            // School colors & icons
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
              <div key={sch} className="bg-slate-900 border border-slate-800 p-3 rounded-lg flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-slate-200 capitalize flex items-center gap-1.5 text-xs">
                      {icon} {sch}
                    </span>
                    <span className="text-xs font-bold text-amber-300">Level {currentLvl}/10</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mb-2">
                    {currentLvl >= 5 ? (
                      <span className="text-emerald-400">Classroom Teaching Unlocked</span>
                    ) : (
                      <span>Unlocks Classroom at Level 5</span>
                    )}
                  </div>
                  {currentLvl >= 6 && (
                    <div className="text-[10px] text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 mb-2">
                      Passive Buff: {buffText}
                    </div>
                  )}
                </div>

                {!isMax ? (
                  <button
                    onClick={() => onQueueSession(sch, false)}
                    disabled={!canAfford || !!wizard.activeSession}
                    className="w-full mt-2 py-1.5 px-2 bg-purple-600/20 hover:bg-purple-600/40 text-purple-200 border border-purple-500/40 rounded text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    Ponder {sch} Orb ({req.mana}m · {req.reviews} revs)
                  </button>
                ) : (
                  <span className="text-center text-[10px] text-amber-400 font-bold py-1">
                    Archmagus of {sch.toUpperCase()}
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
              <div key={spId} className="bg-slate-900 border border-slate-800 p-3 rounded-lg flex items-center justify-between">
                <div>
                  <div className="font-bold text-xs text-slate-200 flex items-center gap-1.5">
                    <span>{sp.name}</span>
                    <span className="text-[10px] text-slate-400 uppercase">({sp.school} {sp.tier})</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{sp.effect}</div>
                  <div className="text-[10px] text-amber-400/80 font-mono mt-1">Cost: {sp.manaCost} Mana</div>
                </div>
                <button
                  onClick={() => onCastSpell(spId)}
                  disabled={mana < sp.manaCost || onCooldown}
                  className="px-3 py-1.5 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 rounded text-xs font-semibold disabled:opacity-40 transition"
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
}> = ({ state, onAssignCareer }) => {
  const { characters, cardSets, allCards } = state;
  const [selectedCharId, setSelectedCharId] = useState<number | null>(characters[0]?.id || null);

  const selectedChar = characters.find(c => c.id === selectedCharId);
  const studySet = cardSets.find(s => s.id === selectedChar?.studySetId);
  const studyCardIds = studySet?.cardIds || [];

  const ivls = studyCardIds.map(id => allCards[id]?.honestIvl || 0);
  const skill = calculateStudentSkill(ivls, state.settings.cardsPerStudent);
  const ready = isMasteryReady(ivls, state.settings.cardsPerStudent);

  // Faculty limit calculation
  const totalWiz = Object.values(state.wizard.levels).reduce((a, b) => a + b, 0);
  const facBeds = state.rooms.reduce((acc, r) => acc + (r.defId === 'faculty_quarters' ? 2 : 0), 0);
  const classCount = state.rooms.filter(r => r.defId.startsWith('class_') || r.defId.startsWith('hall_')).length;
  const studentCount = characters.filter(c => c.status === 'student').length;
  const { limit: facultyLimit, breakdown } = calculateFacultyLimit(totalWiz, facBeds, classCount, studentCount);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Student List */}
      <div className="space-y-2 border-r border-slate-800 pr-4">
        <div className="flex items-center justify-between text-xs font-bold text-slate-300 pb-2 border-b border-slate-800">
          <span>Academy Roster ({characters.length})</span>
          <span className="text-amber-400 text-[11px]">Faculty: {characters.filter(c => c.career).length}/{facultyLimit}</span>
        </div>

        <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
          {characters.map(char => {
            const isSelected = char.id === selectedCharId;
            return (
              <div
                key={char.id}
                onClick={() => setSelectedCharId(char.id)}
                className={`p-2.5 rounded-lg border cursor-pointer transition flex items-center justify-between ${
                  isSelected
                    ? 'bg-amber-950/40 border-amber-500/80'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="font-bold text-xs text-slate-200">{char.name}</div>
                  <div className="text-[10px] text-slate-400 capitalize">
                    {char.currentSchool ? `Student · ${char.currentSchool}` : char.career ? `Faculty · ${char.career}` : char.status}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-amber-400">
                    {char.morale}% Morale
                  </div>
                  {char.masteredSchools.length > 0 && (
                    <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1 py-0.2 rounded font-semibold">
                      Master
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
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-amber-200">{selectedChar.name}</h3>
              <p className="text-xs text-slate-400">
                Personality: <strong className="text-slate-200">{selectedChar.personality}</strong> · Traits: {selectedChar.traits.join(', ')}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400">School Skill:</span>
              <div className="text-lg font-bold text-amber-300">{skill} / 100</div>
            </div>
          </div>

          {/* 50-Card Constellation Grid */}
          <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-2">
              <span>Card Constellation (50 Linked Anki Flashcards)</span>
              <span className="text-[11px] text-slate-400">Gold dots = &gt;30d interval (Mastery)</span>
            </div>
            <p className="text-[11px] text-slate-400 mb-3">
              Rule BR-13/14: Cards are never shared. Intervals directly mirror your real memory and fall honestly on lapses.
            </p>

            <div className="grid grid-cols-10 gap-2 p-3 bg-slate-900/60 rounded-lg border border-slate-800/80">
              {studyCardIds.map((cid, idx) => {
                const c = allCards[cid];
                const ivl = c ? c.honestIvl : 0;
                const isMature = ivl > 30;
                const dotColor = isMature
                  ? 'bg-amber-400 shadow-amber-400/50 shadow-sm'
                  : ivl >= 15
                  ? 'bg-emerald-400'
                  : ivl >= 5
                  ? 'bg-sky-400'
                  : 'bg-slate-600';

                return (
                  <div
                    key={cid}
                    className={`w-5 h-5 rounded-full ${dotColor} flex items-center justify-center text-[9px] font-mono text-slate-950 font-bold cursor-help transition transform hover:scale-125`}
                    title={`Card #${cid}: "${c?.front?.slice(0, 50)}..."\nInterval: ${ivl} days`}
                  >
                    {idx + 1}
                  </div>
                );
              })}
            </div>

            {ready && (
              <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-200">
                ✨ <strong>Mastery-Ready!</strong> All 50 cards exceed 30 days interval. Waiting on teacher delay before graduation ceremony.
              </div>
            )}
          </div>

          {/* Student Needs Breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-900 border border-slate-800 p-3 rounded-lg text-xs">
            <div>
              <span className="text-slate-400">Hunger:</span>
              <div className="font-bold text-slate-200">{selectedChar.needs.hunger}%</div>
            </div>
            <div>
              <span className="text-slate-400">Rest:</span>
              <div className="font-bold text-slate-200">{selectedChar.needs.rest}%</div>
            </div>
            <div>
              <span className="text-slate-400">Leisure:</span>
              <div className="font-bold text-slate-200">{selectedChar.needs.leisure}%</div>
            </div>
            <div>
              <span className="text-slate-400">Composure:</span>
              <div className="font-bold text-slate-200">{selectedChar.needs.composure}%</div>
            </div>
          </div>

          {/* Career Assignment for Masters */}
          {selectedChar.masteredSchools.length > 0 && !selectedChar.career && (
            <div className="bg-slate-900 border border-amber-900/40 p-3 rounded-lg">
              <h4 className="text-xs font-bold text-amber-300 mb-2">Assign Master Career (BR-18: +20 Career Cards)</h4>
              <div className="flex flex-wrap gap-2">
                {(['teacher', 'gardener', 'tamer', 'healer', 'warder', 'alchemist', 'builder', 'adventurer'] as CareerType[]).map(car => (
                  <button
                    key={car}
                    onClick={() => onAssignCareer(selectedChar.id, car)}
                    className="px-2.5 py-1 bg-amber-600/20 hover:bg-amber-600/40 text-amber-200 border border-amber-500/30 rounded text-xs capitalize transition"
                  >
                    {car}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="col-span-2 text-center text-slate-500 py-12 text-xs">
          No students enrolled yet. Open the Recruitment tab to admit young apprentices!
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

  // Compute free young cards vs needed (GDD Section 12.3)
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
    { name: 'Lyra Starling', personality: 'Bookish' as const, traits: ['Star-Touched', 'Well-Read'], bio: 'Fascinated by ancient astronomical charts and celestial runes.' }
  ];

  return (
    <div className="space-y-5">
      {/* Permanent Enrollment Tracker Widget (BR-23) */}
      <div className="bg-slate-900 border-2 border-indigo-500/40 p-4 rounded-xl shadow-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-2">
            📊 Enrollment Tracker (Rule BR-23)
          </span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${canEnroll ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
            {canEnroll ? '✔ Free Young Cards Available' : '❌ Enrollment Blocked'}
          </span>
        </div>

        <div className="text-sm font-bold text-slate-100 mb-1">
          Free Young Cards: <span className="text-amber-300">{freeYoungCards.length}</span> / {needed} needed for 1 Student
        </div>

        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden mb-3">
          <div
            className={`h-full transition-all ${canEnroll ? 'bg-emerald-400' : 'bg-red-400'}`}
            style={{ width: `${Math.min(100, (freeYoungCards.length / Math.max(1, needed)) * 100)}%` }}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-slate-400">
          <div>Eligible Young Cards (≤30d): <strong className="text-slate-200">{eligibleYoungCards.length}</strong></div>
          <div>Linked to Students: <strong className="text-slate-200">{linkedCardIds.size}</strong></div>
          <div>Enrollment Fee: <strong className="text-amber-300">60 Mana</strong></div>
        </div>
      </div>

      {/* School Tab Selector */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        {(['arcane', 'nature', 'light', 'shadow', 'alchemy'] as SchoolType[]).map(sch => {
          const isUnlocked = (wizard.levels[sch] || 0) >= 5;
          return (
            <button
              key={sch}
              onClick={() => setSelectedSchool(sch)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition flex items-center gap-1.5 ${
                selectedSchool === sch
                  ? 'bg-amber-500/20 border border-amber-500/50 text-amber-200'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>{sch}</span>
              {!isUnlocked && <span className="text-[10px] text-red-400">(Req L5)</span>}
            </button>
          );
        })}
      </div>

      {/* Applicant Board */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {sampleApplicants.map((app, idx) => (
          <div key={idx} className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-sm text-slate-100">{app.name}</span>
                <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                  {app.personality}
                </span>
              </div>
              <p className="text-xs text-slate-400 mb-2">{app.bio}</p>
              <div className="flex flex-wrap gap-1 mb-3">
                {app.traits.map(t => (
                  <span key={t} className="text-[10px] bg-emerald-950/60 border border-emerald-800/40 text-emerald-300 px-1.5 py-0.5 rounded">
                    {t}
                  </span>
                ))}
              </div>
            </div>

            <button
              onClick={() => onEnroll(selectedSchool, app.name, app.personality, app.traits)}
              disabled={!canEnroll || (wizard.levels[selectedSchool] || 0) < 5 || state.mana < 60}
              className="w-full py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 rounded-lg text-xs font-bold transition disabled:opacity-40 disabled:cursor-not-allowed"
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
}> = ({ state, onPlaceRoom }) => {
  const [category, setCategory] = useState<string>('all');
  const roomList = Object.values(ROOM_DEFINITIONS);

  const filtered = roomList.filter(r => category === 'all' || r.category === category || (category === 'grounds' && r.area === 'grounds'));

  return (
    <div className="space-y-4">
      {/* Category Filter */}
      <div className="flex items-center gap-2 flex-wrap border-b border-slate-800 pb-2 text-xs">
        {['all', 'core', 'living', 'arcane', 'nature', 'light', 'shadow', 'alchemy', 'craft', 'rift', 'grounds'].map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`px-3 py-1 rounded text-xs capitalize transition ${
              category === cat
                ? 'bg-amber-500/20 border border-amber-500/50 text-amber-200 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Room Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[500px] overflow-y-auto">
        {filtered.map(room => {
          const canAfford = state.mana >= room.cost.mana;
          return (
            <div key={room.id} className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs text-slate-100">{room.name}</span>
                  <span className="text-[10px] text-slate-400 capitalize">{room.area} ({room.size.join('x')})</span>
                </div>
                <p className="text-[11px] text-slate-400 mb-2 line-clamp-2">{room.description}</p>
                <div className="text-[10px] text-slate-400 font-mono mb-2">
                  Cost: <strong className="text-amber-300">{room.cost.mana}m</strong>
                  {room.cost.timber && ` · ${room.cost.timber}T`}
                  {room.cost.stone && ` · ${room.cost.stone}S`}
                  {room.cost.glass && ` · ${room.cost.glass}G`}
                  {room.cost.cloth && ` · ${room.cost.cloth}C`}
                  {' · '}Build: {room.buildReviews} revs
                </div>
              </div>

              <button
                onClick={() => onPlaceRoom(room.id, room.area)}
                disabled={!canAfford}
                className="w-full py-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-200 border border-indigo-500/30 rounded text-xs font-semibold disabled:opacity-40 transition"
              >
                Construct Plan
              </button>
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
  onDrawDeck: (deck: 'foundation' | SchoolType) => void;
}> = ({ state, onDrawDeck }) => {
  const decks: Array<{ id: 'foundation' | SchoolType; name: string; basePrice: number }> = [
    { id: 'foundation', name: 'Foundation Deck', basePrice: 120 },
    { id: 'arcane', name: 'Arcane Deck', basePrice: 150 },
    { id: 'nature', name: 'Nature Deck', basePrice: 150 },
    { id: 'light', name: 'Light Deck', basePrice: 150 },
    { id: 'shadow', name: 'Shadow Deck', basePrice: 150 },
    { id: 'alchemy', name: 'Alchemy Deck', basePrice: 150 }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold text-amber-200">The Grimoire Card Draft (Draw 3, Keep 1)</h3>
        <p className="text-xs text-slate-400">
          Rule BR-26: Draw rare room blueprints, creature lures, furniture patterns, and instant boons.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {decks.map(d => {
          const recentDraws = state.draftHistory[d.id] || 0;
          const currentPrice = Math.round(d.basePrice * Math.pow(1.15, recentDraws));
          const canAfford = state.mana >= currentPrice;

          return (
            <div key={d.id} className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col justify-between">
              <div>
                <h4 className="font-bold text-xs text-slate-100 mb-1">{d.name}</h4>
                <p className="text-[11px] text-slate-400 mb-2">
                  Draw 3 cards, keep 1. Price increases with recent draws, relaxing over 7 days.
                </p>
                <div className="text-xs font-mono text-amber-300 mb-3">
                  Current Cost: {currentPrice} Mana
                </div>
              </div>
              <button
                onClick={() => onDrawDeck(d.id)}
                disabled={!canAfford}
                className="w-full py-2 bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 rounded-lg text-xs font-bold disabled:opacity-40 transition"
              >
                Draft From Deck
              </button>
            </div>
          );
        })}
      </div>

      {/* Cards in Hand */}
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3">
          Cards in Hand ({state.hand.length}/8)
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {state.hand.map(card => (
            <div key={card.id} className="bg-slate-950 border border-amber-600/40 p-3 rounded-lg flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs text-amber-200">{card.name}</span>
                  <span className="text-[9px] uppercase px-1 rounded bg-amber-500/20 text-amber-300">{card.rarity}</span>
                </div>
                <div className="text-[11px] text-slate-400">{card.description}</div>
              </div>
              <button className="mt-3 w-full py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 rounded text-xs font-semibold">
                Play Card
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 6. ALCHEMY & BREWING PANEL
// ==========================================
export const AlchemyPanel: React.FC<{
  state: FullGameState;
  onBrewPotion: (potionId: string) => void;
}> = ({ state, onBrewPotion }) => {
  const { resources, potions } = state;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold text-amber-200">The Alchemy Laboratory</h3>
        <p className="text-xs text-slate-400">
          GDD Section 24: Combine 3 distinct ingredients into potent elixirs. Discovered recipes brew at workstations.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {potions.map(rec => {
          const count = resources.potions[rec.id] || 0;
          return (
            <div key={rec.id} className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs text-slate-100">{rec.name}</span>
                  <span className="text-xs font-bold text-amber-400">x{count} Owned</span>
                </div>
                <div className="text-[11px] text-slate-400 mb-2">{rec.effect}</div>
                <div className="text-[10px] text-slate-500 font-mono mb-3">
                  Recipe: {rec.ingredients.join(' + ')}
                </div>
              </div>
              <button
                onClick={() => onBrewPotion(rec.id)}
                className="w-full py-1.5 bg-orange-600/20 hover:bg-orange-600/40 text-orange-200 border border-orange-500/30 rounded text-xs font-semibold transition"
              >
                Brew Elixir ({rec.reviewsToBrew} revs)
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ==========================================
// 7. RIFT EXPEDITION PLANNER PANEL
// ==========================================
export const RiftPanel: React.FC<{
  state: FullGameState;
  onLaunchExpedition: (destId: string, teamIds: number[]) => void;
}> = ({ state, onLaunchExpedition }) => {
  const { characters, expeditions, cardSets, allCards } = state;
  const [selectedDestId, setSelectedDestId] = useState<string>('mossy_hollow');
  const [selectedHeroIds, setSelectedHeroIds] = useState<number[]>([]);

  const dest = RIFT_DESTINATIONS[selectedDestId];
  const activeExpedition = expeditions.find(e => e.state === 'active');

  const adventurers = characters.filter(c => c.career === 'adventurer');

  // Calculate party skill (mean ivl)
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
        <h3 className="text-sm font-bold text-amber-200">The Otherworldly Rift (Rule BR-27 to BR-33)</h3>
        <p className="text-xs text-slate-400">
          Party Skill is the true average review interval of your adventurers cards. Safe odds are capped; nobody ever dies.
        </p>
      </div>

      {activeExpedition ? (
        <div className="bg-purple-950/60 border border-purple-500/40 p-4 rounded-xl text-center space-y-2">
          <div className="text-sm font-bold text-purple-200">Expedition in Progress</div>
          <p className="text-xs text-slate-300">
            Destination: {RIFT_DESTINATIONS[activeExpedition.destinationId]?.name} · Progress: {activeExpedition.progressReviews} / {activeExpedition.requiredReviews} reviews
          </p>
          <div className="w-full max-w-md mx-auto bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-purple-400 h-full transition-all"
              style={{ width: `${Math.min(100, (activeExpedition.progressReviews / activeExpedition.requiredReviews) * 100)}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Destination Selector */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-300 uppercase">1. Select Destination</h4>
            {Object.values(RIFT_DESTINATIONS).map(d => {
              const isSelected = d.id === selectedDestId;
              return (
                <div
                  key={d.id}
                  onClick={() => setSelectedDestId(d.id)}
                  className={`p-3 rounded-lg border cursor-pointer transition ${
                    isSelected ? 'bg-amber-950/50 border-amber-500' : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                    <span>{d.name} ({d.tier.toUpperCase()})</span>
                    <span className="text-amber-400">{d.cost} Mana</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">{d.description}</div>
                  <div className="text-[10px] text-slate-500 font-mono mt-1">
                    Req Skill: {d.skillNeeded}d · Safe: {d.safeOdds}% · Best: {d.bestOdds}% · {d.reviews} reviews
                  </div>
                </div>
              );
            })}
          </div>

          {/* Team Selection & Chance Meter */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-300 uppercase">2. Select Adventurers (1-3)</h4>
            <div className="space-y-2">
              {adventurers.length === 0 ? (
                <div className="text-xs text-slate-500 p-3 bg-slate-900 rounded border border-slate-800">
                  No Adventurers available. Graduate Masters in the Roster and assign them the Adventurer career.
                </div>
              ) : (
                adventurers.map(adv => {
                  const isSelected = selectedHeroIds.includes(adv.id);
                  return (
                    <div
                      key={adv.id}
                      onClick={() => toggleHero(adv.id)}
                      className={`p-2.5 rounded border text-xs cursor-pointer flex items-center justify-between transition ${
                        isSelected ? 'bg-purple-950/50 border-purple-500 text-purple-200' : 'bg-slate-900 border-slate-800 text-slate-300'
                      }`}
                    >
                      <span className="font-semibold">{adv.name}</span>
                      <span className="text-[10px] text-slate-400">
                        {adv.status === 'away' ? 'On Expedition' : adv.injury ? 'Injured' : 'Ready'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Semicircular Chance Meter Display */}
            <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl text-center space-y-2">
              <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                Chance of Safe Return
              </div>
              <div className="text-3xl font-black text-amber-300">
                {chance}%
              </div>
              <div className="text-[11px] text-slate-400 space-y-0.5">
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
              onClick={() => onLaunchExpedition(dest.id, selectedHeroIds)}
              disabled={selectedHeroIds.length === 0 || state.mana < dest.cost}
              className="w-full py-2.5 bg-gradient-to-r from-amber-600 to-purple-600 hover:from-amber-500 hover:to-purple-500 text-slate-950 font-bold rounded-lg text-xs shadow-lg transition disabled:opacity-40"
            >
              Step Through the Rift ({dest.cost} Mana)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
