/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Wizard's Study pickers (UI declutter pass):
 *  - PonderOrbPicker: one "Ponder Orb" button opens this; pick the school to study.
 *    Same queue rules/costs as the old five buttons (engine.queueWizardSession decides).
 *  - GrimoireBook: one "Grimoire" button opens this book of known spells, with Cast.
 */

import React from 'react';
import { BookOpen, Leaf, Sun, Moon, FlaskConical, Sparkles, Lock, Clock } from 'lucide-react';
import { FullGameState, SchoolType } from '../types/ankicaster';
import { SPELL_DEFINITIONS } from '../data/content';
import { getWizardLevelRequirements } from '../utils/formulas';

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

/** Pure: the option row for one school, mirroring the old per-school button logic. */
export function orbOption(state: FullGameState, sch: SchoolType) {
  const { wizard, mana } = state;
  const currentLvl = wizard.levels[sch] || 0;
  const activeForSchool = wizard.activeSession && wizard.activeSession.school === sch && wizard.activeSession.kind === 'orb' ? 1 : 0;
  const queuedForSchool = (wizard.queuedSessions || []).filter(s => s.school === sch && s.kind === 'orb').length;
  const targetLvl = currentLvl + activeForSchool + queuedForSchool + 1;
  const isMax = targetLvl > 10;
  const req = getWizardLevelRequirements(Math.min(10, targetLvl));
  const totalSessions = (wizard.activeSession ? 1 : 0) + (wizard.queuedSessions ? wizard.queuedSessions.length : 0);
  const canAfford = mana >= req.mana;
  const queueFull = totalSessions >= 5;
  const canQueue = !isMax && canAfford && !queueFull;
  const reason = isMax ? 'Level 10 reached or queued' : queueFull ? 'Queue full (5 sessions)' : !canAfford ? `Needs ${req.mana} mana` : '';
  return { currentLvl, targetLvl, isMax, req, canQueue, reason, verb: totalSessions > 0 ? 'Queue' : 'Ponder' };
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
  return (
    <Backdrop onClose={onClose} label="Ponder Orb">
      <div className="bg-slate-900 border border-purple-500/50 rounded-2xl w-full max-w-md shadow-2xl" data-testid="ponder-picker">
        <div className="px-5 py-3 border-b border-slate-800 bg-gradient-to-r from-purple-900/50 to-transparent rounded-t-2xl flex items-center justify-between">
          <h3 className="font-bold text-purple-200 flex items-center gap-2"><Sparkles className="w-4 h-4 text-purple-400" /> Ponder Orb</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 text-[13px] px-2 min-h-[32px]">Close</button>
        </div>
        <div className="p-4 space-y-2">
          <p className="text-[13px] text-slate-400">
            {s ? 'Pick a school to queue next.' : 'Pick a school to study.'}{' '}
            <span title="Each level takes 25 × level honest reviews and 80 × level mana. Pauses safely during breaks.">ⓘ</span>
          </p>
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
                    title={o.reason || `${o.verb} level ${o.targetLvl}: ${o.req.mana} mana, ${o.req.reviews} reviews`}
                    className="w-28 min-h-[36px] px-2 py-1 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-purple-100 text-[12px] font-bold disabled:opacity-40 disabled:cursor-not-allowed leading-tight"
                  >
                    {o.verb} Lv {o.targetLvl}
                    <span className="block font-mono font-normal text-purple-300">{o.req.mana}m · {o.req.reviews}r</span>
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
  onClose: () => void;
}> = ({ state, onCast, onClose }) => {
  const { wizard, mana } = state;
  const spells = wizard.knownSpells.map(id => SPELL_DEFINITIONS[id]).filter(Boolean);
  const half = Math.ceil(spells.length / 2);
  const pages = [spells.slice(0, half), spells.slice(half)];

  const Page: React.FC<{ list: typeof spells; side: 'left' | 'right' }> = ({ list, side }) => (
    <div className={`flex-1 p-4 space-y-3 ${side === 'left' ? 'border-r border-[#c9b78f] shadow-[inset_-12px_0_16px_-12px_rgba(0,0,0,0.35)]' : 'shadow-[inset_12px_0_16px_-12px_rgba(0,0,0,0.35)]'}`}>
      {list.map(sp => {
        const cd = wizard.spellCooldowns[sp.id];
        const disabled = mana < sp.manaCost || !!cd;
        return (
          <div key={sp.id} className="border-b border-dashed border-[#c9b78f] pb-2.5" data-spell={sp.id}>
            <div className="flex items-center gap-2">
              <SchoolGlyph school={sp.school} />
              <span className="font-bold text-[14px]">{sp.name}</span>
              <span className="text-[11px] px-1.5 rounded bg-[#2A2533]/10 font-mono">{sp.tier}</span>
            </div>
            <p className="text-[13px] leading-snug mt-1 text-[#4a4152]">{sp.effect}</p>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[12px] font-mono text-[#7a4b12]">{sp.manaCost} mana{cd ? ` · ${cd}r cooldown` : ''}</span>
              <button
                onClick={() => onCast(sp.id)}
                disabled={disabled}
                title={cd ? `Cooling down: ${cd} reviews` : mana < sp.manaCost ? `Needs ${sp.manaCost} mana` : `Cast ${sp.name}`}
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
          <div className="rounded-xl bg-[#F4EBD9] text-[#2A2533] min-h-[300px] max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between px-4 pt-3">
              <h3 className="font-bold text-[16px] tracking-wide">📖 Grimoire of {wizard.name}</h3>
              <button onClick={onClose} className="text-[13px] font-bold px-2 min-h-[32px] hover:underline">Close</button>
            </div>
            {spells.length === 0 ? (
              <div className="p-8 text-center text-[13px] text-[#4a4152] flex flex-col items-center gap-2">
                <Lock className="w-6 h-6" />
                No spells inscribed yet.
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row">
                <Page list={pages[0]} side="left" />
                {pages[1].length > 0 && <Page list={pages[1]} side="right" />}
              </div>
            )}
          </div>
        </div>
      </div>
    </Backdrop>
  );
};
