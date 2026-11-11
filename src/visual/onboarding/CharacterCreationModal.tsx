/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Minimal Character Creation & "Choose Your Look" Modal
 * Implements Section 10.2 & 10.5 of Visual Overhaul Addendum:
 * - Minimal creation screen: name, title, pronouns, robe colour, hat, founding school
 * - For existing saves without appearance: opens in "Choose your look" mode without resetting save progress.
 */

import React, { useState } from 'react';
import { SchoolType } from '../../types/ankicaster';
import { HeadmasterChoices, DEFAULT_HEADMASTER_CHOICES } from './freshStart';
import { PALETTE } from '../sprites/forge/palettes';
import { Sparkles, Check, Wand2 } from 'lucide-react';

interface CharacterCreationModalProps {
  isOpen: boolean;
  isExistingSave: boolean;
  initialValues?: Partial<HeadmasterChoices>;
  onComplete: (choices: HeadmasterChoices) => void;
  onClose?: () => void;
}

export const CharacterCreationModal: React.FC<CharacterCreationModalProps> = ({
  isOpen,
  isExistingSave,
  initialValues,
  onComplete,
  onClose
}) => {
  const [choices, setChoices] = useState<HeadmasterChoices>({
    ...DEFAULT_HEADMASTER_CHOICES,
    ...initialValues
  });

  if (!isOpen) return null;

  const schools: Array<{ id: SchoolType; name: string; color: string; desc: string }> = [
    { id: 'nature', name: 'Nature', color: '#4E8B3A', desc: 'Vibrant living groves, fauna care, and organic essence.' },
    { id: 'arcane', name: 'Arcane', color: '#6B4FBB', desc: 'Cosmic star charts, glyph scribing, and raw mana mastery.' },
    { id: 'light', name: 'Light', color: '#E8C547', desc: 'Solar radiance, sanctum purity, and restorative grace.' },
    { id: 'shadow', name: 'Shadow', color: '#2F3A73', desc: 'Subtle veils, hush runes, and protective wards.' },
    { id: 'alchemy', name: 'Alchemy', color: '#B5651D', desc: 'Athanors, transmutation, and reactive reagents.' }
  ];

  const titles = ['Wizard', 'Witch', 'Mage', 'Sorcerer', 'Sorceress', 'Warlock', 'Magus'];
  const pronounList = ['they/them', 'she/her', 'he/him'];
  const hats = ['pointed', 'wide', 'circlet', 'none'];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!choices.name.trim()) return;
    onComplete(choices);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-slate-900 border-2 border-amber-500/40 rounded-3xl p-6 md:p-8 shadow-2xl text-slate-100 my-8">
        <div className="text-center mb-6">
          <div className="inline-flex p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mb-3">
            <Wand2 className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold tracking-wide text-amber-300">
            {isExistingSave ? 'Choose Your Headmaster Look' : 'Create Your Headmaster'}
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            {isExistingSave
              ? 'Customize your on-screen paper doll sprite. Your existing Academy progress is preserved.'
              : 'Found your magic academy and design your personal wizard.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name & Title */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Headmaster Name
              </label>
              <input
                type="text"
                required
                maxLength={24}
                value={choices.name}
                onChange={e => setChoices(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Morgan"
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white font-medium focus:outline-none focus:border-amber-400 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Title
              </label>
              <select
                value={choices.title}
                onChange={e => setChoices(prev => ({ ...prev, title: e.target.value }))}
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white font-medium focus:outline-none focus:border-amber-400 transition"
              >
                {titles.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Pronouns */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Pronouns
            </label>
            <div className="flex gap-2">
              {pronounList.map(p => (
                <button
                  type="button"
                  key={p}
                  onClick={() => setChoices(prev => ({ ...prev, pronouns: p }))}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition ${
                    choices.pronouns === p
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Robe Colour (12 swatches) */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Robe Colour
            </label>
            <div className="grid grid-cols-6 gap-2">
              {PALETTE.robes.map(r => (
                <button
                  type="button"
                  key={r.color}
                  onClick={() => setChoices(prev => ({ ...prev, robeColor: r.color }))}
                  style={{ backgroundColor: r.color }}
                  title={r.name}
                  className={`h-9 rounded-xl flex items-center justify-center border-2 transition ${
                    choices.robeColor === r.color ? 'border-white scale-105 shadow-md' : 'border-transparent opacity-80 hover:opacity-100'
                  }`}
                >
                  {choices.robeColor === r.color && <Check className="w-4 h-4 text-white drop-shadow" />}
                </button>
              ))}
            </div>
          </div>

          {/* Hat Choice */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Headwear
            </label>
            <div className="grid grid-cols-4 gap-2">
              {hats.map(h => (
                <button
                  type="button"
                  key={h}
                  onClick={() => setChoices(prev => ({ ...prev, hat: h }))}
                  className={`py-2 rounded-xl text-xs font-semibold capitalize border transition ${
                    choices.hat === h
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>

          {/* Founding School (Fresh start only) */}
          {!isExistingSave && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Founding School (Suggested First Focus)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {schools.map(s => (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => setChoices(prev => ({ ...prev, foundingSchool: s.id, robeColor: s.color }))}
                    className={`p-3 text-left rounded-xl border transition flex flex-col justify-between ${
                      choices.foundingSchool === s.id
                        ? 'bg-slate-800 border-amber-400 shadow-md ring-1 ring-amber-400/40'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm" style={{ color: s.color }}>
                        {s.name}
                      </span>
                      {s.id === 'nature' && (
                        <span className="text-[10px] bg-emerald-950/80 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-800">
                          Suggested
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 leading-tight">
                      {s.desc}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-2 flex justify-end gap-3">
            {isExistingSave && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 font-medium transition"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="flex items-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-bold shadow-lg transition transform active:scale-95"
            >
              <Sparkles className="w-5 h-5" />
              <span>{isExistingSave ? 'Apply Look' : 'Enter Academy'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
