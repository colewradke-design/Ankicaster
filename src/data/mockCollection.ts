/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Ankicaster Realistic Anki Collection Mock Engine
 * Generates initial realistic decks and cards to demonstrate linking, intervals, and study simulation.
 */

import { AnkiCardSnapshot } from '../types/ankicaster';

const SAMPLE_DECKS = [
  'Medical Sciences::Cardiology',
  'Languages::Latin Vocabulary',
  'Arcane Glyphs::Ancient Runes',
  'Natural Philosophy::Herbalism',
  'History of Magic::Great Cataclysms'
];

const PROMPTS = [
  { front: 'What is the action potential refractory period in cardiac myocytes?', back: 'Phase 2 (plateau) prolongs refraction, preventing tetanic contractions.' },
  { front: 'Latin root for "healing" or "physician"', back: 'Medeor / Medicus' },
  { front: 'Rune of Solitude and Silent Defense', back: 'Hagalaz / Aegis-sign of Hush' },
  { front: 'Active reagent extracted from Silverleaf petals', back: 'Astra-cellulose compound' },
  { front: 'Primary cause of the Second Rift Tremor', back: 'Harmonic resonance from shattered star towers' },
  { front: 'Dopaminergic pathways of the mesolimbic system', back: 'Ventral tegmental area projecting to nucleus accumbens' },
  { front: 'Translate: "Ignis aurum probat, miseria fortes viros"', back: 'Fire tests gold, adversity tests strong men.' },
  { front: 'Optimal fermentation condition for Murky Sludge compost', back: 'Anaerobic resting at 32°C for four bells' },
  { front: 'Sign of dawn alignment in celestial navigation', back: 'Zenith of the Morning Star at fourth declination' },
  { front: 'Distinction between sympathetic and parasympathetic innervation', back: 'Fight-or-flight (thoracolumbar) vs Rest-and-digest (craniosacral)' }
];

export function generateInitialCollection(count: number = 320): Record<number, AnkiCardSnapshot> {
  const cards: Record<number, AnkiCardSnapshot> = {};
  const now = Date.now();

  for (let i = 1; i <= count; i++) {
    const deck = SAMPLE_DECKS[i % SAMPLE_DECKS.length];
    const prompt = PROMPTS[i % PROMPTS.length];
    // Create realistic distribution:
    // 60% young cards (ivl 1 to 28 days), 25% learning/relearning cards (ivl 0 to 1), 15% mature cards (>30 days)
    let ivl = 0;
    const roll = Math.random();
    if (roll < 0.2) {
      ivl = 0; // new / relearn
    } else if (roll < 0.8) {
      ivl = Math.floor(Math.random() * 26) + 1; // 1 to 27 days
    } else {
      ivl = Math.floor(Math.random() * 60) + 31; // 31 to 90 days
    }

    const lastStudied = now - Math.floor(Math.random() * 14 * 86400000);

    cards[i] = {
      id: i,
      nid: Math.floor((i - 1) / 2) + 1, // 2 cards per note on average
      deckName: deck,
      front: `${prompt.front} (#${i})`,
      back: prompt.back,
      ivl: ivl,
      lastAnswerIvl: ivl,
      honestIvl: ivl,
      type: ivl === 0 ? 1 : 2,
      queue: 2,
      due: Math.floor(Math.random() * 10),
      lastStudiedMs: lastStudied
    };
  }

  return cards;
}
