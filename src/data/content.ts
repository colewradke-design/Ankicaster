/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Ankicaster Content Catalogs (Rooms, Furniture, Creatures, Potions, Rift, Spells, Events)
 * Based strictly on GDD Sections 16, 17, 22, 24, 26, 27, 28, 29, 31, 32
 */

import {
  SchoolType,
  RoomDefinition,
  FurnitureDefinition,
  CreatureDefinition,
  PotionRecipe,
  RiftDestination,
  SchoolEvent
} from '../types/ankicaster';

// 56 Room Types from GDD Section 16
export const ROOM_DEFINITIONS: Record<string, RoomDefinition> = {
  // --- CORE & CIRCULATION ---
  entrance_hall: {
    id: 'entrance_hall',
    name: 'Entrance Hall',
    category: 'core',
    area: 'castle',
    size: [2, 1],
    maxCount: 1,
    noDemolish: true,
    unlock: { type: 'start' },
    cost: { mana: 0 },
    buildReviews: 0,
    veil: 4,
    requiredFurniture: [{ role: 'grand_doors', count: 1, name: 'Grand Doors' }],
    optionalSlots: 4,
    stats: { primary: ['charm', 'order'], secondary: 'comfort' },
    description: 'Root of reachability and ceremonial space. Charm placed here counts double for Renown.'
  },
  wizard_study: {
    id: 'wizard_study',
    name: "Wizard's Study",
    category: 'core',
    area: 'castle',
    size: [1, 2],
    maxCount: 1,
    noDemolish: true,
    unlock: { type: 'start' },
    cost: { mana: 0 },
    buildReviews: 0,
    veil: 6,
    requiredFurniture: [
      { role: 'orb_stand', count: 1, name: 'Orb Stand' },
      { role: 'lectern', count: 1, name: 'Lectern' }
    ],
    optionalSlots: 3,
    stats: { primary: ['focus', 'aura'], secondary: 'charm' },
    level3Perk: "Wizard's spells cost 10% less.",
    description: 'The personal sanctum of the Headmaster where orbs and grimoires are pondered.'
  },
  spiral_stair: {
    id: 'spiral_stair',
    name: 'Spiral Stair',
    category: 'core',
    area: 'castle',
    size: [1, 1],
    unlock: { type: 'start' },
    cost: { mana: 40, stone: 10 },
    buildReviews: 5,
    veil: 1,
    requiredFurniture: [],
    optionalSlots: 0,
    stats: { primary: ['order', 'order'], secondary: 'order' },
    description: 'The vertical circulatory spine of the castle. Stack stairs to connect floors.'
  },
  corridor: {
    id: 'corridor',
    name: 'Corridor',
    category: 'core',
    area: 'castle',
    size: [1, 1],
    unlock: { type: 'start' },
    cost: { mana: 25, timber: 8 },
    buildReviews: 4,
    veil: 1,
    requiredFurniture: [],
    optionalSlots: 1,
    stats: { primary: ['charm', 'charm'], secondary: 'order' },
    description: 'Connects distant rooms horizontally and spaces noisy labs from quiet dorms.'
  },
  support_pillar: {
    id: 'support_pillar',
    name: 'Support Pillar',
    category: 'core',
    area: 'castle',
    size: [1, 1],
    unlock: { type: 'start' },
    cost: { mana: 15, stone: 6 },
    buildReviews: 3,
    veil: 0.5,
    requiredFurniture: [],
    optionalSlots: 0,
    stats: { primary: ['order', 'order'], secondary: 'order' },
    description: 'Structural support foundation. Allows building upper rooms over open ground.'
  },
  storage_vault: {
    id: 'storage_vault',
    name: 'Storage Vault',
    category: 'core',
    area: 'castle',
    size: [1, 1],
    unlock: { type: 'start' },
    cost: { mana: 120, timber: 20, stone: 10 },
    buildReviews: 20,
    veil: 2,
    requiredFurniture: [{ role: 'shelving', count: 1, name: 'Shelving' }],
    optionalSlots: 2,
    stats: { primary: ['order', 'order'], secondary: 'aura' },
    level3Perk: 'Auto-sorts vault; builders clean +1 cleanliness per bell.',
    description: 'Expands maximum storage cap for common materials by +200 each.'
  },

  // --- LIVING ---
  dormitory: {
    id: 'dormitory',
    name: 'Dormitory',
    category: 'living',
    area: 'castle',
    size: [2, 1],
    unlock: { type: 'start' },
    cost: { mana: 250, timber: 30, stone: 10 },
    buildReviews: 40,
    veil: 4,
    capacity: { beds: 4 },
    requiredFurniture: [{ role: 'bed', count: 1, name: 'Bed (at least 1)' }],
    optionalSlots: 4,
    stats: { primary: ['comfort', 'charm'], secondary: 'order' },
    level3Perk: 'Roommates share Kind Heart and Sunny effects at double strength.',
    description: 'Cozy quarters for up to 4 students (+1/level) to rest and restore energy.'
  },
  grand_dormitory: {
    id: 'grand_dormitory',
    name: 'Grand Dormitory',
    category: 'living',
    area: 'castle',
    size: [3, 1],
    unlock: { type: 'draft', rarity: 'uncommon' },
    cost: { mana: 650, timber: 60, stone: 25, cloth: 10 },
    buildReviews: 80,
    veil: 6,
    capacity: { beds: 7 },
    requiredFurniture: [{ role: 'bed', count: 1, name: 'Bed (at least 1)' }],
    optionalSlots: 5,
    stats: { primary: ['comfort', 'charm'], secondary: 'order' },
    level3Perk: '+5 Leisure target for residents.',
    description: 'Spacious dormitory holding 7 beds (+1/level) with reduced Veil upkeep per bed.'
  },
  faculty_quarters: {
    id: 'faculty_quarters',
    name: 'Faculty Quarters',
    category: 'living',
    area: 'castle',
    size: [2, 1],
    unlock: { type: 'standard' },
    cost: { mana: 350, timber: 30, stone: 15, cloth: 5 },
    buildReviews: 50,
    veil: 4,
    capacity: { facultyBeds: 2 },
    requiredFurniture: [
      { role: 'faculty_bed', count: 2, name: 'Faculty Bed' },
      { role: 'writing_desk', count: 1, name: 'Writing Desk' }
    ],
    optionalSlots: 4,
    stats: { primary: ['comfort', 'focus'], secondary: 'order' },
    level3Perk: 'Residents career proficiency +5.',
    description: 'Housing for Masters working as Faculty members, supporting the faculty limit.'
  },
  faculty_lounge: {
    id: 'faculty_lounge',
    name: 'Faculty Lounge',
    category: 'living',
    area: 'castle',
    size: [2, 1],
    unlock: { type: 'draft', rarity: 'common' },
    cost: { mana: 300, timber: 25, cloth: 10 },
    buildReviews: 40,
    veil: 4,
    capacity: { leisureSeats: 4 },
    requiredFurniture: [{ role: 'armchair', count: 2, name: 'Armchair' }],
    optionalSlots: 4,
    stats: { primary: ['comfort', 'charm'], secondary: 'focus' },
    description: 'Private rest and socialization retreat for teachers and staff. Boosts career output.'
  },
  refectory: {
    id: 'refectory',
    name: 'Refectory',
    category: 'living',
    area: 'castle',
    size: [3, 1],
    unlock: { type: 'start' },
    cost: { mana: 400, timber: 40, stone: 20 },
    buildReviews: 60,
    veil: 5,
    capacity: { seats: 12 },
    requiredFurniture: [
      { role: 'long_table', count: 1, name: 'Long Table' },
      { role: 'hearth', count: 1, name: 'Hearth' }
    ],
    optionalSlots: 5,
    stats: { primary: ['comfort', 'order'], secondary: 'charm' },
    level3Perk: 'Meals restore +5 Composure.',
    description: 'Serves meals every 5 bells to keep students and faculty well-fed.'
  },
  kitchen: {
    id: 'kitchen',
    name: 'Kitchen',
    category: 'living',
    area: 'castle',
    size: [1, 1],
    unlock: { type: 'draft', rarity: 'common' },
    cost: { mana: 250, timber: 15, stone: 15 },
    buildReviews: 30,
    veil: 3,
    requiredFurniture: [{ role: 'cooking_range', count: 1, name: 'Cooking Range' }],
    optionalSlots: 2,
    stats: { primary: ['order', 'aura'], secondary: 'comfort' },
    description: 'When adjacent to Refectory, serves Hearty meals (+5 morale) and uses -10% food.'
  },
  common_room: {
    id: 'common_room',
    name: 'Common Room',
    category: 'living',
    area: 'castle',
    size: [2, 1],
    unlock: { type: 'start' },
    cost: { mana: 300, timber: 30, cloth: 10 },
    buildReviews: 45,
    veil: 4,
    capacity: { leisureSeats: 6 },
    requiredFurniture: [{ role: 'couch_or_hearth', count: 1, name: 'Couch or Hearth' }],
    optionalSlots: 5,
    stats: { primary: ['comfort', 'charm'], secondary: 'order' },
    level3Perk: 'Misbehavior Academy-wide -5%.',
    description: 'Central relaxation hub satisfying students Leisure need.'
  },
  bathhouse: {
    id: 'bathhouse',
    name: 'Bathhouse',
    category: 'living',
    area: 'castle',
    size: [2, 1],
    unlock: { type: 'draft', rarity: 'uncommon' },
    cost: { mana: 450, stone: 20, glass: 15 },
    buildReviews: 60,
    veil: 5,
    requiredFurniture: [{ role: 'soaking_tub', count: 1, name: 'Soaking Tub' }],
    optionalSlots: 4,
    stats: { primary: ['comfort', 'aura'], secondary: 'charm' },
    description: 'Restorative mineral waters. Users Rest target +10, Composure +5, and heal 10% faster.'
  },

  // --- TEACHING (Basic Classrooms) ---
  class_arcane: {
    id: 'class_arcane',
    name: 'Glyph Classroom',
    category: 'arcane',
    area: 'castle',
    size: [2, 1],
    unlock: { type: 'standard' },
    cost: { mana: 300, timber: 25, stone: 15 },
    buildReviews: 45,
    veil: 5,
    capacity: { seats: 5 },
    workplace: { career: 'teacher', slots: 1 },
    requiredFurniture: [
      { role: 'teachers_lectern', count: 1, name: "Teacher's Lectern" },
      { role: 'orrery_globe', count: 1, name: 'Orrery Globe' }
    ],
    optionalSlots: 4,
    stats: { primary: ['focus', 'aura'], secondary: 'order' },
    level3Perk: '+1 Tutor slot and +5% Insight essence.',
    description: 'Arcane classroom producing Insight essence each bell.'
  },
  class_nature: {
    id: 'class_nature',
    name: 'Grove Classroom',
    category: 'nature',
    area: 'castle',
    size: [2, 1],
    unlock: { type: 'standard' },
    cost: { mana: 300, timber: 25, stone: 15 },
    buildReviews: 45,
    veil: 5,
    capacity: { seats: 5 },
    workplace: { career: 'teacher', slots: 1 },
    requiredFurniture: [
      { role: 'teachers_lectern', count: 1, name: "Teacher's Lectern" },
      { role: 'potting_bench', count: 1, name: 'Potting Bench' }
    ],
    optionalSlots: 4,
    stats: { primary: ['focus', 'aura'], secondary: 'order' },
    level3Perk: '+1 Tutor slot and +5% Herbs essence.',
    description: 'Nature classroom producing Herbs essence each bell.'
  },
  class_light: {
    id: 'class_light',
    name: 'Dawn Classroom',
    category: 'light',
    area: 'castle',
    size: [2, 1],
    unlock: { type: 'standard' },
    cost: { mana: 300, timber: 25, stone: 15 },
    buildReviews: 45,
    veil: 5,
    capacity: { seats: 5 },
    workplace: { career: 'teacher', slots: 1 },
    requiredFurniture: [
      { role: 'teachers_lectern', count: 1, name: "Teacher's Lectern" },
      { role: 'sun_altar', count: 1, name: 'Sun Altar' }
    ],
    optionalSlots: 4,
    stats: { primary: ['focus', 'aura'], secondary: 'order' },
    level3Perk: '+1 Tutor slot and +5% Radiance essence.',
    description: 'Light classroom producing Radiance essence each bell.'
  },
  class_shadow: {
    id: 'class_shadow',
    name: 'Hush Classroom',
    category: 'shadow',
    area: 'castle',
    size: [2, 1],
    unlock: { type: 'standard' },
    cost: { mana: 300, timber: 25, stone: 15 },
    buildReviews: 45,
    veil: 5,
    capacity: { seats: 5 },
    workplace: { career: 'teacher', slots: 1 },
    requiredFurniture: [
      { role: 'teachers_lectern', count: 1, name: "Teacher's Lectern" },
      { role: 'veiled_mirror', count: 1, name: 'Veiled Mirror' }
    ],
    optionalSlots: 4,
    stats: { primary: ['focus', 'aura'], secondary: 'order' },
    level3Perk: '+1 Tutor slot and +5% Umbra essence.',
    description: 'Shadow classroom producing Umbra essence each bell.'
  },
  class_alchemy: {
    id: 'class_alchemy',
    name: 'Bench Classroom',
    category: 'alchemy',
    area: 'castle',
    size: [2, 1],
    unlock: { type: 'standard' },
    cost: { mana: 300, timber: 25, stone: 15 },
    buildReviews: 45,
    veil: 5,
    capacity: { seats: 5 },
    workplace: { career: 'teacher', slots: 1 },
    requiredFurniture: [
      { role: 'teachers_lectern', count: 1, name: "Teacher's Lectern" },
      { role: 'bench_cauldron', count: 1, name: 'Bench Cauldron' }
    ],
    optionalSlots: 4,
    stats: { primary: ['focus', 'aura'], secondary: 'order' },
    level3Perk: '+1 Tutor slot and +5% Reagents essence.',
    description: 'Alchemy classroom producing Reagents essence each bell.'
  },

  // --- KNOWLEDGE (Arcane) ---
  library: {
    id: 'library',
    name: 'Library',
    category: 'arcane',
    area: 'castle',
    size: [2, 1],
    unlock: { type: 'standard' },
    cost: { mana: 500, timber: 40, glass: 10 },
    buildReviews: 70,
    veil: 5,
    capacity: { readers: 4 },
    workplace: { career: 'scholar', slots: 2 },
    requiredFurniture: [
      { role: 'bookshelf', count: 2, name: 'Bookshelf' },
      { role: 'reading_desk', count: 1, name: 'Reading Desk' }
    ],
    optionalSlots: 4,
    stats: { primary: ['focus', 'order'], secondary: 'charm' },
    level3Perk: 'Grimoire study costs -10% mana.',
    description: 'Scholars generate Insight here. Researches Veil Theory and reveals potion recipes.'
  },
  observatory: {
    id: 'observatory',
    name: 'Observatory',
    category: 'arcane',
    area: 'castle',
    size: [1, 2],
    needsSky: true,
    floorRule: 'highest_floor',
    unlock: { type: 'draft', rarity: 'uncommon' },
    cost: { mana: 650, stone: 20, glass: 25, crystal: 3 },
    buildReviews: 80,
    veil: 7,
    workplace: { career: 'scholar', slots: 1 },
    requiredFurniture: [{ role: 'great_telescope', count: 1, name: 'Great Telescope' }],
    optionalSlots: 2,
    stats: { primary: ['aura', 'focus'], secondary: 'charm' },
    description: 'Foresight reveals the next day event in advance and provides +1 Rift Fortune.'
  },
  scriptorium: {
    id: 'scriptorium',
    name: 'Scriptorium',
    category: 'arcane',
    area: 'castle',
    size: [2, 1],
    unlock: { type: 'draft', rarity: 'uncommon' },
    cost: { mana: 450, timber: 30, cloth: 10, insight: 10 },
    buildReviews: 60,
    veil: 5,
    workplace: { career: 'scholar', slots: 1 },
    requiredFurniture: [{ role: 'scribes_desk', count: 1, name: "Scribe's Desk" }],
    optionalSlots: 3,
    stats: { primary: ['focus', 'order'], secondary: 'aura' },
    description: 'Crafts magical scrolls: Rift Maps, Ward Scrolls, and Recipe Notes.'
  },

  // --- NATURE ---
  greenhouse: {
    id: 'greenhouse',
    name: 'Greenhouse',
    category: 'nature',
    area: 'castle',
    size: [2, 1],
    needsSky: true,
    unlock: { type: 'standard' },
    cost: { mana: 450, timber: 30, glass: 25 },
    buildReviews: 60,
    veil: 5,
    capacity: { cropBeds: 2 },
    workplace: { career: 'gardener', slots: 1 },
    requiredFurniture: [{ role: 'planter_bed', count: 2, name: 'Planter Bed' }],
    optionalSlots: 3,
    stats: { primary: ['aura', 'comfort'], secondary: 'charm' },
    level3Perk: 'Mixed planting allowed in each bed.',
    description: 'Grows high-yield indoor crops, herbs, and exotic seeds.'
  },
  meadow_paddock: {
    id: 'meadow_paddock',
    name: 'Meadow Paddock',
    category: 'nature',
    area: 'grounds',
    size: [2, 1],
    unlock: { type: 'standard' },
    cost: { mana: 200, timber: 30 },
    buildReviews: 30,
    veil: 3,
    capacity: { creatures: 3 },
    requiredFurniture: [{ role: 'feeding_trough', count: 1, name: 'Feeding Trough' }],
    optionalSlots: 2,
    stats: { primary: ['comfort', 'charm'], secondary: 'order' },
    description: 'Outdoor pasture pen for Meadow creatures like tortoises, hares, and foxes.'
  },
  tide_tank: {
    id: 'tide_tank',
    name: 'Tide Tank',
    category: 'nature',
    area: 'castle',
    size: [2, 1],
    floorRule: 'floor_0',
    unlock: { type: 'standard' },
    cost: { mana: 400, stone: 20, glass: 30 },
    buildReviews: 50,
    veil: 4,
    capacity: { creatures: 2 },
    requiredFurniture: [{ role: 'glass_tank', count: 1, name: 'Glass Tank' }],
    optionalSlots: 2,
    stats: { primary: ['aura', 'comfort'], secondary: 'order' },
    description: 'Reinforced saltwater tank for Tide creatures on the ground floor.'
  },
  menagerie: {
    id: 'menagerie',
    name: 'Menagerie',
    category: 'nature',
    area: 'castle',
    size: [3, 2],
    unlock: { type: 'draft', rarity: 'rare' },
    cost: { mana: 1400, timber: 60, stone: 40, glass: 40, heartwood: 5 },
    buildReviews: 140,
    veil: 12,
    capacity: { creatures: 6 },
    workplace: { career: 'tamer', slots: 1 },
    requiredFurniture: [{ role: 'habitat_module', count: 2, name: 'Habitat Module (2)' }],
    optionalSlots: 4,
    stats: { primary: ['comfort', 'charm'], secondary: 'aura' },
    level3Perk: 'Wary creatures here escape 50% less.',
    description: 'Grand zoological hall accommodating any habitat modules. Creatures give +10% buff.'
  },

  // --- LIGHT ---
  infirmary: {
    id: 'infirmary',
    name: 'Infirmary',
    category: 'light',
    area: 'castle',
    size: [2, 1],
    unlock: { type: 'standard' },
    cost: { mana: 450, timber: 25, cloth: 10, glass: 10 },
    buildReviews: 60,
    veil: 5,
    capacity: { beds: 3 },
    workplace: { career: 'healer', slots: 1 },
    requiredFurniture: [
      { role: 'infirmary_cot', count: 2, name: 'Infirmary Cot' },
      { role: 'remedy_cabinet', count: 1, name: 'Remedy Cabinet' }
    ],
    optionalSlots: 3,
    stats: { primary: ['comfort', 'order'], secondary: 'aura' },
    level3Perk: 'Also treats injured creatures at full speed.',
    description: 'Heals Bruised, Sprained, and Broken Bone injuries. Staffed by Healers.'
  },
  aviary: {
    id: 'aviary',
    name: 'Aviary',
    category: 'light',
    area: 'castle',
    size: [1, 2],
    needsSky: true,
    unlock: { type: 'standard' },
    cost: { mana: 350, timber: 25, glass: 15 },
    buildReviews: 45,
    veil: 4,
    capacity: { creatures: 3 },
    requiredFurniture: [{ role: 'perch_tree', count: 1, name: 'Perch Tree' }],
    optionalSlots: 2,
    stats: { primary: ['charm', 'aura'], secondary: 'comfort' },
    description: 'High spire bird sanctuary for Sky creatures (moths, finches, owls, gryphons).'
  },
  sunlit_sanctum: {
    id: 'sunlit_sanctum',
    name: 'Sunlit Sanctum',
    category: 'light',
    area: 'castle',
    size: [2, 1],
    unlock: { type: 'draft', rarity: 'uncommon' },
    cost: { mana: 600, stone: 30, glass: 15, radiance: 15 },
    buildReviews: 70,
    veil: 6,
    capacity: { seats: 6 },
    workplace: { career: 'healer', slots: 1 },
    requiredFurniture: [
      { role: 'sun_window', count: 1, name: 'Sun Window' },
      { role: 'meditation_cushions', count: 2, name: 'Meditation Cushions' }
    ],
    optionalSlots: 4,
    stats: { primary: ['aura', 'charm'], secondary: 'comfort' },
    description: 'Sanctuary of peace. Healer performs the Rite of Renewal to remove troublesome traits.'
  },

  // --- SHADOW ---
  warding_chamber: {
    id: 'warding_chamber',
    name: 'Warding Chamber',
    category: 'shadow',
    area: 'castle',
    size: [1, 1],
    unlock: { type: 'standard' },
    cost: { mana: 400, stone: 25, glass: 5 },
    buildReviews: 50,
    veil: 4,
    workplace: { career: 'warder', slots: 1 },
    requiredFurniture: [{ role: 'ward_circle', count: 1, name: 'Ward Circle' }],
    optionalSlots: 2,
    stats: { primary: ['order', 'aura'], secondary: 'focus' },
    level3Perk: 'Breaches auto-contained in this chamber radius.',
    description: 'Reduces daily Veil cost by 5% and suppresses hazards in nearby rooms.'
  },
  gloom_hutch: {
    id: 'gloom_hutch',
    name: 'Gloom Hutch',
    category: 'shadow',
    area: 'castle',
    size: [1, 1],
    unlock: { type: 'standard' },
    cost: { mana: 250, timber: 15, stone: 15 },
    buildReviews: 35,
    veil: 3,
    capacity: { creatures: 2 },
    requiredFurniture: [{ role: 'lightless_burrow', count: 1, name: 'Lightless Burrow' }],
    optionalSlots: 2,
    stats: { primary: ['comfort', 'order'], secondary: 'aura' },
    description: 'Dark secluded burrow for Gloom creatures (mice, bats, shade hounds, lynx).'
  },
  detention_hall: {
    id: 'detention_hall',
    name: 'Detention Hall',
    category: 'shadow',
    area: 'castle',
    size: [1, 1],
    unlock: { type: 'draft', rarity: 'uncommon' },
    cost: { mana: 350, stone: 25 },
    buildReviews: 45,
    veil: 3,
    workplace: { career: 'warder', slots: 1 },
    requiredFurniture: [{ role: 'penitent_benches', count: 1, name: 'Penitent Benches' }],
    optionalSlots: 2,
    stats: { primary: ['order', 'focus'], secondary: 'order' },
    description: 'Disciplines unruly students, suppressing future misbehavior and curing traits.'
  },

  // --- ALCHEMY & CRAFT ---
  alchemy_lab: {
    id: 'alchemy_lab',
    name: 'Alchemy Lab',
    category: 'alchemy',
    area: 'castle',
    size: [2, 1],
    unlock: { type: 'standard' },
    cost: { mana: 450, stone: 20, glass: 20 },
    buildReviews: 60,
    veil: 6,
    workplace: { career: 'alchemist', slots: 1 },
    requiredFurniture: [
      { role: 'brewing_cauldron', count: 1, name: 'Brewing Cauldron' },
      { role: 'ingredient_rack', count: 1, name: 'Ingredient Rack' }
    ],
    optionalSlots: 3,
    stats: { primary: ['aura', 'order'], secondary: 'focus' },
    level3Perk: 'Third brewing station unlocked.',
    description: 'Brew potions by combining three ingredients. Staffed by an Alchemist.'
  },
  ember_pit: {
    id: 'ember_pit',
    name: 'Ember Pit',
    category: 'alchemy',
    area: 'castle',
    size: [1, 1],
    floorRule: 'floors_0_1',
    unlock: { type: 'standard' },
    cost: { mana: 300, stone: 25, glass: 5 },
    buildReviews: 40,
    veil: 4,
    capacity: { creatures: 2 },
    requiredFurniture: [{ role: 'brazier_nest', count: 1, name: 'Brazier Nest' }],
    optionalSlots: 2,
    stats: { primary: ['aura', 'comfort'], secondary: 'order' },
    description: 'Furnace habitat on lower floors for fire creatures (newts, toads, salamanders).'
  },
  crystal_vivarium: {
    id: 'crystal_vivarium',
    name: 'Crystal Vivarium',
    category: 'arcane',
    area: 'castle',
    size: [1, 1],
    unlock: { type: 'standard' },
    cost: { mana: 350, stone: 10, glass: 20 },
    buildReviews: 40,
    veil: 4,
    capacity: { creatures: 2 },
    requiredFurniture: [{ role: 'geode_bed', count: 1, name: 'Geode Bed' }],
    optionalSlots: 2,
    stats: { primary: ['aura', 'charm'], secondary: 'focus' },
    description: 'Resonant crystalline habitat for crystal-dwelling creatures and wisps.'
  },
  workshop: {
    id: 'workshop',
    name: 'Workshop',
    category: 'craft',
    area: 'castle',
    size: [2, 1],
    unlock: { type: 'draft', rarity: 'uncommon' },
    cost: { mana: 500, timber: 40, stone: 20 },
    buildReviews: 60,
    veil: 5,
    workplace: { career: 'builder', slots: 2 },
    requiredFurniture: [{ role: 'workbench', count: 1, name: 'Workbench' }],
    optionalSlots: 3,
    stats: { primary: ['order', 'focus'], secondary: 'aura' },
    level3Perk: 'Builder slots advance 1.4 per review.',
    description: 'Each Builder adds a construction slot. Idle builders keep the school clean.'
  },
  glassworks: {
    id: 'glassworks',
    name: 'Glassworks',
    category: 'craft',
    area: 'castle',
    size: [1, 1],
    unlock: { type: 'draft', rarity: 'common' },
    cost: { mana: 350, stone: 30 },
    buildReviews: 40,
    veil: 3,
    requiredFurniture: [{ role: 'kiln', count: 1, name: 'Kiln' }],
    optionalSlots: 1,
    stats: { primary: ['aura', 'order'], secondary: 'focus' },
    description: 'At full efficiency, converts 2 Stone into 1 Glass per bell. Short on stone, it converts only what it has (half as much glass as the stone used). Glass caps at 500.'
  },
  weaving_room: {
    id: 'weaving_room',
    name: 'Weaving Room',
    category: 'craft',
    area: 'castle',
    size: [1, 1],
    unlock: { type: 'draft', rarity: 'common' },
    cost: { mana: 250, timber: 20 },
    buildReviews: 30,
    veil: 2,
    requiredFurniture: [{ role: 'loom', count: 1, name: 'Loom' }],
    optionalSlots: 2,
    stats: { primary: ['order', 'charm'], secondary: 'comfort' },
    description: 'Spins 0.5 Cloth per bell at full efficiency (doubled with a tamed Moonsheep). Cloth caps at 500.'
  },

  // --- RIFT & DISPLAY ---
  rift_gate: {
    id: 'rift_gate',
    name: 'Rift Gate',
    category: 'rift',
    area: 'grounds',
    size: [2, 1],
    maxCount: 1,
    unlock: { type: 'grant' }, // granted at 3 masters
    cost: { mana: 1000, stone: 60, glass: 20, crystal: 5 },
    buildReviews: 120,
    veil: 10,
    capacity: { adventurers: 3 },
    requiredFurniture: [
      { role: 'gate_arch', count: 1, name: 'Gate Arch' },
      { role: 'anchor_stones', count: 1, name: 'Anchor Stones' }
    ],
    optionalSlots: 2,
    stats: { primary: ['aura', 'order'], secondary: 'focus' },
    description: 'Anchors the tear in reality. Send teams of 1-3 adventurers on hazardous expeditions.'
  },
  training_yard: {
    id: 'training_yard',
    name: 'Training Yard',
    category: 'rift',
    area: 'grounds',
    size: [2, 1],
    unlock: { type: 'standard' },
    cost: { mana: 300, timber: 30, stone: 10 },
    buildReviews: 40,
    veil: 2,
    capacity: { adventurers: 3 },
    requiredFurniture: [{ role: 'practice_dummies', count: 1, name: 'Practice Dummies' }],
    optionalSlots: 3,
    stats: { primary: ['order', 'focus'], secondary: 'comfort' },
    description: 'Drills adventurers between expeditions. Yields +1 Rift Fortune per yard level.'
  },
  trophy_hall: {
    id: 'trophy_hall',
    name: 'Trophy Hall',
    category: 'rift',
    area: 'castle',
    size: [2, 1],
    unlock: { type: 'draft', rarity: 'rare' },
    cost: { mana: 700, stone: 40, glass: 20 },
    buildReviews: 80,
    veil: 5,
    capacity: { plinths: 4 },
    requiredFurniture: [],
    optionalSlots: 2,
    stats: { primary: ['charm', 'aura'], secondary: 'order' },
    description: 'Displays legendary artifacts recovered from the Rift. Artifacts only activate here.'
  },

  // --- GROUNDS PLOTS ---
  vegetable_patch: {
    id: 'vegetable_patch',
    name: 'Vegetable Patch',
    category: 'grounds',
    area: 'grounds',
    size: [1, 1],
    unlock: { type: 'start' },
    cost: { mana: 60, timber: 10 },
    buildReviews: 15,
    veil: 2,
    requiredFurniture: [],
    optionalSlots: 1,
    stats: { primary: ['comfort', 'order'], secondary: 'charm' },
    description: 'Produces 1.0 Provisions and 0.2 Greens per bell.'
  },
  herb_garden: {
    id: 'herb_garden',
    name: 'Herb Garden',
    category: 'grounds',
    area: 'grounds',
    size: [1, 1],
    unlock: { type: 'standard' },
    cost: { mana: 80, timber: 10 },
    buildReviews: 20,
    veil: 2,
    requiredFurniture: [],
    optionalSlots: 1,
    stats: { primary: ['aura', 'charm'], secondary: 'order' },
    description: 'Produces 0.6 Herbs per bell for alchemy potions.'
  },
  woodlot: {
    id: 'woodlot',
    name: 'Woodlot',
    category: 'grounds',
    area: 'grounds',
    size: [1, 1],
    unlock: { type: 'start' },
    cost: { mana: 50, stone: 5 },
    buildReviews: 15,
    veil: 2,
    requiredFurniture: [],
    optionalSlots: 1,
    stats: { primary: ['order', 'comfort'], secondary: 'charm' },
    description: 'Yields 2 Timber per bell with a 0.5% chance of rare Heartwood.'
  },
  quarry: {
    id: 'quarry',
    name: 'Quarry',
    category: 'grounds',
    area: 'grounds',
    size: [1, 1],
    unlock: { type: 'start' },
    cost: { mana: 80, timber: 10 },
    buildReviews: 20,
    veil: 2,
    requiredFurniture: [],
    optionalSlots: 1,
    stats: { primary: ['order', 'order'], secondary: 'focus' },
    description: 'Quarries 1 Stone per bell with a 2% chance of Crystal.'
  },
  pond: {
    id: 'pond',
    name: 'Pond',
    category: 'grounds',
    area: 'grounds',
    size: [2, 1],
    unlock: { type: 'standard' },
    cost: { mana: 150, stone: 20 },
    buildReviews: 30,
    veil: 3,
    requiredFurniture: [],
    optionalSlots: 1,
    stats: { primary: ['comfort', 'charm'], secondary: 'aura' },
    description: 'Yields 0.8 Fish per bell; Tide creatures occasionally visit.'
  },
  orchard: {
    id: 'orchard',
    name: 'Orchard',
    category: 'grounds',
    area: 'grounds',
    size: [2, 1],
    unlock: { type: 'draft', rarity: 'common' },
    cost: { mana: 250, timber: 30 },
    buildReviews: 50,
    veil: 3,
    capacity: { leisureSeats: 4 },
    requiredFurniture: [],
    optionalSlots: 1,
    stats: { primary: ['comfort', 'charm'], secondary: 'order' },
    description: 'Yields 0.8 Provisions and 0.3 Nectar per bell. Provides 4 Leisure capacity.'
  },
  apiary: {
    id: 'apiary',
    name: 'Apiary',
    category: 'grounds',
    area: 'grounds',
    size: [1, 1],
    unlock: { type: 'draft', rarity: 'uncommon' },
    cost: { mana: 200, timber: 20 },
    buildReviews: 30,
    veil: 2,
    requiredFurniture: [],
    optionalSlots: 1,
    stats: { primary: ['order', 'charm'], secondary: 'aura' },
    description: 'Produces 0.5 Nectar per bell; boosts adjacent outdoor plots by +5%.'
  },
  courtyard_garden: {
    id: 'courtyard_garden',
    name: 'Courtyard Garden',
    category: 'grounds',
    area: 'grounds',
    size: [1, 1],
    unlock: { type: 'draft', rarity: 'common' },
    cost: { mana: 120, stone: 15 },
    buildReviews: 20,
    veil: 1,
    capacity: { leisureSeats: 3 },
    requiredFurniture: [],
    optionalSlots: 1,
    stats: { primary: ['charm', 'comfort'], secondary: 'order' },
    description: 'Decorative courtyard offering 3 Leisure capacity and +3 Academy Charm.'
  },
  standing_stones: {
    id: 'standing_stones',
    name: 'Standing Stones',
    category: 'grounds',
    area: 'grounds',
    size: [1, 1],
    unlock: { type: 'draft', rarity: 'uncommon' },
    cost: { mana: 400, stone: 40 },
    buildReviews: 50,
    veil: 2,
    requiredFurniture: [],
    optionalSlots: 1,
    stats: { primary: ['order', 'aura'], secondary: 'focus' },
    description: 'Reduces grounds hazards by 50%, breach chance by 25%, and adds +2 Veil strength daily.'
  },
  moonwell: {
    id: 'moonwell',
    name: 'Moonwell',
    category: 'grounds',
    area: 'grounds',
    size: [1, 1],
    unlock: { type: 'draft', rarity: 'rare' },
    cost: { mana: 500, stone: 30, radiance: 10 },
    buildReviews: 60,
    veil: 3,
    requiredFurniture: [],
    optionalSlots: 1,
    stats: { primary: ['aura', 'comfort'], secondary: 'charm' },
    description: 'Infused with starlight: accelerates injury healing by +20% and raises Composure.'
  }
};

// Key Furniture Definitions from GDD Section 17
export const FURNITURE_DEFINITIONS: Record<string, FurnitureDefinition> = {
  // Beds
  simple_cot: {
    id: 'simple_cot',
    name: 'Simple Cot',
    role: 'bed',
    targetRole: 'bed',
    slots: 1,
    cost: { mana: 30, timber: 5 },
    stats: { comfort: 1 },
    rooms: ['dormitory', 'grand_dormitory'],
    unlock: { type: 'std' }
  },
  feather_bed: {
    id: 'feather_bed',
    name: 'Feather Bed',
    role: 'bed',
    targetRole: 'bed',
    slots: 1,
    cost: { mana: 90, timber: 6, cloth: 3 },
    stats: { comfort: 3 },
    rooms: ['dormitory', 'grand_dormitory'],
    unlock: { type: 'std' }
  },
  canopy_bed: {
    id: 'canopy_bed',
    name: 'Canopy Bed',
    role: 'bed',
    targetRole: 'bed',
    slots: 1,
    cost: { mana: 220, timber: 8, cloth: 6, moonsilk: 1 },
    stats: { comfort: 5, charm: 2 },
    specialEffect: 'Occupant Rest target +5',
    rooms: ['dormitory', 'grand_dormitory'],
    unlock: { type: 'draft', rarity: 'uncommon' }
  },
  faculty_bed: {
    id: 'faculty_bed',
    name: 'Faculty Bed',
    role: 'faculty_bed',
    targetRole: 'faculty_bed',
    slots: 1,
    cost: { mana: 100, timber: 8, cloth: 3 },
    stats: { comfort: 3 },
    rooms: ['faculty_quarters'],
    unlock: { type: 'std' }
  },
  // Required items
  grand_doors: {
    id: 'grand_doors',
    name: 'Grand Doors',
    role: 'required',
    targetRole: 'grand_doors',
    slots: 1,
    cost: { mana: 0 },
    stats: { order: 3, charm: 3 },
    rooms: ['entrance_hall'],
    unlock: { type: 'grant' }
  },
  orb_stand: {
    id: 'orb_stand',
    name: 'Orb Stand',
    role: 'required',
    targetRole: 'orb_stand',
    slots: 1,
    cost: { mana: 0 },
    stats: { aura: 4, focus: 2 },
    rooms: ['wizard_study'],
    unlock: { type: 'grant' }
  },
  lectern: {
    id: 'lectern',
    name: 'Study Lectern',
    role: 'required',
    targetRole: 'lectern',
    slots: 1,
    cost: { mana: 0 },
    stats: { focus: 4, order: 2 },
    rooms: ['wizard_study'],
    unlock: { type: 'grant' }
  },
  shelving: {
    id: 'shelving',
    name: 'Vault Shelving',
    role: 'required',
    targetRole: 'shelving',
    slots: 1,
    cost: { mana: 50, timber: 8 },
    stats: { order: 1 },
    rooms: ['storage_vault'],
    unlock: { type: 'std' }
  },
  long_table: {
    id: 'long_table',
    name: 'Long Table',
    role: 'required',
    targetRole: 'long_table',
    slots: 1,
    cost: { mana: 120, timber: 15 },
    stats: { order: 2 },
    rooms: ['refectory'],
    unlock: { type: 'std' }
  },
  hearth: {
    id: 'hearth',
    name: 'Hearth',
    role: 'required',
    targetRole: 'hearth',
    slots: 1,
    cost: { mana: 150, stone: 20 },
    stats: { comfort: 3 },
    rooms: ['refectory', 'common_room'],
    unlock: { type: 'std' }
  },
  teachers_lectern: {
    id: 'teachers_lectern',
    name: "Teacher's Lectern",
    role: 'required',
    targetRole: 'teachers_lectern',
    slots: 1,
    cost: { mana: 80, timber: 8 },
    stats: { focus: 2 },
    rooms: ['class_arcane', 'class_nature', 'class_light', 'class_shadow', 'class_alchemy'],
    unlock: { type: 'std' }
  },
  orrery_globe: {
    id: 'orrery_globe',
    name: 'Orrery Globe',
    role: 'required',
    targetRole: 'orrery_globe',
    slots: 1,
    cost: { mana: 160, stone: 5, glass: 5 },
    stats: { aura: 3, focus: 1 },
    rooms: ['class_arcane'],
    unlock: { type: 'std' }
  },
  potting_bench: {
    id: 'potting_bench',
    name: 'Potting Bench',
    role: 'required',
    targetRole: 'potting_bench',
    slots: 1,
    cost: { mana: 120, timber: 10, herbs: 3 },
    stats: { aura: 3, comfort: 1 },
    rooms: ['class_nature'],
    unlock: { type: 'std' }
  },
  sun_altar: {
    id: 'sun_altar',
    name: 'Sun Altar',
    role: 'required',
    targetRole: 'sun_altar',
    slots: 1,
    cost: { mana: 150, stone: 10, glass: 2 },
    stats: { aura: 3, charm: 1 },
    rooms: ['class_light'],
    unlock: { type: 'std' }
  },
  veiled_mirror: {
    id: 'veiled_mirror',
    name: 'Veiled Mirror',
    role: 'required',
    targetRole: 'veiled_mirror',
    slots: 1,
    cost: { mana: 150, glass: 3, cloth: 3 },
    stats: { aura: 3, order: 1 },
    rooms: ['class_shadow'],
    unlock: { type: 'std' }
  },
  bench_cauldron: {
    id: 'bench_cauldron',
    name: 'Bench Cauldron',
    role: 'required',
    targetRole: 'bench_cauldron',
    slots: 1,
    cost: { mana: 150, stone: 10, glass: 2 },
    stats: { aura: 3, order: 1 },
    rooms: ['class_alchemy'],
    unlock: { type: 'std' }
  },
  planter_bed: {
    id: 'planter_bed',
    name: 'Planter Bed',
    role: 'required',
    targetRole: 'planter_bed',
    slots: 1,
    cost: { mana: 60, timber: 8 },
    stats: { aura: 1 },
    rooms: ['greenhouse'],
    unlock: { type: 'std' }
  },
  // Optional decor
  potted_fern: {
    id: 'potted_fern',
    name: 'Potted Fern',
    role: 'optional',
    slots: 1,
    cost: { mana: 30, timber: 2 },
    stats: { charm: 2 },
    rooms: 'any',
    unlock: { type: 'std' }
  },
  bookshelf: {
    id: 'bookshelf',
    name: 'Bookshelf',
    role: 'optional',
    slots: 1,
    cost: { mana: 100, timber: 10 },
    stats: { focus: 3, order: 1 },
    specialEffect: 'Well-Read trait activates (+10% classroom yield)',
    rooms: 'any',
    unlock: { type: 'std' }
  },
  tapestry: {
    id: 'tapestry',
    name: 'Tapestry',
    role: 'optional',
    slots: 1,
    cost: { mana: 80, cloth: 4 },
    stats: { charm: 4, comfort: 1 },
    rooms: 'any',
    unlock: { type: 'std' }
  },
  ward_lantern: {
    id: 'ward_lantern',
    name: 'Ward Lantern',
    role: 'optional',
    slots: 1,
    cost: { mana: 160, glass: 5, umbra: 5 },
    stats: { order: 2 },
    specialEffect: 'Hazards in room -30%, adjacent rooms -10%',
    rooms: 'any',
    unlock: { type: 'draft', school: 'shadow', rarity: 'common' }
  },
  enchanted_broom: {
    id: 'enchanted_broom',
    name: 'Enchanted Broom',
    role: 'optional',
    slots: 1,
    cost: { mana: 150, timber: 5, reagents: 5 },
    stats: { order: 2 },
    specialEffect: 'Cleans 1 cleanliness point per bell in room',
    rooms: 'any',
    unlock: { type: 'draft', school: 'alchemy', rarity: 'common' }
  },
  fume_hood: {
    id: 'fume_hood',
    name: 'Fume Hood',
    role: 'optional',
    slots: 1,
    cost: { mana: 250, stone: 10, glass: 10, reagents: 3 },
    stats: { order: 2 },
    specialEffect: 'Explosions -40%; removes Alchemy Lab noise penalty',
    rooms: ['alchemy_lab'],
    unlock: { type: 'draft', school: 'alchemy', rarity: 'uncommon' }
  },
  // Additional Bedroom & Living
  bunk_bed: {
    id: 'bunk_bed',
    name: 'Bunk Bed',
    role: 'bed',
    slots: 1,
    cost: { mana: 120, timber: 12 },
    stats: { comfort: 2, order: 1 },
    specialEffect: 'Provides 2 student bed slots in 1 furniture slot',
    rooms: ['dormitory', 'grand_dormitory'],
    unlock: { type: 'draft', rarity: 'common' }
  },
  dreamcatcher_bed: {
    id: 'dreamcatcher_bed',
    name: 'Dreamcatcher Bed',
    role: 'bed',
    slots: 1,
    cost: { mana: 300, timber: 8, cloth: 4, insight: 5 },
    stats: { comfort: 4, charm: 2 },
    specialEffect: 'Occupant Composure target +5',
    rooms: ['dormitory', 'grand_dormitory'],
    unlock: { type: 'draft', school: 'arcane', rarity: 'uncommon' }
  },
  mossbed: {
    id: 'mossbed',
    name: 'Living Mossbed',
    role: 'bed',
    slots: 1,
    cost: { mana: 180, timber: 6, herbs: 10 },
    stats: { comfort: 4, aura: 1 },
    specialEffect: 'Occupant heals 20% faster',
    rooms: ['dormitory', 'grand_dormitory'],
    unlock: { type: 'draft', school: 'nature', rarity: 'uncommon' }
  },
  footlocker: {
    id: 'footlocker',
    name: 'Footlocker',
    role: 'optional',
    slots: 1,
    cost: { mana: 40, timber: 4 },
    stats: { order: 1 },
    rooms: ['dormitory', 'grand_dormitory', 'faculty_quarters'],
    unlock: { type: 'std' }
  },
  moon_curtains: {
    id: 'moon_curtains',
    name: 'Moon-Shroud Curtains',
    role: 'optional',
    slots: 1,
    cost: { mana: 140, cloth: 6, umbra: 4 },
    stats: { order: 2, aura: 1 },
    specialEffect: 'Dorm Rest target +5 (dark restful sleep)',
    rooms: ['dormitory', 'grand_dormitory'],
    unlock: { type: 'draft', school: 'shadow', rarity: 'common' }
  },
  // Faculty & Leisure
  couch: {
    id: 'couch',
    name: 'Velvet Couch',
    role: 'optional',
    slots: 1,
    cost: { mana: 90, timber: 8, cloth: 4 },
    stats: { comfort: 3, charm: 1 },
    rooms: ['common_room', 'faculty_lounge', 'entrance_hall'],
    unlock: { type: 'std' }
  },
  hammock: {
    id: 'hammock',
    name: 'Woven Hammock',
    role: 'optional',
    slots: 1,
    cost: { mana: 60, cloth: 4 },
    stats: { comfort: 2 },
    rooms: ['common_room', 'dormitory'],
    unlock: { type: 'std' }
  },
  tea_service: {
    id: 'tea_service',
    name: 'Porcelain Tea Service',
    role: 'optional',
    slots: 1,
    cost: { mana: 120, glass: 2, herbs: 2 },
    stats: { comfort: 2, charm: 2 },
    specialEffect: 'Lounge career outputs +1%',
    rooms: ['faculty_lounge', 'wizard_study'],
    unlock: { type: 'draft', school: 'light', rarity: 'common' }
  },
  wizard_chess: {
    id: 'wizard_chess',
    name: "Wizard's Chess Table",
    role: 'optional',
    slots: 1,
    cost: { mana: 140, timber: 10, insight: 2 },
    stats: { charm: 2, focus: 1 },
    specialEffect: '+2 Leisure capacity',
    rooms: ['common_room', 'faculty_lounge'],
    unlock: { type: 'draft', school: 'arcane', rarity: 'common' }
  },
  music_box: {
    id: 'music_box',
    name: 'Music Box of Calm',
    role: 'optional',
    slots: 1,
    cost: { mana: 160, glass: 3, radiance: 3 },
    stats: { charm: 2, comfort: 1 },
    specialEffect: 'Occupants +3 Composure target',
    rooms: ['common_room', 'dormitory', 'infirmary'],
    unlock: { type: 'draft', school: 'light', rarity: 'common' }
  },
  hex_darts: {
    id: 'hex_darts',
    name: 'Dartboard of Harmless Hexes',
    role: 'optional',
    slots: 1,
    cost: { mana: 120, timber: 6, umbra: 3 },
    stats: { charm: 1, focus: 1 },
    specialEffect: 'Misbehavior Academy-wide -5%',
    rooms: ['common_room', 'faculty_lounge'],
    unlock: { type: 'draft', school: 'shadow', rarity: 'common' }
  },
  warm_hearthstone: {
    id: 'warm_hearthstone',
    name: 'Warm Hearthstone',
    role: 'optional',
    slots: 1,
    cost: { mana: 160, stone: 10, reagents: 3 },
    stats: { comfort: 3, order: 1 },
    specialEffect: 'Halves Cold Snap hazard effects in room',
    rooms: ['dormitory', 'common_room', 'faculty_lounge'],
    unlock: { type: 'draft', school: 'alchemy', rarity: 'common' }
  },
  // Refectory & Kitchen
  cooking_range: {
    id: 'cooking_range',
    name: 'Cooking Range',
    role: 'required',
    slots: 1,
    cost: { mana: 180, stone: 15, glass: 2 },
    stats: { order: 2, aura: 1 },
    rooms: ['kitchen'],
    unlock: { type: 'std' }
  },
  spice_rack: {
    id: 'spice_rack',
    name: 'Herb & Spice Rack',
    role: 'optional',
    slots: 1,
    cost: { mana: 70, timber: 5, herbs: 3 },
    stats: { charm: 1 },
    specialEffect: 'Hearty meals grant +2 extra morale',
    rooms: ['kitchen', 'refectory'],
    unlock: { type: 'draft', school: 'nature', rarity: 'common' }
  },
  frostbox: {
    id: 'frostbox',
    name: 'Arcane Frostbox',
    role: 'optional',
    slots: 1,
    cost: { mana: 200, stone: 5, glass: 5, insight: 3 },
    stats: { order: 2 },
    specialEffect: '+100 Provisions storage capacity',
    rooms: ['kitchen', 'storage_vault'],
    unlock: { type: 'draft', school: 'arcane', rarity: 'common' }
  },
  stewpot: {
    id: 'stewpot',
    name: 'Bottomless Stewpot',
    role: 'optional',
    slots: 1,
    cost: { mana: 400, stone: 10, reagents: 10, ember_salt: 2 },
    stats: { aura: 2, comfort: 2 },
    specialEffect: 'Meals use 20% fewer Provisions',
    rooms: ['kitchen'],
    unlock: { type: 'draft', school: 'alchemy', rarity: 'rare' }
  },
  banquet_bell: {
    id: 'banquet_bell',
    name: 'Banquet Bell',
    role: 'optional',
    slots: 1,
    cost: { mana: 250, stone: 10, glass: 3 },
    stats: { charm: 3 },
    specialEffect: 'Ring for Feast: next meal gives Well-Fed to all and +5 Leisure',
    rooms: ['refectory'],
    unlock: { type: 'draft', rarity: 'uncommon' }
  },
  // Knowledge & Science
  reading_desk: {
    id: 'reading_desk',
    name: 'Reading Desk',
    role: 'required',
    slots: 1,
    cost: { mana: 90, timber: 8 },
    stats: { focus: 3 },
    rooms: ['library'],
    unlock: { type: 'std' }
  },
  rolling_ladder: {
    id: 'rolling_ladder',
    name: 'Rolling Library Ladder',
    role: 'optional',
    slots: 1,
    cost: { mana: 80, timber: 8 },
    stats: { order: 1, charm: 1 },
    specialEffect: 'Library study capacity +1',
    rooms: ['library'],
    unlock: { type: 'std' }
  },
  great_telescope: {
    id: 'great_telescope',
    name: 'Great Brass Telescope',
    role: 'required',
    slots: 2,
    cost: { mana: 400, stone: 10, glass: 15, crystal: 2 },
    stats: { aura: 5, focus: 3 },
    rooms: ['observatory'],
    unlock: { type: 'std' }
  },
  scribes_desk: {
    id: 'scribes_desk',
    name: "Master Scribe's Desk",
    role: 'required',
    slots: 1,
    cost: { mana: 150, timber: 10, cloth: 3 },
    stats: { focus: 3 },
    rooms: ['scriptorium'],
    unlock: { type: 'std' }
  },
  globe_elsewhere: {
    id: 'globe_elsewhere',
    name: 'Globe of Elsewhere',
    role: 'optional',
    slots: 1,
    cost: { mana: 350, glass: 5, insight: 10, crystal: 1 },
    stats: { aura: 3, focus: 2 },
    specialEffect: '+0.2 Insight per bell',
    rooms: ['observatory', 'library', 'wizard_study'],
    unlock: { type: 'draft', school: 'arcane', rarity: 'rare' }
  },
  silent_quill: {
    id: 'silent_quill',
    name: 'Self-Writing Quill',
    role: 'optional',
    slots: 1,
    cost: { mana: 220, moonsilk: 2, insight: 5 },
    stats: { focus: 3 },
    specialEffect: 'Scriptorium crafts 25% faster',
    rooms: ['scriptorium', 'wizard_study'],
    unlock: { type: 'draft', school: 'arcane', rarity: 'uncommon' }
  },
  map_table: {
    id: 'map_table',
    name: 'Expedition Map Table',
    role: 'optional',
    slots: 2,
    cost: { mana: 300, timber: 10, cloth: 5, insight: 5 },
    stats: { focus: 2, order: 2 },
    specialEffect: 'Rift Fortune +1 on all expeditions',
    rooms: ['library', 'training_yard', 'wizard_study'],
    unlock: { type: 'draft', school: 'arcane', rarity: 'uncommon' }
  },
  // Nature & Habitats
  rain_cistern: {
    id: 'rain_cistern',
    name: 'Rainwater Cistern',
    role: 'optional',
    slots: 1,
    cost: { mana: 140, stone: 10, glass: 3 },
    stats: { comfort: 1, order: 1 },
    specialEffect: 'Greenhouse output +10%',
    rooms: ['greenhouse', 'vegetable_patch'],
    unlock: { type: 'std' }
  },
  compost_bin: {
    id: 'compost_bin',
    name: 'Enriched Compost Bin',
    role: 'optional',
    slots: 1,
    cost: { mana: 50, timber: 6 },
    stats: { order: 1 },
    specialEffect: 'Greenhouse +5%; converts garden waste to Herbs',
    rooms: ['greenhouse', 'vegetable_patch'],
    unlock: { type: 'std' }
  },
  glowcap_lamp: {
    id: 'glowcap_lamp',
    name: 'Glowcap Grow-Lamp',
    role: 'optional',
    slots: 1,
    cost: { mana: 180, glass: 3, herbs: 5, insight: 2 },
    stats: { aura: 2 },
    specialEffect: 'Greenhouse crop output +15%',
    rooms: ['greenhouse'],
    unlock: { type: 'draft', school: 'nature', rarity: 'uncommon' }
  },
  feeding_trough: {
    id: 'feeding_trough',
    name: 'Meadow Feeding Trough',
    role: 'required',
    slots: 1,
    cost: { mana: 60, timber: 8 },
    stats: { order: 1 },
    rooms: ['meadow_paddock', 'menagerie'],
    unlock: { type: 'std' }
  },
  glass_tank: {
    id: 'glass_tank',
    name: 'Reinforced Glass Tank',
    role: 'required',
    slots: 2,
    cost: { mana: 200, glass: 20 },
    stats: { aura: 2 },
    rooms: ['tide_tank', 'menagerie'],
    unlock: { type: 'std' }
  },
  perch_tree: {
    id: 'perch_tree',
    name: 'Indoor Perch Tree',
    role: 'required',
    slots: 1,
    cost: { mana: 120, timber: 10 },
    stats: { charm: 2 },
    rooms: ['aviary', 'menagerie'],
    unlock: { type: 'std' }
  },
  lightless_burrow: {
    id: 'lightless_burrow',
    name: 'Lightless Burrow',
    role: 'required',
    slots: 1,
    cost: { mana: 100, stone: 10, cloth: 2 },
    stats: { comfort: 2 },
    rooms: ['gloom_hutch', 'menagerie'],
    unlock: { type: 'std' }
  },
  brazier_nest: {
    id: 'brazier_nest',
    name: 'Fire-Clay Brazier Nest',
    role: 'required',
    slots: 1,
    cost: { mana: 140, stone: 15 },
    stats: { aura: 2 },
    rooms: ['ember_pit', 'menagerie'],
    unlock: { type: 'std' }
  },
  geode_bed: {
    id: 'geode_bed',
    name: 'Resonant Geode Bed',
    role: 'required',
    slots: 1,
    cost: { mana: 160, stone: 10, crystal: 1 },
    stats: { aura: 2 },
    rooms: ['crystal_vivarium', 'menagerie'],
    unlock: { type: 'std' }
  },
  creature_toybox: {
    id: 'creature_toybox',
    name: 'Creature Toybox',
    role: 'optional',
    slots: 1,
    cost: { mana: 90, timber: 6, cloth: 3 },
    stats: { charm: 2 },
    specialEffect: 'Creature escape chance in room -20%',
    rooms: ['meadow_paddock', 'tide_tank', 'aviary', 'gloom_hutch', 'ember_pit', 'crystal_vivarium', 'menagerie'],
    unlock: { type: 'draft', school: 'nature', rarity: 'common' }
  },
  treat_dispenser: {
    id: 'treat_dispenser',
    name: 'Automatic Treat Dispenser',
    role: 'optional',
    slots: 1,
    cost: { mana: 120, stone: 5, reagents: 2 },
    stats: { order: 1 },
    specialEffect: 'Creatures here consume 25% less food diet',
    rooms: ['meadow_paddock', 'tide_tank', 'aviary', 'gloom_hutch', 'ember_pit', 'crystal_vivarium', 'menagerie'],
    unlock: { type: 'draft', school: 'alchemy', rarity: 'uncommon' }
  },
  warm_rock: {
    id: 'warm_rock',
    name: 'Sunning Rock',
    role: 'optional',
    slots: 1,
    cost: { mana: 80, stone: 10 },
    stats: { comfort: 2 },
    specialEffect: 'Taming speed in this room +10%',
    rooms: ['meadow_paddock', 'tide_tank', 'aviary', 'gloom_hutch', 'ember_pit', 'crystal_vivarium', 'menagerie'],
    unlock: { type: 'draft', school: 'nature', rarity: 'common' }
  },
  // Light, Healing & Health
  infirmary_cot: {
    id: 'infirmary_cot',
    name: 'Infirmary Cot',
    role: 'required',
    slots: 1,
    cost: { mana: 90, timber: 6, cloth: 3 },
    stats: { comfort: 2 },
    specialEffect: 'Provides bed for injured student/hero recovery',
    rooms: ['infirmary'],
    unlock: { type: 'std' }
  },
  remedy_cabinet: {
    id: 'remedy_cabinet',
    name: 'Apothecary Remedy Cabinet',
    role: 'required',
    slots: 1,
    cost: { mana: 150, timber: 8, glass: 4 },
    stats: { order: 2 },
    specialEffect: 'Infirmary recovery speed +10%',
    rooms: ['infirmary', 'bathhouse'],
    unlock: { type: 'std' }
  },
  healing_basin: {
    id: 'healing_basin',
    name: 'Healing Spring Basin',
    role: 'optional',
    slots: 2,
    cost: { mana: 350, stone: 15, radiance: 10 },
    stats: { aura: 3, comfort: 2 },
    specialEffect: 'Healing rate +25%',
    rooms: ['infirmary', 'bathhouse', 'sanctuary'],
    unlock: { type: 'draft', school: 'light', rarity: 'rare' }
  },
  sun_window: {
    id: 'sun_window',
    name: 'Luminous Sun Window',
    role: 'required',
    slots: 1,
    cost: { mana: 200, glass: 15, radiance: 5 },
    stats: { charm: 3, aura: 3 },
    rooms: ['sanctuary'],
    unlock: { type: 'std' }
  },
  meditation_cushions: {
    id: 'meditation_cushions',
    name: 'Silk Meditation Cushions',
    role: 'optional',
    slots: 1,
    cost: { mana: 60, cloth: 4 },
    stats: { comfort: 2, focus: 1 },
    specialEffect: 'Sanctum capacity +1; restores composure',
    rooms: ['sanctuary', 'common_room', 'wizard_study'],
    unlock: { type: 'std' }
  },
  soaking_tub: {
    id: 'soaking_tub',
    name: 'Marble Soaking Tub',
    role: 'required',
    slots: 2,
    cost: { mana: 220, stone: 10, glass: 5 },
    stats: { comfort: 4 },
    specialEffect: 'Restores Rest target +10 and heals 10% faster',
    rooms: ['bathhouse'],
    unlock: { type: 'std' }
  },
  halo_candles: {
    id: 'halo_candles',
    name: 'Halo Candles',
    role: 'optional',
    slots: 1,
    cost: { mana: 130, glass: 2, radiance: 4 },
    stats: { aura: 2, charm: 1 },
    specialEffect: 'Composure target +2 in room',
    rooms: ['dormitory', 'sanctuary', 'infirmary'],
    unlock: { type: 'draft', school: 'light', rarity: 'common' }
  },
  // Shadow & Defense
  ward_circle: {
    id: 'ward_circle',
    name: 'Inscribed Ward Circle',
    role: 'required',
    slots: 1,
    cost: { mana: 200, stone: 10, glass: 2 },
    stats: { order: 3, aura: 2 },
    specialEffect: 'Suppresses hazards in room and adjacent areas',
    rooms: ['warding_chamber', 'ward_spire'],
    unlock: { type: 'std' }
  },
  penitent_benches: {
    id: 'penitent_benches',
    name: 'Hardwood Penitent Benches',
    role: 'required',
    slots: 1,
    cost: { mana: 100, timber: 10 },
    stats: { order: 2 },
    specialEffect: 'Cures unruly student misbehavior',
    rooms: ['detention_hall'],
    unlock: { type: 'std' }
  },
  silence_bell: {
    id: 'silence_bell',
    name: 'Silence Bell of St. Jude',
    role: 'optional',
    slots: 1,
    cost: { mana: 250, stone: 5, umbra: 8 },
    stats: { order: 3 },
    specialEffect: 'Misbehavior in adjacent rooms -15%',
    rooms: ['corridor', 'dormitory', 'detention_hall'],
    unlock: { type: 'draft', school: 'shadow', rarity: 'uncommon' }
  },
  shadow_ledger: {
    id: 'shadow_ledger',
    name: 'Shadow Ledger of Fates',
    role: 'optional',
    slots: 1,
    cost: { mana: 300, cloth: 10, umbra: 10 },
    stats: { order: 2, focus: 2 },
    specialEffect: 'Warns of next hazard target room in advance',
    rooms: ['warding_chamber', 'wizard_study'],
    unlock: { type: 'draft', school: 'shadow', rarity: 'uncommon' }
  },
  nightglass: {
    id: 'nightglass',
    name: 'Nightglass Tinted Pane',
    role: 'optional',
    slots: 1,
    cost: { mana: 180, glass: 10, umbra: 4 },
    stats: { aura: 2, charm: 1 },
    specialEffect: 'Gloom creatures in adjacent habitats +10% buff',
    rooms: ['gloom_hutch', 'warding_chamber', 'dormitory'],
    unlock: { type: 'draft', school: 'shadow', rarity: 'common' }
  },
  // Craft, Storage & Training
  brewing_cauldron: {
    id: 'brewing_cauldron',
    name: 'Cast Iron Brewing Cauldron',
    role: 'required',
    slots: 1,
    cost: { mana: 220, stone: 15, glass: 2 },
    stats: { aura: 3, order: 1 },
    rooms: ['alchemy_lab'],
    unlock: { type: 'std' }
  },
  ingredient_rack: {
    id: 'ingredient_rack',
    name: 'Organized Ingredient Rack',
    role: 'required',
    slots: 1,
    cost: { mana: 100, timber: 8, glass: 2 },
    stats: { order: 2 },
    rooms: ['alchemy_lab', 'apothecary'],
    unlock: { type: 'std' }
  },
  alembic_array: {
    id: 'alembic_array',
    name: 'Crystal Alembic Array',
    role: 'optional',
    slots: 2,
    cost: { mana: 450, glass: 20, reagents: 10, ember_salt: 2 },
    stats: { aura: 4, focus: 2 },
    specialEffect: 'Potion yield +10%, brew review cost -20%',
    rooms: ['alchemy_lab'],
    unlock: { type: 'draft', school: 'alchemy', rarity: 'rare' }
  },
  workbench: {
    id: 'workbench',
    name: 'Heavy Timber Workbench',
    role: 'required',
    slots: 1,
    cost: { mana: 150, timber: 15, stone: 5 },
    stats: { order: 2, focus: 1 },
    rooms: ['workshop'],
    unlock: { type: 'std' }
  },
  tool_wall: {
    id: 'tool_wall',
    name: 'Master Builder Tool Wall',
    role: 'optional',
    slots: 1,
    cost: { mana: 90, timber: 8, stone: 3 },
    stats: { order: 2 },
    specialEffect: 'Builder career construction speed +5%',
    rooms: ['workshop'],
    unlock: { type: 'std' }
  },
  kiln: {
    id: 'kiln',
    name: 'High-Temperature Kiln',
    role: 'required',
    slots: 1,
    cost: { mana: 200, stone: 25 },
    stats: { aura: 2, order: 1 },
    rooms: ['glassworks'],
    unlock: { type: 'std' }
  },
  loom: {
    id: 'loom',
    name: 'Floor Weaving Loom',
    role: 'required',
    slots: 1,
    cost: { mana: 150, timber: 15 },
    stats: { order: 1, charm: 1 },
    rooms: ['weaving_room'],
    unlock: { type: 'std' }
  },
  practice_dummies: {
    id: 'practice_dummies',
    name: 'Straw Practice Dummies',
    role: 'required',
    slots: 1,
    cost: { mana: 80, timber: 10, cloth: 2 },
    stats: { order: 1, focus: 1 },
    rooms: ['training_yard'],
    unlock: { type: 'std' }
  },
  supply_chest: {
    id: 'supply_chest',
    name: 'Reinforced Expedition Supply Chest',
    role: 'optional',
    slots: 1,
    cost: { mana: 120, timber: 10 },
    stats: { order: 1 },
    specialEffect: 'Expeditions gain +1 extra supply item slot',
    rooms: ['training_yard', 'storage_vault'],
    unlock: { type: 'std' }
  },
  artifact_plinth: {
    id: 'artifact_plinth',
    name: 'Polished Marble Plinth',
    role: 'required',
    slots: 1,
    cost: { mana: 150, stone: 15 },
    stats: { charm: 2, aura: 1 },
    specialEffect: 'Safely displays and activates Rift relics',
    rooms: ['trophy_hall', 'entrance_hall'],
    unlock: { type: 'std' }
  },
  // Outdoor Decor Pieces (Sacred Grounds)
  garden_gnome: {
    id: 'garden_gnome',
    name: 'Enchanted Clay Gnome',
    role: 'outdoor',
    slots: 1,
    cost: { mana: 60, stone: 5 },
    stats: { charm: 1 },
    specialEffect: '+1 Academy Charm; scares away 10% of grounds hazards',
    rooms: ['vegetable_patch', 'woodlot', 'herb_garden', 'quarry', 'orchard', 'apiary', 'courtyard_garden'],
    unlock: { type: 'std' }
  },
  bird_bath: {
    id: 'bird_bath',
    name: 'Marble Bird Bath',
    role: 'outdoor',
    slots: 1,
    cost: { mana: 80, stone: 10 },
    stats: { charm: 1 },
    specialEffect: 'Sky creatures grant +5% bonus buff',
    rooms: ['vegetable_patch', 'woodlot', 'herb_garden', 'courtyard_garden'],
    unlock: { type: 'draft', school: 'light', rarity: 'common' }
  },
  scarecrow: {
    id: 'scarecrow',
    name: 'Hexed Scarecrow',
    role: 'outdoor',
    slots: 1,
    cost: { mana: 90, timber: 6, cloth: 2, umbra: 2 },
    stats: { order: 1 },
    specialEffect: 'Plot crop output +5%',
    rooms: ['vegetable_patch', 'herb_garden', 'orchard'],
    unlock: { type: 'draft', school: 'shadow', rarity: 'common' }
  },
  stone_lantern: {
    id: 'stone_lantern',
    name: 'Carved Stone Lantern',
    role: 'outdoor',
    slots: 1,
    cost: { mana: 100, stone: 12 },
    stats: { charm: 2 },
    specialEffect: '+2 Academy Charm for renown ceremonies',
    rooms: ['vegetable_patch', 'woodlot', 'herb_garden', 'courtyard_garden', 'standing_stones'],
    unlock: { type: 'std' }
  },
  beehive_box: {
    id: 'beehive_box',
    name: 'Beehive Box',
    role: 'outdoor',
    slots: 1,
    cost: { mana: 120, timber: 8 },
    stats: { charm: 1 },
    specialEffect: 'Produces +0.1 Nectar per bell',
    rooms: ['vegetable_patch', 'herb_garden', 'orchard', 'apiary'],
    unlock: { type: 'draft', school: 'nature', rarity: 'common' }
  },
  windmill_charm: {
    id: 'windmill_charm',
    name: 'Copper Windmill Charm',
    role: 'outdoor',
    slots: 1,
    cost: { mana: 150, timber: 10, reagents: 3 },
    stats: { order: 1 },
    specialEffect: 'Plot output +8%',
    rooms: ['vegetable_patch', 'herb_garden', 'orchard'],
    unlock: { type: 'draft', school: 'alchemy', rarity: 'uncommon' }
  },
  fairy_ring: {
    id: 'fairy_ring',
    name: 'Fairy Mushroom Ring',
    role: 'outdoor',
    slots: 1,
    cost: { mana: 250, herbs: 10, insight: 5 },
    stats: { charm: 3, aura: 2 },
    specialEffect: '5% chance per day: a wild creature visits your grounds',
    rooms: ['courtyard_garden', 'standing_stones', 'orchard'],
    unlock: { type: 'draft', school: 'nature', rarity: 'uncommon' }
  },
  rune_marker: {
    id: 'rune_marker',
    name: 'Warding Rune Marker',
    role: 'outdoor',
    slots: 1,
    cost: { mana: 200, stone: 15, umbra: 5 },
    stats: { order: 2, aura: 1 },
    specialEffect: 'Grounds hazards -15%',
    rooms: ['woodlot', 'quarry', 'standing_stones'],
    unlock: { type: 'draft', school: 'shadow', rarity: 'uncommon' }
  },
  // Legendary Furniture (Rift Only)
  starfall_chandelier: {
    id: 'starfall_chandelier',
    name: 'Starfall Chandelier',
    role: 'optional',
    slots: 1,
    cost: { mana: 600 },
    stats: { focus: 6, charm: 6 },
    specialEffect: '+0.3 Insight per bell Academy-wide',
    rooms: 'any',
    unlock: { type: 'rift', destination: 'ashen_wastes' }
  },
  heartwood_bench: {
    id: 'heartwood_bench',
    name: 'Living Heartwood Bench',
    role: 'optional',
    slots: 2,
    cost: { mana: 600 },
    stats: { comfort: 6, charm: 4 },
    specialEffect: "All occupants' morale +5",
    rooms: ['common_room', 'faculty_lounge', 'sanctuary'],
    unlock: { type: 'rift', destination: 'crystal_caverns' }
  }
};

// 40 Creatures from Bestiary (GDD Section 22.7)
export const CREATURE_DEFINITIONS: Record<string, CreatureDefinition> = {
  mossback_tortoise: {
    id: 'mossback_tortoise',
    name: 'Mossback Tortoise',
    school: 'nature',
    rarity: 'common',
    habitats: ['meadow'],
    tamingReviews: 40,
    diet: { greens: 1 },
    buffDescription: 'Greenhouse output +5%',
    buffType: 'pct_greenhouse',
    buffValue: 0.05,
    troubleDescription: 'Naps in Vegetable Patch: plot -50% for 10 reviews',
    companionBonus: 1
  },
  thistle_hare: {
    id: 'thistle_hare',
    name: 'Thistle Hare',
    school: 'nature',
    rarity: 'common',
    habitats: ['meadow'],
    tamingReviews: 40,
    diet: { greens: 1 },
    buffDescription: '+0.1 Herbs per bell',
    buffType: 'produce_herbs',
    buffValue: 0.1,
    troubleDescription: 'Hides 5 Herbs (returned on recapture)',
    companionBonus: 1
  },
  bramblefox: {
    id: 'bramblefox',
    name: 'Bramblefox',
    school: 'nature',
    rarity: 'uncommon',
    habitats: ['meadow'],
    tamingReviews: 90,
    diet: { provisions: 1 },
    buffDescription: 'Grounds hazards -15%',
    buffType: 'grounds_hazards',
    buffValue: -0.15,
    troubleDescription: 'Hides 5 Provisions',
    companionBonus: 1
  },
  moonsheep: {
    id: 'moonsheep',
    name: 'Moonsheep',
    school: 'nature',
    rarity: 'uncommon',
    habitats: ['meadow'],
    tamingReviews: 90,
    diet: { greens: 2 },
    buffDescription: 'Weaving Room x2 output; 1 Moonsilk per 40 bells',
    buffType: 'weaving_mult',
    buffValue: 2,
    troubleDescription: 'Sleeps in student bed: resident Rest -15',
    companionBonus: 1
  },
  puddlewyrm: {
    id: 'puddlewyrm',
    name: 'Puddlewyrm',
    school: 'nature',
    rarity: 'uncommon',
    habitats: ['tide'],
    tamingReviews: 90,
    diet: { fish: 1 },
    buffDescription: 'Pond +15% output',
    buffType: 'pond_buff',
    buffValue: 0.15,
    troubleDescription: 'Floods a floor-0 room: cleanliness -30',
    companionBonus: 1
  },
  glimmerhorn_stag: {
    id: 'glimmerhorn_stag',
    name: 'Glimmerhorn Stag',
    school: 'nature',
    rarity: 'rare',
    habitats: ['meadow'],
    tamingReviews: 160,
    diet: { greens: 3 },
    buffDescription: 'Academy morale +3',
    buffType: 'morale_buff',
    buffValue: 3,
    troubleDescription: 'Knocks paddock fence: creatures roll escape',
    companionBonus: 2
  },
  coral_kelpie: {
    id: 'coral_kelpie',
    name: 'Coral Kelpie',
    school: 'nature',
    rarity: 'rare',
    habitats: ['tide'],
    tamingReviews: 160,
    diet: { fish: 2 },
    buffDescription: 'Bathhouse and Infirmary +10%',
    buffType: 'healing_buff',
    buffValue: 0.1,
    troubleDescription: 'Soaks a student: Composure -10',
    companionBonus: 2
  },
  verdant_drake: {
    id: 'verdant_drake',
    name: 'Verdant Drake',
    school: 'nature',
    rarity: 'epic',
    habitats: ['meadow'],
    tamingReviews: 260,
    diet: { provisions: 2, greens: 2 },
    buffDescription: 'Food and Herbs output +12%',
    buffType: 'food_herbs_buff',
    buffValue: 0.12,
    troubleDescription: 'Scorches Greenhouse: locked 30 reviews',
    companionBonus: 3
  },
  elder_treant_sprout: {
    id: 'elder_treant_sprout',
    name: 'Elder Treant Sprout',
    school: 'nature',
    rarity: 'legendary',
    habitats: ['meadow'],
    tamingReviews: 400,
    diet: { greens: 3, herbs: 1 },
    buffDescription: 'Gardener career output +20%',
    buffType: 'gardener_buff',
    buffValue: 0.2,
    troubleDescription: 'Roots in corridor: blocks movement for 20 reviews',
    companionBonus: 3
  },
  fen_sprite: {
    id: 'fen_sprite',
    name: 'Fen Sprite',
    school: 'nature',
    rarity: 'uncommon',
    habitats: ['meadow', 'tide'],
    tamingReviews: 90,
    diet: { nectar: 1 },
    buffDescription: 'Herb Garden and Greenhouse +8%',
    buffType: 'herb_garden_buff',
    buffValue: 0.08,
    troubleDescription: 'Hides 5 Herbs in reeds',
    companionBonus: 1
  },
  inkling_wisp: {
    id: 'inkling_wisp',
    name: 'Inkling Wisp',
    school: 'arcane',
    rarity: 'common',
    habitats: ['crystal'],
    tamingReviews: 40,
    diet: { insight: 1 },
    buffDescription: 'Library +5%; +0.05 Insight per bell',
    buffType: 'produce_insight',
    buffValue: 0.05,
    troubleDescription: 'Hides 3 books: Library -20% for 15 reviews',
    companionBonus: 1
  },
  orrery_moth: {
    id: 'orrery_moth',
    name: 'Orrery Moth',
    school: 'arcane',
    rarity: 'common',
    habitats: ['sky'],
    tamingReviews: 40,
    diet: { nectar: 1 },
    buffDescription: 'Observatory +5%; Rift Fortune +1',
    buffType: 'observatory_buff',
    buffValue: 0.05,
    troubleDescription: 'Nibbles curtains: 1 Cloth furniture damaged',
    companionBonus: 1
  },
  glyph_cat: {
    id: 'glyph_cat',
    name: 'Glyph Cat',
    school: 'arcane',
    rarity: 'uncommon',
    habitats: ['crystal'],
    tamingReviews: 90,
    diet: { provisions: 1 },
    buffDescription: 'Hazards -8% Academy-wide',
    buffType: 'hazard_reduction',
    buffValue: -0.08,
    troubleDescription: 'Teleports into classroom: yield 0 for 10 reviews (petted)',
    companionBonus: 1
  },
  prism_beetle: {
    id: 'prism_beetle',
    name: 'Prism Beetle',
    school: 'arcane',
    rarity: 'uncommon',
    habitats: ['crystal'],
    tamingReviews: 90,
    diet: { insight: 1 },
    buffDescription: 'Produces 1 Crystal per 25 bells',
    buffType: 'produce_crystal',
    buffValue: 0.04,
    troubleDescription: 'Chews glass: 1 Glass furniture damaged',
    companionBonus: 1
  },
  star_heron: {
    id: 'star_heron',
    name: 'Star Heron',
    school: 'arcane',
    rarity: 'rare',
    habitats: ['sky'],
    tamingReviews: 160,
    diet: { fish: 2 },
    buffDescription: 'Foresight +1 day; Rift Fortune +1',
    buffType: 'foresight_buff',
    buffValue: 1,
    troubleDescription: 'Perches on Observatory: locked 15 reviews',
    companionBonus: 2
  },
  phase_ferret: {
    id: 'phase_ferret',
    name: 'Phase Ferret',
    school: 'arcane',
    rarity: 'rare',
    habitats: ['crystal'],
    tamingReviews: 160,
    diet: { insight: 2 },
    buffDescription: 'Successful expeditions +1 loot roll',
    buffType: 'loot_rolls_buff',
    buffValue: 1,
    troubleDescription: 'Borrows artifact: artifact inactive until recaptured',
    companionBonus: 2
  },
  mistfeather_owl: {
    id: 'mistfeather_owl',
    name: 'Mistfeather Owl',
    school: 'arcane',
    rarity: 'rare',
    habitats: ['sky'],
    tamingReviews: 160,
    diet: { fish: 2 },
    buffDescription: 'Library and Scriptorium +10%; Foresight +1 day',
    buffType: 'knowledge_buff',
    buffValue: 0.1,
    troubleDescription: 'Hoots in Library: locked 10 reviews',
    companionBonus: 2
  },
  aether_serpent: {
    id: 'aether_serpent',
    name: 'Aether Serpent',
    school: 'arcane',
    rarity: 'epic',
    habitats: ['crystal'],
    tamingReviews: 260,
    diet: { insight: 3 },
    buffDescription: 'Draft prices -8%',
    buffType: 'draft_discount',
    buffValue: -0.08,
    troubleDescription: 'Tears tiny rift: Echo Loop hazard',
    companionBonus: 3
  },
  chronoflare_owl: {
    id: 'chronoflare_owl',
    name: 'Chronoflare Owl',
    school: 'arcane',
    rarity: 'legendary',
    habitats: ['sky'],
    tamingReviews: 400,
    diet: { insight: 3 },
    buffDescription: 'Once per day, drafts show 4 cards instead of 3',
    buffType: 'draft_four_cards',
    buffValue: 1,
    troubleDescription: 'Stops clocks: Clocks and Foresight off for 20 reviews',
    companionBonus: 3
  },
  lantern_moth: {
    id: 'lantern_moth',
    name: 'Lantern Moth',
    school: 'light',
    rarity: 'common',
    habitats: ['sky'],
    tamingReviews: 40,
    diet: { nectar: 1 },
    buffDescription: 'Academy Charm +3; Composure target +1',
    buffType: 'charm_buff',
    buffValue: 3,
    troubleDescription: 'Swarms lamp: room Focus -5 for 10 reviews',
    companionBonus: 1
  },
  dawn_finch: {
    id: 'dawn_finch',
    name: 'Dawn Finch',
    school: 'light',
    rarity: 'common',
    habitats: ['sky'],
    tamingReviews: 40,
    diet: { greens: 1 },
    buffDescription: 'Composure target +2 Academy-wide',
    buffType: 'composure_target',
    buffValue: 2,
    troubleDescription: 'Sings at night: dorm Rest -5',
    companionBonus: 1
  },
  halo_lamb: {
    id: 'halo_lamb',
    name: 'Halo Lamb',
    school: 'light',
    rarity: 'uncommon',
    habitats: ['meadow'],
    tamingReviews: 90,
    diet: { greens: 1 },
    buffDescription: 'Healing rate +10%',
    buffType: 'healing_rate',
    buffValue: 0.1,
    troubleDescription: 'Follows student to class: room Focus -2 for 10 reviews',
    companionBonus: 1
  },
  gilded_pangolin: {
    id: 'gilded_pangolin',
    name: 'Gilded Pangolin',
    school: 'light',
    rarity: 'uncommon',
    habitats: ['ember'],
    tamingReviews: 90,
    diet: { nectar: 1 },
    buffDescription: '+5 Renown when tamed; Trophy Hall artifacts Renown x1.5',
    buffType: 'trophy_renown',
    buffValue: 1.5,
    troubleDescription: 'Rolls off with 10 Glass (returned on recapture)',
    companionBonus: 1
  },
  dawnhart_gryphon: {
    id: 'dawnhart_gryphon',
    name: 'Dawnhart Gryphon',
    school: 'light',
    rarity: 'rare',
    habitats: ['sky'],
    tamingReviews: 160,
    diet: { provisions: 3 },
    buffDescription: 'As companion: expeditions return 15% sooner',
    buffType: 'expedition_speed',
    buffValue: 0.15,
    troubleDescription: 'Carries student to roof: 50% chance bruised',
    companionBonus: 2
  },
  sunlit_unicorn: {
    id: 'sunlit_unicorn',
    name: 'Sunlit Unicorn',
    school: 'light',
    rarity: 'epic',
    habitats: ['meadow'],
    tamingReviews: 260,
    diet: { greens: 2, radiance: 1 },
    buffDescription: 'Healing +20%; Hexed injuries heal without healer',
    buffType: 'hex_cure_buff',
    buffValue: 0.2,
    troubleDescription: 'Hides in Sanctum: locked 20 reviews',
    companionBonus: 3
  },
  ember_phoenix: {
    id: 'ember_phoenix',
    name: 'Ember Phoenix',
    school: 'light',
    rarity: 'legendary',
    habitats: ['ember', 'sky'],
    tamingReviews: 400,
    diet: { radiance: 2, reagents: 1 },
    buffDescription: 'Recovery +10%; as companion heals worst injury on return',
    buffType: 'recovery_buff',
    buffValue: 0.1,
    troubleDescription: 'Small fire in room: locked 15 reviews',
    companionBonus: 3
  },
  duskmouse: {
    id: 'duskmouse',
    name: 'Duskmouse',
    school: 'shadow',
    rarity: 'common',
    habitats: ['gloom'],
    tamingReviews: 40,
    diet: { provisions: 1 },
    buffDescription: 'Misbehavior -5% Academy-wide',
    buffType: 'misbehavior_reduction',
    buffValue: -0.05,
    troubleDescription: 'Startles Refectory: next meal -10% capacity',
    companionBonus: 1
  },
  hush_raven: {
    id: 'hush_raven',
    name: 'Hush Raven',
    school: 'shadow',
    rarity: 'common',
    habitats: ['gloom', 'sky'],
    tamingReviews: 40,
    diet: { provisions: 1 },
    buffDescription: 'Hazards resolve 15% faster',
    buffType: 'hazard_resolve_speed',
    buffValue: 0.15,
    troubleDescription: 'Steals shinies: hides 5 Glass',
    companionBonus: 1
  },
  velvet_bat_swarm: {
    id: 'velvet_bat_swarm',
    name: 'Velvet Bat Swarm',
    school: 'shadow',
    rarity: 'uncommon',
    habitats: ['gloom'],
    tamingReviews: 90,
    diet: { nectar: 1 },
    buffDescription: 'Hazards -8%; Veil cost -2%',
    buffType: 'veil_cost_reduction',
    buffValue: -0.02,
    troubleDescription: 'Roosts in dorm: residents Rest -10 for 10 reviews',
    companionBonus: 1
  },
  shade_hound: {
    id: 'shade_hound',
    name: 'Shade Hound',
    school: 'shadow',
    rarity: 'uncommon',
    habitats: ['gloom'],
    tamingReviews: 90,
    diet: { umbra: 1 },
    buffDescription: 'Breach effects -50%; clears Imp Infestations instantly',
    buffType: 'breach_defense',
    buffValue: 0.5,
    troubleDescription: 'Howls: floor Composure -10 for 15 reviews',
    companionBonus: 1
  },
  night_lynx: {
    id: 'night_lynx',
    name: 'Night Lynx',
    school: 'shadow',
    rarity: 'rare',
    habitats: ['gloom'],
    tamingReviews: 160,
    diet: { provisions: 2 },
    buffDescription: 'Hazards -15% Academy-wide',
    buffType: 'hazard_reduction',
    buffValue: -0.15,
    troubleDescription: 'Hunts: another random creature becomes loose',
    companionBonus: 2
  },
  umbral_wyrmling: {
    id: 'umbral_wyrmling',
    name: 'Umbral Wyrmling',
    school: 'shadow',
    rarity: 'epic',
    habitats: ['gloom'],
    tamingReviews: 260,
    diet: { umbra: 3 },
    buffDescription: 'Veil cost -5% (stacks inside cap)',
    buffType: 'veil_cost_reduction',
    buffValue: -0.05,
    troubleDescription: 'Gnaws Veil: strength -10',
    companionBonus: 3
  },
  moonless_kitsune: {
    id: 'moonless_kitsune',
    name: 'Moonless Kitsune',
    school: 'shadow',
    rarity: 'legendary',
    habitats: ['gloom'],
    tamingReviews: 400,
    diet: { umbra: 2, nectar: 1 },
    buffDescription: 'Misbehavior -20% Academy-wide',
    buffType: 'misbehavior_reduction',
    buffValue: -0.2,
    troubleDescription: 'Plays tricks: 3 students get cosmetic potion prank',
    companionBonus: 3
  },
  cinder_newt: {
    id: 'cinder_newt',
    name: 'Cinder Newt',
    school: 'alchemy',
    rarity: 'common',
    habitats: ['ember'],
    tamingReviews: 40,
    diet: { reagents: 1 },
    buffDescription: 'Potion yield +5%',
    buffType: 'potion_yield',
    buffValue: 0.05,
    troubleDescription: 'Singes a room: cleanliness -15',
    companionBonus: 1
  },
  mopslime: {
    id: 'mopslime',
    name: 'Mopslime',
    school: 'alchemy',
    rarity: 'common',
    habitats: ['tide'],
    tamingReviews: 40,
    diet: { provisions: 1 },
    buffDescription: 'Cleans 3 points of cleanliness per bell Academy-wide',
    buffType: 'cleanliness_per_bell',
    buffValue: 3,
    troubleDescription: 'Absorbs 5 Provisions (returned on recapture)',
    companionBonus: 1
  },
  bellows_toad: {
    id: 'bellows_toad',
    name: 'Bellows Toad',
    school: 'alchemy',
    rarity: 'uncommon',
    habitats: ['ember'],
    tamingReviews: 90,
    diet: { fish: 1 },
    buffDescription: 'Construction slots +5% speed',
    buffType: 'construction_speed',
    buffValue: 0.05,
    troubleDescription: 'Puffs up in Workshop: locked 10 reviews',
    companionBonus: 1
  },
  quicksilver_otter: {
    id: 'quicksilver_otter',
    name: 'Quicksilver Otter',
    school: 'alchemy',
    rarity: 'uncommon',
    habitats: ['tide'],
    tamingReviews: 90,
    diet: { fish: 2 },
    buffDescription: 'Glassworks and Weaving Room +15%',
    buffType: 'glassworks_buff',
    buffValue: 0.15,
    troubleDescription: 'Slips into Pond: Pond output 0 for 15 reviews',
    companionBonus: 1
  },
  alembic_salamander: {
    id: 'alembic_salamander',
    name: 'Alembic Salamander',
    school: 'alchemy',
    rarity: 'rare',
    habitats: ['ember'],
    tamingReviews: 160,
    diet: { reagents: 2 },
    buffDescription: 'Potion yield +10%; lab explosions -30%',
    buffType: 'potion_yield',
    buffValue: 0.1,
    troubleDescription: 'Starts lab fire: Alchemy Lab locked 20 reviews',
    companionBonus: 2
  },
  geode_golem: {
    id: 'geode_golem',
    name: 'Geode Golem',
    school: 'alchemy',
    rarity: 'rare',
    habitats: ['crystal'],
    tamingReviews: 160,
    diet: { stone: 2 },
    buffDescription: 'Construction slots +10% speed; Storage caps +10%',
    buffType: 'construction_speed',
    buffValue: 0.1,
    troubleDescription: 'Wanders into corridor and sits down for 10 reviews',
    companionBonus: 2
  },
  philosophers_chimera: {
    id: 'philosophers_chimera',
    name: "Philosopher's Chimera",
    school: 'alchemy',
    rarity: 'legendary',
    habitats: ['ember', 'crystal'],
    tamingReviews: 400,
    diet: { reagents: 2, provisions: 2 },
    buffDescription: 'Room and furniture materials -8% (inside cap)',
    buffType: 'material_discount',
    buffValue: -0.08,
    troubleDescription: 'Transmutes up to 50 Timber into Stone',
    companionBonus: 3
  }
};

// 18 Potion Recipes (GDD Section 24.4)
export const POTION_RECIPES: PotionRecipe[] = [
  {
    id: 'mending_draught',
    name: 'Mending Draught',
    tier: 'basic',
    ingredients: ['herbs', 'radiance', 'greens'],
    reviewsToBrew: 20,
    effect: 'Fully heals one injury (including Hexed).',
    discovered: true
  },
  {
    id: 'calming_tonic',
    name: 'Calming Tonic',
    tier: 'basic',
    ingredients: ['herbs', 'umbra', 'nectar'],
    reviewsToBrew: 20,
    effect: 'Composure +30 for everyone in a room; ends a misbehavior chain.',
    discovered: false
  },
  {
    id: 'growth_elixir',
    name: 'Growth Elixir',
    tier: 'basic',
    ingredients: ['herbs', 'reagents', 'fish'],
    reviewsToBrew: 20,
    effect: 'One Greenhouse or plot x2 output for 10 bells.',
    discovered: false
  },
  {
    id: 'beast_biscuit',
    name: 'Beast Biscuit',
    tier: 'basic',
    ingredients: ['greens', 'fish', 'reagents'],
    reviewsToBrew: 20,
    effect: '+30 taming points to one creature, or instantly recaptures a Loose creature.',
    discovered: false
  },
  {
    id: 'lure_musk',
    name: 'Lure Musk',
    tier: 'basic',
    ingredients: ['nectar', 'fish', 'insight'],
    reviewsToBrew: 20,
    effect: 'Guarantees a creature visitor at next day tick in chosen habitat.',
    discovered: false
  },
  {
    id: 'polishing_spirit',
    name: 'Polishing Spirit',
    tier: 'basic',
    ingredients: ['reagents', 'greens', 'nectar'],
    reviewsToBrew: 20,
    effect: 'One room restored to 100 cleanliness; immune to dirt for 20 bells.',
    discovered: false
  },
  {
    id: 'fireproof_salve',
    name: 'Fireproof Salve',
    tier: 'basic',
    ingredients: ['reagents', 'fish', 'umbra'],
    reviewsToBrew: 20,
    effect: 'One room immune to fires and explosions for 50 bells.',
    discovered: false
  },
  {
    id: 'dreamless_draught',
    name: 'Dreamless Draught',
    tier: 'basic',
    ingredients: ['umbra', 'nectar', 'greens'],
    reviewsToBrew: 20,
    effect: 'Residents of one dorm Rest +20.',
    discovered: false
  },
  {
    id: 'veil_tonic',
    name: 'Veil Tonic',
    tier: 'advanced',
    ingredients: ['umbra', 'insight', 'radiance'],
    reviewsToBrew: 40,
    effect: 'Veil strength +15.',
    discovered: false
  },
  {
    id: 'wardwater',
    name: 'Wardwater',
    tier: 'advanced',
    ingredients: ['umbra', 'radiance', 'fish'],
    reviewsToBrew: 40,
    effect: 'Prevents the next hazard on one floor; ends Hex Fog.',
    discovered: false
  },
  {
    id: 'quickmortar',
    name: 'Quickmortar',
    tier: 'advanced',
    ingredients: ['reagents', 'crystal', 'fish'],
    reviewsToBrew: 40,
    effect: '+20 progress points to one construction site.',
    discovered: false
  },
  {
    id: 'rift_elixir',
    name: 'Rift Elixir',
    tier: 'advanced',
    ingredients: ['insight', 'herbs', 'nectar'],
    reviewsToBrew: 40,
    effect: '+10% safe odds on one expedition, up to the destination best odds.',
    discovered: false
  },
  {
    id: 'courage_draught',
    name: 'Courage Draught',
    tier: 'advanced',
    ingredients: ['radiance', 'reagents', 'greens'],
    reviewsToBrew: 40,
    effect: 'One expedition: any injury or curse requires half the usual recovery.',
    discovered: false
  },
  {
    id: 'glass_flux',
    name: 'Glass Flux',
    tier: 'advanced',
    ingredients: ['reagents', 'herbs', 'crystal'],
    reviewsToBrew: 40,
    effect: 'Instantly produces 20 Glass.',
    discovered: false
  },
  {
    id: 'elixir_of_fellowship',
    name: 'Elixir of Fellowship',
    tier: 'rare',
    ingredients: ['moonsilk', 'nectar', 'radiance'],
    reviewsToBrew: 80,
    effect: 'Academy morale +10 for 30 bells.',
    discovered: false
  },
  {
    id: 'starlight_ink',
    name: 'Starlight Ink',
    tier: 'rare',
    ingredients: ['insight', 'starmetal', 'umbra'],
    reviewsToBrew: 80,
    effect: 'Grants 3 draft reroll tokens.',
    discovered: false
  },
  {
    id: 'transmutation_salts',
    name: 'Transmutation Salts',
    tier: 'rare',
    ingredients: ['ember_salt', 'reagents', 'insight'],
    reviewsToBrew: 80,
    effect: 'Converts 50 of one common material into 40 of another.',
    discovered: false
  },
  {
    id: 'phoenix_draught',
    name: 'Phoenix Draught',
    tier: 'legendary',
    ingredients: ['phoenix_ash', 'radiance', 'reagents'],
    reviewsToBrew: 120,
    effect: 'Instantly heals every injury and curse of one returned expedition team.',
    discovered: false
  }
];

// 5 Rift Destinations (GDD Section 27.3, Binding BR-31)
export const RIFT_DESTINATIONS: Record<string, RiftDestination> = {
  mossy_hollow: {
    id: 'mossy_hollow',
    name: 'Mossy Hollow',
    tier: 'easy',
    skillNeeded: 0,
    safeOdds: 85,
    bestOdds: 95,
    reviews: 50,
    cost: 150,
    supplies: 5,
    lootRolls: 2,
    supplySlots: 1,
    band: 'low',
    description: 'A green, dripping hollow under giant roots, fireflies at noon.',
    rewardsSummary: 'Timber, Herbs, common creature eggs, furniture patterns.'
  },
  whispering_fen: {
    id: 'whispering_fen',
    name: 'Whispering Fen',
    tier: 'mild',
    skillNeeded: 10,
    safeOdds: 75,
    bestOdds: 90,
    reviews: 100,
    cost: 300,
    supplies: 10,
    lootRolls: 3,
    supplySlots: 1,
    band: 'low',
    description: 'Mist-covered reed beds where the water murmurs secrets.',
    rewardsSummary: 'Rare herbs, Lumen Lily seeds, Moonsilk, owl and sprite eggs.'
  },
  crystal_caverns: {
    id: 'crystal_caverns',
    name: 'Crystal Caverns',
    tier: 'medium',
    skillNeeded: 20,
    safeOdds: 65,
    bestOdds: 85,
    reviews: 150,
    cost: 500,
    supplies: 15,
    lootRolls: 4,
    supplySlots: 2,
    band: 'low',
    description: 'Echoing galleries of humming crystal and sleeping stone giants.',
    rewardsSummary: 'Crystals, Stone, Golem Cores, Starmetal, Rare creature eggs.'
  },
  ashen_wastes: {
    id: 'ashen_wastes',
    name: 'Ashen Wastes',
    tier: 'hard',
    skillNeeded: 30,
    safeOdds: 55,
    bestOdds: 80,
    reviews: 250,
    cost: 800,
    supplies: 20,
    lootRolls: 5,
    supplySlots: 2,
    band: 'high',
    description: 'Grey dunes, cooling lava rivers, and an ember-tinted sky.',
    rewardsSummary: 'Fire creatures, Ember Salt, Sunstone, Void Pearl, Epic eggs, Artifacts.'
  },
  shattered_spire: {
    id: 'shattered_spire',
    name: 'The Shattered Spire',
    tier: 'deadly',
    skillNeeded: 45,
    safeOdds: 45,
    bestOdds: 70,
    reviews: 400,
    cost: 1200,
    supplies: 30,
    lootRolls: 6,
    supplySlots: 3,
    band: 'high',
    description: 'Floating fragments of a shattered ancient tower, stairways into void.',
    rewardsSummary: 'Rare/Epic/Legendary draft cards, supreme artifacts, Legendary eggs.'
  }
};

// Wizard Spells (GDD Section 29)
export interface SpellDefinition {
  id: string;
  name: string;
  school: SchoolType;
  tier: 'T1' | 'T2' | 'T3' | 'T4' | 'Cap';
  manaCost: number;
  cooldownReviews: number;
  effect: string;
}

export const SPELL_DEFINITIONS: Record<string, SpellDefinition> = {
  // Arcane
  glow: { id: 'glow', name: 'Glow', school: 'arcane', tier: 'T1', manaCost: 40, cooldownReviews: 20, effect: 'Ends Spill of Night or Echo Loop on a floor.' },
  dispel: { id: 'dispel', name: 'Dispel', school: 'arcane', tier: 'T2', manaCost: 120, cooldownReviews: 60, effect: 'Ends any one hazard (not a breach).' },
  foresight: { id: 'foresight', name: 'Foresight', school: 'arcane', tier: 'T3', manaCost: 200, cooldownReviews: 100, effect: "Reveals next 3 days' events and lets you skip one." },
  rift_beacon: { id: 'rift_beacon', name: 'Rift Beacon', school: 'arcane', tier: 'T4', manaCost: 300, cooldownReviews: 200, effect: 'Next expedition: +3 Rift Fortune and returns 25% sooner.' },
  starlit_conjunction: { id: 'starlit_conjunction', name: 'Starlit Conjunction', school: 'arcane', tier: 'Cap', manaCost: 400, cooldownReviews: 300, effect: 'All essence yields x1.5 for 50 bells.' },

  // Nature
  beckon: { id: 'beckon', name: 'Beckon', school: 'nature', tier: 'T1', manaCost: 30, cooldownReviews: 10, effect: 'A Loose creature returns safely home.' },
  rain_dance: { id: 'rain_dance', name: 'Rain Dance', school: 'nature', tier: 'T2', manaCost: 120, cooldownReviews: 60, effect: 'All plots x1.5 output for 10 bells.' },
  clear_skies: { id: 'clear_skies', name: 'Clear Skies', school: 'nature', tier: 'T3', manaCost: 150, cooldownReviews: 40, effect: 'Dispels Cold Snap, Hex Fog, and Rainy Week effects.' },
  wild_kinship: { id: 'wild_kinship', name: 'Wild Kinship', school: 'nature', tier: 'T4', manaCost: 250, cooldownReviews: 100, effect: '+50 taming points split among all Wary creatures.' },
  verdant_surge: { id: 'verdant_surge', name: 'Verdant Surge', school: 'nature', tier: 'Cap', manaCost: 400, cooldownReviews: 300, effect: 'Food and Herbs output x2 for 30 bells.' },

  // Light
  mend: { id: 'mend', name: 'Mend', school: 'light', tier: 'T1', manaCost: 40, cooldownReviews: 15, effect: '+30 healing points to one injured character.' },
  soothing_light: { id: 'soothing_light', name: 'Soothing Light', school: 'light', tier: 'T2', manaCost: 100, cooldownReviews: 40, effect: 'Composure +20 for everyone on a floor.' },
  mend_object: { id: 'mend_object', name: 'Mend Object', school: 'light', tier: 'T3', manaCost: 80, cooldownReviews: 20, effect: 'Repairs one Damaged furniture item.' },
  sunburst: { id: 'sunburst', name: 'Sunburst', school: 'light', tier: 'T4', manaCost: 300, cooldownReviews: 150, effect: '+60 healing points to every injured character.' },
  dawn_blessing: { id: 'dawn_blessing', name: 'Dawn Blessing', school: 'light', tier: 'Cap', manaCost: 400, cooldownReviews: 300, effect: 'Academy morale +15 for 50 bells; lifts all Rift curses.' },

  // Shadow
  hush: { id: 'hush', name: 'Hush', school: 'shadow', tier: 'T1', manaCost: 30, cooldownReviews: 10, effect: 'Ends a misbehavior chain in a room; Composure +5.' },
  ward_pulse: { id: 'ward_pulse', name: 'Ward Pulse', school: 'shadow', tier: 'T2', manaCost: 150, cooldownReviews: 80, effect: 'No hazards for 10 bells.' },
  banish: { id: 'banish', name: 'Banish', school: 'shadow', tier: 'T3', manaCost: 200, cooldownReviews: 60, effect: 'Resolves a breach immediately.' },
  veil_stitch: { id: 'veil_stitch', name: 'Veil Stitch', school: 'shadow', tier: 'T4', manaCost: 180, cooldownReviews: 100, effect: 'Veil strength +20.' },
  moonless_night: { id: 'moonless_night', name: 'Moonless Night', school: 'shadow', tier: 'Cap', manaCost: 400, cooldownReviews: 300, effect: 'Hazards and misbehavior -60% for 50 bells.' },

  // Alchemy
  tidy_wind: { id: 'tidy_wind', name: 'Tidy Wind', school: 'alchemy', tier: 'T1', manaCost: 40, cooldownReviews: 20, effect: 'Restores every room on a floor to 100 cleanliness.' },
  douse: { id: 'douse', name: 'Douse', school: 'alchemy', tier: 'T2', manaCost: 60, cooldownReviews: 20, effect: 'Ends a fire or explosion; room fireproof for 20 bells.' },
  quickening: { id: 'quickening', name: 'Quickening', school: 'alchemy', tier: 'T3', manaCost: 250, cooldownReviews: 60, effect: '+25 progress points to active construction.' },
  transmute: { id: 'transmute', name: 'Transmute', school: 'alchemy', tier: 'T4', manaCost: 150, cooldownReviews: 40, effect: 'Convert 60 of one common material into 50 of another.' },
  philosophers_hour: { id: 'philosophers_hour', name: "Philosopher's Hour", school: 'alchemy', tier: 'Cap', manaCost: 400, cooldownReviews: 300, effect: 'Next 3 brews complete instantly with x2 yield.' }
};

// Events Catalog (GDD Section 28)
export const SCHOOL_EVENTS: SchoolEvent[] = [
  {
    id: 'misaddressed_owl',
    name: 'A Misaddressed Owl',
    description: 'A great horned owl perches upon the weather vane clutching a wax-sealed parchment not meant for you.',
    options: [
      { text: 'Send it safely on its way', reward: '+5 Renown', action: 'send_owl' },
      { text: 'Peek at the celestial calculations', reward: '+10 Insight', action: 'peek_letter' },
      { text: 'Offer it a warm perch and treats', reward: 'A Hush Raven visits your habitat', action: 'perch_owl' }
    ]
  },
  {
    id: 'peddler',
    name: 'The Curio Cart',
    description: 'An eccentric wandering merchant has hitched their chimera outside the Academy gates with rare patterns.',
    options: [
      { text: 'Browse later (decline politely)', reward: 'No effect', action: 'pass_curio' },
      { text: 'Purchase Canopy Bed Pattern', cost: '150 Mana', reward: 'Canopy Bed blueprint', action: 'buy_bed' },
      { text: 'Purchase Ward Lantern Pattern', cost: '120 Mana', reward: 'Ward Lantern blueprint', action: 'buy_lantern' }
    ]
  },
  {
    id: 'doorstep_basket',
    name: 'A Basket on the Doorstep',
    description: 'A woven wicker basket wrapped in wool sits upon the threshold, rustling with gentle breathing.',
    options: [
      { text: 'Find it a loving home in our paddock', reward: 'A friendly creature arrives as Wary', action: 'keep_creature' },
      { text: 'Entrust to the nearby village wildlife keeper', reward: '+5 Renown', action: 'pass_creature' }
    ]
  },
  {
    id: 'birthday',
    name: "A Student's Birthday",
    description: 'The dormitories are buzzing with quiet excitement—one of your apprentices celebrates another year of learning!',
    options: [
      { text: 'Lead the Academy in an encouraging song', reward: 'Composure +5 for student', action: 'sing' },
      { text: 'Bake a honey feast in the refectory (20 Provisions)', cost: '20 Provisions', reward: 'Dorm Leisure +20 & morale +5', action: 'bake_cake' }
    ]
  },
  {
    id: 'mysterious_seeds',
    name: 'Mysterious Seeds',
    description: 'An apprentice discovered luminescent seeds inside a hollow geode by the quarry.',
    options: [
      { text: 'Plant them in the greenhouse', reward: 'Unlock an exotic crop seed', action: 'plant_seed' },
      { text: 'Carefully dry and grind them for research', reward: '+30 Herbs', action: 'grind_seed' }
    ]
  },
  {
    id: 'celestial_comet',
    name: 'The Starlight Comet',
    description: 'A radiant sapphire comet streaks across the twilight canopy above the academy spires.',
    options: [
      { text: 'Observe calculations from Observatory', reward: '+25 Insight', action: 'observe_comet' },
      { text: 'Ground ward crystals in courtyard', reward: '+2 Crystal', action: 'crystal_comet' },
      { text: 'Invite whole school to make wishes', reward: '+15 Composure & Morale', action: 'wish_comet' }
    ]
  },
  {
    id: 'traveling_alchemist',
    name: 'The Wandering Alembic',
    description: 'An itinerant potion master with a smoking knapsack requests permission to rest at the gate.',
    options: [
      { text: 'Trade 20 Reagents for Sunstone', cost: '20 Reagents', reward: '+1 Sunstone', action: 'trade_sunstone' },
      { text: 'Host joint brewing demonstration', reward: '+20 Reagents & +5 Renown', action: 'demo_brew' },
      { text: 'Offer fresh well water & bread', reward: '+5 Renown', action: 'water_bread' }
    ]
  },
  {
    id: 'lost_familiar',
    name: 'A Stray Luminescent Fox',
    description: 'A small fox with glowing azure fur and a tiny silver bell scratches politely at the academy gate.',
    options: [
      { text: 'Shelter in Meadow Paddock', reward: 'Bramblefox arrives as wary friend', action: 'shelter_fox' },
      { text: 'Ring guild bell and safely escort home', reward: '+15 Renown', action: 'return_fox' },
      { text: 'Feed sweet forest berries', reward: '+15 Herbs', action: 'feed_fox' }
    ]
  },
  {
    id: 'royal_inspector',
    name: 'Envoy of the Arcanum',
    description: 'An immaculate imperial emissary in velvet robes arrives with a seal to inspect the academy.',
    options: [
      { text: 'Present comprehensive academy tour', reward: '+20 Renown', action: 'tour_inspector' },
      { text: 'Serve a formal refectory feast', cost: '15 Provisions', reward: '+15 Renown & +5 Morale', action: 'feast_inspector' },
      { text: 'Polite ceremonial greeting at the gate', reward: '+8 Renown', action: 'greet_inspector' }
    ]
  },
  {
    id: 'ancient_grimoire_peddler',
    name: 'The Weathered Bibliophile',
    description: 'A scholar pushing a hand-cart stacked with ancient illuminated manuscripts stops by.',
    options: [
      { text: 'Purchase Arcane Tome', cost: '150 Mana', reward: '+30 Insight', action: 'buy_grimoire' },
      { text: 'Barter 25 Timber for rare architectural scrolls', cost: '25 Timber', reward: '+25 Insight & +5 Renown', action: 'barter_scrolls' },
      { text: 'Politely exchange pleasantries', reward: 'No cost', action: 'pass_books' }
    ]
  },
  {
    id: 'mana_geyser',
    name: 'Surge of the Leyline',
    description: 'A latent spring of crystalline mana erupts gently beneath the outer courtyard flagstones.',
    options: [
      { text: 'Channel harmonic pulse into Veil Dome', reward: '+20% Veil Strength', action: 'geyser_veil' },
      { text: 'Condense into pure liquid mana', reward: '+150 Mana', action: 'geyser_mana' },
      { text: 'Irrigate the herb and crop gardens', reward: '+30 Provisions & +15 Herbs', action: 'geyser_garden' }
    ]
  },
  {
    id: 'bard_troupe',
    name: 'The Starlit Players',
    description: 'A traveling troupe of lute-players and illusionists seek a venue for their midsummer tale.',
    options: [
      { text: 'Host a grand drama in the Great Hall', reward: 'All students +25 Leisure & +15 Morale', action: 'host_troupe' },
      { text: 'Commission a heroic ballad about the Academy', cost: '50 Mana', reward: '+15 Renown', action: 'ballad_troupe' },
      { text: 'Permit them to perform on the front lawn', reward: '+5 Renown', action: 'lawn_troupe' }
    ]
  },
  {
    id: 'shadow_conjunction',
    name: 'The Umbral Alignment',
    description: 'Twin moons align, bathing the high academy parapets in soft violet luminesce.',
    options: [
      { text: 'Harvest distilled essence of dusk', reward: '+25 Umbra', action: 'harvest_umbra' },
      { text: 'Fortify shadow ward lattices', cost: '50 Mana', reward: '+15% Veil Strength', action: 'fortify_umbra' },
      { text: 'Conduct quiet sanctuary meditation', reward: 'All students +20 Composure', action: 'meditate_umbra' }
    ]
  },
  {
    id: 'bountiful_harvest',
    name: 'Boughs of the Sun Orchard',
    description: 'The orchard trees have fruited overnight with enormous golden pears and sweet berries.',
    options: [
      { text: 'Organize academy harvest festival', reward: '+40 Provisions & +10 Nectar', action: 'harvest_orchard' },
      { text: 'Brew sparkling celebratory cider', reward: '+15 Nectar & +15 Morale', action: 'cider_orchard' },
      { text: 'Gift harvest baskets to neighboring villages', reward: '+15 Renown', action: 'gift_orchard' }
    ]
  },
  {
    id: 'stray_golem',
    name: 'The Dormant Stone Guardian',
    description: 'An ancient moss-grown stone golem has wandered out of the mountains and powered down near the gate.',
    options: [
      { text: 'Recharge core with magic crystals', cost: '40 Mana', reward: '+40 Stone & +1 Golem Core', action: 'repair_golem' },
      { text: 'Carefully carve runes from outer casing', reward: '+30 Stone & +10 Insight', action: 'salvage_golem' },
      { text: 'Leave as a dignified garden statue', reward: '+5 Renown', action: 'statue_golem' }
    ]
  },
  {
    id: 'wandering_healer',
    name: 'Healer of the Silver Spring',
    description: 'A renowned herbal doctor with a satchel of fresh poultices pays a courtesy call.',
    options: [
      { text: 'Invite to treat all academy injuries', reward: 'Heals all injured characters', action: 'healer_cure' },
      { text: 'Exchange regional herbal secrets', reward: '+30 Herbs', action: 'healer_herbs' },
      { text: 'Offer modest travel donation', cost: '30 Mana', reward: '+10 Renown', action: 'healer_donate' }
    ]
  },
  {
    id: 'astral_projection',
    name: 'The Spectral Philosopher',
    description: 'A shimmering phantom scholar emerges from a bookshelf to discuss ancient cosmological proofs.',
    options: [
      { text: 'Engage in lively philosophical debate', reward: '+25 Insight', action: 'astral_debate' },
      { text: 'Inquire regarding Rift cartography', reward: '+15 Renown & expedition tips', action: 'astral_rift' },
      { text: 'Offer peaceful scholarly blessing', reward: 'All students +15 Composure', action: 'astral_peace' }
    ]
  },
  {
    id: 'wild_magic_surge',
    name: 'Chromatic Bubble Drift',
    description: 'Playful globes of iridescent magic float through the academy colonnades.',
    options: [
      { text: 'Gently pop and gather reagents', reward: '+20 Reagents', action: 'bubble_reagents' },
      { text: 'Absorb ambient light into ward lanterns', reward: '+15 Radiance', action: 'bubble_light' },
      { text: 'Let apprentices study the levitation runes', reward: 'Morale +10 for all students', action: 'bubble_fun' }
    ]
  },
  {
    id: 'merchant_convoy',
    name: 'Caravan in Distress',
    description: 'A heavy spice and silk merchant wagon broke an axle on the cobblestones outside the gate.',
    options: [
      { text: 'Dispatch carpentry crew to fix axle', cost: '20 Timber', reward: '+25 Cloth & +15 Glass', action: 'fix_wagon' },
      { text: 'Trade timber for gourmet rations', cost: '25 Timber', reward: '+30 Provisions', action: 'trade_wagon' },
      { text: 'Offer refuge and warm soup', reward: '+10 Renown', action: 'shelter_wagon' }
    ]
  },
  {
    id: 'meteor_shower',
    name: 'Night of the Falling Stars',
    description: 'Luminous meteors leave sparkling silver trails that settle over the academy rooftops.',
    options: [
      { text: 'Scour grounds for starlight ore', reward: '+2 Starmetal', action: 'collect_starmetal' },
      { text: 'Attune mana capacitor plates', reward: '+120 Mana', action: 'starlight_mana' },
      { text: 'Courtyard midnight picnic', reward: 'All students +25 Morale & Rest', action: 'starlight_picnic' }
    ]
  },
  {
    id: 'guild_grant',
    name: 'Arcanum Academic Endowment',
    description: 'The High Council of Sorcery reviews your curriculum and bestows an academic grant.',
    options: [
      { text: 'Accept unrestricted mana research grant', reward: '+200 Mana', action: 'grant_mana' },
      { text: 'Accept building materials shipment', reward: '+40 Timber & +40 Stone', action: 'grant_mats' },
      { text: 'Accept rare laboratory curios', reward: '+10 Reagents & +10 Insight', action: 'grant_curios' }
    ]
  },
  {
    id: 'clockwork_tinkerer',
    name: 'The Brass Artificer',
    description: 'A clockmaker with magnifying goggles offers to tune the academy bell tower.',
    options: [
      { text: 'Commission acoustic harmonic tuning', cost: '75 Mana', reward: '+15 Renown & clearer bells', action: 'tune_bells' },
      { text: 'Trade 1 Crystal for clockwork parts', cost: '1 Crystal', reward: '+1 Golem Core & +10 Glass', action: 'trade_clock' },
      { text: 'Politely thank the visitor', reward: '+2 Renown', action: 'pass_clock' }
    ]
  },
  {
    id: 'spirit_migration',
    name: 'Flight of the Moon Herons',
    description: 'A glowing flock of celestial waterbirds rests along the edge of the academy reflecting pond.',
    options: [
      { text: 'Silently observe their luminous courtship', reward: '+20 Radiance', action: 'heron_light' },
      { text: 'Offer fresh grain by the waterside', cost: '10 Provisions', reward: 'Morale +15 & +10 Renown', action: 'heron_feed' },
      { text: 'Chart migratory flight lines', reward: '+15 Insight', action: 'heron_chart' }
    ]
  },
  {
    id: 'alumni_bequest',
    name: 'A Graduate’s Gratitude',
    description: 'An alumnus now serving as Court Astrologer sends an inscribed chest back to their alma mater.',
    options: [
      { text: 'Accept endowment for scholarship', reward: '+150 Mana', action: 'bequest_mana' },
      { text: 'Unpack donated rare books and charts', reward: '+25 Insight', action: 'bequest_books' },
      { text: 'Display royal recognition plaque', reward: '+15 Renown', action: 'bequest_plaque' }
    ]
  },
  {
    id: 'solstice_festival',
    name: 'The Great Solstice Feast',
    description: 'The midday sun rests in zenith above the academy spire, radiating golden harmony.',
    options: [
      { text: 'Celebrate with grand banquet', cost: '15 Provisions', reward: 'All student needs restored to 100%', action: 'solstice_banquet' },
      { text: 'Focus sunbeams into the solar array', reward: '+35 Radiance', action: 'solstice_radiance' },
      { text: 'Consecrate boundary stones', reward: '+15% Veil Strength & +10 Renown', action: 'solstice_veil' }
    ]
  }
];
