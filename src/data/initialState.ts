/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Ankicaster Initial State Generator
 * Creates initial starting state according to GDD Sections 7, 15, 16, 25
 */

import { FullGameState, PlacedRoom, Character, CardSet } from '../types/ankicaster';
import { generateInitialCollection } from './mockCollection';
import { POTION_RECIPES } from './content';

export function createInitialGameState(): FullGameState {
  const mockCards = generateInitialCollection(350);

  // Initial Rooms (GDD Section 15.2):
  // Entrance Hall (floor 0, col 3-4, size 2x1)
  // Wizard's Study (col 5, floors 0-1, size 1x2, internal stair)
  // Spiral Stair (col 2, floor 0, size 1x1)
  // Storage Vault (col 1, floor 0, size 1x1)
  // Grounds: Vegetable Patch (plot 0), Woodlot (plot 1)
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
      id: 3,
      defId: 'spiral_stair',
      x: 2,
      y: 0,
      w: 1,
      h: 1,
      area: 'castle',
      level: 1,
      state: 'built',
      buildRequired: 0,
      buildProgress: 0,
      buildPaused: false,
      cleanliness: 100,
      settings: {},
      furniture: []
    },
    {
      id: 4,
      defId: 'storage_vault',
      x: 1,
      y: 0,
      w: 1,
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
        { id: 104, defId: 'shelving', slotKind: 'required:shelving', damaged: false }
      ]
    },
    {
      id: 5,
      defId: 'vegetable_patch',
      x: 0,
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
    },
    {
      id: 6,
      defId: 'woodlot',
      x: 1,
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

  // Starting starter kit materials (GDD Section 25.1)
  // 120 Timber, 60 Stone, 20 Glass, 20 Cloth, 40 Provisions, 10 Greens
  return {
    day: 1,
    reviewIndex: 0,
    bellIndex: 0,
    mana: 250, // Starting bank for day 1 actions
    manaDebt: 0,
    bankAtLastReview: 250,
    renown: 10,
    lastSessionTimeMs: Date.now(),
    installBaselineMs: Date.now(),
    wizard: {
      name: 'Hazel',
      title: 'Witch',
      pronouns: 'she/her',
      sigil: '✨',
      academyName: 'Ankicaster Academy',
      levels: {
        arcane: 1,
        nature: 2,
        light: 1,
        shadow: 1,
        alchemy: 1
      },
      studyLevel: 1,
      knownSpells: ['glow', 'beckon', 'mend', 'hush', 'tidy_wind'],
      spellCooldowns: {},
      queuedSessions: []
    },
    veil: {
      strength: 100,
      costToday: 64,
      paidToday: 64,
      autoPay: true,
      reductions: []
    },
    resources: {
      timber: 120,
      stone: 60,
      glass: 20,
      cloth: 20,
      provisions: 40,
      greens: 10,
      fish: 0,
      nectar: 5,
      insight: 15,
      herbs: 20,
      radiance: 10,
      umbra: 10,
      reagents: 15,
      crystal: 2,
      heartwood: 0,
      sunstone: 0,
      void_pearl: 0,
      ember_salt: 0,
      moonsilk: 0,
      starmetal: 0,
      golem_core: 0,
      phoenix_ash: 0,
      potions: {
        mending_draught: 1
      },
      seedsUnlocked: ['hearthroot', 'moonbeans', 'silverleaf']
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
      mode: 'endless',
      termLengthDays: 120,
      devMode: false
    },
    rooms: initialRooms,
    characters: [],
    cardSets: [],
    allCards: mockCards,
    creatures: [
      {
        id: 1,
        defId: 'mossback_tortoise',
        nickname: 'Old Barnaby',
        status: 'wary',
        hungry: false,
        hatchProgress: 0,
        tamingProgress: 18,
        bondLevel: 1,
        bondProgress: 0,
        arrivedDay: 1
      }
    ],
    expeditions: [],
    potions: POTION_RECIPES,
    hand: [
      {
        id: 'h1',
        deck: 'foundation',
        rarity: 'common',
        name: 'Courtyard Garden',
        type: 'blueprint',
        targetId: 'courtyard_garden',
        description: 'Construct a relaxing floral courtyard on outdoor plots.'
      },
      {
        id: 'h2',
        deck: 'foundation',
        rarity: 'common',
        name: 'Crate of Supplies',
        type: 'boon',
        description: 'Open for +40 Timber, +20 Stone, and +10 Glass.'
      }
    ],
    knownPlans: ['vegetable_patch', 'woodlot', 'quarry', 'dormitory', 'refectory', 'common_room'],
    knownPatterns: ['simple_cot', 'long_table', 'hearth', 'couch', 'potted_fern', 'bookshelf'],
    draftHistory: {},
    draftPity: {},
    activeEvents: [],
    notices: [
      {
        id: 'n1',
        time: Date.now(),
        type: 'info',
        text: 'Welcome to Ankicaster Academy! Honest spaced repetition reviews fuel our arcane realm.'
      }
    ],
    achievements: ['doors_open'],
    spellbooks: [],
    alumniGallery: [],
    processedReviewIds: []
  };
}
