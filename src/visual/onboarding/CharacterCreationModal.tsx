/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Minimal Character Creation & Welcome Modal
 * Implements Section 10.1, 10.2 & 10.5 of Visual Overhaul Addendum:
 * - Fresh save -> Welcome page (GDD 35.2 Step 0 honesty promise text) -> Create your Headmaster
 * - Save without a look -> "Choose your look"
 */

import React, { useState } from 'react';
import { SchoolType } from '../../types/ankicaster';
import { HeadmasterChoices, DEFAULT_HEADMASTER_CHOICES } from './freshStart';
import { PALETTE } from '../sprites/forge/palettes';
import { HATS, CREATION_HATS, STAFFS, SKIN_TONES, HAIR_COLOURS, HAIR_STYLES, BODY_SHAPES, EYE_COLOURS, FACE_SHAPES, SHOE_KINDS, NAME_SUGGESTIONS, normalizeAppearance } from '../../utils/appearance';
import { HeadmasterPreview } from '../../components/WizardPortrait';
import { Sparkles, Check, ShieldCheck } from 'lucide-react';

interface CharacterCreationModalProps {
  isOpen: boolean;
  isExistingSave: boolean;
  initialValues?: Partial<HeadmasterChoices>;
  onComplete: (choices: HeadmasterChoices, opts?: { skipTutorial?: boolean }) => void;
  onClose?: () => void;
  reduceMotion?: boolean;
}

export const CharacterCreationModal: React.FC<CharacterCreationModalProps> = ({
  isOpen,
  isExistingSave,
  initialValues,
  onComplete,
  onClose,
  reduceMotion
}) => {
  // Step 0 welcome page for fresh saves; existing saves go straight to creation/look customization
  const [step, setStep] = useState<'welcome' | 'create'>(isExistingSave ? 'create' : 'welcome');

  const [choices, setChoices] = useState<HeadmasterChoices>(() => {
    const merged = { ...DEFAULT_HEADMASTER_CHOICES, ...initialValues } as HeadmasterChoices;
    // Older saves may hold tokens ('tone1', 'brown') or miss fields: show valid values
    const look = normalizeAppearance({ ...merged, robeColor: merged.robeColor || DEFAULT_HEADMASTER_CHOICES.robeColor });
    return { ...merged, ...look };
  });
  // Picking a founding school suggests its robe colour only until the player picks a robe
  const [robeTouched, setRobeTouched] = useState(false);
  const [skipTutorial, setSkipTutorial] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customPronouns, setCustomPronouns] = useState('');

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!choices.name.trim()) return;
    onComplete({ ...choices, title: choices.title === 'custom' ? (customTitle.trim().slice(0, 16) || 'Wizard') : choices.title, pronouns: choices.pronouns === 'custom' ? (customPronouns.trim().slice(0, 24) || 'they/them') : choices.pronouns }, { skipTutorial });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3">
      <div className={`relative w-full bg-slate-900 border-2 border-amber-500/40 rounded-3xl shadow-2xl text-slate-100 flex flex-col overflow-hidden ${step === 'welcome' && !isExistingSave ? 'max-w-2xl p-6 md:p-8' : 'max-w-3xl max-h-[100dvh] h-[min(920px,100dvh)]'}`}>
        
        {/* VIEW 1: WELCOME PAGE (GDD 35.2 Step 0 Honesty Promise) */}
        {!isExistingSave && step === 'welcome' ? (
          <div className="space-y-6 text-center">
            <div className="inline-flex p-4 rounded-3xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mb-2">
              <ShieldCheck className="w-12 h-12" />
            </div>

            <h2 className="text-2xl md:text-3xl font-bold tracking-wide text-amber-300">
              Welcome to Ankicaster Academy
            </h2>

            <div className="p-6 bg-slate-950/80 rounded-2xl border border-amber-900/40 text-slate-200 text-sm md:text-base leading-relaxed italic text-left space-y-3 font-serif">
              <p>
                &ldquo;Every honest review you do from today earns your Academy a little mana.
                Again, Hard, Good and Easy are worth exactly the same &mdash; answer however is true.
                Your past reviews don&rsquo;t count, nothing here ever changes your Anki scheduling,
                and taking a break never costs you anything: the Veil keeps your Academy safe while you&rsquo;re away.&rdquo;
              </p>
            </div>

            <p className="text-xs text-slate-400">
              GDD Section 35.2 Step 0 &middot; Honest Spaced-Repetition Magic School Simulator
            </p>

            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => { setSkipTutorial(false); setStep('create'); }}
                className="w-full sm:w-auto px-10 py-3.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-bold shadow-lg transition transform active:scale-95 text-sm"
              >
                Begin
              </button>
              <button
                type="button"
                onClick={() => { setSkipTutorial(true); setStep('create'); }}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-semibold transition"
              >
                Skip Tutorial
              </button>
            </div>
          </div>
        ) : (
          /* VIEW 2: CREATE YOUR HEADMASTER / CHOOSE YOUR LOOK */
          <>
            <div className="shrink-0 flex flex-col items-center gap-2 px-4 pt-4 pb-3 bg-slate-950 border-b border-slate-800" data-testid="look-preview">
              <HeadmasterPreview appearance={choices} reduceMotion={reduceMotion} />
              <div className="text-sm text-center">
                <div className="font-bold text-amber-200">{choices.title} {choices.name || '…'}</div>
                <div className="text-slate-400 text-xs mt-0.5">
                  {HATS.find(h => h.id === choices.hat)?.name} · {PALETTE.robes.find(r => r.color.toUpperCase() === (choices.robeColor || '').toUpperCase())?.name || 'Custom'} robe · {STAFFS.find(st => st.id === choices.staff)?.name} staff
                </div>
              </div>
            </div>
            <div className="px-4 md:px-6 pt-4 text-center">
              <h2 className="text-xl font-bold tracking-wide text-amber-300">
                {isExistingSave ? 'Choose Your Headmaster Look' : 'Create Your Headmaster'}
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                {isExistingSave
                  ? 'Customize your on-screen paper-doll sprite. Your existing Academy progress is preserved.'
                  : 'Establish your identity as founder and headmaster of the Academy.'}
              </p>
            </div>
            <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 pb-6 pt-4 space-y-6">

              {/* Name & Title */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Headmaster Name
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      maxLength={24}
                      value={choices.name}
                      onChange={e => setChoices(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g. Morgan"
                      className="flex-1 px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white font-medium focus:outline-none focus:border-amber-400 transition"
                    />
                    <button
                      type="button"
                      className="px-3 rounded-xl border border-slate-700 text-xs text-slate-300"
                      onClick={() => setChoices(prev => ({ ...prev, name: NAME_SUGGESTIONS[Math.floor(Math.random() * NAME_SUGGESTIONS.length)] }))}
                    >
                      Suggest
                    </button>
                  </div>
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
                    <option value="custom">Custom</option>
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
                  <button
                    type="button"
                    onClick={() => setChoices(prev => ({ ...prev, pronouns: 'custom' }))}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition ${choices.pronouns === 'custom' ? 'bg-amber-500/20 border-amber-400 text-amber-300' : 'bg-slate-950 border-slate-800 text-slate-400'}`}
                  >
                    Custom
                  </button>
                </div>
                {choices.pronouns === 'custom' && (
                  <input value={customPronouns} maxLength={24} onChange={e => setCustomPronouns(e.target.value)} placeholder="pronouns" className="mt-2 w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm" />
                )}
                {choices.title === 'custom' && (
                  <input value={customTitle} maxLength={16} onChange={e => setCustomTitle(e.target.value)} placeholder="Custom title" className="mt-2 w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm" />
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Appearance</span>
                <button
                  type="button"
                  data-testid="randomise-look"
                  className="text-xs px-3 py-1 rounded-lg border border-slate-700 text-slate-300"
                  onClick={() => {
                    setRobeTouched(true);
                    setChoices(prev => ({
                      ...prev,
                      bodyShape: BODY_SHAPES[Math.floor(Math.random() * BODY_SHAPES.length)].id,
                      skin: SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)],
                      hair: HAIR_STYLES[Math.floor(Math.random() * HAIR_STYLES.length)].id,
                      hairColor: HAIR_COLOURS[Math.floor(Math.random() * HAIR_COLOURS.length)].color,
                      eyes: EYE_COLOURS[Math.floor(Math.random() * EYE_COLOURS.length)].color,
                      face: FACE_SHAPES[Math.floor(Math.random() * FACE_SHAPES.length)],
                      shoes: SHOE_KINDS[Math.floor(Math.random() * SHOE_KINDS.length)],
                      hat: CREATION_HATS[Math.floor(Math.random() * CREATION_HATS.length)].id,
                      staff: STAFFS[Math.floor(Math.random() * STAFFS.length)].id
                    }));
                  }}
                >
                  Randomise
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Body shape</label>
                <div className="grid grid-cols-4 gap-2">
                  {BODY_SHAPES.map(b => (
                    <button
                      type="button"
                      key={b.id}
                      data-body={b.id}
                      aria-label={`Body ${b.name}`}
                      aria-pressed={choices.bodyShape === b.id}
                      onClick={() => setChoices(prev => ({ ...prev, bodyShape: b.id }))}
                      className={`py-2 rounded-xl text-xs font-semibold border ${choices.bodyShape === b.id ? 'border-amber-400 text-amber-300 bg-amber-500/20' : 'border-slate-800 text-slate-400'}`}
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Hair style</label>
                <div className="flex items-center gap-2">
                  <button type="button" aria-label="Previous hair" className="px-3 py-2 rounded-lg border border-slate-700" onClick={() => setChoices(prev => {
                    const i = Math.max(0, HAIR_STYLES.findIndex(h => h.id === prev.hair));
                    return { ...prev, hair: HAIR_STYLES[(i + HAIR_STYLES.length - 1) % HAIR_STYLES.length].id };
                  })}>‹</button>
                  <div className="flex-1 text-center text-sm text-amber-200" data-hair={choices.hair}>{HAIR_STYLES.find(h => h.id === choices.hair)?.name || choices.hair}</div>
                  <button type="button" aria-label="Next hair" className="px-3 py-2 rounded-lg border border-slate-700" onClick={() => setChoices(prev => {
                    const i = Math.max(0, HAIR_STYLES.findIndex(h => h.id === prev.hair));
                    return { ...prev, hair: HAIR_STYLES[(i + 1) % HAIR_STYLES.length].id };
                  })}>›</button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Eyes</label>
                <div className="grid grid-cols-6 gap-1.5">
                  {EYE_COLOURS.map((e, i) => (
                    <button
                      type="button"
                      key={e.id}
                      data-eye={e.id}
                      aria-label={`Eyes ${e.name} ${i + 1} of ${EYE_COLOURS.length}`}
                      aria-pressed={choices.eyes === e.color}
                      onClick={() => setChoices(prev => ({ ...prev, eyes: e.color }))}
                      style={{ backgroundColor: e.color }}
                      className={`h-7 rounded-lg border-2 ${choices.eyes === e.color ? 'border-white' : 'border-transparent'}`}
                    />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Face</label>
                  <div className="grid grid-cols-2 gap-1">
                    {FACE_SHAPES.map(f => (
                      <button type="button" key={f} data-face={f} aria-pressed={choices.face === f} onClick={() => setChoices(prev => ({ ...prev, face: f }))} className={`py-1.5 rounded-lg text-xs capitalize border ${choices.face === f ? 'border-amber-400 text-amber-200' : 'border-slate-800 text-slate-400'}`}>{f}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Shoes</label>
                  <div className="grid grid-cols-1 gap-1">
                    {SHOE_KINDS.map(s => (
                      <button type="button" key={s} data-shoes={s} aria-pressed={choices.shoes === s} onClick={() => setChoices(prev => ({ ...prev, shoes: s }))} className={`py-1.5 rounded-lg text-xs capitalize border ${choices.shoes === s ? 'border-amber-400 text-amber-200' : 'border-slate-800 text-slate-400'}`}>{s}</button>
                    ))}
                  </div>
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
                      onClick={() => { setRobeTouched(true); setChoices(prev => ({ ...prev, robeColor: r.color })); }}
                      style={{ backgroundColor: r.color }}
                      title={r.name}
                      className={`h-9 rounded-xl flex items-center justify-center border-2 transition ${
                        (choices.robeColor || '').toUpperCase() === r.color.toUpperCase() ? 'border-white scale-105 shadow-md' : 'border-transparent opacity-80 hover:opacity-100'
                      }`}
                    >
                      {(choices.robeColor || '').toUpperCase() === r.color.toUpperCase() && <Check className="w-4 h-4 text-white drop-shadow" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hat Choice (8, including no hat) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Headwear
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {CREATION_HATS.map(h => (
                    <button
                      type="button"
                      key={h.id}
                      data-hat={h.id}
                      aria-pressed={choices.hat === h.id}
                      onClick={() => setChoices(prev => ({ ...prev, hat: h.id }))}
                      className={`py-2 rounded-xl text-xs font-semibold border transition ${
                        choices.hat === h.id
                          ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      {h.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Skin tone (8) and hair colour (10) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Skin Tone</label>
                  <div className="grid grid-cols-8 gap-1.5">
                    {SKIN_TONES.map((t, i) => (
                      <button
                        type="button"
                        key={t}
                        title={`Tone ${i + 1}`}
                        aria-label={`Skin tone ${i + 1} of ${SKIN_TONES.length}`}
                        aria-pressed={choices.skin === t}
                        onClick={() => setChoices(prev => ({ ...prev, skin: t }))}
                        style={{ backgroundColor: t }}
                        className={`h-7 rounded-lg border-2 transition ${choices.skin === t ? 'border-white scale-105' : 'border-transparent opacity-80 hover:opacity-100'}`}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Hair Colour</label>
                  <div className="grid grid-cols-10 gap-1.5">
                    {HAIR_COLOURS.map(h => (
                      <button
                        type="button"
                        key={h.id}
                        title={h.name}
                        aria-label={`Hair ${h.name}`}
                        aria-pressed={choices.hairColor === h.color}
                        onClick={() => setChoices(prev => ({ ...prev, hairColor: h.color }))}
                        style={{ backgroundColor: h.color }}
                        className={`h-7 rounded-lg border-2 transition ${choices.hairColor === h.color ? 'border-white scale-105' : 'border-transparent opacity-80 hover:opacity-100'}`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Staff (6) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Staff</label>
                <div className="grid grid-cols-6 gap-2">
                  {STAFFS.map(st => (
                    <button
                      type="button"
                      key={st.id}
                      data-staff={st.id}
                      aria-pressed={choices.staff === st.id}
                      onClick={() => setChoices(prev => ({ ...prev, staff: st.id }))}
                      className={`py-2 rounded-xl text-xs font-semibold border transition flex items-center justify-center gap-1 ${
                        choices.staff === st.id
                          ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: st.tip }} />
                      {st.name}
                    </button>
                  ))}
                </div>
              </div>

              {!isExistingSave && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Academy name</label>
                    <input value={choices.academyName} maxLength={40} onChange={e => setChoices(prev => ({ ...prev, academyName: e.target.value }))} className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Mode</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['endless', 'timed'] as const).map(m => (
                        <button type="button" key={m} data-mode={m} aria-pressed={choices.mode === m} onClick={() => setChoices(prev => ({ ...prev, mode: m }))} className={`py-2 rounded-xl text-xs border ${choices.mode === m ? 'border-amber-400 text-amber-200' : 'border-slate-800 text-slate-400'}`}>
                          {m === 'endless' ? 'Endless School' : 'Timed Term'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

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
                        onClick={() => setChoices(prev => ({ ...prev, foundingSchool: s.id, robeColor: robeTouched ? prev.robeColor : s.color }))}
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
                  className="flex items-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-bold shadow-lg transition transform active:scale-95 text-sm"
                >
                  <Sparkles className="w-5 h-5" />
                  <span>{isExistingSave ? 'Apply Look' : 'Enter Academy'}</span>
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
