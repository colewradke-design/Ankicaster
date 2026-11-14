/**
 * Manual Furniture Placement tests (manual-furniture.md):
 * - Bulk vs background classification & plane lock
 * - 4px snap grid & 2px gap between bulk items
 * - Bounds, door keep-outs (10px ground floor), Wizard's Study stair keep-out (18px), pen edge keep-out (6px)
 * - Multi-floor upper floor placement & ceiling top-floor rule & wall Y / label keep-out
 * - Surface layering: floor background under bulk, wall behind bulk, same-surface collision
 * - Long table 6-mark snapping, taken mark refusal, moving carries chairs, removing detaches chairs
 * - Refectory 0-slot chair exemption (up to 6/table) & real meal capacity
 * - Two-step UI flow (acquire -> unplacedFurniture -> drop / cancel), RoomWindow SSR markup
 * - One-time load migration & exact piece-tracked roomAnchors & VR-01 deep-freeze safety
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ROOM_DEFINITIONS, FURNITURE_DEFINITIONS } from '../src/data/content.ts';
import { FullGameState, PlacedFurniture, PlacedRoom } from '../src/types/ankicaster.ts';
import { AnkicasterEngine } from '../src/utils/engine.ts';
import { calculateRoomEfficiency } from '../src/utils/formulas.ts';
import { isRoomUnfinished, maxSameFurnitureInRoom, optionalSlotsCostForNewPiece, optionalSlotsUsed } from '../src/utils/requiredFurniture.ts';
import { refectoryChairCount } from '../src/utils/schedule.ts';
import { createNewAcademy } from '../src/visual/onboarding/freshStart.ts';
import {
  pieceKind,
  piecePlane,
  snapFurnitureX,
  validateFurnitureDrop,
  roomLabelKeepOutRect
} from '../src/visual/layout/furniturePlacement.ts';
import { buildRoomAnchors } from '../src/visual/layout/roomAnchors.ts';
import { getGroundY, roomToWorldBox } from '../src/visual/layout/gridToWorld.ts';
import { VisualWorld } from '../src/visual/world/VisualWorld.ts';
import { RoomWindow } from '../src/components/RoomWindow.tsx';

function rich(state: FullGameState): FullGameState {
  state.mana = 5000;
  for (const k of Object.keys(state.resources)) (state.resources as any)[k] = 500;
  return state;
}

function learnAllFurniturePatterns(state: FullGameState): FullGameState {
  for (const f of Object.values(FURNITURE_DEFINITIONS)) {
    if (!state.knownPatterns.includes(f.id)) state.knownPatterns.push(f.id);
  }
  return state;
}

function makeRoom(
  id: number,
  defId: string,
  x: number,
  y: number,
  furniture: PlacedFurniture[] = [],
  extra: Partial<PlacedRoom> = {}
): PlacedRoom {
  const def = ROOM_DEFINITIONS[defId];
  return {
    id,
    defId,
    x,
    y,
    w: def.size[0],
    h: def.size[1],
    area: def.area as 'castle' | 'grounds',
    level: 1,
    state: 'built',
    buildRequired: def.buildReviews,
    buildProgress: def.buildReviews,
    buildPaused: false,
    cleanliness: 100,
    settings: {},
    furniture,
    ...extra
  };
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const key of Object.keys(obj as any)) {
      deepFreeze((obj as any)[key]);
    }
  }
  return obj;
}

test('MF-1: Bulk vs background classification, plane lock, and 4px grid snap', () => {
  assert.equal(piecePlane('student_desk'), 'floor');
  assert.equal(pieceKind('student_desk'), 'bulk');
  assert.equal(pieceKind('bookshelf'), 'bulk');
  assert.equal(pieceKind('potted_fern'), 'bulk');
  assert.equal(pieceKind('wooden_chair'), 'bulk');
  assert.equal(pieceKind('long_table'), 'bulk');
  assert.equal(pieceKind('orrery_globe'), 'bulk');

  assert.equal(piecePlane('woven_rug'), 'floor');
  assert.equal(pieceKind('woven_rug'), 'background');
  assert.equal(piecePlane('tapestry'), 'wall');
  assert.equal(pieceKind('tapestry'), 'background');
  assert.equal(piecePlane('academy_banner'), 'wall');
  assert.equal(pieceKind('academy_banner'), 'background');
  assert.equal(piecePlane('starfall_chandelier'), 'ceiling');
  assert.equal(pieceKind('starfall_chandelier'), 'background');

  assert.equal(snapFurnitureX(31), 32);
  assert.equal(snapFurnitureX(30), 32);
  assert.equal(snapFurnitureX(29), 28);

  const room = makeRoom(50, 'class_arcane', 6, 0);
  const res1 = validateFurnitureDrop(room, [room], 'student_desk', { x: 40, floor: 0, plane: 'wall' });
  assert.equal(res1.valid, false, 'Floor piece refused when dropped with wall plane');

  const res2 = validateFurnitureDrop(room, [room], 'tapestry', { x: 40, floor: 0, plane: 'floor' });
  assert.equal(res2.valid, false, 'Wall piece refused when dropped with floor plane');

  const res3 = validateFurnitureDrop(room, [room], 'starfall_chandelier', { x: 40, floor: 0, plane: 'floor' });
  assert.equal(res3.valid, false, 'Ceiling piece refused when dropped with floor plane');
});

test('MF-2: 2px bulk gap, small prop spacing, door keep-out, study stair column, pen edge & multi-floor rules', () => {
  const s = createNewAcademy();
  // entrance_hall in freshStart is at x=3..5, y=0; wizard_study is at x=5..6, y=0..2
  const study = s.rooms.find(r => r.defId === 'wizard_study')!;
  const eh = s.rooms.find(r => r.defId === 'entrance_hall')!;

  // Add class_arcane directly to left of entrance_hall: x=1..3, y=0 -> hasRightDoor = true (touching eh at x=3)
  const cls = makeRoom(51, 'class_arcane', eh.x - 2, 0, [
    { id: 5101, defId: 'student_desk', slotKind: 'required:student_desk', damaged: false, x: 32, floor: 0, plane: 'floor' }
  ]);
  const all = [...s.rooms, cls];

  // Second student_desk at x=48 -> [40..56] touches [24..40] with 0px gap (< 2px gap): refused!
  const touchRes = validateFurnitureDrop(cls, all, 'student_desk', { x: 48, floor: 0 });
  assert.equal(touchRes.valid, false, 'Zero gap between bulk pieces must be refused');
  assert.deepEqual(touchRes.collidingIds, [5101]);

  // At x=52 -> [44..60] has 4px gap (>= 2px gap): allowed!
  const clearRes = validateFurnitureDrop(cls, all, 'student_desk', { x: 52, floor: 0 });
  assert.equal(clearRes.valid, true, '4px gap between bulk pieces is valid');

  // Small potted_fern beside desk at x=52 allowed, inside desk at x=32 refused
  const fernInside = validateFurnitureDrop(cls, all, 'potted_fern', { x: 32, floor: 0 });
  assert.equal(fernInside.valid, false, 'Pot plant cannot sit inside a desk');
  const fernBeside = validateFurnitureDrop(cls, all, 'potted_fern', { x: 52, floor: 0 });
  assert.equal(fernBeside.valid, true, 'Pot plant can sit beside a desk');

  // Right door keep-out (W = 128, DOOR_GAP_PX = 10 -> max right <= 118): desk width 16 at x=116 has right=124 > 118
  const doorHit = validateFurnitureDrop(cls, all, 'student_desk', { x: 116, floor: 0 });
  assert.equal(doorHit.valid, false, 'Desk overlapping ground-floor right doorway keep-out refused');

  // Edge WALL_BORDER_PX=2: left edge x=8 has left=0 < 2 refused even without left neighbor
  const outEdge = validateFurnitureDrop(cls, all, 'student_desk', { x: 8, floor: 0 });
  assert.equal(outEdge.valid, false, 'Left wall border keep-out enforced');

  // Non-mezzanine room refuses floor 1 even if h were > 1
  const tallNonMezz = makeRoom(52, 'library', 8, 0, [], { h: 2 });
  const nonMezzUpper = validateFurnitureDrop(tallNonMezz, [tallNonMezz], 'reading_desk', { x: 48, floor: 1 });
  assert.equal(nonMezzUpper.valid, false, 'Non-mezzanine room refuses floor 1 floor items');

  // Wizard study (mezzanine): floor 1 allowed, but left 18px stair column must stay clear on all floors
  const stairHit = validateFurnitureDrop(study, all, 'bookshelf', { x: 20, floor: 1 });
  assert.equal(stairHit.valid, false, "Wizard's Study 18px left stair keep-out enforced");
  const studyUpperValid = validateFurnitureDrop(study, all, 'bookshelf', { x: 40, floor: 1 });
  assert.equal(studyUpperValid.valid, true, "Wizard's Study upper floor clear of stair column accepted");

  // Menagerie pen (mezzanine h=2, creature pen): 6px walkable edge keep-out, upper floor allowed without door keep-out
  const men = makeRoom(53, 'menagerie', eh.x - 2, 1, [], { w: 2, h: 2 });
  const penEdge = validateFurnitureDrop(men, [...all, men], 'potted_fern', { x: 12, floor: 0 }); // left = 4 < 6
  assert.equal(penEdge.valid, false, 'Pen 6px edge keep-out enforced');
  const penValid = validateFurnitureDrop(men, [...all, men], 'potted_fern', { x: 20, floor: 1 }); // left = 12 >= 6
  assert.equal(penValid.valid, true, 'Pen upper floor valid inside walkable edge');
});

test('MF-3: Wall Y bounds, room label keep-out, ceiling top-floor rule, and background vs bulk layering', () => {
  const tallRoom = makeRoom(60, 'wizard_study', 5, 0, [
    { id: 6001, defId: 'student_desk', slotKind: 'optional', damaged: false, x: 48, floor: 0, plane: 'floor' }
  ], { h: 2 });

  // Ceiling piece on floor 0 of h=2 refused; floor 1 accepted
  const ceilGround = validateFurnitureDrop(tallRoom, [tallRoom], 'starfall_chandelier', { x: 32, floor: 0 });
  assert.equal(ceilGround.valid, false, 'Ceiling piece cannot hang below top floor');
  const ceilTop = validateFurnitureDrop(tallRoom, [tallRoom], 'starfall_chandelier', { x: 32, floor: 1 });
  assert.equal(ceilTop.valid, true, 'Ceiling piece hangs on top floor');

  // Background layered with bulk on same X: rug under desk & tapestry behind desk are both valid!
  const rugUnderDesk = validateFurnitureDrop(tallRoom, [tallRoom], 'woven_rug', { x: 48, floor: 0 });
  assert.equal(rugUnderDesk.valid, true, 'Woven rug allowed under a student desk');

  const tapestryBehindDesk = validateFurnitureDrop(tallRoom, [tallRoom], 'tapestry', { x: 48, floor: 0, wallY: -24 });
  assert.equal(tapestryBehindDesk.valid, true, 'Wall tapestry allowed behind a floor bulk piece');

  // Wall Y out of bounds (too high or touching floor)
  const wallTooHigh = validateFurnitureDrop(tallRoom, [tallRoom], 'tapestry', { x: 48, floor: 0, wallY: -40 });
  assert.equal(wallTooHigh.valid, false, 'Wall piece above -44 beam limit refused');
  const wallTooLow = validateFurnitureDrop(tallRoom, [tallRoom], 'tapestry', { x: 48, floor: 0, wallY: -4 });
  assert.equal(wallTooLow.valid, false, 'Wall piece below -2 floor limit refused');

  // Room label keep-out on top floor
  const label = roomLabelKeepOutRect(tallRoom)!;
  const labelCenter = snapFurnitureX((label.left + label.right) / 2);
  const hitLabel = validateFurnitureDrop(tallRoom, [tallRoom], 'tapestry', { x: labelCenter, floor: 1, wallY: -36 });
  assert.equal(hitLabel.valid, false, 'Top-floor wall piece cannot overlap room label banner');

  // Same-plane background overlap refused
  tallRoom.furniture.push(
    { id: 6002, defId: 'woven_rug', slotKind: 'optional', damaged: false, x: 48, floor: 0, plane: 'floor' },
    { id: 6003, defId: 'tapestry', slotKind: 'optional', damaged: false, x: 48, floor: 0, wallY: -24, plane: 'wall' }
  );
  const rugOnRug = validateFurnitureDrop(tallRoom, [tallRoom], 'woven_rug', { x: 52, floor: 0 });
  assert.equal(rugOnRug.valid, false, 'Overlapping rugs on floor refused');
  assert.deepEqual(rugOnRug.collidingIds, [6002]);

  const bannerOnTapestry = validateFurnitureDrop(tallRoom, [tallRoom], 'academy_banner', { x: 52, floor: 0, wallY: -24 });
  assert.equal(bannerOnTapestry.valid, false, 'Overlapping wall items on wall refused');
  assert.deepEqual(bannerOnTapestry.collidingIds, [6003]);
});

test('MF-4: Long table 6-mark chair snapping, slot exemption, move/remove cascade, and real meal count', () => {
  let state = learnAllFurniturePatterns(rich(createNewAcademy()));
  const eh = state.rooms.find(r => r.defId === 'entrance_hall')!;
  const ref = makeRoom(70, 'refectory', eh.x + eh.w, 0, [
    { id: 7001, defId: 'long_table', slotKind: 'required:long_table', damaged: false, x: 64, floor: 0, plane: 'floor' },
    { id: 7002, defId: 'hearth', slotKind: 'required:hearth', damaged: false, x: 168, floor: 0, plane: 'floor' }
  ]);
  state.rooms.push(ref);

  // Empty marks feed 0!
  assert.equal(refectoryChairCount(ref), 0, 'Long table with no snapped chairs feeds 0');

  // Up to 6 chairs per table cost 0 optional slots in refectory
  assert.equal(maxSameFurnitureInRoom(ref, 'wooden_chair'), 6);
  assert.equal(optionalSlotsCostForNewPiece(ref, 'wooden_chair'), 0);
  assert.equal(optionalSlotsUsed(ref), 0);

  // Acquire & drop 6 chairs onto the 6 marks
  for (let m = 0; m < 6; m++) {
    const colOffset = [-10, 0, 10][m % 3];
    const wy = m < 3 ? -20 : -6;
    const acq = AnkicasterEngine.acquireFurniture(state, ref.id, 'wooden_chair');
    assert.equal(acq.success, true, `Chair ${m} acquired using 0 optional slots`);
    state = acq.state;
    const drop = AnkicasterEngine.dropRoomFurniture(state, ref.id, acq.furnitureId!, {
      x: 64 + colOffset,
      floor: 0,
      wallY: wy
    });
    assert.equal(drop.success, true, `Chair ${m} dropped on mark ${m}: ${drop.error}`);
    state = drop.state;
  }

  let curRef = state.rooms.find(r => r.id === ref.id)!;
  assert.equal(refectoryChairCount(curRef), 6, 'All 6 snapped chairs count toward meal capacity');
  assert.equal(optionalSlotsUsed(curRef), 0, '6 snapped chairs around 1 table use 0 optional slots');

  // Attempting to drop a freestanding chair at x=120 fails maxSameFurnitureInRoom (already 6 for 1 table)
  const overChair = AnkicasterEngine.acquireFurniture(state, ref.id, 'wooden_chair');
  assert.equal(overChair.success, false, 'Cannot exceed 6 chairs with only 1 long table in refectory');

  // Taking an already-occupied mark refuses drop
  const firstChair = curRef.furniture.find(f => f.defId === 'wooden_chair' && f.markIndex === 0)!;
  const dupeMark = validateFurnitureDrop(curRef, state.rooms, 'wooden_chair', {
    x: 54, floor: 0, tableId: 7001, markIndex: 0
  });
  assert.equal(dupeMark.valid, false, 'Taken seat mark is refused');
  assert.deepEqual(dupeMark.collidingIds, [firstChair.id]);

  // Moving long_table carries all 6 snapped chairs with it
  const movedTbl = AnkicasterEngine.movePlacedFurniture(state, ref.id, 7001, { x: 80, floor: 0 });
  assert.equal(movedTbl.success, true);
  state = movedTbl.state;
  curRef = state.rooms.find(r => r.id === ref.id)!;
  const tblAfter = curRef.furniture.find(f => f.id === 7001)!;
  assert.equal(tblAfter.x, 80);
  const m0Chair = curRef.furniture.find(f => f.id === firstChair.id)!;
  assert.equal(m0Chair.x, 70, 'Attached chair moved by table delta');

  // Moving long_table near doorway refuses if attached chair or table hits 10px left door keep-out
  const doorFail = AnkicasterEngine.movePlacedFurniture(state, ref.id, 7001, { x: 20, floor: 0 });
  assert.equal(doorFail.success, false, 'Moving table into left doorway keep-out refused');

  // Moving one chair off the table makes it freestanding (does NOT count toward refectoryChairCount!)
  const freestanding = AnkicasterEngine.movePlacedFurniture(state, ref.id, m0Chair.id, { x: 132, floor: 0 });
  assert.equal(freestanding.success, true);
  curRef = freestanding.state.rooms.find(r => r.id === ref.id)!;
  const detached = curRef.furniture.find(f => f.id === m0Chair.id)!;
  assert.equal(detached.tableId, undefined);
  assert.equal(refectoryChairCount(curRef), 5, 'Freestanding chair does not count as a dining seat');

  // Add second optional long_table -> max chairs increases to 12, then remove optional table to test chair detach
  const addTbl2 = AnkicasterEngine.addFurniture(freestanding.state, ref.id, 'long_table', { x: 40, floor: 0 });
  assert.equal(addTbl2.success, true);
  const tbl2Id = addTbl2.state.rooms.find(r => r.id === ref.id)!.furniture.find(f => f.defId === 'long_table' && f.id !== 7001)!.id;
  const addC1 = AnkicasterEngine.addFurniture(addTbl2.state, ref.id, 'wooden_chair', { x: 30, floor: 0, tableId: tbl2Id, markIndex: 0 });
  const addC2 = AnkicasterEngine.addFurniture(addC1.state, ref.id, 'wooden_chair', { x: 30, floor: 0, tableId: tbl2Id, markIndex: 3 });
  assert.equal(addC2.success, true);

  // Removing optional table 2 detaches its chairs: first col-0 chair remains freestanding, second overlapping col-0 moves to unplacedFurniture
  const remTbl2 = AnkicasterEngine.removeFurniture(addC2.state, ref.id, tbl2Id);
  assert.equal(remTbl2.success, true);
  const refAfterRem = remTbl2.state.rooms.find(r => r.id === ref.id)!;
  assert.equal(refAfterRem.furniture.filter(f => f.tableId === tbl2Id).length, 0);
  assert.equal((refAfterRem.unplacedFurniture || []).length, 1, 'Colliding detached chair safely moved to unplacedFurniture');
});

test('MF-5: Two-step UI flow (acquire -> unplacedFurniture -> drop/cancel) and RoomWindow SSR markup', () => {
  let state = learnAllFurniturePatterns(rich(createNewAcademy()));
  const cls = makeRoom(80, 'class_arcane', 1, 0, []);
  state.rooms.push(cls);

  // Acquiring required lectern leaves room Unfinished & 0% efficiency until dropped
  const acqReq = AnkicasterEngine.acquireRequiredFixture(state, cls.id, 0);
  assert.equal(acqReq.success, true);
  state = acqReq.state;
  let curCls = state.rooms.find(r => r.id === cls.id)!;
  assert.equal(curCls.furniture.length, 0);
  assert.equal((curCls.unplacedFurniture || []).length, 1);
  assert.equal(isRoomUnfinished(curCls), true, 'Queued required fixture still leaves room Unfinished');
  assert.equal(calculateRoomEfficiency(curCls), 0);

  // Cannot cancel a required unplaced fixture back to storage
  const badCancel = AnkicasterEngine.cancelUnplacedFurniture(state, cls.id, acqReq.furnitureId!);
  assert.equal(badCancel.success, false);

  // Acquire an optional potted_fern -> goes into unplacedFurniture & consumes slot
  const manaBefore = state.mana;
  const acqOpt = AnkicasterEngine.acquireFurniture(state, cls.id, 'potted_fern');
  assert.equal(acqOpt.success, true);
  state = acqOpt.state;
  assert.ok(state.mana < manaBefore);
  curCls = state.rooms.find(r => r.id === cls.id)!;
  assert.equal((curCls.unplacedFurniture || []).length, 2);

  // Verify RoomWindow renders To Place tray, Place buttons, Cancel unplaced, Slots usage
  const html = renderToStaticMarkup(
    <RoomWindow
      state={state}
      room={curCls}
      detailsOpen={true}
      onClose={() => {}}
      onOpenScreen={() => {}}
      onResolveHazard={() => {}}
      onUpgrade={() => {}}
      onAddFurniture={() => {}}
      onRemoveFurniture={() => {}}
      onInstallRequired={() => {}}
      onPlaceFurniture={() => {}}
      onMoveFurniture={() => {}}
      onCancelUnplacedFurniture={() => {}}
    />
  );
  assert.ok(html.includes('data-testid="to-place-furniture"'), 'To place section rendered');
  assert.ok(html.includes('data-action="place-required"'), 'Required slot shows Place button');
  assert.ok(html.includes('data-action="place-furniture"'), 'Unplaced queue shows Place button');
  assert.ok(html.includes('data-action="cancel-unplaced"'), 'Optional unplaced item can return to storage');
  assert.ok(html.includes('data-testid="room-slots-usage"'), 'Slot usage displayed');

  // Cancelling optional unplaced item returns it to furnitureInventory
  const cancelled = AnkicasterEngine.cancelUnplacedFurniture(state, cls.id, acqOpt.furnitureId!);
  assert.equal(cancelled.success, true);
  state = cancelled.state;
  assert.equal(state.furnitureInventory?.potted_fern, 1, 'Cancelled unplaced item moved to furnitureInventory');

  // Invalid drop rejects and keeps piece in unplacedFurniture
  const badDrop = AnkicasterEngine.dropRoomFurniture(state, cls.id, acqReq.furnitureId!, { x: 4, floor: 0 });
  assert.equal(badDrop.success, false);
  assert.equal((badDrop.state.rooms.find(r => r.id === cls.id)!.unplacedFurniture || []).length, 1);

  // Valid drops install all 3 required fixtures and finish the room
  const d0 = AnkicasterEngine.dropRoomFurniture(state, cls.id, acqReq.furnitureId!, { x: 32, floor: 0 });
  assert.equal(d0.success, true);
  const d1 = AnkicasterEngine.installRequiredFixture(d0.state, cls.id, 1, { x: 64, floor: 0 });
  assert.equal(d1.success, true);
  const d2 = AnkicasterEngine.installRequiredFixture(d1.state, cls.id, 2, { x: 96, floor: 0 });
  assert.equal(d2.success, true);
  curCls = d2.state.rooms.find(r => r.id === cls.id)!;
  assert.equal(isRoomUnfinished(curCls), false);
  assert.ok(calculateRoomEfficiency(curCls) > 0);

  // Required fixture can be moved via movePlacedFurniture, but cannot be removed via removeFurniture
  const reqId = curCls.furniture[0].id;
  const mvReq = AnkicasterEngine.movePlacedFurniture(d2.state, cls.id, reqId, { x: 40, floor: 0 });
  assert.equal(mvReq.success, true);
  assert.equal(mvReq.state.rooms.find(r => r.id === cls.id)!.furniture[0].x, 40);
  const rmReq = AnkicasterEngine.removeFurniture(mvReq.state, cls.id, reqId);
  assert.equal(rmReq.success, false);

  // Installed fixtures (including required) show Move button in RoomWindow
  const htmlInstalled = renderToStaticMarkup(
    <RoomWindow
      state={mvReq.state}
      room={mvReq.state.rooms.find(r => r.id === cls.id)!}
      detailsOpen={true}
      onClose={() => {}}
      onOpenScreen={() => {}}
      onResolveHazard={() => {}}
      onUpgrade={() => {}}
      onAddFurniture={() => {}}
      onRemoveFurniture={() => {}}
      onMoveFurniture={() => {}}
    />
  );
  assert.ok(htmlInstalled.includes('data-action="move-furniture"'), 'Installed items expose Move action');
});

test('MF-6: One-time load migration preserves custom positions & piece-tracked roomAnchors', () => {
  const legacyRoom = makeRoom(90, 'class_arcane', 1, 0, [
    { id: 9001, defId: 'teachers_lectern', slotKind: 'required:teachers_lectern', damaged: false },
    { id: 9002, defId: 'orrery_globe', slotKind: 'required:orrery_globe', damaged: false },
    { id: 9003, defId: 'student_desk', slotKind: 'required:student_desk', damaged: false },
    { id: 9004, defId: 'bookshelf', slotKind: 'optional', damaged: false }
  ]);
  const s = createNewAcademy();
  s.rooms.push(legacyRoom);
  delete (s as any).manualFurnitureVersion;

  const migrated = AnkicasterEngine.normalizeLoadedState(JSON.parse(JSON.stringify(s))) as FullGameState;
  assert.equal(migrated.manualFurnitureVersion, 1);
  const mRoom = migrated.rooms.find(r => r.id === 90)!;
  assert.ok(mRoom.furniture.every(f => typeof f.x === 'number' && f.plane === 'floor'), 'Legacy room positions backfilled');

  // Customize desk & shelf positions and re-run normalizeLoadedState: must never overwrite!
  mRoom.furniture = [
    { id: 9001, defId: 'teachers_lectern', slotKind: 'required:teachers_lectern', damaged: false, x: 24, floor: 0, plane: 'floor' },
    { id: 9002, defId: 'orrery_globe', slotKind: 'required:orrery_globe', damaged: false, x: 108, floor: 0, plane: 'floor' },
    { id: 9003, defId: 'student_desk', slotKind: 'required:student_desk', damaged: false, x: 52, floor: 0, plane: 'floor' },
    { id: 9004, defId: 'bookshelf', slotKind: 'optional', damaged: false, x: 84, floor: 0, plane: 'floor' }
  ];
  const again = AnkicasterEngine.normalizeLoadedState(JSON.parse(JSON.stringify(migrated))) as FullGameState;
  const afterRoom = again.rooms.find(r => r.id === 90)!;
  assert.equal(afterRoom.furniture.find(f => f.id === 9003)!.x, 52, 'Saved desk position never overwritten');

  // roomAnchors match placed coordinates & bookshelf anchor stands beside shelf & orrery is never a seat
  const groundY = getGroundY(3);
  const box = roomToWorldBox(afterRoom, groundY);
  const anchors = buildRoomAnchors(afterRoom, groundY);
  assert.equal(anchors.lecterns[0].x, box.left + 24, 'Teacher lectern anchor sits at placed x');
  assert.equal(anchors.studentDesks[0].x, box.left + 52, 'Student desk anchor sits at placed x');
  const shelfWorldX = box.left + 84;
  assert.ok(Math.abs(anchors.bookshelves[0].x - shelfWorldX) >= 8, 'Bookshelf reader stands beside shelf, not inside box');
  assert.equal(anchors.all.some(a => a.defId === 'orrery_globe'), false, 'Non-seat bulk prop orrery_globe is never an anchor');

  // Empty common_room / refectory has zero invented seats
  const emptyCommon = makeRoom(91, 'common_room', 1, 0, [
    { id: 9101, defId: 'hearth', slotKind: 'required:couch_or_hearth', damaged: false, x: 64, floor: 0, plane: 'floor' }
  ]);
  const commonAnchors = buildRoomAnchors(emptyCommon, groundY);
  assert.equal(commonAnchors.seats.length, 0, 'Hearth is not a seat and empty common_room invents no seats');
});

test('MF-7: VR-01 deep-frozen state with placed/unplaced furniture and VisualWorld ghost renders cleanly', () => {
  let state = rich(learnAllFurniturePatterns(createNewAcademy()));
  const acq = AnkicasterEngine.acquireFurniture(state, state.rooms[0].id, 'potted_fern');
  assert.equal(acq.success, true);
  state = acq.state;

  const frozen = deepFreeze(structuredClone(state));
  const world = new VisualWorld();
  assert.doesNotThrow(() => {
    world.setSnapshot(frozen, frozen.rooms[0].id);
    world.setFurnitureGhost({
      roomId: frozen.rooms[0].id,
      furnitureId: acq.furnitureId!,
      defId: 'potted_fern',
      x: 40,
      floor: 0,
      plane: 'floor',
      valid: true,
      collidingIds: []
    });
    world.setFurnitureGhost({
      roomId: frozen.rooms[0].id,
      furnitureId: acq.furnitureId!,
      defId: 'potted_fern',
      x: 12,
      floor: 0,
      plane: 'floor',
      valid: false,
      collidingIds: [frozen.rooms[0].furniture[0]?.id ?? 1]
    });
    world.update(16, 1000);
    world.setFurnitureGhost(null);
  });
});
