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
    unlock: { type: 'standard', school: 'arcane', level: 5 },
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
    unlock: { type: 'standard', school: 'nature', level: 5 },
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
    unlock: { type: 'standard', school: 'light', level: 5 },
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
    unlock: { type: 'standard', school: 'shadow', level: 5 },
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
    unlock: { type: 'standard', school: 'alchemy', level: 5 },
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
    unlock: { type: 'standard', school: 'arcane', level: 2 },
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
    unlock: { type: 'draft', school: 'arcane', rarity: 'uncommon', level: 4 },
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
    unlock: { type: 'draft', school: 'arcane', rarity: 'uncommon', level: 3 },
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
    unlock: { type: 'standard', school: 'nature', level: 2 },
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
    unlock: { type: 'standard', school: 'nature', level: 3 },
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
    unlock: { type: 'standard', school: 'nature', level: 3 },
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
    unlock: { type: 'draft', school: 'nature', rarity: 'rare', level: 4 },
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
    unlock: { type: 'standard', school: 'light', level: 2 },
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
    unlock: { type: 'standard', school: 'light', level: 3 },
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
    unlock: { type: 'draft', school: 'light', rarity: 'uncommon', level: 4 },
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
    unlock: { type: 'standard', school: 'shadow', level: 2 },
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
    unlock: { type: 'standard', school: 'shadow', level: 3 },
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
    unlock: { type: 'draft', school: 'shadow', rarity: 'uncommon', level: 4 },
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
    unlock: { type: 'standard', school: 'alchemy', level: 2 },
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
    unlock: { type: 'standard', school: 'alchemy', level: 3 },
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
    unlock: { type: 'standard', school: 'arcane', level: 3 },
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
    unlock: { type: 'draft', school: 'alchemy', rarity: 'uncommon', level: 4 },
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
    unlock: { type: 'draft', school: 'alchemy', rarity: 'common', level: 3 },
    cost: { mana: 350, stone: 30 },
    buildReviews: 40,
    veil: 3,
    requiredFurniture: [{ role: 'kiln', count: 1, name: 'Kiln' }],
    optionalSlots: 1,
    stats: { primary: ['aura', 'order'], secondary: 'focus' },
    description: 'Kiln converts 2 Stone into 1 Glass per bell to supply building construction.'
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
    description: 'Spins 0.5 Cloth per bell (doubled with a tamed Moonsheep). Creates fine textiles.'
  },

  // --- RIFT & DISPLAY ---
  rift_gate: {
    id: 'rift_gate',
    name: 'Rift Gate',
    category: 'rift',
    area: 'grounds',
    size: [2, 1],
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
    unlock: { type: 'standard', school: 'nature', level: 1 },
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
    unlock: { type: 'standard', school: 'nature', level: 2 },
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
    unlock: { type: 'draft', school: 'nature', rarity: 'common' },
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
    unlock: { type: 'draft', school: 'nature', rarity: 'uncommon' },
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
    unlock: { type: 'draft', school: 'shadow', rarity: 'uncommon' },
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
    unlock: { type: 'draft', school: 'light', rarity: 'rare' },
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
  cooking_range: {
    id: 'cooking_range',
    name: 'Cooking Range',
    role: 'required',
    targetRole: 'cooking_range',
    slots: 1,
    cost: { mana: 180, stone: 15, glass: 2 },
    stats: { order: 2, aura: 1 },
    rooms: ['kitchen'],
    unlock: { type: 'std' }
  },
  couch: {
    id: 'couch',
    name: 'Couch',
    role: 'required',
    targetRole: 'couch_or_hearth',
    slots: 1,
    cost: { mana: 90, timber: 8, cloth: 4 },
    stats: { comfort: 3 },
    rooms: ['common_room'],
    unlock: { type: 'std' }
  },
  soaking_tub: {
    id: 'soaking_tub',
    name: 'Soaking Tub',
    role: 'required',
    targetRole: 'soaking_tub',
    slots: 2,
    cost: { mana: 220, stone: 10, glass: 5 },
    stats: { comfort: 4 },
    rooms: ['bathhouse'],
    unlock: { type: 'grant' }
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
  brewing_cauldron: {
    id: 'brewing_cauldron',
    name: 'Brewing Cauldron',
    role: 'required',
    targetRole: 'brewing_cauldron',
    slots: 1,
    cost: { mana: 220, stone: 15, glass: 2 },
    stats: { aura: 3 },
    rooms: ['alchemy_lab'],
    unlock: { type: 'std' }
  },
  ingredient_rack: {
    id: 'ingredient_rack',
    name: 'Ingredient Rack',
    role: 'required',
    targetRole: 'ingredient_rack',
    slots: 1,
    cost: { mana: 100, timber: 8, glass: 2 },
    stats: { order: 2 },
    rooms: ['alchemy_lab'],
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
  feeding_trough: {
    id: 'feeding_trough',
    name: 'Feeding Trough',
    role: 'required',
    targetRole: 'feeding_trough',
    slots: 1,
    cost: { mana: 60, timber: 8 },
    stats: { order: 1 },
    rooms: ['meadow_paddock'],
    unlock: { type: 'std' }
  },
  glass_tank: {
    id: 'glass_tank',
    name: 'Glass Tank',
    role: 'required',
    targetRole: 'glass_tank',
    slots: 2,
    cost: { mana: 200, glass: 20 },
    stats: { aura: 2 },
    rooms: ['tide_tank'],
    unlock: { type: 'std' }
  },
  perch_tree: {
    id: 'perch_tree',
    name: 'Perch Tree',
    role: 'required',
    targetRole: 'perch_tree',
    slots: 1,
    cost: { mana: 120, timber: 10 },
    stats: { charm: 2 },
    rooms: ['aviary'],
    unlock: { type: 'std' }
  },
  lightless_burrow: {
    id: 'lightless_burrow',
    name: 'Lightless Burrow',
    role: 'required',
    targetRole: 'lightless_burrow',
    slots: 1,
    cost: { mana: 100, stone: 10, cloth: 2 },
    stats: { comfort: 2 },
    rooms: ['gloom_hutch'],
    unlock: { type: 'std' }
  },
  brazier_nest: {
    id: 'brazier_nest',
    name: 'Brazier Nest',
    role: 'required',
    targetRole: 'brazier_nest',
    slots: 1,
    cost: { mana: 140, stone: 15 },
    stats: { aura: 2 },
    rooms: ['ember_pit'],
    unlock: { type: 'std' }
  },
  geode_bed: {
    id: 'geode_bed',
    name: 'Geode Bed',
    role: 'required',
    targetRole: 'geode_bed',
    slots: 1,
    cost: { mana: 160, stone: 10, crystal: 1 },
    stats: { aura: 2 },
    rooms: ['crystal_vivarium'],
    unlock: { type: 'std' }
  },
  ward_circle: {
    id: 'ward_circle',
    name: 'Ward Circle',
    role: 'required',
    targetRole: 'ward_circle',
    slots: 1,
    cost: { mana: 200, stone: 10, glass: 2 },
    stats: { order: 3, aura: 2 },
    rooms: ['warding_chamber'],
    unlock: { type: 'std' }
  },
  workbench: {
    id: 'workbench',
    name: 'Workbench',
    role: 'required',
    targetRole: 'workbench',
    slots: 1,
    cost: { mana: 150, timber: 15, stone: 5 },
    stats: { order: 2, focus: 1 },
    rooms: ['workshop'],
    unlock: { type: 'grant' }
  },
  practice_dummies: {
    id: 'practice_dummies',
    name: 'Practice Dummies',
    role: 'required',
    targetRole: 'practice_dummies',
    slots: 1,
    cost: { mana: 80, timber: 10, cloth: 2 },
    stats: { order: 1 },
    rooms: ['training_yard'],
    unlock: { type: 'grant' }
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
    troubleDescription: 'Teleports into classroom: yield 0 for 10 reviews while petted',
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
  // Rare & Legendary highlights
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
  ember_phoenix: {
    id: 'ember_phoenix',
    name: 'Ember Phoenix',
    school: 'light',
    rarity: 'legendary',
    habitats: ['ember', 'sky'],
    tamingReviews: 400,
    diet: { radiance: 2, reagents: 1 },
    buffDescription: 'Recovery +10%; heals worst Rift injury on return',
    buffType: 'recovery_buff',
    buffValue: 0.1,
    troubleDescription: 'A small fire in its room: locked 15 reviews',
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
  }
];
