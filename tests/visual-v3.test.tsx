/**
 * V3: layered characters, portraits, injury path, and onboarding that matches the three-room start.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { createNewAcademy } from '../src/visual/onboarding/freshStart.ts';
import { CharacterCreationModal } from '../src/visual/onboarding/CharacterCreationModal.tsx';
import { FoundingDay, GoalBanner, GuidedTour } from '../src/visual/onboarding/FoundingTour.tsx';
import { FIRST_GOAL, TOUR_STEPS, advanceTour, applyTutorialAction, defaultTourTargets, DEFAULT_TOUR_VIEWPORT, phaseAfterCreate, placeTourBox, rectsIntersect, STUDY_PARTS, tourStepId, tourView } from '../src/visual/onboarding/flow.ts';
import {
  BODY_SHAPES, CREATION_HATS, EYE_COLOURS, FACE_SHAPES, HAIR_ALIAS, HAIR_COLOURS, HAIR_STYLES, SHOE_KINDS, SKIN_TONES, STAFFS, resolveHair
} from '../src/utils/appearance.ts';
import {
  DOLL_ANIMS, HELD_ITEMS, HEAD_R, LAYER_OPTIONS, MOVE_SPEED, appearanceToLayers, bubbleLabel, chooseBubble,
  dollAnchors, dollFrame, drawBubble, drawCharacter, drawPortrait, hairMaskPixels, hairPalette, healingPlaceFor, portraitBackgroundColor, portraitLayout
} from '../src/visual/agents/doll.ts';
import { Choreographer } from '../src/visual/agents/Choreographer.ts';
import { NavGraph } from '../src/visual/layout/navGraph.ts';
import { VisualWorld } from '../src/visual/world/VisualWorld.ts';
import { AnkicasterEngine } from '../src/utils/engine.ts';
import type { Character, InjuryType } from '../src/types/ankicaster.ts';

class RecordingPainter {
  shapes = 0;
  pending = 0;
  problems: string[] = [];
  ops: Array<
    | { k: 'rect'; x: number; y: number; w: number; h: number }
    | { k: 'circle'; x: number; y: number; r: number }
    | { k: 'ellipse'; x: number; y: number; rx: number; ry: number }
    | { k: 'poly'; points: number[] }
  > = [];
  paints: Array<{ color: number; op: RecordingPainter['ops'][number] }> = [];
  private num(label: string, ...v: number[]) {
    for (const n of v) if (!Number.isFinite(n)) this.problems.push(`${label} non-finite`);
    return this;
  }
  rect(x: number, y: number, w: number, h: number) { this.ops.push({ k: 'rect', x, y, w, h }); this.pending++; return this.num('rect', x, y, w, h); }
  circle(x: number, y: number, r: number) { this.ops.push({ k: 'circle', x, y, r }); this.pending++; if (r < 0) this.problems.push('r<0'); return this.num('circle', x, y, r); }
  ellipse(x: number, y: number, rx: number, ry: number) { this.ops.push({ k: 'ellipse', x, y, rx, ry }); this.pending++; return this.num('ellipse', x, y, rx, ry); }
  poly(points: number[]) { this.ops.push({ k: 'poly', points: points.slice() }); this.pending++; if (points.length < 4 || points.length % 2) this.problems.push(`poly ${points.length}`); return this.num('poly', ...points); }
  fill(s: { color: number; alpha?: number }) {
    const start = this.ops.length - this.pending;
    for (let i = Math.max(0, start); i < this.ops.length; i++) this.paints.push({ color: s.color, op: this.ops[i] });
    return this.style('fill', s);
  }
  stroke(s: { color: number; width?: number; alpha?: number }) { return this.style('stroke', s); }
  private style(kind: string, s: { color: number; alpha?: number; width?: number }) {
    if (!Number.isInteger(s.color) || s.color < 0 || s.color > 0xffffff) this.problems.push(`${kind} colour ${s.color}`);
    if (s.alpha !== undefined && !(s.alpha >= 0 && s.alpha <= 1)) this.problems.push(`${kind} alpha ${s.alpha}`);
    if (s.width !== undefined && !(s.width > 0)) this.problems.push(`${kind} width ${s.width}`);
    this.shapes += this.pending ? 1 : 0;
    this.pending = 0;
    return this;
  }
}

function drawLook(look: ReturnType<typeof appearanceToLayers>, anim: keyof typeof DOLL_ANIMS = 'idle', frame = 0) {
  const p = new RecordingPainter();
  const res = drawCharacter(p, look, { x: 40, y: 60, facing: 'R', anim, frame });
  assert.deepEqual(p.problems, [], `${look.role} ${anim} ${look.hat} ${look.hair}`);
  assert.ok(p.shapes >= 3, 'drew shapes');
  return res;
}

const base = () => appearanceToLayers({
  id: 1, isWizard: true,
  appearance: { skin: SKIN_TONES[0], hair: 'short', hairColor: HAIR_COLOURS[0].color, robeColor: '#6B4FBB', hat: 'pointed', staff: 'oak', bodyShape: 1, eyes: EYE_COLOURS[0].color, face: 'round', shoes: 'boots' }
});

test('catalog draws every appearance option and every role mark', () => {
  for (const id of LAYER_OPTIONS.body) {
    const look = base();
    look.bodyShape = id as 1 | 2 | 3 | 4;
    drawLook(look);
  }
  for (const skin of SKIN_TONES) { const look = base(); look.skin = skin; drawLook(look); }
  for (const hair of HAIR_STYLES) { const look = base(); look.hair = hair.id; drawLook(look); }
  for (const col of HAIR_COLOURS) { const look = base(); look.hairColor = col.color; drawLook(look); }
  for (const eye of EYE_COLOURS) { const look = base(); look.eyes = eye.color; drawLook(look); }
  for (const face of FACE_SHAPES) { const look = base(); look.face = face; drawLook(look); }
  for (const shoes of SHOE_KINDS) { const look = base(); look.shoes = shoes; drawLook(look); }
  for (const hat of CREATION_HATS) { const look = base(); look.hat = hat.id; drawLook(look); }
  for (const staff of STAFFS) { const look = base(); look.staff = staff.id; look.role = 'wizard'; drawLook(look, 'cast', 2); }
  for (const item of HELD_ITEMS) {
    const look = appearanceToLayers({ id: item, status: 'faculty', career: 'teacher', currentSchool: 'arcane', appearance: { skin: '#F6D7C3', hair: 'bob', hairColor: '#4A2E1E', robeColor: '#6B4FBB', hat: 'none' } });
    look.role = 'faculty';
    const p = new RecordingPainter();
    drawCharacter(p, look, { x: 30, y: 50, facing: 'L', anim: item === 'staff' ? 'idle' : 'work', frame: 1 });
    assert.deepEqual(p.problems, [], item);
  }
  const marks: Record<string, string> = {};
  for (const role of LAYER_OPTIONS.roles) {
    const look = appearanceToLayers({
      id: role,
      isWizard: role === 'wizard',
      status: role === 'student' ? 'student' : role === 'resident' ? 'resident' : 'faculty',
      career: role === 'adventurer' ? 'adventurer' : role === 'faculty' ? 'teacher' : undefined,
      careerState: role === 'sabbatical' ? 'sabbatical' : undefined,
      masteredSchools: role === 'resident' ? ['nature'] : [],
      currentSchool: 'nature',
      appearance: { skin: '#C08560', hair: 'braid', hairColor: '#B8402A', robeColor: '#4E8B3A', hat: role === 'wizard' ? 'pointed' : 'cap' }
    });
    const res = drawLook(look, 'walk', 1);
    marks[role] = res.mark;
    const portrait = new RecordingPainter();
    drawPortrait(portrait, look);
    assert.deepEqual(portrait.problems, [], `portrait ${role}`);
    assert.ok(portrait.shapes >= 4, `portrait ${role} drew`);
  }
  assert.deepEqual(marks, {
    wizard: 'sigil', faculty: 'stole', resident: 'star', student: 'scarf', adventurer: 'pack', sabbatical: 'folded'
  });
  for (const anim of Object.keys(DOLL_ANIMS) as Array<keyof typeof DOLL_ANIMS>) {
    drawLook(base(), anim, 0);
  }
  for (const injury of ['bruised', 'sprained', 'hexed', 'broken_bone', 'rift_touched'] as InjuryType[]) {
    const p = new RecordingPainter();
    drawBubble(p, { kind: 'injury', injury }, 10, 10, 2);
    assert.deepEqual(p.problems, [], injury);
    assert.ok(p.shapes >= 1);
  }
  assert.equal(MOVE_SPEED.walk, 28);
  assert.equal(MOVE_SPEED.limp, 16);
  assert.ok(Object.values(DOLL_ANIMS).every(a => a.fps > 0 && a.frames > 0));
});

test('an injured character shows the injury bubble and walks to healingPlaceFor', () => {
  const needs = { hunger: 10, rest: 90, leisure: 90, composure: 90, health: 40 };
  const bubble = chooseBubble({ injury: { type: 'sprained' }, needs: { hunger: 10, rest: 90, leisure: 90, composure: 90 }, morale: 90, readyDays: { nature: 2 } });
  assert.deepEqual(bubble, { kind: 'injury', injury: 'sprained' });
  assert.equal(chooseBubble({ needs: { hunger: 80, rest: 10, leisure: 90, composure: 90 } })?.kind, 'need');
  assert.equal(bubbleLabel([{ kind: 'need', need: 'hunger', urgent: true }, { kind: 'injury', injury: 'bruised' }]), '1 hungry, 1 injured');

  const state = createNewAcademy({ name: 'Ivy', skin: '#F6D7C3', hair: 'bob', hairColor: '#4A2E1E', robeColor: '#4E8B3A', hat: 'pointed', staff: 'oak' });
  const infirmary = { ...state.rooms[0], id: 40, defId: 'infirmary', x: 0, y: 0, w: 2, h: 1, furniture: [] };
  const dorm = { ...state.rooms[0], id: 41, defId: 'dormitory', x: 1, y: 0, w: 1, h: 1, furniture: [] };
  state.rooms = [...state.rooms, infirmary, dorm];
  const char = {
    id: 7, name: 'Nim', pronouns: 'they/them', status: 'student', personality: 'Bold', traits: [],
    appearance: { skin: '#F6D7C3', hair: 'short', hairColor: '#4A2E1E', robeColor: '#4E8B3A', hat: 'cap' },
    masteredSchools: [], needs, morale: 40, injury: { type: 'bruised' as const, points: 0, required: 30 },
    bedRoomId: dorm.id, readyDays: {}, enrolledDay: 1, careerSetIds: [], currentSchool: 'nature'
  } as unknown as Character;
  assert.equal(healingPlaceFor(char, state.rooms), infirmary.id);
  char.injury = { type: 'broken_bone', points: 0, required: 80 };
  assert.equal(healingPlaceFor(char, state.rooms), dorm.id, 'broken bone stays in bed');

  state.characters = [{ ...char, injury: { type: 'bruised', points: 0, required: 30 } }];
  const ch = new Choreographer(new NavGraph(state.rooms, 400), 400);
  ch.syncState(state);
  ch.tick(80, state, false);
  const agent = ch.agents.get('char-7');
  assert.ok(agent);
  assert.equal(agent!.targetRoomId, healingPlaceFor(state.characters[0], state.rooms));
});

test('a new game runs creation, then Founding Day, and lands on the three starting rooms with the tour', () => {
  const html = renderToStaticMarkup(
    <CharacterCreationModal isOpen isExistingSave={false} onComplete={() => {}} />
  );
  assert.match(html, /Begin/);
  assert.match(html, /Skip Tutorial/);
  const create = renderToStaticMarkup(
    <CharacterCreationModal isOpen isExistingSave onComplete={() => {}} />
  );
  for (const b of BODY_SHAPES) assert.match(create, new RegExp(`data-body="${b.id}"`));
  for (const h of CREATION_HATS) assert.match(create, new RegExp(`data-hat="${h.id}"`));
  for (const e of EYE_COLOURS) assert.match(create, new RegExp(`data-eye="${e.id}"`));
  for (const s of STAFFS) assert.match(create, new RegExp(`data-staff="${s.id}"`));
  assert.match(create, /data-hair="short"/);
  assert.match(create, /Skin tone 1 of 8/);
  assert.match(create, /data-testid="headmaster-preview"/);
  assert.match(create, /data-scale="4"/);
  assert.match(create, /width="192"/);
  assert.match(create, /height="256"/);

  assert.equal(phaseAfterCreate(false), 'founding');
  assert.equal(phaseAfterCreate(true), 'play');
  let step = 0;
  for (let i = 0; i < TOUR_STEPS.length - 1; i++) {
    const n = advanceTour(step);
    assert.equal(n.phase, 'tour');
    step = n.step;
  }
  assert.equal(advanceTour(step).phase, 'goal');

  const founding = renderToStaticMarkup(<FoundingDay onDone={() => {}} />);
  assert.match(founding, /data-testid="founding-day"/);
  assert.match(founding, /Entrance Hall/);
  assert.match(founding, /Wizard(?:'|&#x27;)s Study/);
  assert.match(founding, /Vegetable Patch/);
  const studyView = tourView({ phase: 'tour', step: 1, part: 0 }, { studyOpen: false });
  const studyHtml = renderToStaticMarkup(<GuidedTour view={studyView} step={1} onNext={() => {}} onSkip={() => {}} />);
  assert.match(studyHtml, /Skip tutorial/);
  assert.match(studyHtml, /Wizard/);
  assert.equal(studyHtml.includes('data-testid="tour-next"'), false);
  const drawView = tourView({ phase: 'tour', step: 6, part: 0 }, { studyOpen: false });
  const drawHtml = renderToStaticMarkup(<GuidedTour view={drawView} step={6} onNext={() => {}} onSkip={() => {}} />);
  assert.match(drawHtml, /Foundation/);
  assert.match(drawHtml, /50 mana/);
  assert.match(drawHtml, /materials/);
  assert.match(drawHtml, /Skip tutorial/);
  const goal = renderToStaticMarkup(<GoalBanner onDone={() => {}} />);
  assert.match(goal, new RegExp(FIRST_GOAL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  const state = createNewAcademy({
    name: 'Ivy', title: 'Witch', pronouns: 'she/her', bodyShape: 2, skin: '#C08560', hair: 'braid',
    hairColor: '#B8402A', eyes: '#3A6A9A', face: 'oval', shoes: 'slippers', robeColor: '#6B4FBB',
    hat: 'floppy', staff: 'willow', foundingSchool: 'arcane', academyName: 'Ivy Hall', mode: 'endless'
  });
  assert.deepEqual(state.rooms.map(r => r.defId).sort(), ['entrance_hall', 'vegetable_patch', 'wizard_study']);
  assert.equal(state.mana, 0);
  assert.equal(state.wizard.appearance?.hat, 'floppy');
  assert.equal(state.wizard.appearance?.hair, 'braid');
  assert.equal(state.wizard.appearance?.eyes, '#3A6A9A');
  assert.equal(state.rooms.length, 3);
  assert.equal(state.tutorial?.phase, 'founding');
});

const ROLES = ['wizard', 'faculty', 'resident', 'student', 'adventurer', 'sabbatical'] as const;

function headShape(ops: RecordingPainter['ops'], headY: number, x = 40) {
  const near = (y: number) => Math.abs(y - headY) <= 1.6;
  for (const o of ops) {
    if (o.k === 'circle' && Math.abs(o.x - x) < 0.2 && Math.abs(o.r - HEAD_R) < 0.2 && near(o.y)) return o;
    if (o.k === 'ellipse' && Math.abs(o.x - x) < 0.2 && o.ry >= 5 && near(o.y)) return o;
    if (o.k === 'rect' && Math.abs(o.x + o.w / 2 - x) < 0.2 && o.h >= 9 && near(o.y + o.h / 2)) return o;
  }
  return undefined;
}

function portraitHead(ops: RecordingPainter['ops']) {
  for (const o of ops) {
    if (o.k === 'circle' && Math.abs(o.r - HEAD_R * 4) < 0.2) return o;
    if (o.k === 'ellipse' && o.ry >= HEAD_R * 4) return o;
    if (o.k === 'rect' && o.h >= HEAD_R * 2 * 4 - 1) return o;
  }
  return undefined;
}

function lookOf(role: (typeof ROLES)[number], body: number, hair: string, hat: string, face: string) {
  return appearanceToLayers({
    id: `${role}-${body}-${hair}-${hat}-${face}`,
    isWizard: role === 'wizard',
    status: role === 'student' ? 'student' : role === 'resident' ? 'resident' : 'faculty',
    career: role === 'adventurer' ? 'adventurer' : role === 'faculty' ? 'teacher' : undefined,
    careerState: role === 'sabbatical' ? 'sabbatical' : undefined,
    masteredSchools: role === 'resident' ? ['nature'] : [],
    currentSchool: 'nature',
    bodyShape: body,
    face,
    hat,
    hair,
    appearance: {
      skin: '#F6D7C3', hair, hairColor: '#4A2E1E', robeColor: '#4E8B3A', hat,
      face, eyes: '#4A2E1E', shoes: 'boots', bodyShape: body, staff: 'oak'
    }
  });
}

test('head layer meets the neck for every body, hat, hair and role', () => {
  const faces = ['round', 'oval', 'square', 'heart'];
  for (const role of ROLES) {
    for (const body of [1, 2, 3, 4]) {
      for (const hair of HAIR_STYLES) {
        for (const hat of CREATION_HATS) {
          const look = lookOf(role, body, hair.id, hat.id, 'round');
          const p = new RecordingPainter();
          const res = drawCharacter(p, look, { x: 40, y: 90, facing: 'R', anim: 'idle', frame: 0 });
          assert.deepEqual(p.problems, [], `${role} body ${body} ${hair.id} ${hat.id}`);
          const neckY = res.anchors.neckY;
          const headY = res.anchors.headY;
          assert.ok(Math.abs(headY - (90 + dollAnchors(look.role, look.bodyShape).head)) < 0.01);
          const head = headShape(p.ops, headY);
          assert.ok(head, `missing head ${role} ${body}`);
          const center = head.k === 'rect' ? head.y + head.h / 2 : head.y;
          const bottom = head.k === 'circle' ? head.y + head.r : head.k === 'ellipse' ? head.y + head.ry : head.y + head.h;
          assert.ok(Math.abs(center - headY) < 0.2, `head drifted ${role} body ${body} ${center} vs ${headY}`);
          assert.ok(bottom + 0.05 >= neckY, `gap under head ${role} body ${body} bottom ${bottom} neck ${neckY}`);
          const neck = p.ops.find(o => o.k === 'rect' && Math.abs(o.y - neckY) < 0.05 && o.h >= 6 && Math.abs(o.x + o.w / 2 - 40) < 1);
          assert.ok(neck, `neck row missing ${role} body ${body}`);
        }
      }
      for (const face of faces) {
        const look = lookOf(role, body, 'short', 'pointed', face);
        const p = new RecordingPainter();
        const res = drawCharacter(p, look, { x: 40, y: 90, facing: 'L', anim: 'idle', frame: 1 });
        const head = headShape(p.ops, res.anchors.headY);
        assert.ok(head, `face ${face} body ${body}`);
        const bottom = head.k === 'circle' ? head.y + head.r : head.k === 'ellipse' ? head.y + head.ry : head.y + head.h;
        assert.ok(bottom + 0.05 >= res.anchors.neckY, `${face} body ${body} floats`);
      }
    }
  }
});

test('portrait crop is centred on the face for every body', () => {
  const centers: Array<[number, number]> = [];
  for (const role of ROLES) {
    for (const body of [1, 2, 3, 4]) {
      for (const face of ['round', 'oval', 'square', 'heart']) {
        const look = lookOf(role, body, 'bob', 'cap', face);
        const lay = portraitLayout(look);
        assert.equal(lay.cx, 32);
        assert.equal(lay.cy, 32);
        assert.ok(lay.faceDiameter / 64 >= 0.55 && lay.faceDiameter / 64 <= 0.7, `face share ${lay.faceDiameter}`);
        centers.push([lay.headOffset, body]);
        const p = new RecordingPainter();
        drawPortrait(p, look);
        assert.deepEqual(p.problems, [], `${role} ${body} ${face}`);
        const head = portraitHead(p.ops);
        assert.ok(head, `portrait head ${role} ${body} ${face}`);
        const cx = head.k === 'rect' ? head.x + head.w / 2 : head.x;
        const cy = head.k === 'rect' ? head.y + head.h / 2 : head.y;
        assert.ok(Math.abs(cx - 32) < 0.2 && Math.abs(cy - 32) < 0.2, `off centre ${role} ${body} ${face} ${cx},${cy}`);
      }
    }
  }
  const offsets = new Set(centers.map(([off]) => off));
  assert.ok(offsets.size > 1, 'tall and short bodies should not share a head anchor');
  const nature = lookOf('student', 4, 'bob', 'none', 'round');
  const raw = 0x4e8b3a;
  const bg = portraitBackgroundColor(nature);
  assert.ok(bg < raw, 'portrait background is a darkened school colour');
});

test('tutorial advances only on the right action, resumes after reload, and skip ends it', () => {
  const study = { phase: 'tour' as const, step: 1, part: 0 };
  assert.equal(tourStepId(study), 'study');
  assert.deepEqual(applyTutorialAction(study, 'next'), study);
  assert.deepEqual(applyTutorialAction(study, 'open-other'), study);
  assert.deepEqual(applyTutorialAction(study, 'close-study'), study);
  assert.equal(applyTutorialAction(study, 'open-study').step, 2);

  const close = { phase: 'tour' as const, step: 3, part: 4 };
  assert.equal(tourStepId(close), 'close');
  assert.equal(applyTutorialAction(close, 'next').step, 3);
  assert.equal(applyTutorialAction(close, 'open-study').step, 3);
  assert.equal(applyTutorialAction(close, 'open-other').step, 3);
  assert.equal(applyTutorialAction(close, 'close-study').step, 4);

  for (const step of [0, 1, 2, 3, 4, 5, 6]) {
    const done = applyTutorialAction({ phase: 'tour', step, part: 2 }, 'skip');
    assert.equal(done.phase, 'done');
  }
  assert.equal(applyTutorialAction({ phase: 'founding', step: 0, part: 0 }, 'skip').phase, 'done');

  const mid = { phase: 'tour' as const, step: 3, part: 2 };
  const loaded = AnkicasterEngine.normalizeLoadedState(JSON.parse(JSON.stringify({ tutorial: mid, rooms: [], characters: [] })));
  assert.deepEqual(loaded.tutorial, mid);
  const legacy = AnkicasterEngine.normalizeLoadedState({ rooms: [], characters: [] }) as { tutorial?: { phase: string } };
  assert.equal(legacy.tutorial?.phase, 'done');
});

test('extra ticker callbacks do not advance animation faster than the fixed rate', () => {
  const state = createNewAcademy({
    skin: '#F6D7C3', hair: 'bob', hairColor: '#4A2E1E', robeColor: '#4E8B3A', hat: 'pointed', staff: 'oak'
  });
  const world = new VisualWorld();
  world.setSnapshot(state);
  const t0 = 20_000;
  world.update(16, t0);
  const ch = world.choreographer;
  const wiz = ch.agents.get('wizard');
  assert.ok(wiz);
  const clock = ch.clockMs;
  const frame = wiz!.animFrame;
  const x = wiz!.x;
  for (let i = 0; i < 100; i++) {
    world.setSnapshot(state);
    world.update(16, t0);
  }
  assert.equal(ch.clockMs, clock, '100 callbacks at one timestamp must not add time');
  assert.equal(wiz!.animFrame, frame);
  assert.equal(wiz!.x, x, 'walking speed is not driven by callback count');
  assert.equal(wiz!.animFrame, dollFrame('idle', ch.clockMs - (wiz!.animBaseMs ?? ch.clockMs)));

  for (let i = 1; i <= 100; i++) world.update(16, t0 + i * 10);
  const gained = ch.clockMs - clock;
  assert.ok(gained <= 1000 + 1 && gained >= 900, `gained ${gained}`);
  assert.equal(wiz!.animFrame, dollFrame('idle', ch.clockMs - (wiz!.animBaseMs ?? ch.clockMs)));
  const steps = Math.floor(gained / (1000 / DOLL_ANIMS.idle.fps));
  assert.ok(steps <= DOLL_ANIMS.idle.fps, `idle advanced ${steps} frames in one second`);

  const before = ch.clockMs;
  world.update(60_000, t0 + 1000 + 60_000);
  assert.ok(ch.clockMs - before <= 250, 'focus return is clamped');

  const ch2 = new Choreographer(new NavGraph(state.rooms, 400), 400);
  ch2.syncState(state);
  ch2.tick(16, state, false, 8000);
  const c2 = ch2.clockMs;
  for (let i = 0; i < 100; i++) ch2.tick(50, state, false, 8000);
  assert.equal(ch2.clockMs, c2);
  const w2 = ch2.agents.get('wizard')!;
  assert.equal(w2.animFrame, dollFrame(w2.anim, ch2.clockMs - (w2.animBaseMs ?? ch2.clockMs)));
  assert.equal(w2.animFrame, 0);
});

test('every hair style meets the crown on all 4 bodies, and a hat hides hair that would poke through', () => {
  const hair = 0x4a2e1e;
  const pal = hairPalette(hair);
  const tones = new Set([pal.outline, pal.mid, pal.hi]);
  for (const style of HAIR_STYLES) {
    for (const body of [1, 2, 3, 4]) {
      const look = lookOf('wizard', body, style.id, 'none', 'round');
      look.hairColor = '#4A2E1E';
      const p = new RecordingPainter();
      const res = drawCharacter(p, look, { x: 40, y: 90, facing: 'R', anim: 'idle', frame: 0 });
      assert.deepEqual(p.problems, [], `${style.id} body ${body}`);
      if (style.id === 'bald') continue;
      const headTop = res.anchors.headY - HEAD_R;
      const touching = p.paints.some(paint => {
        if (!tones.has(paint.color) || paint.op.k !== 'rect') return false;
        const top = paint.op.y;
        const bottom = paint.op.y + paint.op.h;
        const cx = paint.op.x + paint.op.w / 2;
        return bottom > headTop - 0.01 && top < headTop + 1.01 && Math.abs(cx - 40) < 8;
      });
      assert.ok(touching, `${style.id} body ${body} leaves a gap above the head`);

      const hatted = lookOf('wizard', body, style.id, 'pointed', 'round');
      hatted.hairColor = '#4A2E1E';
      const hp = new RecordingPainter();
      const hr = drawCharacter(hp, hatted, { x: 40, y: 90, facing: 'L', anim: 'idle', frame: 0 });
      const brim = hr.anchors.headY - 6;
      for (const paint of hp.paints) {
        if (!tones.has(paint.color) || paint.op.k !== 'rect') continue;
        assert.ok(paint.op.y >= brim - 0.01, `${style.id} body ${body} pokes through the hat at ${paint.op.y}`);
      }
    }
  }
});

test('side-profile hair is distinct, mirrored, and stays off the chin', () => {
  const poses = [
    { facing: 'L' as const, anim: 'idle' as const },
    { facing: 'R' as const, anim: 'idle' as const },
    { facing: 'R' as const, anim: 'climb' as const }
  ];
  for (const style of HAIR_STYLES) {
    for (const pose of poses) {
      const p = new RecordingPainter();
      drawCharacter(p, lookOf('student', 2, style.id, 'none', 'round'), {
        x: 40, y: 90, facing: pose.facing, anim: pose.anim, frame: 0
      });
      assert.deepEqual(p.problems, [], `${style.id} ${pose.facing} ${pose.anim}`);
    }
  }

  const masks = new Map<string, Set<string>>();
  for (const style of HAIR_STYLES) {
    if (style.id === 'bald') {
      assert.equal(hairMaskPixels(style.id, 'R').length, 0);
      continue;
    }
    const right = new Set(hairMaskPixels(style.id, 'R'));
    const left = new Set(hairMaskPixels(style.id, 'L'));
    const mirrored = new Set([...right].map(key => {
      const [x, y] = key.split(',').map(Number);
      return `${-x - 1},${y}`;
    }));
    assert.deepEqual(left, mirrored, `${style.id} does not mirror`);
    for (const key of right) {
      const [x, y] = key.split(',').map(Number);
      assert.ok(!(x >= 0 && y >= 3), `${style.id} hair sits on the chin at ${x},${y}`);
    }
    masks.set(style.id, right);
  }

  const ids = [...masks.keys()];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = masks.get(ids[i])!;
      const b = masks.get(ids[j])!;
      let diff = 0;
      for (const px of a) if (!b.has(px)) diff++;
      for (const px of b) if (!a.has(px)) diff++;
      assert.ok(diff >= 8, `${ids[i]} vs ${ids[j]} differ by ${diff}`);
    }
  }

  assert.equal(HAIR_STYLES.length, 8);
  assert.equal(HAIR_ALIAS.short_messy, 'short');
  assert.equal(HAIR_ALIAS.curls, 'bob');
  assert.equal(HAIR_ALIAS.locs, 'long');
  assert.equal(HAIR_ALIAS.wavy, 'long');
  assert.equal(resolveHair('short_messy'), 'short');
  assert.equal(resolveHair('curls'), 'bob');
  assert.equal(resolveHair('locs'), 'long');
  assert.equal(resolveHair('wavy'), 'long');
  assert.equal(resolveHair('messy'), 'short');
  assert.equal(resolveHair('pixie'), 'short');
  assert.equal(resolveHair('straight'), 'long');
});

test('tutorial box never intersects its target for every step at the default window size', () => {
  const vp = DEFAULT_TOUR_VIEWPORT;
  const box = { width: Math.min(576, vp.width - 32), height: 188 };
  const steps = defaultTourTargets(vp);
  assert.ok(steps.length >= STUDY_PARTS.length + 5);
  for (const step of steps) {
    const placed = placeTourBox(step.target, vp, box);
    assert.equal(rectsIntersect(placed, step.target), false, step.step);
    assert.ok(placed.left >= 7 && placed.top >= 7, `${step.step} off the top/left`);
    assert.ok(placed.left + placed.width <= vp.width - 7, `${step.step} off the right`);
    assert.ok(placed.top + placed.height <= vp.height - 7, `${step.step} off the bottom`);
  }
  const low = steps.find(s => s.step === 'study:renovate')!;
  assert.equal(placeTourBox(low.target, vp, box).side, 'above');
  const ponder = { phase: 'tour' as const, step: 2, part: STUDY_PARTS.findIndex(p => p.id === 'ponder') };
  assert.equal(tourStepId(ponder), 'study-parts');
  assert.equal(applyTutorialAction(ponder, 'next').part, ponder.part);
  assert.equal(applyTutorialAction(ponder, 'start-ponder').part, ponder.part + 1);
  const view = tourView(ponder, { studyOpen: true });
  assert.equal(view.showNext, false);
  assert.match(view.body, /25 honest reviews/);
  assert.equal(view.selector, '[data-testid="free-ponder"]');
});

