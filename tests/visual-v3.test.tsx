/**
 * V3: layered characters, portraits, injury path, and onboarding that matches the three-room start.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { createNewAcademy } from '../src/visual/onboarding/freshStart.ts';
import { CharacterCreationModal } from '../src/visual/onboarding/CharacterCreationModal.tsx';
import { FoundingDay, GuidedTour } from '../src/visual/onboarding/FoundingTour.tsx';
import { FIRST_GOAL, TOUR_STEPS, advanceTour, phaseAfterCreate } from '../src/visual/onboarding/flow.ts';
import {
  BODY_SHAPES, CREATION_HATS, EYE_COLOURS, FACE_SHAPES, HAIR_COLOURS, HAIR_STYLES, SHOE_KINDS, SKIN_TONES, STAFFS
} from '../src/utils/appearance.ts';
import {
  DOLL_ANIMS, HELD_ITEMS, LAYER_OPTIONS, MOVE_SPEED, appearanceToLayers, bubbleLabel, chooseBubble,
  drawBubble, drawCharacter, drawPortrait, healingPlaceFor
} from '../src/visual/agents/doll.ts';
import { Choreographer } from '../src/visual/agents/Choreographer.ts';
import { NavGraph } from '../src/visual/layout/navGraph.ts';
import type { Character, InjuryType } from '../src/types/ankicaster.ts';

class RecordingPainter {
  shapes = 0;
  pending = 0;
  problems: string[] = [];
  private num(label: string, ...v: number[]) {
    for (const n of v) if (!Number.isFinite(n)) this.problems.push(`${label} non-finite`);
    return this;
  }
  rect(x: number, y: number, w: number, h: number) { this.pending++; return this.num('rect', x, y, w, h); }
  circle(x: number, y: number, r: number) { this.pending++; if (r < 0) this.problems.push('r<0'); return this.num('circle', x, y, r); }
  ellipse(x: number, y: number, rx: number, ry: number) { this.pending++; return this.num('ellipse', x, y, rx, ry); }
  poly(points: number[]) { this.pending++; if (points.length < 4 || points.length % 2) this.problems.push(`poly ${points.length}`); return this.num('poly', ...points); }
  fill(s: { color: number; alpha?: number }) { return this.style('fill', s); }
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
  assert.match(create, /data-hair="short_messy"/);
  assert.match(create, /Skin tone 1 of 8/);

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
  const tour = renderToStaticMarkup(<GuidedTour step={2} onNext={() => {}} onSkip={() => {}} />);
  assert.match(tour, /Vegetable Patch/);
  assert.match(tour, /50 mana/);
  assert.match(tour, /Magic for 100/);
  assert.match(tour, /materials, not mana/);
  const top = renderToStaticMarkup(<GuidedTour step={3} onNext={() => {}} onSkip={() => {}} />);
  assert.match(top, /resources/);
  assert.match(top, new RegExp(FIRST_GOAL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

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
});
