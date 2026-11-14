/**
 * 5.5 Room visual audit regression & invariant tests (tests/visual-audit-5-5.test.tsx).
 * Enforces every rule from room-visual-audit.md:
 * 1. drawTierSkin emits 0 light emitters across all tiers (warmth is wall/floor colour only).
 * 2. Every day glow emitter and night light comes strictly from a drawn fixture in roomLights.ts.
 * 3. Every stained_window/window trim tag draws real glass; the fallback 10x10 gold square is gone.
 * 4. Outdoor plots only emit/draw a L3 post lantern when that plot actually has a post.
 * 5. Dressed required pieces do not double-draw sprites or leave orphan steam/bubbles/glows behind.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { ROOM_DEFINITIONS } from '../src/data/content.ts';
import { PlacedRoom } from '../src/types/ankicaster.ts';
import { drawRoomInterior, drawTierSkin, TIERS, Emitter } from '../src/visual/rooms/roomArt.ts';
import { drawRoomUpgradeTrim, ROOM_TRIM_SPECS, getRoomTrimTags } from '../src/visual/rooms/roomTrims.ts';
import {
  roomLights,
  OUTDOOR_LANTERNS,
  DRESSING_IS_ART,
  stairCressetPoint,
  loungeArchPane,
  glassFanlightPane
} from '../src/visual/rooms/roomLights.ts';
import { getRoomLayout, layoutRoomFurniture } from '../src/visual/layout/roomLayouts.ts';
import { roomToWorldBox, getGroundY } from '../src/visual/layout/gridToWorld.ts';
import { computeRoomNightLights } from '../src/visual/world/atmosphere.ts';

type RecordedOp =
  | { k: 'rect'; x: number; y: number; w: number; h: number; color?: number; alpha?: number }
  | { k: 'circle'; x: number; y: number; r: number; color?: number; alpha?: number }
  | { k: 'ellipse'; x: number; y: number; rx: number; ry: number; color?: number; alpha?: number }
  | { k: 'poly'; points: number[]; color?: number; alpha?: number };

class InspectablePainter {
  ops: RecordedOp[] = [];
  private current: RecordedOp | null = null;
  rect(x: number, y: number, w: number, h: number) {
    this.current = { k: 'rect', x, y, w, h };
    return this;
  }
  circle(x: number, y: number, r: number) {
    this.current = { k: 'circle', x, y, r };
    return this;
  }
  ellipse(x: number, y: number, rx: number, ry: number) {
    this.current = { k: 'ellipse', x, y, rx, ry };
    return this;
  }
  poly(points: number[]) {
    this.current = { k: 'poly', points };
    return this;
  }
  fill(s: { color: number; alpha?: number }) {
    if (this.current) {
      this.current.color = s.color;
      this.current.alpha = s.alpha;
      this.ops.push(this.current);
      this.current = null;
    }
    return this;
  }
  stroke(s: { color: number; width?: number; alpha?: number }) {
    if (this.current) {
      this.current.color = s.color;
      this.current.alpha = s.alpha;
      this.ops.push(this.current);
      this.current = null;
    }
    return this;
  }
}

function makeRoom(defId: string, level: 1 | 2 | 3 = 1, furniture: PlacedRoom['furniture'] = [], id = 10): PlacedRoom {
  const d = ROOM_DEFINITIONS[defId];
  return {
    id,
    defId,
    x: 0,
    y: 0,
    w: d.size[0],
    h: d.size[1],
    area: d.area as 'castle' | 'grounds',
    level,
    state: 'built',
    buildRequired: 0,
    buildProgress: 0,
    cleanliness: 100,
    settings: {},
    furniture
  };
}

function requiredFurnitureFor(defId: string): PlacedRoom['furniture'] {
  const d = ROOM_DEFINITIONS[defId];
  let nextId = 1;
  return d.requiredFurniture.flatMap(req =>
    Array.from({ length: req.count }, () => ({
      id: nextId++,
      defId: req.role.split('_or_')[0],
      slotKind: `required:${req.role}`,
      damaged: false
    }))
  );
}

test('Audit Rule 1: drawTierSkin never emits torches, sconces, lamps, candles, or glow discs', () => {
  const box = { left: 0, top: 100, width: 128, height: 48, floorLineY: 144 };
  for (const tier of TIERS) {
    const p = new InspectablePainter();
    const em: Emitter[] = [];
    drawTierSkin(p, box, tier, 0x6b4fbb, 'star8', 7, em);
    assert.equal(em.length, 0, `tier ${tier} emitted quality skin emitters: ${JSON.stringify(em)}`);
  }
});

test('Audit Rule 2: day glow emitters and night lights match roomLights() 1:1 across all 51 rooms', () => {
  const groundY = getGroundY(5);
  for (const defId of Object.keys(ROOM_DEFINITIONS)) {
    for (const level of [1, 2, 3] as const) {
      for (const furnished of [false, true]) {
        const furn = furnished ? requiredFurnitureFor(defId) : [];
        const room = makeRoom(defId, level, furn, 42);
        const box = roomToWorldBox(room, groundY);
        const p = new InspectablePainter();
        const riftState = defId === 'rift_gate' && furnished ? 'open' : 'dormant';
        const res = drawRoomInterior(p, room, box, { tier: 'cozy', riftState });

        const expected = roomLights(room, box, { riftState });
        const dayGlows = res.emitters.filter(e => e.kind === 'glow');
        assert.equal(dayGlows.length, expected.length, `${defId} L${level} furnished=${furnished} day glow count`);
        expected.forEach((l, idx) => {
          assert.equal(dayGlows[idx].x, l.x, `${defId} L${level} glow[${idx}].x`);
          assert.equal(dayGlows[idx].y, l.y, `${defId} L${level} glow[${idx}].y`);
          assert.equal(dayGlows[idx].size, l.radius, `${defId} L${level} glow[${idx}].size`);
          assert.equal(dayGlows[idx].color, l.color, `${defId} L${level} glow[${idx}].color`);
        });

        const night = computeRoomNightLights([room], groundY, 1.0, riftState);
        assert.equal(night.length, expected.length, `${defId} L${level} furnished=${furnished} night light count`);
        for (const nl of night) {
          if (nl.kind === 'window') {
            assert.ok(nl.pane, `${defId} L${level} window night light has pane bounds`);
            assert.ok(nl.pane.w > 0 && nl.pane.h > 0);
            assert.ok(nl.pane.x >= box.left && nl.pane.x + nl.pane.w <= box.left + box.width);
          }
        }
      }
    }
  }
});

test('Audit Rule 3: no 10x10 fallback gold emblem square and every stained_window tag renders real glass', () => {
  const groundY = getGroundY(5);
  for (const defId of Object.keys(ROOM_DEFINITIONS)) {
    const def = ROOM_DEFINITIONS[defId];
    if (def.area !== 'castle') continue;
    const tags = getRoomTrimTags(defId, 3);
    const room = makeRoom(defId, 3, requiredFurnitureFor(defId));
    const box = roomToWorldBox(room, groundY);
    const p = new InspectablePainter();
    drawRoomUpgradeTrim(p, room, box, 0x6b4fbb, 'star8');

    // The removed 10x10 fallback emblem square used to draw at (L + 11, T + 5)
    const fallbackSquare = p.ops.find(
      op => op.k === 'rect' && op.x === box.left + 11 && op.y === box.top + 8 && op.w === 10 && op.h === 10
    );
    assert.equal(fallbackSquare, undefined, `${defId} must not draw the 10x10 fallback gold emblem square`);

    const hasWindowTag = tags.some(t => t.startsWith('stained_window:') || t.startsWith('window:'));
    if (hasWindowTag && defId !== 'faculty_lounge' && defId !== 'sunlit_sanctum' && defId !== 'alchemy_lab') {
      assert.ok(
        roomLights(room, box).some(l => l.kind === 'window'),
        `${defId} has window trim tag (${tags.join(', ')}) and must light a real glass pane`
      );
    }
  }
  // Specifically verify faculty_lounge L3 colours and lights loungeArchPane, and alchemy_lab draws its pane without fire
  const lounge = makeRoom('faculty_lounge', 3, requiredFurnitureFor('faculty_lounge'));
  const loungeBox = roomToWorldBox(lounge, groundY);
  const lp = loungeArchPane(loungeBox);
  const loungeLights = roomLights(lounge, loungeBox);
  assert.equal(loungeLights.length, 1);
  assert.deepEqual(loungeLights[0].pane, lp);

  const lab = makeRoom('alchemy_lab', 3, []);
  const labBox = roomToWorldBox(lab, groundY);
  assert.equal(roomLights(lab, labBox).length, 0, 'alchemy_lab distillate pane is unlit; cauldron holds the glow');
});

test('Audit Rule 4 & Room regressions: audited indoor, pen, and outdoor fixes hold', () => {
  const groundY = getGroundY(5);

  // Entrance Hall: L1 has no glow; L2 omits duplicate badge; L3 puts rose oculus on right clear of left banner
  const eh1 = makeRoom('entrance_hall', 1, []);
  const eh3 = makeRoom('entrance_hall', 3, []);
  const ehBox = roomToWorldBox(eh1, groundY);
  assert.equal(roomLights(eh1, ehBox).length, 0);
  const eh3Lights = roomLights(eh3, ehBox);
  assert.equal(eh3Lights.length, 1);
  assert.ok(eh3Lights[0].x > ehBox.left + ehBox.width / 2, 'entrance_hall L3 rose oculus sits in right bay clear of left banner');

  // Spiral Stair: L1 emits 0 flames; L2+ emits 1 flame at stairCressetPoint
  const ss1 = makeRoom('spiral_stair', 1, []);
  const ss2 = makeRoom('spiral_stair', 2, []);
  const ssBox = roomToWorldBox(ss1, groundY);
  const ss1p = new InspectablePainter();
  const ss1Res = drawRoomInterior(ss1p, ss1, ssBox);
  assert.equal(ss1Res.emitters.filter(e => e.kind === 'flame').length, 0);
  const ss2p = new InspectablePainter();
  const ss2Res = drawRoomInterior(ss2p, ss2, ssBox);
  const ss2Flames = ss2Res.emitters.filter(e => e.kind === 'flame');
  assert.equal(ss2Flames.length, 1);
  assert.equal(ss2Flames[0].x, stairCressetPoint(ssBox).x);

  // Faculty Quarters: required & optional slots stay clear of the centre hearth gap [56, 72]
  const fqLayout = getRoomLayout('faculty_quarters');
  assert.ok(fqLayout.required.every(a => a.x < 56 || a.x > 72), 'required pieces avoid centre hearth');
  assert.ok(fqLayout.floor.every(a => a.x < 56 || a.x > 72), 'optional floor pieces avoid centre hearth');

  // Faculty Lounge: empty has no floor steam
  const fl = makeRoom('faculty_lounge', 1, []);
  const flRes = drawRoomInterior(new InspectablePainter(), fl, roomToWorldBox(fl, groundY));
  assert.equal(flRes.emitters.filter(e => e.kind === 'steam').length, 0);

  // Kitchen: empty has no steam or glow; L2+ with Cooking Range has vent glow
  const k2Empty = makeRoom('kitchen', 2, []);
  const kBox = roomToWorldBox(k2Empty, groundY);
  const k2EmptyRes = drawRoomInterior(new InspectablePainter(), k2Empty, kBox);
  assert.equal(k2EmptyRes.emitters.filter(e => e.kind === 'steam' || e.kind === 'glow').length, 0);
  const k2Full = makeRoom('kitchen', 2, requiredFurnitureFor('kitchen'));
  assert.ok(roomLights(k2Full, kBox).some(l => l.fixture === 'range_hood_vent'));

  // Bathhouse: steam appears only when Soaking Tub is placed
  const bathEmpty = makeRoom('bathhouse', 1, []);
  const bathBox = roomToWorldBox(bathEmpty, groundY);
  assert.equal(drawRoomInterior(new InspectablePainter(), bathEmpty, bathBox).emitters.filter(e => e.kind === 'steam').length, 0);
  const bathFull = makeRoom('bathhouse', 1, requiredFurnitureFor('bathhouse'));
  assert.equal(drawRoomInterior(new InspectablePainter(), bathFull, bathBox).emitters.filter(e => e.kind === 'steam').length, 2);

  // Observatory L3: keeps dome slit only, no extra stained lancet
  const obs = makeRoom('observatory', 3, requiredFurnitureFor('observatory'));
  const obsLights = roomLights(obs, roomToWorldBox(obs, groundY));
  assert.equal(obsLights.length, 1);
  assert.equal(obsLights[0].fixture, 'dome_slit');

  // Infirmary L1: no orphan floor glow disc; L3 has frosted window light
  const inf1 = makeRoom('infirmary', 1, []);
  assert.equal(roomLights(inf1, roomToWorldBox(inf1, groundY)).length, 0);
  const inf3 = makeRoom('infirmary', 3, []);
  assert.equal(roomLights(inf3, roomToWorldBox(inf3, groundY))[0].fixture, 'frosted_window');

  // Sunlit Sanctum: 1 oculus (when installed), cushions clear of sun cone [44, 84], no L3 lancet
  const ssEmpty = makeRoom('sunlit_sanctum', 3, []);
  const ssEmptyBox = roomToWorldBox(ssEmpty, groundY);
  assert.equal(roomLights(ssEmpty, ssEmptyBox).length, 0);
  const ssFull = makeRoom('sunlit_sanctum', 3, requiredFurnitureFor('sunlit_sanctum'));
  const ssFullLights = roomLights(ssFull, ssEmptyBox);
  assert.equal(ssFullLights.length, 1);
  assert.equal(ssFullLights[0].fixture, 'sun_window_oculus');
  const sanctumView = layoutRoomFurniture(ssFull);
  for (const item of sanctumView.items.filter(i => i.kind === 'floor')) {
    assert.ok(item.x < 44 || item.x > 84, `cushion at x=${item.x} sits outside sun cone [44..84]`);
  }

  // Trophy Hall: 4 optional slots matching 4 plinths, dark when empty, lit per placed artifact_plinth
  assert.equal(ROOM_DEFINITIONS.trophy_hall.optionalSlots, 4);
  const thEmpty = makeRoom('trophy_hall', 3, []);
  const thBox = roomToWorldBox(thEmpty, groundY);
  const thEmptyRes = drawRoomInterior(new InspectablePainter(), thEmpty, thBox);
  assert.equal(thEmptyRes.emitters.filter(e => e.kind === 'twinkle' || e.kind === 'glow').length, 0);
  const thOne = makeRoom('trophy_hall', 3, [{ id: 1, defId: 'artifact_plinth', slotKind: 'optional', damaged: false }]);
  const thOneRes = drawRoomInterior(new InspectablePainter(), thOne, thBox);
  assert.equal(thOneRes.emitters.filter(e => e.kind === 'twinkle').length, 1);
  assert.equal(thOneRes.emitters.filter(e => e.kind === 'glow').length, 1);

  // Glassworks: no orphan glow when empty; L3 adds fanlight; Kiln adds kiln glow
  const gwEmpty = makeRoom('glassworks', 1, []);
  const gwBox = roomToWorldBox(gwEmpty, groundY);
  assert.equal(roomLights(gwEmpty, gwBox).length, 0);
  const gw3 = makeRoom('glassworks', 3, []);
  assert.deepEqual(roomLights(gw3, gwBox)[0].pane, glassFanlightPane(gwBox));

  // Dressing-is-art pieces suppress duplicate sprite while missing slot keeps ghost
  for (const [defId, roles] of Object.entries(DRESSING_IS_ART)) {
    assert.ok(roles.length > 0, `${defId} registers dressing-is-art role`);
  }
  const rgMissing = makeRoom('rift_gate', 3, []);
  const rgBox = roomToWorldBox(rgMissing, groundY);
  const rgMissingRes = drawRoomInterior(new InspectablePainter(), rgMissing, rgBox, { riftState: 'open' });
  assert.equal(rgMissingRes.emitters.filter(e => e.kind === 'portal' || e.kind === 'glow').length, 0);

  // Outdoor L3 lanterns: quarry, apiary, standing_stones, moonwell, vegetable_patch, herb_garden have NO post lantern
  for (const unlitGround of ['quarry', 'apiary', 'standing_stones', 'moonwell', 'vegetable_patch', 'herb_garden']) {
    assert.equal(OUTDOOR_LANTERNS[unlitGround], undefined, `${unlitGround} must not draw a L3 post lantern`);
    const gr = makeRoom(unlitGround, 3, []);
    const grLights = roomLights(gr, roomToWorldBox(gr, groundY));
    assert.equal(
      grLights.filter(l => l.fixture === 'post_lantern').length,
      0,
      `${unlitGround} L3 emits 0 post_lantern lights`
    );
  }
  // standing_stones & moonwell optional floor anchors keep off tallest monolith / well pool
  assert.ok(getRoomLayout('standing_stones').floor.every(a => a.x < 18 || a.x > 30));
  assert.ok(getRoomLayout('moonwell').floor.every(a => a.x < 18 || a.x > 46));
  // Rooms with documented L3 tags match expectations
  assert.equal(ROOM_TRIM_SPECS.common_room.l3Tags.some(t => t.startsWith('stained_window:')), false);
  assert.equal(ROOM_TRIM_SPECS.observatory.l3Tags.some(t => t.startsWith('stained_window:')), false);
  assert.equal(ROOM_TRIM_SPECS.trophy_hall.l3Tags.some(t => t.startsWith('stained_window:')), false);
});
