/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * V5 Part A — Atmosphere, Time-of-Day, Night Lights, Parallax Hills/Clouds & Veil Dome
 * Pure computation + Pixi Graphics helpers. Read-only on FullGameState (VR-01).
 */

import type { FullGameState, PlacedRoom } from '../../types/ankicaster';
import { getVeilBand, type VeilBand } from '../../utils/formulas';
import { roomLights as roomFixtureLights, type Pane, type RoomLight } from '../rooms/roomLights';
import { getRiftGateVisualState, type RiftGateVisualState } from '../rooms/riftGateArt';
import { roomToWorldBox, type RoomWorldBox } from '../layout/gridToWorld';

export type WorldBox = RoomWorldBox;
export type TimePhase = 'day' | 'dusk' | 'night' | 'dawn';
export type VisualTimeSetting = 'clock' | 'day' | 'night';

export interface CelestialBodyState {
  visible: boolean;
  /** Progress along arc 0..1 */
  progress: number;
  /** World X coordinate */
  x: number;
  /** World Y coordinate */
  y: number;
  alpha: number;
}

export interface MoonState extends CelestialBodyState {
  /** 0..1 synodic cycle (0 = new, 0.5 = full) */
  phase: number;
  /** 0..7 discrete phase index */
  phaseIndex: number;
  phaseName:
    | 'new'
    | 'waxing_crescent'
    | 'first_quarter'
    | 'waxing_gibbous'
    | 'full'
    | 'waning_gibbous'
    | 'third_quarter'
    | 'waning_crescent';
}

export interface CloudSpec {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  width: number;
  height: number;
  alpha: number;
  tint: number;
}

export interface HillLayerSpec {
  parallaxFactor: number; // 0.20 or 0.40
  offsetX: number;
  color: number;
  alpha: number;
  points: Array<{ x: number; y: number }>;
}

export type ParallaxHillsResult = [HillLayerSpec, HillLayerSpec] & {
  far: HillLayerSpec;
  near: HillLayerSpec;
};

export interface RoomLightEmitter {
  roomId: number;
  defId: string;
  area: 'castle' | 'grounds';
  kind: 'window' | 'sconce' | 'hearth' | 'lantern' | 'nightglass' | 'light_school' | 'ember_bed';
  x: number;
  y: number;
  radius: number;
  color: number;
  alpha: number;
  /** Drawn glass pane shape/bounds when kind === 'window'. */
  pane?: Pane;
}

export interface VeilTearSpec {
  x: number;
  y: number;
  width: number;
  height: number;
  alpha: number;
}

export interface VeilDomeState {
  strength: number;
  band: VeilBand;
  skyWashColor: number;
  skyWashAlpha: number;
  domeColor: number;
  domeAlpha: number;
  hasEdgeGaps: boolean;
  edgeGaps: boolean;
  edgeGapCount: number;
  hasVioletTears: boolean;
  violetTearCount: number;
  tears: VeilTearSpec[];
  paidRippleActive: boolean;
  rippleProgress: number | null; // 0..1 when paid day tick ripple is active
  dimMultiplier: number; // < 1 during 1s unpaid day tick dim
  showWardCircles: boolean;
  wardCircles: Array<{ floor: number; x: number; y: number; radius: number; color: number }>;
}

export interface AtmosphereOutput {
  hours: number;
  phase: TimePhase;
  /** 0 = full day, 1 = full night, fractional during dawn/dusk */
  nightWeight: number;
  nightLightStrength: number;
  /** 0..1 blend factor within the active transition (dawn: Night->Day, dusk: Day->Night) */
  phaseBlend: number;
  blendProgress: number;
  skyTopColor: number;
  skyBottomColor: number;
  skyTop: number;
  skyMid: number;
  skyHorizon: number;
  horizonGlowColor: number;
  horizonGlowAlpha: number;
  worldTintColor: number;
  worldTintAlpha: number;
  starAlpha: number;
  windowGlowAlpha: number;
  sun: CelestialBodyState;
  moon: MoonState;
  celestial: { sun: CelestialBodyState; moon: MoonState };
  hills: ParallaxHillsResult;
  clouds: CloudSpec[];
  roomLights: RoomLightEmitter[];
  nightLights: RoomLightEmitter[];
  veil: VeilDomeState;
  veilDome: VeilDomeState;
}

export type AtmosphereState = AtmosphereOutput;

const DAY_SKY_TOP = 0x4f8fc9;
const DAY_SKY_BOTTOM = 0xaad4f5;
const DAWN_HORIZON = 0xf09c6b;
const DUSK_HORIZON = 0xc9657c;
const NIGHT_SKY_TOP = 0x0c1026;
const NIGHT_SKY_BOTTOM = 0x1b2347;

const DAY_TINT = 0xffffff;
const DAWN_TINT = 0xffb37a;
const DUSK_TINT = 0xd47488;
const NIGHT_TINT = 0x1a2652;

const SYNODIC_MONTH_MS = 29.53058867 * 86_400_000;
const KNOWN_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14, 0);

export function lerpNumber(a: number, b: number, t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return a + (b - a) * clamped;
}

export function lerpColor(c1: number, c2: number, t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  const r1 = (c1 >> 16) & 0xff;
  const g1 = (c1 >> 8) & 0xff;
  const b1 = c1 & 0xff;

  const r2 = (c2 >> 16) & 0xff;
  const g2 = (c2 >> 8) & 0xff;
  const b2 = c2 & 0xff;

  const r = Math.round(r1 + (r2 - r1) * clamped);
  const g = Math.round(g1 + (g2 - g1) * clamped);
  const b = Math.round(b1 + (b2 - b1) * clamped);
  return (r << 16) | (g << 8) | b;
}

/**
 * Resolve effective decimal hours (0..24) from FullGameState or Date, visualTime setting, and optional debug slider.
 */
export function resolveEffectiveHours(
  stateOrDate: FullGameState | Date = new Date(),
  dateOrVisualTime: Date | VisualTimeSetting = 'clock',
  debugTimeHours?: number | null
): number {
  let date: Date;
  let visualTime: VisualTimeSetting = 'clock';
  let debugHours: number | null | undefined = debugTimeHours;

  if (stateOrDate instanceof Date) {
    date = stateOrDate;
    if (typeof dateOrVisualTime === 'string') {
      visualTime = dateOrVisualTime;
    }
  } else {
    date = dateOrVisualTime instanceof Date ? dateOrVisualTime : new Date();
    visualTime = stateOrDate.settings?.visualTime ?? 'clock';
    if (debugHours === undefined) {
      debugHours = stateOrDate.debugTimeHours;
    }
  }

  if (typeof debugHours === 'number' && Number.isFinite(debugHours)) {
    return ((debugHours % 24) + 24) % 24;
  }
  if (visualTime === 'day') return 12.0;
  if (visualTime === 'night') return 0.0;
  const h = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  return ((h % 24) + 24) % 24;
}

/**
 * Compute phase and linear blend weights for any hour of day (0..24):
 * - Day:   07:30–17:30 (7.5..17.5)
 * - Dusk:  17:30–19:30 (17.5..19.5) — linear Day -> Night over 2h
 * - Night: 19:30–05:30 (19.5..24, 0..5.5)
 * - Dawn:  05:30–07:30 (5.5..7.5) — linear Night -> Day over 2h
 */
export function getTimePhaseInfo(hours: number): {
  phase: TimePhase;
  nightWeight: number;
  nightLightStrength: number;
  phaseBlend: number;
  blendProgress: number;
} {
  const h = ((hours % 24) + 24) % 24;
  if (h >= 5.5 && h < 7.5) {
    // Dawn: blends linearly from Night (t=0) to Day (t=1) over 2 hours
    const t = (h - 5.5) / 2.0;
    const nw = 1 - t;
    return {
      phase: 'dawn',
      nightWeight: nw,
      nightLightStrength: nw,
      phaseBlend: t,
      blendProgress: t
    };
  }
  if (h >= 7.5 && h < 17.5) {
    return {
      phase: 'day',
      nightWeight: 0,
      nightLightStrength: 0,
      phaseBlend: 1,
      blendProgress: 1
    };
  }
  if (h >= 17.5 && h < 19.5) {
    // Dusk: blends linearly from Day (t=0) to Night (t=1) over 2 hours
    const t = (h - 17.5) / 2.0;
    return {
      phase: 'dusk',
      nightWeight: t,
      nightLightStrength: t,
      phaseBlend: t,
      blendProgress: t
    };
  }
  return {
    phase: 'night',
    nightWeight: 1,
    nightLightStrength: 1,
    phaseBlend: 1,
    blendProgress: 1
  };
}

/**
 * Compute lunar phase fraction (0..1) from a real Date.
 */
export function computeMoonPhase(date: Date = new Date()): number {
  const elapsed = date.getTime() - KNOWN_NEW_MOON_MS;
  const raw = ((elapsed % SYNODIC_MONTH_MS) + SYNODIC_MONTH_MS) / SYNODIC_MONTH_MS;
  return raw % 1;
}

export function getMoonPhaseDetails(dateOrPhase: Date | number = new Date()): {
  phase: number;
  phaseIndex: number;
  phaseName: MoonState['phaseName'];
} {
  const phase = typeof dateOrPhase === 'number' ? ((dateOrPhase % 1) + 1) % 1 : computeMoonPhase(dateOrPhase);
  const phaseIndex = Math.floor(((phase + 1 / 16) % 1) * 8);
  const names: MoonState['phaseName'][] = [
    'new',
    'waxing_crescent',
    'first_quarter',
    'waxing_gibbous',
    'full',
    'waning_gibbous',
    'third_quarter',
    'waning_crescent'
  ];
  return {
    phase,
    phaseIndex,
    phaseName: names[phaseIndex] || 'full'
  };
}

/**
 * Sun arcs across the sky from 05:30 to 19:30; Moon arcs from 17:30 to 07:30.
 * Accepts either (hours, worldWidth, groundY, date?) or (hours, date, worldWidth, groundY).
 */
export function computeCelestialBodies(
  hours: number,
  worldWidthOrDate: number | Date,
  groundYOrWorldWidth: number,
  dateOrGroundY: Date | number = new Date()
): { sun: CelestialBodyState; moon: MoonState } {
  let worldWidth: number;
  let groundY: number;
  let date: Date;

  if (worldWidthOrDate instanceof Date) {
    date = worldWidthOrDate;
    worldWidth = groundYOrWorldWidth;
    groundY = typeof dateOrGroundY === 'number' ? dateOrGroundY : 400;
  } else {
    worldWidth = worldWidthOrDate;
    groundY = groundYOrWorldWidth;
    date = dateOrGroundY instanceof Date ? dateOrGroundY : new Date();
  }

  const h = ((hours % 24) + 24) % 24;
  const marginX = 36;
  const spanW = Math.max(120, worldWidth - marginX * 2);
  const horizonY = Math.max(60, groundY - 12);
  const zenithY = Math.max(18, groundY - 210);

  // Sun active 05:30 (5.5) .. 19:30 (19.5) -> 14 hours
  let sunVisible = false;
  let sunProgress = 0;
  let sunAlpha = 0;
  if (h >= 5.5 && h <= 19.5) {
    sunVisible = true;
    sunProgress = (h - 5.5) / 14.0;
    if (h < 7.5) sunAlpha = (h - 5.5) / 2.0;
    else if (h > 17.5) sunAlpha = 1 - (h - 17.5) / 2.0;
    else sunAlpha = 1;
  }
  const sunX = marginX + sunProgress * spanW;
  const sunY = horizonY - Math.sin(sunProgress * Math.PI) * (horizonY - zenithY);

  // Moon active 17:30 (17.5) .. 07:30 (7.5 next day) -> 14 hours
  let moonVisible = false;
  let moonProgress = 0;
  let moonAlpha = 0;
  if (h >= 17.5 || h <= 7.5) {
    moonVisible = true;
    const elapsedNight = h >= 17.5 ? h - 17.5 : h + 6.5;
    moonProgress = elapsedNight / 14.0;
    if (h >= 17.5 && h < 19.5) moonAlpha = (h - 17.5) / 2.0;
    else if (h > 5.5 && h <= 7.5) moonAlpha = 1 - (h - 5.5) / 2.0;
    else moonAlpha = 1;
  }
  const moonX = marginX + moonProgress * spanW;
  const moonY = horizonY - Math.sin(moonProgress * Math.PI) * (horizonY - zenithY);
  const lunar = getMoonPhaseDetails(date);

  return {
    sun: {
      visible: sunVisible,
      progress: sunProgress,
      x: sunX,
      y: sunY,
      alpha: Math.max(0, Math.min(1, sunAlpha))
    },
    moon: {
      visible: moonVisible,
      progress: moonProgress,
      x: moonX,
      y: moonY,
      alpha: Math.max(0, Math.min(1, moonAlpha)),
      phase: lunar.phase,
      phaseIndex: lunar.phaseIndex,
      phaseName: lunar.phaseName
    }
  };
}

/**
 * Build two parallax hill silhouettes (20% and 40% of camera pan offset).
 */
export function computeParallaxHills(
  worldWidth: number,
  groundY: number,
  cameraPanX: number,
  phaseOrNightWeight: number | TimePhase = 0
): ParallaxHillsResult {
  const nightWeight =
    typeof phaseOrNightWeight === 'number'
      ? phaseOrNightWeight
      : phaseOrNightWeight === 'night'
        ? 1
        : phaseOrNightWeight === 'dusk' || phaseOrNightWeight === 'dawn'
          ? 0.5
          : 0;

  const farColor = lerpColor(0x3b5848, 0x141b34, nightWeight);
  const nearColor = lerpColor(0x2c4732, 0x0f1629, nightWeight);

  const farOffsetX = cameraPanX === 0 ? 0 : -cameraPanX * 0.20;
  const nearOffsetX = cameraPanX === 0 ? 0 : -cameraPanX * 0.40;

  const farPoints: Array<{ x: number; y: number }> = [];
  const nearPoints: Array<{ x: number; y: number }> = [];
  const steps = 16;
  const span = Math.max(600, worldWidth + 160);

  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const x = -80 + u * span;
    const farPeak =
      Math.sin(u * Math.PI * 3.0 + 0.4) * 18 +
      Math.cos(u * Math.PI * 5.0 + 1.1) * 9 +
      28;
    const nearPeak =
      Math.sin(u * Math.PI * 4.0 + 1.7) * 12 +
      Math.cos(u * Math.PI * 7.0 + 0.3) * 6 +
      16;
    farPoints.push({ x, y: groundY - farPeak });
    nearPoints.push({ x, y: groundY - nearPeak });
  }

  const far: HillLayerSpec = {
    parallaxFactor: 0.20,
    offsetX: farOffsetX,
    color: farColor,
    alpha: 0.75,
    points: farPoints
  };
  const near: HillLayerSpec = {
    parallaxFactor: 0.40,
    offsetX: nearOffsetX,
    color: nearColor,
    alpha: 0.88,
    points: nearPoints
  };

  return Object.assign([far, near] as [HillLayerSpec, HillLayerSpec], { far, near });
}

/**
 * Compute slow drifting clouds that freeze under reduceMotion.
 */
export function computeClouds(
  worldWidth: number,
  groundY: number,
  clockMs: number,
  reduceMotion: boolean,
  nightWeight: number = 0
): CloudSpec[] {
  const effectiveTimeSec = reduceMotion ? 0 : clockMs / 1000;
  const span = Math.max(600, worldWidth + 120);
  const tint = lerpColor(0xf6f1e8, 0x3b4675, nightWeight);
  const baseAlpha = lerpNumber(0.42, 0.18, nightWeight);

  const seeds = [
    { id: 0, baseX: 55, yOff: 175, w: 64, h: 14, speed: 3.2 },
    { id: 1, baseX: 195, yOff: 145, w: 82, h: 16, speed: 2.4 },
    { id: 2, baseX: 340, yOff: 190, w: 54, h: 12, speed: 3.8 },
    { id: 3, baseX: 485, yOff: 158, w: 72, h: 15, speed: 2.8 },
    { id: 4, baseX: 620, yOff: 182, w: 60, h: 13, speed: 3.5 }
  ];

  return seeds.map(s => {
    const rawX = (s.baseX + effectiveTimeSec * s.speed) % span;
    const x = rawX - 40;
    const y = Math.max(16, groundY - s.yOff);
    return {
      id: s.id,
      x,
      y,
      w: s.w,
      h: s.h,
      width: s.w,
      height: s.h,
      alpha: baseAlpha,
      tint
    };
  });
}

function mapNightKind(light: RoomLight, room: PlacedRoom): RoomLightEmitter['kind'] {
  if (light.kind === 'window') return 'window';
  if (light.kind === 'fire') return room.defId === 'ember_pit' ? 'ember_bed' : 'hearth';
  if (light.kind === 'lamp') return room.area === 'grounds' ? 'lantern' : 'sconce';
  return room.defId === 'class_light' ? 'light_school' : 'nightglass';
}

/**
 * Compute night light emitters for all built rooms (5.5 Room visual audit):
 * every night light is anchored directly on a drawn fixture returned by roomLights().
 */
export function computeRoomNightLights(
  roomsOrState: PlacedRoom[] | FullGameState,
  groundY: number = 400,
  nightWeight: number = 1.0,
  riftState?: RiftGateVisualState
): RoomLightEmitter[] {
  if (nightWeight <= 0.01) return [];
  const rooms: PlacedRoom[] = Array.isArray(roomsOrState) ? roomsOrState : roomsOrState.rooms;
  const resolvedRiftState: RiftGateVisualState =
    riftState ?? (Array.isArray(roomsOrState) ? 'dormant' : getRiftGateVisualState(roomsOrState, false));
  const emitters: RoomLightEmitter[] = [];

  for (const room of rooms) {
    if (room.state !== 'built') continue;
    const box: WorldBox = roomToWorldBox(room, groundY);
    for (const light of roomFixtureLights(room, box, { riftState: resolvedRiftState })) {
      const kind = mapNightKind(light, room);
      const isDimSlit = room.defId === 'spiral_stair' && light.kind === 'window' && (room.level || 1) < 3;
      const baseAlpha =
        kind === 'ember_bed'
          ? 0.42
          : kind === 'window'
            ? isDimSlit
              ? 0.24
              : 0.36
            : 0.32;
      const halo = kind === 'window' ? Math.max(light.radius + 4, 12) : Math.max(light.radius + 6, 14);
      emitters.push({
        roomId: room.id,
        defId: room.defId,
        area: room.area,
        kind,
        x: light.x,
        y: light.y,
        radius: halo,
        color: light.color,
        alpha: baseAlpha * nightWeight,
        pane: light.pane
      });
    }
  }

  return emitters;
}

export interface VeilDomeInputOptions {
  strength: number;
  rooms: PlacedRoom[];
  groundY: number;
  worldWidth: number;
  showHazardsLens?: boolean;
  wardwaterFloors?: number[];
  wardPulseBells?: number;
  rippleProgress?: number | null;
  unpaidDimRemainingMs?: number;
  clockMs?: number;
}

/**
 * Compute Veil sky wash, dome arc parameters, edge gaps (<50), violet tears (<20),
 * paid ripple, unpaid 1s dim, and ward circles (only when showHazardsLens is true).
 */
export function computeVeilDomeState(
  stateOrOptions: FullGameState | VeilDomeInputOptions,
  worldWidthArg: number = 1600,
  groundYArg: number = 400,
  clockMsArg: number = 0,
  paidRippleProgressArg: number = 0,
  unpaidDimProgressArg: number = 0
): VeilDomeState {
  let options: VeilDomeInputOptions;
  if ('veil' in stateOrOptions) {
    options = {
      strength: stateOrOptions.veil.strength,
      rooms: stateOrOptions.rooms,
      groundY: groundYArg,
      worldWidth: worldWidthArg,
      showHazardsLens: Boolean(stateOrOptions.settings?.showHazardsLens),
      wardwaterFloors: stateOrOptions.activeBuffs?.wardwaterFloors,
      wardPulseBells: stateOrOptions.activeBuffs?.wardPulseBells,
      rippleProgress: paidRippleProgressArg > 0 ? paidRippleProgressArg : null,
      unpaidDimRemainingMs: unpaidDimProgressArg > 0 ? unpaidDimProgressArg * 1000 : 0,
      clockMs: clockMsArg
    };
  } else {
    options = stateOrOptions;
  }

  const strength = Math.max(0, Math.min(100, Number.isFinite(options.strength) ? options.strength : 100));
  const band = getVeilBand(strength);

  // PALETTE.veil: ['#3D2856', '#7D5BA6', '#B9A6FF', '#9BD4FF']
  let skyWashColor = 0x9bd4ff;
  let skyWashAlpha = 0.0;
  let domeColor = 0x9bd4ff;
  if (band === 'strong') {
    skyWashColor = 0x9bd4ff;
    skyWashAlpha = 0.0;
    domeColor = 0x9bd4ff;
  } else if (band === 'thinning') {
    skyWashColor = 0xb9a6ff;
    skyWashAlpha = 0.08;
    domeColor = 0xb9a6ff;
  } else if (band === 'thin') {
    skyWashColor = 0x7d5ba6;
    skyWashAlpha = 0.20;
    domeColor = 0x9c7ad6;
  } else {
    skyWashColor = 0x3d2856;
    skyWashAlpha = 0.32;
    domeColor = 0x7d5ba6;
  }

  const unpaidDimRemainingMs = options.unpaidDimRemainingMs ?? 0;
  const dimMultiplier = unpaidDimRemainingMs > 0 ? 0.35 : 1.0;
  const paidRippleActive = options.rippleProgress !== null && options.rippleProgress !== undefined && options.rippleProgress > 0;
  const rippleBoost = paidRippleActive ? Math.sin((options.rippleProgress || 0) * Math.PI) * 0.22 : 0;

  const baseDomeAlpha = 0.14 + (strength / 100) * 0.28;
  const domeAlpha = Math.max(0.05, Math.min(0.65, (baseDomeAlpha + rippleBoost) * dimMultiplier));

  const hasEdgeGaps = strength < 50;
  const edgeGapCount = strength < 20 ? 6 : strength < 50 ? 4 : 0;
  const hasVioletTears = strength < 20;
  const violetTearCount = strength < 20 ? 4 : 0;

  const tears: VeilTearSpec[] = [];
  if (hasVioletTears) {
    const clockSec = (options.clockMs ?? 0) / 1000;
    for (let i = 0; i < violetTearCount; i++) {
      const tx = options.worldWidth * (0.2 + i * 0.2);
      const ty = 22 + (i % 2) * 14;
      const flicker = 0.55 + 0.4 * Math.abs(Math.sin(clockSec * 3.5 + i * 1.7));
      tears.push({
        x: tx,
        y: ty,
        width: 24 + (i % 2) * 8,
        height: 8,
        alpha: flicker
      });
    }
  }

  // Wards show as teal circles ONLY when the hazards lens is on
  const showWardCircles = Boolean(options.showHazardsLens);
  const wardCircles: VeilDomeState['wardCircles'] = [];
  if (showWardCircles) {
    const floors = new Set<number>(options.wardwaterFloors || []);
    if ((options.wardPulseBells || 0) > 0) {
      for (const r of options.rooms) {
        if (r.state === 'built') floors.add(r.y);
      }
    }
    for (const r of options.rooms) {
      if (r.state !== 'built') continue;
      const hasWardItem =
        r.defId === 'standing_stones' ||
        r.furniture.some(f => !f.damaged && (f.defId.includes('ward') || f.defId.includes('seal') || f.defId.includes('bell_of_vigil')));
      if (hasWardItem || floors.has(r.y)) {
        const box = roomToWorldBox(r, options.groundY);
        wardCircles.push({
          floor: r.y,
          x: box.left + box.width * 0.5,
          y: box.top + box.height * 0.5,
          radius: Math.max(18, Math.min(box.width, box.height) * 0.45),
          color: 0x2e8b8b
        });
      }
    }
    for (const fl of floors) {
      if (!wardCircles.some(w => w.floor === fl)) {
        wardCircles.push({
          floor: fl,
          x: options.worldWidth * 0.5,
          y: options.groundY - fl * 48 - 24,
          radius: 26,
          color: 0x2e8b8b
        });
      }
    }
  }

  return {
    strength,
    band,
    skyWashColor,
    skyWashAlpha,
    domeColor,
    domeAlpha,
    hasEdgeGaps,
    edgeGaps: hasEdgeGaps,
    edgeGapCount,
    hasVioletTears,
    violetTearCount,
    tears,
    paidRippleActive,
    rippleProgress: options.rippleProgress ?? null,
    dimMultiplier,
    showWardCircles,
    wardCircles
  };
}

export interface ComputeAtmosphereOptions {
  date?: Date;
  now?: Date;
  visualTime?: VisualTimeSetting;
  debugTimeHours?: number | null;
  veilStrength?: number;
  rooms?: PlacedRoom[];
  groundY?: number;
  worldWidth?: number;
  cameraPanX?: number;
  cameraX?: number;
  clockMs?: number;
  reduceMotion?: boolean;
  showHazardsLens?: boolean;
  wardwaterFloors?: number[];
  wardPulseBells?: number;
  rippleProgress?: number | null;
  paidRippleProgress?: number;
  unpaidDimRemainingMs?: number;
  unpaidDimProgress?: number;
  riftState?: RiftGateVisualState;
}

/**
 * Full pure atmosphere calculation for a given frame / clock state.
 * Accepts either `(state: FullGameState, envOpts?)` or `(options: ComputeAtmosphereOptions)`.
 */
export function computeAtmosphere(
  stateOrOptions: FullGameState | ComputeAtmosphereOptions,
  envOpts?: ComputeAtmosphereOptions
): AtmosphereOutput {
  let options: ComputeAtmosphereOptions;
  if ('veil' in stateOrOptions && 'rooms' in stateOrOptions && 'settings' in stateOrOptions) {
    const st = stateOrOptions as FullGameState;
    options = {
      date: envOpts?.now ?? envOpts?.date ?? new Date(),
      visualTime: st.settings?.visualTime ?? 'clock',
      debugTimeHours: st.debugTimeHours,
      veilStrength: st.veil.strength,
      rooms: st.rooms,
      groundY: envOpts?.groundY ?? 400,
      worldWidth: envOpts?.worldWidth ?? 1600,
      cameraPanX: envOpts?.cameraX ?? envOpts?.cameraPanX ?? 0,
      clockMs: envOpts?.clockMs ?? 0,
      reduceMotion: Boolean(st.settings?.reduceMotion),
      showHazardsLens: Boolean(st.settings?.showHazardsLens),
      wardwaterFloors: st.activeBuffs?.wardwaterFloors,
      wardPulseBells: st.activeBuffs?.wardPulseBells,
      rippleProgress:
        envOpts?.paidRippleProgress && envOpts.paidRippleProgress > 0
          ? envOpts.paidRippleProgress
          : envOpts?.rippleProgress ?? null,
      unpaidDimRemainingMs:
        envOpts?.unpaidDimProgress && envOpts.unpaidDimProgress > 0
          ? envOpts.unpaidDimProgress * 1000
          : envOpts?.unpaidDimRemainingMs ?? 0,
      riftState: envOpts?.riftState ?? getRiftGateVisualState(st, false)
    };
  } else {
    options = stateOrOptions as ComputeAtmosphereOptions;
  }

  const date = options.now ?? options.date ?? new Date();
  const groundY = options.groundY ?? 400;
  const worldWidth = options.worldWidth ?? 1600;
  const rooms = options.rooms ?? [];
  const veilStrength = options.veilStrength ?? 100;

  const hours = resolveEffectiveHours(date, options.visualTime ?? 'clock', options.debugTimeHours);
  const { phase, nightWeight, phaseBlend } = getTimePhaseInfo(hours);

  const skyTopColor = lerpColor(DAY_SKY_TOP, NIGHT_SKY_TOP, nightWeight);
  let skyBottomColor = lerpColor(DAY_SKY_BOTTOM, NIGHT_SKY_BOTTOM, nightWeight);

  let horizonGlowColor = DAY_SKY_BOTTOM;
  let horizonGlowAlpha = 0;
  let worldTintColor = DAY_TINT;
  let worldTintAlpha = 0;

  if (phase === 'dawn') {
    const arch = Math.sin(phaseBlend * Math.PI);
    skyBottomColor = lerpColor(skyBottomColor, DAWN_HORIZON, arch * 0.65);
    horizonGlowColor = DAWN_HORIZON;
    horizonGlowAlpha = arch * 0.45;
    worldTintColor = lerpColor(NIGHT_TINT, DAWN_TINT, phaseBlend);
    worldTintAlpha = lerpNumber(0.28, 0.0, phaseBlend);
  } else if (phase === 'dusk') {
    const arch = Math.sin(phaseBlend * Math.PI);
    skyBottomColor = lerpColor(skyBottomColor, DUSK_HORIZON, arch * 0.65);
    horizonGlowColor = DUSK_HORIZON;
    horizonGlowAlpha = arch * 0.50;
    worldTintColor = lerpColor(DUSK_TINT, NIGHT_TINT, phaseBlend);
    worldTintAlpha = lerpNumber(0.0, 0.28, phaseBlend);
  } else if (phase === 'night') {
    worldTintColor = NIGHT_TINT;
    worldTintAlpha = 0.28;
  } else {
    worldTintColor = DAY_TINT;
    worldTintAlpha = 0;
  }

  const skyMid = lerpColor(skyTopColor, skyBottomColor, 0.5);
  const skyHorizon =
    horizonGlowAlpha > 0 ? lerpColor(skyBottomColor, horizonGlowColor, horizonGlowAlpha) : skyBottomColor;

  const starAlpha = nightWeight;
  const windowGlowAlpha = nightWeight;

  const celestial = computeCelestialBodies(hours, worldWidth, groundY, date);
  const hills = computeParallaxHills(
    worldWidth,
    groundY,
    options.cameraPanX ?? options.cameraX ?? 0,
    nightWeight
  );
  const clouds = computeClouds(
    worldWidth,
    groundY,
    options.clockMs ?? 0,
    Boolean(options.reduceMotion),
    nightWeight
  );
  const roomLights = computeRoomNightLights(rooms, groundY, nightWeight, options.riftState);
  const veil = computeVeilDomeState({
    strength: veilStrength,
    rooms,
    groundY,
    worldWidth,
    showHazardsLens: options.showHazardsLens,
    wardwaterFloors: options.wardwaterFloors,
    wardPulseBells: options.wardPulseBells,
    rippleProgress: options.rippleProgress,
    unpaidDimRemainingMs: options.unpaidDimRemainingMs,
    clockMs: options.clockMs
  });

  return {
    hours,
    phase,
    nightWeight,
    nightLightStrength: nightWeight,
    phaseBlend,
    blendProgress: phaseBlend,
    skyTopColor,
    skyBottomColor,
    skyTop: skyTopColor,
    skyMid,
    skyHorizon,
    horizonGlowColor,
    horizonGlowAlpha,
    worldTintColor,
    worldTintAlpha,
    starAlpha,
    windowGlowAlpha,
    sun: celestial.sun,
    moon: celestial.moon,
    celestial,
    hills,
    clouds,
    roomLights,
    nightLights: roomLights,
    veil,
    veilDome: veil
  };
}
