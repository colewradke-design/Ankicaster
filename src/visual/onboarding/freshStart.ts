/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Fresh Start & Character Creation Constructor
 * Implements Section 10.2, 10.3, 10.4 of Visual Overhaul Addendum:
 * - 0 mana, 0 manaDebt, 0 bankAtLastReview
 * - 0 Renown
 * - All wizard levels 0, studyLevel 0
 * - Exactly 3 starting rooms, already built:
 *   Entrance Hall (x 3, y 0, w 2, h 1)
 *   Wizard's Study (x 5, y 0, w 1, h 2)
 *   Vegetable Patch (grounds index 8)
 * - Every other room is found in a card deck. Spiral Stair, Corridor and Support Pillar stay free.
 * - GDD 25.1 starting stock: 120 Timber, 60 Stone, 20 Glass, 20 Cloth, 40 Provisions, 10 Greens; everything else 0
 * - 0 creatures, 0 characters, 0 cardSets, 0 activeEvents, 0 pending events
 * - Empty achievements (doors_open earned on first enrolment)
 */

import { FullGameState, PlacedRoom, SchoolType } from '../../types/ankicaster';
import { generateInitialCollection } from '../../data/mockCollection';
import { POTION_RECIPES } from '../../data/content';
import { STARTER_PATTERNS } from '../../utils/decks';
import { normalizeAppearance, SKIN_TONES } from '../../utils/appearance';

export interface HeadmasterChoices {
  name: string;
  title: string;
  pronouns: string;
  bodyShape: number;
  skin: string;
  hair: string;
  hairColor: string;
  eyes: string;
  face: string;
  shoes: string;
  robeColor: string;
  hat: string;
  staff: string;
  foundingSchool: SchoolType;
  sigil: string;
  academyName: string;
  mode: 'endless' | 'timed';
}

export const DEFAULT_HEADMASTER_CHOICES: HeadmasterChoices = {
  name: 'Morgan',
  title: 'Wizard',
  pronouns: 'they/them',
  bodyShape: 1,
  skin: SKIN_TONES[0],
  hair: 'short_messy',
  hairColor: '#4A2E1E',
  eyes: '#4A2E1E',
  face: 'round',
  shoes: 'boots',
  robeColor: '#4E8B3A', // Nature default
  hat: 'pointed',
  staff: 'oak',
  foundingSchool: 'nature',
  sigil: 'star8',
  academyName: 'Ankicaster Academy',
  mode: 'endless'
};

export function createNewAcademy(choices: Partial<HeadmasterChoices> = {}): FullGameState {
  const c: HeadmasterChoices = { ...DEFAULT_HEADMASTER_CHOICES, ...choices };
  const hasLook = !!(choices.skin || choices.hair || choices.hairColor || choices.robeColor || choices.hat || choices.staff);
  const mockCards = generateInitialCollection(350);

  const initialRooms: PlacedRoom[] = [
    {
      id: 1,
      defId: 'entrance_hall',
      x: 3,
      y: 0,
      w: 2,
      h: 1,
      area: 'castle',
      level: 1,
      state: 'built',
      buildRequired: 0,
      buildProgress: 0,
      buildPaused: false,
      cleanliness: 100,
      settings: {},
      furniture: [
        { id: 101, defId: 'grand_doors', slotKind: 'required:grand_doors', damaged: false }
      ]
    },
    {
      id: 2,
      defId: 'wizard_study',
      x: 5,
      y: 0,
      w: 1,
      h: 2,
      area: 'castle',
      level: 1,
      state: 'built',
      buildRequired: 0,
      buildProgress: 0,
      buildPaused: false,
      cleanliness: 100,
      settings: {},
      furniture: [
        { id: 102, defId: 'orb_stand', slotKind: 'required:orb_stand', damaged: false },
        { id: 103, defId: 'lectern', slotKind: 'required:lectern', damaged: false }
      ]
    },
    {
      id: 5,
      defId: 'vegetable_patch',
      x: 8, // L0 (index 8)
      y: 0,
      w: 1,
      h: 1,
      area: 'grounds',
      level: 1,
      state: 'built',
      buildRequired: 0,
      buildProgress: 0,
      buildPaused: false,
      cleanliness: 100,
      settings: {},
      furniture: []
    }
  ];

  const now = Date.now();

  return {
    day: 1,
    reviewIndex: 0,
    bellIndex: 0,
    mana: 0, // BR-01: 0 mana at fresh start
    manaDebt: 0,
    requiredFixturesVersion: 1, // new saves never need the old-save fixture back-fill
    staffingVersion: 1,
    knownPlansVersion: 1,
    tutorial: hasLook ? { phase: 'founding', step: 0, part: 0 } : undefined,
    bankAtLastReview: 0,
    renown: 0, // GDD 32: 0 Renown at fresh start
    lastSessionTimeMs: now,
    installBaselineMs: now,
    wizard: {
      name: c.name || 'Morgan',
      title: c.title || 'Wizard',
      pronouns: c.pronouns || 'they/them',
      sigil: c.sigil || 'star8',
      academyName: c.academyName || 'Ankicaster Academy',
      levels: {
        arcane: 0,
        nature: 0,
        light: 0,
        shadow: 0,
        alchemy: 0
      },
      studyLevel: 0,
      knownSpells: [],
      spellCooldowns: {},
      queuedSessions: [],
      // The chosen look lives on the player's character and is drawn by the forge renderer
      appearance: hasLook ? normalizeAppearance({
        bodyShape: c.bodyShape as 1 | 2 | 3 | 4,
        skin: c.skin,
        hair: c.hair,
        hairColor: c.hairColor,
        eyes: c.eyes,
        face: c.face,
        shoes: c.shoes,
        robeColor: c.robeColor,
        hat: c.hat,
        staff: c.staff
      }) : undefined,
      foundingSchool: c.foundingSchool,
      foundedAt: new Date(now).toISOString()
    },
    veil: {
      strength: 100,
      costToday: 0,
      paidToday: 0,
      autoPay: true,
      reductions: []
    },
    // GDD Section 25.1 starting stock only
    resources: {
      timber: 120,
      stone: 60,
      glass: 20,
      cloth: 20,
      provisions: 40,
      greens: 10,
      fish: 0,
      nectar: 0,
      insight: 0,
      herbs: 0,
      radiance: 0,
      umbra: 0,
      reagents: 0,
      crystal: 0,
      heartwood: 0,
      sunstone: 0,
      void_pearl: 0,
      ember_salt: 0,
      moonsilk: 0,
      starmetal: 0,
      golem_core: 0,
      phoenix_ash: 0,
      potions: {},
      seedsUnlocked: ['hearthroot']
    },
    settings: {
      manaPerReview: 10,
      cardsPerStudent: 50,
      retirementAgeDays: 90,
      deckScope: 'all',
      linkNewCards: false,
      avoidSiblings: true,
      honestIntervalsOnly: true,
      suspendedReleaseDays: 30,
      veilPayment: 'auto',
      toastMode: 'every_bell',
      reduceMotion: false,
      sound: false,
      textScale: 1.0,
      mode: c.mode || 'endless',
      termLengthDays: 120,
      devMode: false,
      visualTime: 'clock',
      celebrationSize: 'full',
      showHazardsLens: false
    },
    rooms: initialRooms,
    characters: [],
    cardSets: [],
    allCards: mockCards,
    creatures: [], // No creatures at fresh start
    expeditions: [],
    potions: POTION_RECIPES,
    hand: [], // Hand empty until tutorial draft
    roomPlans: {},
    knownPlans: [],
    knownPatterns: [...STARTER_PATTERNS],
    draftHistory: {},
    draftPity: {},
    roomlessStreak: {},
    foundingDraws: { foundation: 0, grounds: 0 },
    draftsCompleted: 0,
    riftGateGranted: false,
    resourceLedger: { bells: [], recent: {} },
    activeEvents: [], // No pending events
    notices: [
      {
        id: `welcome-${now}`,
        time: now,
        type: 'info',
        text: 'Welcome to Ankicaster Academy! Honest spaced-repetition study fuels your realm.'
      }
    ],
    achievements: [], // doors_open earned on first enrolment
    spellbooks: [],
    alumniGallery: [],
    processedReviewIds: []
  };
}
