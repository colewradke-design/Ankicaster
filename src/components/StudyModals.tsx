/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Wizard's Study pickers (UI declutter pass):
 *  - PonderOrbPicker: one "Ponder Orb" button opens this; pick the school to study.
 *    Same queue rules/costs as the old five buttons (engine.queueWizardSession decides).
 *  - GrimoireBook: one "Grimoire" button opens this book of known spells, with Cast.
 */

import React, { useState } from 'react';
import { BookOpen, Leaf, Sun, Moon, FlaskConical, Sparkles, Lock, Clock } from 'lucide-react';
import { FullGameState, SchoolType } from '../types/ankicaster';
import { SPELL_DEFINITIONS, SPELLBOOK_DEFINITIONS } from '../data/content';
import {
  computeStudyLevel,
  maxStudySessionsForWizard,
  SPELL_TIER_MIN_LEVEL,
  wizardOrbQuote
} from '../utils/formulas';
import { isRoomUnfinished } from '../utils/requiredFurniture';

export const SCHOOLS: SchoolType[] = ['arcane', 'nature', 'light', 'shadow', 'alchemy'];

export const SchoolGlyph: React.FC<{ school: string; className?: string }> = ({ school, className = 'w-4 h-4' }) =>
  school === 'arcane' ? <BookOpen className={`${className} text-purple-400`} /> :
  school === 'nature' ? <Leaf className={`${className} text-emerald-400`} /> :
  school === 'light' ? <Sun className={`${className} text-amber-400`} /> :
  school === 'shadow' ? <Moon className={`${className} text-indigo-400`} /> :
  <FlaskConical className={`${className} text-orange-400`} />;

function buffText(sch: SchoolType, lvl: number): string {
  const n = Math.max(0, lvl - 5);
  return sch === 'arcane' ? `+${n * 2}% Mana` :
    sch === 'nature' ? `+${n * 3}% Food, Herbs, Taming` :
    sch === 'light' ? `+${n * 3}% Recovery & Teaching` :
    sch === 'shadow' ? `-${n * 3}% Veil & Hazards` :
    `-${n * 3}% Build, +${n * 3}% Potions`;
}

/** Pure: the option row for one school, mirroring the engine's queue cost & Study tier cap. */
export function orbOption(state: FullGameState, sch: SchoolType) {
  const { wizard, mana } = state;
  const quote = wizardOrbQuote({
    foundingSchool: wizard.foundingSchool,
    levels: wizard.levels,
    active: wizard.activeSession,
    queued: wizard.queuedSessions,
    school: sch
  });
  const { targetLvl, isMax, req, free } = {
    targetLvl: quote.targetLevel,
    isMax: quote.capped,
    free: quote.free,
    req: { mana: quote.mana, reviews: quote.reviews }
  };
  const currentLvl = wizard.levels[sch] || 0;
  const studyLevel = computeStudyLevel(wizard.levels);
  const maxSessions = maxStudySessionsForWizard(studyLevel);
  const totalSessions = (wizard.activeSession ? 1 : 0) + (wizard.queuedSessions ? wizard.queuedSessions.length : 0);
  const canAfford = mana >= req.mana;
  const queueFull = totalSessions >= maxSessions;
  const canQueue = !isMax && canAfford && !queueFull;
  const reason = isMax
    ? 'Level 10 reached or queued'
    : queueFull
    ? `Queue full (${maxSessions} max at Study Lv ${studyLevel})`
    : !canAfford
    ? `Needs ${req.mana} mana`
    : '';
  return { currentLvl, targetLvl, isMax, req, free, canQueue, queueFull, maxSessions, studyLevel, reason, verb: totalSessions > 0 ? 'Queue' : 'Ponder' };
}

const GRIMOIRE_TIER_REVIEWS: Record<string, number> = {
  T1: 25,
  T2: 50,
  T3: 75,
  T4: 100,
  Cap: 150
};

/** Pure: the study option for an unlearned grimoire spell. */
export function grimoireStudyOption(state: FullGameState, spellId: string) {
  const sp = SPELL_DEFINITIONS[spellId];
  const { wizard, mana } = state;
  const studyLevel = computeStudyLevel(wizard.levels);
  const maxSessions = maxStudySessionsForWizard(studyLevel);
  const totalSessions = (wizard.activeSession ? 1 : 0) + (wizard.queuedSessions ? wizard.queuedSessions.length : 0);
  const hasL3Library = (state.rooms || []).some(
    r => r.defId === 'library' && r.state === 'built' && !isRoomUnfinished(r) && (r.level || 1) >= 3
  );
  const minSchoolLevel = SPELL_TIER_MIN_LEVEL[sp.tier] || 1;
  const schoolLevel = wizard.levels[sp.school] || 0;
  const meetsLevel = schoolLevel >= minSchoolLevel;
  const alreadyStudying =
    (wizard.activeSession?.kind === 'grimoire' && wizard.activeSession.spellId === sp.id) ||
    (wizard.queuedSessions || []).some(q => q.kind === 'grimoire' && q.spellId === sp.id);
  const manaCost = Math.max(10, Math.round(sp.manaCost * (hasL3Library ? 0.9 : 1)));
  const reviews = GRIMOIRE_TIER_REVIEWS[sp.tier] || 50;
  const canAfford = mana >= manaCost;
  const queueFull = totalSessions >= maxSessions;
  const canStudy = meetsLevel && !alreadyStudying && canAfford && !queueFull;
  const reason = !meetsLevel
    ? `Requires ${sp.school[0].toUpperCase() + sp.school.slice(1)} Lv ${minSchoolLevel}`
    : alreadyStudying
    ? 'Already in study queue'
    : queueFull
    ? `Queue full (${maxSessions} max at Study Lv ${studyLevel})`
    : !canAfford
    ? `Needs ${manaCost} mana`
    : '';
  return {
    spell: sp,
    minSchoolLevel,
    schoolLevel,
    meetsLevel,
    alreadyStudying,
    manaCost,
    discounted: manaCost < sp.manaCost,
    reviews,
    canAfford,
    queueFull,
    canStudy,
    verb: totalSessions > 0 ? 'Queue' : 'Study',
    reason
  };
}

const Backdrop: React.FC<{ onClose: () => void; children: React.ReactNode; label: string }> = ({ onClose, children, label }) => (
  <div
    className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
    onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    role="dialog"
    aria-label={label}
  >
    {children}
  </div>
);

export const PonderOrbPicker: React.FC<{
  state: FullGameState;
  onPick: (school: SchoolType) => void;
  onClose: () => void;
}> = ({ state, onPick, onClose }) => {
  const s = state.wizard.activeSession;
  const founding = state.wizard.foundingSchool;
  const studyLevel = computeStudyLevel(state.wizard.levels);
  const maxSessions = maxStudySessionsForWizard(studyLevel);
  const totalSessions = (state.wizard.activeSession ? 1 : 0) + (state.wizard.queuedSessions?.length || 0);
  return (
    <Backdrop onClose={onClose} label="Ponder Orb">
      <div className="bg-slate-900 border border-purple-500/50 rounded-2xl w-full max-w-md shadow-2xl" data-testid="ponder-picker">
        <div className="px-5 py-3 border-b border-slate-800 bg-gradient-to-r from-purple-900/50 to-transparent rounded-t-2xl flex items-center justify-between">
          <h3 className="font-bold text-purple-200 flex items-center gap-2"><Sparkles className="w-4 h-4 text-purple-400" /> Ponder Orb</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 text-[13px] px-2 min-h-[32px]">Close</button>
        </div>
        <div className="p-4 space-y-2">
          <div className="flex items-center justify-between text-[12px] text-slate-400">
            <span>
              {s ? 'Pick a school to queue next.' : 'Pick a school to study.'}{' '}
              <span title="Each level takes 25 × level honest reviews and 80 × level mana. Pauses safely during breaks.">ⓘ</span>
            </span>
            <span className="font-mono text-purple-300" title="Study Lv 1: 1 queued (Lv 15+: 2 queued, Lv 30+: 4 queued)">
              Study Lv {studyLevel} · {totalSessions}/{maxSessions}
            </span>
          </div>
          {SCHOOLS.map(sch => {
            const o = orbOption(state, sch);
            return (
              <div
                key={sch}
                data-school={sch}
                className={`flex items-center gap-3 p-2.5 rounded-xl border ${founding === sch ? 'border-purple-500/60 bg-purple-950/30' : 'border-slate-800 bg-slate-950/50'}`}
                title={o.currentLvl >= 6 ? `Passive buff: ${buffText(sch, o.currentLvl)}` : o.currentLvl >= 5 ? 'You can enroll students in this school' : 'Level 5 lets you teach this school. Its rooms are found in the Magic deck.'}
              >
                <SchoolGlyph school={sch} className="w-5 h-5" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold text-slate-100 capitalize">{sch}</div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5 mt-1 overflow-hidden">
                    <div className="h-full bg-amber-400" style={{ width: `${o.currentLvl * 10}%` }} />
                  </div>
                </div>
                <span className="text-[12px] text-amber-300 font-bold w-12 text-right">Lv {o.currentLvl}</span>
                {o.isMax ? (
                  <span className="text-[12px] text-amber-400 font-bold w-28 text-center">Max</span>
                ) : (
                  <button
                    onClick={() => onPick(sch)}
                    disabled={!o.canQueue}
                    data-testid={o.free ? 'free-ponder' : undefined}
                    data-mana={o.req.mana}
                    title={o.reason || (o.free
                      ? `Free ponder to level ${o.targetLvl}: ${o.req.reviews} honest reviews`
                      : `${o.verb} level ${o.targetLvl}: ${o.req.mana} mana, ${o.req.reviews} reviews`)}
                    className="w-28 min-h-[36px] px-2 py-1 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-purple-100 text-[12px] font-bold disabled:opacity-40 disabled:cursor-not-allowed leading-tight"
                  >
                    {o.verb} Lv {o.targetLvl}
                    <span className="block font-mono font-normal text-purple-300">{o.free ? 'Free' : `${o.req.mana}m`} · {o.req.reviews}r</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Backdrop>
  );
};

export const GrimoireBook: React.FC<{
  state: FullGameState;
  onCast: (spellId: string) => void;
  onStudySpell?: (school: SchoolType, spellId: string) => void;
  onClose: () => void;
}> = ({ state, onCast, onStudySpell, onClose }) => {
  const [tab, setTab] = useState<'known' | 'unlearned'>('known');
  const { wizard, mana } = state;
  const spells = wizard.knownSpells.map(id => SPELL_DEFINITIONS[id]).filter(Boolean);
  const unlearnedSpells = Object.values(SPELL_DEFINITIONS).filter(sp => !wizard.knownSpells.includes(sp.id));
  const half = Math.ceil(spells.length / 2);
  const pages = [spells.slice(0, half), spells.slice(half)];

  const hasL3Study = (state.rooms || []).some(
    r => r.defId === 'wizard_study' && r.state === 'built' && !isRoomUnfinished(r) && (r.level || 1) >= 3
  );

  const Page: React.FC<{ list: typeof spells; side: 'left' | 'right' }> = ({ list, side }) => (
    <div className={`flex-1 p-4 space-y-3 ${side === 'left' ? 'border-r border-[#c9b78f] shadow-[inset_-12px_0_16px_-12px_rgba(0,0,0,0.35)]' : 'shadow-[inset_12px_0_16px_-12px_rgba(0,0,0,0.35)]'}`}>
      {list.map(sp => {
        const cd = wizard.spellCooldowns[sp.id];
        const effectiveCost = Math.max(1, Math.round(sp.manaCost * (hasL3Study ? 0.9 : 1)));
        const disabled = mana < effectiveCost || !!cd;
        return (
          <div key={sp.id} className="border-b border-dashed border-[#c9b78f] pb-2.5" data-spell={sp.id}>
            <div className="flex items-center gap-2">
              <SchoolGlyph school={sp.school} />
              <span className="font-bold text-[14px]">{sp.name}</span>
              <span className="text-[11px] px-1.5 rounded bg-[#2A2533]/10 font-mono">{sp.tier}</span>
            </div>
            <p className="text-[13px] leading-snug mt-1 text-[#4a4152]">{sp.effect}</p>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[12px] font-mono text-[#7a4b12]">
                {effectiveCost} mana
                {effectiveCost < sp.manaCost && <span className="text-[#5c390d]/70 line-through ml-1">{sp.manaCost}</span>}
                {cd ? ` · ${cd}r cooldown` : ''}
              </span>
              <button
                onClick={() => onCast(sp.id)}
                disabled={disabled}
                title={cd ? `Cooling down: ${cd} reviews` : mana < effectiveCost ? `Needs ${effectiveCost} mana` : `Cast ${sp.name}${effectiveCost < sp.manaCost ? ' (Lv 3 Study −10%)' : ''}`}
                className="min-h-[32px] px-3 py-1 rounded-lg bg-[#2A2533] text-[#F4EBD9] text-[12px] font-bold hover:bg-[#3b3446] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {cd ? <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{cd}r</span> : 'Cast'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <Backdrop onClose={onClose} label="Grimoire">
      <div className="w-full max-w-2xl" data-testid="grimoire-book">
        <div className="rounded-2xl bg-[#5a2e1a] p-2.5 shadow-2xl border-2 border-[#3a1d10]">
          <div className="rounded-xl bg-[#F4EBD9] text-[#2A2533] min-h-[300px] max-h-[75vh] overflow-y-auto">
            <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-[#c9b78f]/70">
              <h3 className="font-bold text-[16px] tracking-wide">📖 Grimoire of {wizard.name}</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTab('known')}
                  className={`px-2.5 py-1 rounded-lg text-[12px] font-bold transition ${tab === 'known' ? 'bg-[#2A2533] text-[#F4EBD9]' : 'bg-[#2A2533]/10 text-[#2A2533] hover:bg-[#2A2533]/20'}`}
                >
                  Inscribed ({spells.length})
                </button>
                <button
                  onClick={() => setTab('unlearned')}
                  data-testid="grimoire-study-tab"
                  className={`px-2.5 py-1 rounded-lg text-[12px] font-bold transition ${tab === 'unlearned' ? 'bg-[#2A2533] text-[#F4EBD9]' : 'bg-[#2A2533]/10 text-[#2A2533] hover:bg-[#2A2533]/20'}`}
                >
                  Study Grimoires ({unlearnedSpells.length})
                </button>
                <button onClick={onClose} className="text-[13px] font-bold px-2 min-h-[32px] hover:underline">Close</button>
              </div>
            </div>
            {tab === 'known' ? (
              spells.length === 0 ? (
                <div className="p-8 text-center text-[13px] text-[#4a4152] flex flex-col items-center gap-2">
                  <Lock className="w-6 h-6" />
                  No spells inscribed yet.
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row">
                  <Page list={pages[0]} side="left" />
                  {pages[1].length > 0 && <Page list={pages[1]} side="right" />}
                </div>
              )
            ) : (
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="grimoire-unlearned-list">
                {unlearnedSpells.length === 0 ? (
                  <div className="col-span-full py-6 text-center text-[13px] text-[#4a4152]">
                    All Academy spells have been inscribed!
                  </div>
                ) : (
                  unlearnedSpells.map(sp => {
                    const opt = grimoireStudyOption(state, sp.id);
                    return (
                      <div key={sp.id} className="border border-[#c9b78f] rounded-xl p-3 bg-[#f9f3e6] flex flex-col justify-between gap-2" data-study-spell={sp.id}>
                        <div>
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold text-[13px] flex items-center gap-1.5">
                              <SchoolGlyph school={sp.school} className="w-3.5 h-3.5" />
                              {sp.name}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${opt.meetsLevel ? 'bg-emerald-800/15 text-emerald-900' : 'bg-rose-800/15 text-rose-900'}`}>
                              {sp.school} Lv {opt.minSchoolLevel}+
                            </span>
                          </div>
                          <p className="text-[12px] text-[#4a4152] mt-1 leading-snug">{sp.effect}</p>
                        </div>
                        <div className="flex items-center justify-between pt-1 border-t border-dashed border-[#c9b78f]">
                          <span className="text-[11px] font-mono text-[#7a4b12]">
                            {opt.manaCost}m{opt.discounted ? ' (−10% Lib)' : ''} · {opt.reviews}r
                          </span>
                          <button
                            onClick={() => onStudySpell?.(sp.school, sp.id)}
                            disabled={!onStudySpell || !opt.canStudy}
                            title={opt.reason || `${opt.verb} ${sp.name}`}
                            className="min-h-[30px] px-2.5 py-1 rounded-lg bg-[#2A2533] text-[#F4EBD9] text-[11px] font-bold hover:bg-[#3b3446] disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {opt.alreadyStudying ? 'Queued' : opt.verb}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
            {(state.spellbooks?.length || 0) > 0 && (
              <div className="px-4 py-3 border-t border-[#c9b78f] bg-[#efe2c6]" data-testid="grimoire-spellbook-shelf">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#5c390d] mb-1.5">
                  Bound Spellbooks ({state.spellbooks.length}/21)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {state.spellbooks.map(sbId => {
                    const sb = SPELLBOOK_DEFINITIONS[sbId];
                    if (!sb) return null;
                    return (
                      <span
                        key={sbId}
                        title={sb.effect}
                        className="text-[11px] px-2 py-0.5 rounded-lg bg-[#2A2533] text-[#F4EBD9] font-semibold"
                      >
                        T{sb.tier} · {sb.name}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Backdrop>
  );
};
