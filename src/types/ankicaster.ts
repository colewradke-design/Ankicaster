/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Ankicaster Comprehensive Type Definitions
 * Exact implementation of GDD specification (Sections 1-42)
 */

export type SchoolType = 'arcane' | 'nature' | 'light' | 'shadow' | 'alchemy';

export type CareerType =
  | 'teacher'
  | 'scholar'
  | 'gardener'
  | 'tamer'
  | 'healer'
  | 'warder'
  | 'alchemist'
  | 'builder'
  | 'adventurer';

export type PersonalityType =
  | 'Bookish'
  | 'Mischievous'
  | 'Gentle'
  | 'Bold'
  | 'Dreamy'
  | 'Steadfast'
  | 'Social'
  | 'Curious';

export type CharacterStatus =
  | 'student'
  | 'resident'
  | 'faculty'
  | 'away'
  | 'alumnus';

export type InjuryType =
  | 'bruised'
  | 'sprained'
  | 'hexed'
  | 'broken_bone'
  | 'rift_touched';

export interface InjuryState {
  type: InjuryType;
  points: number;
  required: number;
}

export interface StudentNeeds {
  hunger: number;
  rest: number;
  leisure: number;
  composure: number;
  health: number;
}

export interface AnkiCardSnapshot {
  id: number;
  nid: number;
  deckName: string;
  front: string;
  back: string;
  ivl: number; // current interval in days
  lastAnswerIvl: number;
  honestIvl: number; // max(0, min(ivl, lastAnswerIvl))
  type: number; // 0=new, 1=learn, 2=review, 3=relearn
  queue: number; // -1=suspended, 0=new, 1=learn, 2=review
  due: number;
  lastStudiedMs: number;
  installBaselineMs?: number;
}

export interface CardSet {
  id: number;
  characterId: number;
  kind: 'study' | 'career';
  school?: SchoolType;
  career?: CareerType;
  size: number;
  createdDay: number;
  released: boolean;
  cardIds: number[];
}

export interface Character {
  id: number;
  name: string;
  title?: string;
  pronouns: string;
  appearance: {
    skin: string;
    hair: string;
    hairColor: string;
    robeColor: string;
    hat: string;
  };
  personality: PersonalityType;
  traits: string[];
  status: CharacterStatus;
  currentSchool?: SchoolType;
  masteredSchools: SchoolType[];
  career?: CareerType;
  careerState?: 'active' | 'sabbatical';
  needs: StudentNeeds;
  morale: number; // 0-100
  injury?: InjuryState;
  bedRoomId?: number;
  classRoomId?: number;
  period?: 1 | 2 | 3 | 4;
  seatRoomId?: number;
  workplaceRoomId?: number;
  readyDays: Record<string, number>; // school -> days ready
  enrolledDay: number;
  retiredDay?: number;
  chronicle: Array<{ day: number; text: string }>;
  // Card set ids
  studySetId?: number;
  careerSetIds: number[];
  /** Hunger drifts toward this every bell. 100 seated, 50 standing, 25 no food. New characters start at 50. */
  mealTarget?: number;
}

export interface RoomDefinition {
  id: string;
  name: string;
  category: SchoolType | 'core' | 'living' | 'grounds' | 'craft' | 'rift';
  school?: SchoolType;
  area: 'castle' | 'grounds';
  size: [number, number]; // [width, height]
  needsSky?: boolean;
  /** Max rooms of this type per Academy, counting construction sites (undefined = unlimited). */
  maxCount?: number;
  /** Cannot be demolished (GDD 16.1: Entrance Hall, Wizard's Study). */
  noDemolish?: boolean;
  floorRule?: 'floor_0' | 'floors_0_1' | 'highest_floor';
  /** Found by building, not by a school or a wizard level. Those never gate a room. */
  unlock: {
    type: 'start' | 'standard' | 'draft' | 'grant' | 'rift';
    rarity?: string;
  };
  cost: {
    /**
     * Not spent when the room is placed. Building costs the materials below only.
     * Renovating still scales from this number, so it stays as the old build-mana figure.
     */
    mana: number;
    timber?: number;
    stone?: number;
    glass?: number;
    cloth?: number;
    insight?: number;
    herbs?: number;
    radiance?: number;
    umbra?: number;
    reagents?: number;
    crystal?: number;
    heartwood?: number;
    sunstone?: number;
    void_pearl?: number;
    ember_salt?: number;
  };
  buildReviews: number;
  veil: number;
  capacity?: {
    beds?: number;
    facultyBeds?: number;
    seats?: number;
    leisureSeats?: number;
    cropBeds?: number;
    creatures?: number;
    adventurers?: number;
    plinths?: number;
    readers?: number;
  };
  workplace?: {
    career: CareerType;
    slots: number;
  };
  requiredFurniture: Array<{ role: string; count: number; name: string }>;
  optionalSlots: number;
  stats: {
    primary: [string, string];
    secondary: string;
  };
  level3Perk?: string;
  description: string;
}

export interface PlacedRoom {
  id: number;
  defId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  area: 'castle' | 'grounds';
  level: 1 | 2 | 3;
  state: 'site' | 'built';
  buildRequired: number;
  buildProgress: number;
  buildPaused?: boolean;
  cleanliness: number; // 0-100
  lockedUntilReviewIndex?: number;
  lockReason?: string;
  /** Temporary output multiplier from a creature's escape trouble. */
  troubleMalus?: { untilReview: number; outputFactor: number; reason: string };
  settings: {
    crop?: string;
    modules?: string[];
    glassworksActive?: boolean;
  };
  furniture: PlacedFurniture[];
  /** Built/acquired furniture for this room waiting to be manually placed on the canvas. */
  unplacedFurniture?: UnplacedFurniture[];
  /** What the player actually paid when placing this room (refund bounds; GDD 15.4). Mana is always 0. */
  spent?: {
    mana: number;
    timber?: number;
    stone?: number;
    glass?: number;
    cloth?: number;
    insight?: number;
    herbs?: number;
    radiance?: number;
    umbra?: number;
    reagents?: number;
    crystal?: number;
    heartwood?: number;
    sunstone?: number;
    void_pearl?: number;
    ember_salt?: number;
  };
  /** Renown granted by renovations of this room (taken back on demolish so loops gain nothing). */
  renownGranted?: number;
  /** True when placing this room spent a room plan. Demolish gives the plan back. */
  fromPlan?: boolean;
  hazard?: {
    type: 'spill_of_night' | 'hex_fog' | 'echo_loop' | 'cold_snap' | 'breach';
    name: string;
    description: string;
    effect: string;
  };
}

export interface FurnitureDefinition {
  id: string;
  name: string;
  deck: 'foundation' | 'grounds' | 'magic';
  role: 'required' | 'optional' | 'bed' | 'faculty_bed' | 'outdoor' | 'plinth';
  targetRole?: string; // e.g. 'planter_bed'
  slots: number; // takes 1 or 2 slots
  cost: {
    mana: number;
    timber?: number;
    stone?: number;
    glass?: number;
    cloth?: number;
    insight?: number;
    herbs?: number;
    radiance?: number;
    umbra?: number;
    reagents?: number;
    crystal?: number;
    heartwood?: number;
    sunstone?: number;
    void_pearl?: number;
    ember_salt?: number;
    moonsilk?: number;
    starmetal?: number;
  };
  stats: {
    comfort?: number;
    focus?: number;
    order?: number;
    aura?: number;
    charm?: number;
  };
  specialEffect?: string;
  rooms?: string[] | 'any';
  unlock: {
    type: 'std' | 'draft' | 'grant' | 'rift';
    school?: SchoolType;
    rarity?: string;
    destination?: string;
  };
}

export type FurniturePlane = 'floor' | 'wall' | 'ceiling';

export interface PlacedFurniture {
  id: number;
  defId: string;
  slotKind: string;
  damaged: boolean;
  /** Manual placement coordinate in art pixels from room left edge (center X). */
  x?: number;
  /** Manual placement floor index (0 = ground floor). */
  floor?: number;
  /** Surface plane copied from furniture definition/art on drop. */
  plane?: FurniturePlane;
  /** Vertical offset from floor line for wall pieces (negative = above floor line, default -26). */
  wallY?: number;
  /** For wooden_chair snapped onto a long_table: the table's PlacedFurniture id and mark 0..5. */
  tableId?: number;
  markIndex?: number;
}

export interface UnplacedFurniture {
  id: number;
  defId: string;
  slotKind: string;
  damaged?: boolean;
}

export type HabitatType = 'meadow' | 'tide' | 'sky' | 'gloom' | 'ember' | 'crystal';

export type CreatureMovement =
  | 'scurry'
  | 'hop'
  | 'trot'
  | 'waddle'
  | 'slither'
  | 'fly'
  | 'glide'
  | 'swim'
  | 'hover'
  | 'rooted'
  | 'crawl';

export type CreatureOrigin =
  | 'egg'
  | 'sapling'
  | 'litter'
  | 'cocoon'
  | 'geode'
  | 'wisp';

export type CreatureRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface CreatureDefinition {
  id: string;
  name: string;
  school: SchoolType;
  rarity: CreatureRarity;
  habitats: HabitatType[];
  movement: CreatureMovement;
  origin: CreatureOrigin;
  roamsFreely: boolean;
  tamingReviews: number;
  diet: Record<string, number>;
  buffDescription: string;
  buffType: string;
  buffValue: number;
  troubleDescription: string;
  companionBonus: number; // Fortune contribution
}

export interface CreatureInstance {
  id: number;
  defId: string;
  nickname: string;
  roomId?: number;
  status: 'egg' | 'wary' | 'tamed' | 'loose' | 'away';
  hungry: boolean;
  hatchProgress: number;
  tamingProgress: number;
  tamerId?: number;
  /** Preview debug only. Forces the unhomed Entrance Hall bundle even if a habitat exists. */
  debugUnhomed?: boolean;
  bondLevel: 0 | 1 | 2 | 3;
  bondProgress: number;
  arrivedDay: number;
  /** Bell index of the last hand-feeding. One manual feed per bell. */
  lastManualFeedBell?: number;
  /** Reviews left until the catcher brings this loose creature home. */
  captureReviewsLeft?: number;
  /** 0 is the headmaster. Faculty ids are everyone else. */
  captureTamerId?: number;
  /** Status restored when the creature is recaptured. */
  returnStatus?: 'wary' | 'tamed';
  /** Resources hidden by escape trouble. Returned on recapture. */
  stashed?: Record<string, number>;
}

export interface PotionRecipe {
  id: string;
  name: string;
  tier: 'basic' | 'advanced' | 'rare' | 'legendary';
  school?: SchoolType;
  ingredients: [string, string, string];
  reviewsToBrew: number;
  effect: string;
  discovered: boolean;
}

export interface DraftCard {
  id: string;
  deck: 'foundation' | 'grounds' | 'magic';
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  name: string;
  type: 'blueprint' | 'furniture_pattern' | 'lure' | 'grimoire' | 'seed' | 'recipe_page' | 'boon' | 'deed';
  targetId?: string;
  /** Magic-deck cards belong to a school so the draw can weight them. */
  school?: SchoolType;
  description: string;
}

export interface RiftDestination {
  id: string;
  name: string;
  tier: 'easy' | 'mild' | 'medium' | 'hard' | 'deadly';
  skillNeeded: number; // in days
  safeOdds: number;
  bestOdds: number;
  reviews: number;
  cost: number;
  supplies: number;
  lootRolls: number;
  supplySlots: number;
  band: 'low' | 'high';
  description: string;
  rewardsSummary: string;
}

export interface ActiveExpedition {
  id: number;
  destinationId: string;
  teamIds: number[];
  companionId?: number;
  suppliesTaken: string[];
  partySkillDays: number;
  chance: number;
  fortune: number;
  roll: number;
  wrongRoll: number;
  requiredReviews: number;
  progressReviews: number;
  state: 'active' | 'returned';
  outcome?: 'safe' | 'minor_injury' | 'serious_injury' | 'curse' | 'retreat';
  lootSummary?: string[];
  injuredHeroId?: number;
  injuryApplied?: InjuryType;
}

export interface SchoolEvent {
  id: string;
  name: string;
  description: string;
  options: Array<{
    text: string;
    cost?: string;
    reward: string;
    action: string;
  }>;
}

export interface WizardState {
  name: string;
  title: string;
  pronouns: string;
  sigil: string;
  academyName: string;
  levels: Record<SchoolType, number>;
  studyLevel: number;
  activeSession?: {
    id: number;
    kind: 'orb' | 'grimoire';
    school: SchoolType;
    targetLevel?: number;
    spellId?: string;
    progress: number;
    required: number;
    costPaid: number;
    state: 'active' | 'paused';
  };
  queuedSessions: Array<{
    id: number;
    kind: 'orb' | 'grimoire';
    school: SchoolType;
    targetLevel?: number;
    spellId?: string;
    required: number;
    costPaid: number;
  }>;
  knownSpells: string[];
  spellCooldowns: Record<string, number>; // spellId -> reviews remaining
  appearance?: {
    bodyShape?: number;
    skin?: string;
    hair?: string;
    hairColor?: string;
    robeColor?: string;
    hat?: string;
    staff?: string;
    eyes?: string;
    face?: string;
    shoes?: string;
  };
  foundingSchool?: SchoolType;
  foundedAt?: string;
  /** Room ID visited by the headmaster this bell when no study session is active. */
  presenceRoomId?: number;
}

export interface VeilState {
  strength: number; // 0-100
  costToday: number;
  paidToday: number;
  autoPay: boolean;
  reductions: Array<{ label: string; pct: number }>;
}

export interface ResourceInventory {
  // Common
  timber: number;
  stone: number;
  glass: number;
  cloth: number;
  provisions: number;
  greens: number;
  fish: number;
  nectar: number;
  // Essences
  insight: number;
  herbs: number;
  radiance: number;
  umbra: number;
  reagents: number;
  // Rare
  crystal: number;
  heartwood: number;
  sunstone: number;
  void_pearl: number;
  ember_salt: number;
  moonsilk: number;
  starmetal: number;
  golem_core: number;
  phoenix_ash: number;
  // Potions
  potions: Record<string, number>;
  // Crop seeds unlocked
  seedsUnlocked: string[];
}

export interface GameSettings {
  manaPerReview: number;
  cardsPerStudent: number;
  retirementAgeDays: number;
  deckScope: string;
  linkNewCards: boolean;
  avoidSiblings: boolean;
  honestIntervalsOnly: boolean;
  suspendedReleaseDays: number;
  veilPayment: 'auto' | 'ask';
  toastMode: 'every_review' | 'every_bell' | 'events_only' | 'off';
  reduceMotion: boolean;
  sound: boolean;
  textScale: number;
  mode: 'endless' | 'timed';
  termLengthDays?: number;
  termEndDate?: string;
  examTimer?: boolean;
  devMode?: boolean;
  visualTime?: 'clock' | 'day' | 'night';
  celebrationSize?: 'full' | 'small' | 'off';
  showHazardsLens?: boolean;
}

export interface NoticeData {
  roomId?: number;
  characterIds?: number[];
  creatureId?: number;
  hazardId?: string;
  hazardType?: string;
  incidentId?: string;
  outcome?: string;
  spellId?: string;
  potionId?: string;
  eventId?: string;
  school?: SchoolType;
  level?: number;
  career?: CareerType;
  visualEventType?: string;
}

export interface TutorialProgress {
  /** founding = Founding Day, tour = the guided steps, goal = the first-goal banner, done = finished or skipped. */
  phase: 'founding' | 'tour' | 'goal' | 'done';
  /** Index into the guided steps. Saved so a reload resumes here. */
  step: number;
  /** Sub-step inside the Study window tour. */
  part: number;
}

export interface FullGameState {
  day: number;
  reviewIndex: number;
  bellIndex: number;
  mana: number;
  manaDebt: number;
  bankAtLastReview: number;
  renown: number;
  lastSessionTimeMs: number;
  installBaselineMs: number;
  termStartDateMs?: number;
  termEndDateMs?: number;
  termInitialReviewIndex?: number;
  termInitialMasters?: number;
  termInitialRenown?: number;
  termFinishedReport?: {
    cardsStudied: number;
    mastersGraduated: number;
    renownEarned: number;
    honorTier: string;
    completedAt: number;
  };
  wizard: WizardState;
  veil: VeilState;
  resources: ResourceInventory;
  settings: GameSettings;
  rooms: PlacedRoom[];
  characters: Character[];
  cardSets: CardSet[];
  allCards: Record<number, AnkiCardSnapshot>;
  creatures: CreatureInstance[];
  /** Species IDs discovered by the player (persists even after release or new term). */
  discoveredCreatures?: string[];
  /** Next meal's refectory cap is multiplied by this, then the field clears. Duskmouse trouble. */
  pendingMealCapFactor?: number;
  expeditions: ActiveExpedition[];
  potions: PotionRecipe[];
  hand: DraftCard[];
  /** Unused room cards. Each count is one build of that room. */
  roomPlans?: Record<string, number>;
  knownPlans: string[];
  knownPatterns: string[];
  draftHistory: Record<string, number>; // deck -> draws this term (price growth)
  draftPity: Record<string, number>; // deck -> draws without rare
  /** Draws from one deck in a row that offered no room card. */
  roomlessStreak?: Record<string, number>;
  /** How many Foundation / Grounds draws this game has made (founding guarantees). Not reset at term end. */
  foundingDraws?: { foundation: number; grounds: number };
  /** Draws ever made. The first one shows the deck tutorial. */
  draftsCompleted?: number;
  /** The Rift Gate plan is granted once, at 3 masters. */
  riftGateGranted?: boolean;
  /** Display-only. Last 5 bells of production, the last 20 one-off changes per resource, and the last 20 across all of them. */
  resourceLedger?: {
    bells: Array<{ entries: Array<{ resource: string; amount: number; source: string }> }>;
    recent: Record<string, Array<{ amount: number; label: string }>>;
    recentAll?: Array<{ resource: string; amount: number; label: string }>;
  };
  activeEvents: Array<{ eventId: string; dayArrived: number }>;
  notices: Array<{ id: string; time: number; text: string; type: string; data?: NoticeData }>;
  achievements: string[];
  spellbooks: string[];
  alumniGallery: Array<{
    id: number;
    name: string;
    portrait: string;
    titles: string[];
    retiredDay: number;
    bonusType: string;
    bonusValue: number;
  }>;
  lastProcessedReviewId?: string;
  processedReviewIds?: string[];
  /** Furniture returned by demolition (GDD 15.4 / 17.1); re-installing a stored item is free. */
  furnitureInventory?: Record<string, number>;
  /**
   * Save format marker: 1 once built rooms from before required fixtures were enforced have been
   * back-filled (a one-time load migration). New saves start at 1, so rooms that later finish
   * construction keep their required furniture empty until the player installs it.
   */
  requiredFixturesVersion?: number;
  /** One-time load migration: faculty already in a save get a workplaceRoomId. */
  staffingVersion?: number;
  /** One-time load migration: rooms already built or started stay in knownPlans. */
  knownPlansVersion?: number;
  /** One-time load migration: existing placed furniture receives deterministic saved positions. */
  manualFurnitureVersion?: number;
  /** Guided tutorial. Missing on old saves means already done. */
  tutorial?: TutorialProgress;
  /** Set when a preview debug action touched this save. Real play never sets it. */
  debugUsed?: boolean;
  /** Creature ids created by the preview debug panel. */
  debugCreatureIds?: number[];
  /** Room ids created by the preview debug panel. */
  debugRoomIds?: number[];
  /** Character ids created by the preview debug panel (stand-in masters). */
  debugCharacterIds?: number[];
  /** Expedition ids created by the preview debug panel. */
  debugExpeditionIds?: number[];
  /** The debug panel locked the Rift Gate to preview the dormant arch. */
  debugRiftLock?: boolean;
  /** Preview debug time-of-day override (0..24 hours, or null/undefined to follow settings/clock). */
  debugTimeHours?: number | null;
  /** Preview debug visual event trigger without state mutation. */
  debugPreviewEvent?: { type: string; nonce: number; roomId?: number };
  /** Draft reroll tokens granted by Starlight Ink. */
  draftRerollTokens?: number;
  /** Active timed/charge buffs from potions and spells. */
  activeBuffs?: {
    growthElixirBells?: number;
    growthElixirRoomId?: number;
    cleanImmuneBells?: number;
    cleanImmuneRoomId?: number;
    fireproofBells?: number;
    fireproofRoomId?: number;
    fellowshipBells?: number;
    lureMuskPending?: boolean;
    wardwaterFloors?: number[];
    riftElixirCharges?: number;
    courageDraughtCharges?: number;
    starlitConjunctionBells?: number;
    rainDanceBells?: number;
    verdantSurgeBells?: number;
    dawnBlessingBells?: number;
    wardPulseBells?: number;
    moonlessNightBells?: number;
    philosophersHourBrews?: number;
    riftBeaconActive?: boolean;
    foresightDays?: number;
    foresightSkips?: number;
  };
}
