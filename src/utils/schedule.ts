import {
  Character,
  FullGameState,
  PlacedRoom,
  SchoolType
} from '../types/ankicaster';
import { ROOM_DEFINITIONS } from '../data/content';
import { isRoomUnfinished } from './requiredFurniture';
import { computeReachability, ReachabilityInfo } from './reachability';

export const CLASSROOM_TO_SCHOOL: Record<string, SchoolType> = {
  class_arcane: 'arcane',
  class_nature: 'nature',
  class_light: 'light',
  class_shadow: 'shadow',
  class_alchemy: 'alchemy'
};

export const SCHOOL_TO_CLASSROOM: Record<SchoolType, string> = {
  arcane: 'class_arcane',
  nature: 'class_nature',
  light: 'class_light',
  shadow: 'class_shadow',
  alchemy: 'class_alchemy'
};

export const ALL_SCHOOLS: SchoolType[] = ['arcane', 'nature', 'light', 'shadow', 'alchemy'];
export const ALL_PERIODS: Array<1 | 2 | 3 | 4> = [1, 2, 3, 4];

/** Intact student desks placed in a classroom (clamped 0..4). */
export function classroomDeskCount(room: PlacedRoom): number {
  if (room.state !== 'built') return 0;
  const count = (room.furniture || []).filter(
    f => !f.damaged && (f.defId === 'student_desk' || f.slotKind === 'required:student_desk')
  ).length;
  return Math.min(4, count);
}

/** Active student desks in a finished, built classroom (0 if unfinished). */
export function activeClassroomDeskCount(room: PlacedRoom): number {
  if (room.state !== 'built' || isRoomUnfinished(room)) return 0;
  return classroomDeskCount(room);
}

/** Intact long tables placed in a built, finished refectory (clamped 0..2). */
export function refectoryTableCount(room: PlacedRoom): number {
  if (room.state !== 'built' || isRoomUnfinished(room)) return 0;
  const count = (room.furniture || []).filter(
    f => !f.damaged && (f.defId === 'long_table' || f.slotKind === 'required:long_table')
  ).length;
  return Math.min(2, count);
}

/** Total meal chairs in a refectory: 6 chairs per intact long table (0, 6, or 12). */
export function refectoryChairCount(room: PlacedRoom): number {
  return 6 * refectoryTableCount(room);
}

/** Intact reading desks in a built library (clamped 0..4). */
export function libraryReadingDeskCount(room: PlacedRoom): number {
  if (room.state !== 'built') return 0;
  const count = (room.furniture || []).filter(
    f => !f.damaged && (f.defId === 'reading_desk' || f.slotKind === 'required:reading_desk')
  ).length;
  return Math.min(4, count);
}

/** Intact bookshelves in a built library. */
export function libraryBookshelfCount(room: PlacedRoom): number {
  if (room.state !== 'built') return 0;
  return (room.furniture || []).filter(
    f => !f.damaged && (f.defId === 'bookshelf' || f.slotKind === 'required:bookshelf')
  ).length;
}

/** Intact writing desks in a dormitory / grand dormitory / faculty quarters (clamped 0..2). */
export function dormWritingDeskCount(room: PlacedRoom): number {
  if (room.state !== 'built') return 0;
  const count = (room.furniture || []).filter(
    f => !f.damaged && (f.defId === 'writing_desk' || f.slotKind === 'required:writing_desk')
  ).length;
  return Math.min(2, count);
}

export interface StudentClassAssignment {
  studentId: number;
  school: SchoolType;
  classRoomId: number;
  period: 1 | 2 | 3 | 4;
  deskIndex: number;
}

export interface TeacherPeriodAssignment {
  teacherId: number;
  school: SchoolType;
  classRoomId: number;
  periods: Array<1 | 2 | 3 | 4>;
}

export interface ClassroomPeriodSlot {
  roomId: number;
  school: SchoolType;
  period: 1 | 2 | 3 | 4;
  deskCapacity: number;
  studentIds: number[];
  /** Character id of hired teacher for this period, 'wizard' if covered by Headmaster, or undefined. */
  instructor: number | 'wizard' | undefined;
}

export interface ClassroomScheduleInfo {
  roomId: number;
  school: SchoolType;
  deskCount: number;
  totalStudents: number;
  /** True if covered by 1+ hired teachers or by the Headmaster (level >= 5). */
  isStaffed: boolean;
  coveredByHeadmaster: boolean;
  teacherIds: number[];
  periods: Record<1 | 2 | 3 | 4, ClassroomPeriodSlot>;
}

export interface AcademySchedule {
  studentAssignments: Map<number, StudentClassAssignment>;
  overenrolledStudentIds: Set<number>;
  overenrolledBySchool: Record<SchoolType, number>;
  schoolCapacity: Record<SchoolType, number>;
  schoolEnrolled: Record<SchoolType, number>;
  teacherAssignments: Map<number, TeacherPeriodAssignment>;
  spareTeacherIds: Set<number>;
  classrooms: Map<number, ClassroomScheduleInfo>;
  headmasterRoomId?: number;
  headmasterSchool?: SchoolType;
}

function isClassroomActive(
  room: PlacedRoom,
  reviewIndex: number,
  reach: Map<number, ReachabilityInfo>
): boolean {
  if (room.state !== 'built') return false;
  if (!CLASSROOM_TO_SCHOOL[room.defId]) return false;
  if ((room.lockedUntilReviewIndex ?? -1) > reviewIndex) return false;
  if (reach.get(room.id)?.reachable === false) return false;
  if (isRoomUnfinished(room)) return false;
  return classroomDeskCount(room) >= 1;
}

/**
 * Pure schedule builder for student groups, periods, teachers, and headmaster coverage.
 * Does not mutate `state` (safe for deep-frozen snapshots in visual tests).
 */
export function buildAcademySchedule(
  state: FullGameState,
  reachMap?: Map<number, ReachabilityInfo>
): AcademySchedule {
  const reach = reachMap ?? computeReachability(state.rooms || []);
  const reviewIndex = state.reviewIndex || 0;

  const studentAssignments = new Map<number, StudentClassAssignment>();
  const overenrolledStudentIds = new Set<number>();
  const overenrolledBySchool: Record<SchoolType, number> = {
    arcane: 0,
    nature: 0,
    light: 0,
    shadow: 0,
    alchemy: 0
  };
  const schoolCapacity: Record<SchoolType, number> = {
    arcane: 0,
    nature: 0,
    light: 0,
    shadow: 0,
    alchemy: 0
  };
  const schoolEnrolled: Record<SchoolType, number> = {
    arcane: 0,
    nature: 0,
    light: 0,
    shadow: 0,
    alchemy: 0
  };
  const classrooms = new Map<number, ClassroomScheduleInfo>();
  const activeRoomsBySchool: Record<SchoolType, PlacedRoom[]> = {
    arcane: [],
    nature: [],
    light: [],
    shadow: [],
    alchemy: []
  };

  for (const room of state.rooms || []) {
    const school = CLASSROOM_TO_SCHOOL[room.defId];
    if (!school) continue;
    if (isClassroomActive(room, reviewIndex, reach)) {
      activeRoomsBySchool[school].push(room);
    }
  }

  for (const school of ALL_SCHOOLS) {
    activeRoomsBySchool[school].sort((a, b) => a.id - b.id);
    const rooms = activeRoomsBySchool[school];
    for (const r of rooms) {
      const desks = classroomDeskCount(r);
      schoolCapacity[school] += desks * 4;
      classrooms.set(r.id, {
        roomId: r.id,
        school,
        deskCount: desks,
        totalStudents: 0,
        isStaffed: false,
        coveredByHeadmaster: false,
        teacherIds: [],
        periods: {
          1: { roomId: r.id, school, period: 1, deskCapacity: desks, studentIds: [], instructor: undefined },
          2: { roomId: r.id, school, period: 2, deskCapacity: desks, studentIds: [], instructor: undefined },
          3: { roomId: r.id, school, period: 3, deskCapacity: desks, studentIds: [], instructor: undefined },
          4: { roomId: r.id, school, period: 4, deskCapacity: desks, studentIds: [], instructor: undefined }
        }
      });
    }

    const students = (state.characters || [])
      .filter(c => c.status === 'student' && c.currentSchool === school)
      .slice()
      .sort((a, b) => a.id - b.id);

    schoolEnrolled[school] = students.length;

    let cursor = 0;
    for (const r of rooms) {
      const info = classrooms.get(r.id)!;
      const desks = info.deskCount;
      for (const period of ALL_PERIODS) {
        const slot = info.periods[period];
        for (let d = 0; d < desks && cursor < students.length; d++) {
          const stu = students[cursor++];
          slot.studentIds.push(stu.id);
          info.totalStudents++;
          studentAssignments.set(stu.id, {
            studentId: stu.id,
            school,
            classRoomId: r.id,
            period,
            deskIndex: d
          });
        }
      }
    }

    while (cursor < students.length) {
      const stu = students[cursor++];
      overenrolledStudentIds.add(stu.id);
      overenrolledBySchool[school]++;
    }
  }

  // Qualified present teachers
  const qualifiedTeachers = (state.characters || [])
    .filter(
      c =>
        c.career === 'teacher' &&
        c.careerState === 'active' &&
        c.status !== 'away' &&
        !c.injury &&
        Array.isArray(c.masteredSchools) &&
        c.masteredSchools.length > 0
    )
    .slice()
    .sort((a, b) => a.id - b.id);

  const teachersBySchool: Record<SchoolType, Character[]> = {
    arcane: [],
    nature: [],
    light: [],
    shadow: [],
    alchemy: []
  };

  // Max useful teachers for a school: if 1 room, up to 2 teachers can share it; if N >= 2 rooms, up to N teachers.
  const maxUsefulTeachersForSchool = (s: SchoolType): number => {
    const n = activeRoomsBySchool[s].length;
    if (n === 0) return 0;
    if (n === 1) return 2;
    return n;
  };

  // Pass 1: teachers who only mastered 1 school (or whose current workplace is an active classroom of a mastered school)
  const remainingMultiSchool: Character[] = [];
  for (const t of qualifiedTeachers) {
    const currentRoom = t.workplaceRoomId ? classrooms.get(t.workplaceRoomId) : undefined;
    if (currentRoom && t.masteredSchools.includes(currentRoom.school)) {
      const s = currentRoom.school;
      if (teachersBySchool[s].length < maxUsefulTeachersForSchool(s)) {
        teachersBySchool[s].push(t);
        continue;
      }
    }
    if (t.masteredSchools.length === 1) {
      const s = t.masteredSchools[0];
      teachersBySchool[s].push(t);
    } else {
      remainingMultiSchool.push(t);
    }
  }

  // Pass 2: multi-school teachers prefer a school where they can fill an uncovered room, then a 2-teacher split, then first mastered school
  for (const t of remainingMultiSchool) {
    let chosen: SchoolType | undefined;
    // Prefer school with fewer teachers than rooms (uncovered room)
    for (const s of t.masteredSchools) {
      if (activeRoomsBySchool[s].length > 0 && teachersBySchool[s].length < activeRoomsBySchool[s].length) {
        chosen = s;
        break;
      }
    }
    // Otherwise prefer school with 1 room and 1 teacher (can split periods 1-2 / 3-4)
    if (!chosen) {
      for (const s of t.masteredSchools) {
        if (activeRoomsBySchool[s].length === 1 && teachersBySchool[s].length < 2) {
          chosen = s;
          break;
        }
      }
    }
    // Otherwise first mastered school with any classroom, or first mastered school
    if (!chosen) {
      chosen = t.masteredSchools.find(s => activeRoomsBySchool[s].length > 0) ?? t.masteredSchools[0];
    }
    teachersBySchool[chosen].push(t);
  }

  const teacherAssignments = new Map<number, TeacherPeriodAssignment>();
  const spareTeacherIds = new Set<number>();

  for (const school of ALL_SCHOOLS) {
    const rooms = activeRoomsBySchool[school];
    const pool = teachersBySchool[school].slice().sort((a, b) => a.id - b.id);

    if (rooms.length === 0) {
      for (const t of pool) spareTeacherIds.add(t.id);
      continue;
    }

    if (rooms.length === 1 && pool.length >= 2) {
      const roomInfo = classrooms.get(rooms[0].id)!;
      const tA = pool[0];
      const tB = pool[1];
      roomInfo.isStaffed = true;
      roomInfo.teacherIds = [tA.id, tB.id];
      roomInfo.periods[1].instructor = tA.id;
      roomInfo.periods[2].instructor = tA.id;
      roomInfo.periods[3].instructor = tB.id;
      roomInfo.periods[4].instructor = tB.id;

      teacherAssignments.set(tA.id, {
        teacherId: tA.id,
        school,
        classRoomId: rooms[0].id,
        periods: [1, 2]
      });
      teacherAssignments.set(tB.id, {
        teacherId: tB.id,
        school,
        classRoomId: rooms[0].id,
        periods: [3, 4]
      });
      for (let i = 2; i < pool.length; i++) {
        spareTeacherIds.add(pool[i].id);
      }
    } else {
      const remainingRooms = rooms.slice();
      const assignedTeachers = new Set<number>();
      const takeRoomForTeacher = (t: Character, room: PlacedRoom) => {
        const roomInfo = classrooms.get(room.id)!;
        roomInfo.isStaffed = true;
        roomInfo.teacherIds = [t.id];
        for (const p of ALL_PERIODS) {
          roomInfo.periods[p].instructor = t.id;
        }
        teacherAssignments.set(t.id, {
          teacherId: t.id,
          school,
          classRoomId: room.id,
          periods: [1, 2, 3, 4]
        });
        assignedTeachers.add(t.id);
        const idx = remainingRooms.indexOf(room);
        if (idx >= 0) remainingRooms.splice(idx, 1);
      };

      // Preserve existing explicit workplaceRoomId if it points to an available active classroom of this school
      for (const t of pool) {
        if (remainingRooms.length === 0) break;
        if (t.workplaceRoomId != null) {
          const preferred = remainingRooms.find(r => r.id === t.workplaceRoomId);
          if (preferred) {
            takeRoomForTeacher(t, preferred);
          }
        }
      }

      // Assign remaining teachers in id order to remaining rooms in id order
      for (const t of pool) {
        if (assignedTeachers.has(t.id)) continue;
        if (remainingRooms.length > 0) {
          takeRoomForTeacher(t, remainingRooms[0]);
        } else {
          spareTeacherIds.add(t.id);
        }
      }
    }
  }

  // Headmaster classroom coverage:
  // Covers at most one uncovered classroom whose school the headmaster has at level >= 5.
  // Highest wizard school level first, then most students assigned, then lowest roomId.
  let headmasterRoomId: number | undefined;
  let headmasterSchool: SchoolType | undefined;

  const uncoveredCandidates: ClassroomScheduleInfo[] = [];
  for (const info of classrooms.values()) {
    if (info.isStaffed) continue;
    const wizLevel = state.wizard?.levels?.[info.school] ?? 0;
    if (wizLevel >= 5) {
      uncoveredCandidates.push(info);
    }
  }

  uncoveredCandidates.sort((a, b) => {
    const lvlA = state.wizard?.levels?.[a.school] ?? 0;
    const lvlB = state.wizard?.levels?.[b.school] ?? 0;
    if (lvlB !== lvlA) return lvlB - lvlA;
    if (b.totalStudents !== a.totalStudents) return b.totalStudents - a.totalStudents;
    return a.roomId - b.roomId;
  });

  if (uncoveredCandidates.length > 0) {
    const chosen = uncoveredCandidates[0];
    headmasterRoomId = chosen.roomId;
    headmasterSchool = chosen.school;
    chosen.isStaffed = true;
    chosen.coveredByHeadmaster = true;
    for (const p of ALL_PERIODS) {
      chosen.periods[p].instructor = 'wizard';
    }
  }

  return {
    studentAssignments,
    overenrolledStudentIds,
    overenrolledBySchool,
    schoolCapacity,
    schoolEnrolled,
    teacherAssignments,
    spareTeacherIds,
    classrooms,
    headmasterRoomId,
    headmasterSchool
  };
}

/**
 * Applies the computed student periods/classrooms and teacher workplaces to `state.characters`.
 */
export function applyAcademyScheduleToState(
  state: FullGameState,
  reachMap?: Map<number, ReachabilityInfo>
): AcademySchedule {
  const schedule = buildAcademySchedule(state, reachMap);
  for (const c of state.characters || []) {
    if (c.status === 'student') {
      const assign = schedule.studentAssignments.get(c.id);
      if (assign) {
        c.classRoomId = assign.classRoomId;
        c.period = assign.period;
        c.seatRoomId = assign.classRoomId;
      } else {
        c.classRoomId = undefined;
        c.period = undefined;
        c.seatRoomId = undefined;
      }
    } else {
      c.classRoomId = undefined;
      c.period = undefined;
      if (c.career === 'teacher') {
        const tAssign = schedule.teacherAssignments.get(c.id);
        c.workplaceRoomId = tAssign ? tAssign.classRoomId : undefined;
      }
    }
  }
  return schedule;
}

export type DayBlockKind =
  | { kind: 'period'; period: 1 | 2 | 3 | 4; hourStart: number }
  | { kind: 'break'; afterPeriod: 1 | 2 | 3; hourStart: number }
  | { kind: 'meal'; meal: 'lunch' | 'supper'; sitting: 'A' | 'B'; hourStart: number }
  | { kind: 'afternoon'; hourStart: number }
  | { kind: 'evening'; hourStart: number }
  | { kind: 'night'; hourStart: number };

/**
 * Resolves the local clock hour in `[0, 24)` from `state` and `nowMs`.
 */
export function resolveAcademyLocalHours(state: FullGameState, nowMs?: number): number {
  if (typeof state.debugTimeHours === 'number' && Number.isFinite(state.debugTimeHours)) {
    return ((state.debugTimeHours % 24) + 24) % 24;
  }
  const vt = state.settings?.visualTime;
  if (vt === 'day') return 13.0;
  if (vt === 'night') return 23.0;
  const d = new Date(nowMs ?? Date.now());
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600 + d.getMilliseconds() / 3_600_000;
}

/**
 * Maps a local hour `[0, 24)` to the NPC Day Routine timetable block.
 */
export function getDayBlock(hoursFloat: number): DayBlockKind {
  const h = ((hoursFloat % 24) + 24) % 24;
  if (h >= 6 && h < 7) return { kind: 'period', period: 1, hourStart: 6 };
  if (h >= 7 && h < 8) return { kind: 'break', afterPeriod: 1, hourStart: 7 };
  if (h >= 8 && h < 9) return { kind: 'period', period: 2, hourStart: 8 };
  if (h >= 9 && h < 10) return { kind: 'break', afterPeriod: 2, hourStart: 9 };
  if (h >= 10 && h < 11) return { kind: 'period', period: 3, hourStart: 10 };
  if (h >= 11 && h < 12) return { kind: 'break', afterPeriod: 3, hourStart: 11 };
  if (h >= 12 && h < 13) return { kind: 'period', period: 4, hourStart: 12 };
  if (h >= 13 && h < 14) {
    const sitting = h - 13 < 0.5 ? 'A' : 'B';
    return { kind: 'meal', meal: 'lunch', sitting, hourStart: 13 };
  }
  if (h >= 14 && h < 18) return { kind: 'afternoon', hourStart: 14 };
  if (h >= 18 && h < 19) {
    const sitting = h - 18 < 0.5 ? 'A' : 'B';
    return { kind: 'meal', meal: 'supper', sitting, hourStart: 18 };
  }
  if (h >= 19 && h < 22) return { kind: 'evening', hourStart: 19 };
  return { kind: 'night', hourStart: 22 };
}

/**
 * Total built refectory chairs across all finished, reachable refectories.
 */
export function totalAcademyRefectoryChairs(
  state: FullGameState,
  reachMap?: Map<number, ReachabilityInfo>
): number {
  const reach = reachMap ?? computeReachability(state.rooms || []);
  const reviewIndex = state.reviewIndex || 0;
  let chairs = 0;
  for (const r of state.rooms || []) {
    if (r.state !== 'built' || r.defId !== 'refectory') continue;
    if ((r.lockedUntilReviewIndex ?? -1) > reviewIndex) continue;
    if (reach.get(r.id)?.reachable === false) continue;
    if (isRoomUnfinished(r)) continue;
    chairs += refectoryChairCount(r);
  }
  return chairs;
}

/**
 * Computes library reader capacity for a built library room:
 * reading desks (1..4) + 1 per bookshelf + 1 if rolling_ladder is placed.
 */
export function libraryReaderCapacity(room: PlacedRoom): number {
  if (room.state !== 'built' || isRoomUnfinished(room)) return 0;
  const desks = libraryReadingDeskCount(room);
  const shelves = libraryBookshelfCount(room);
  const ladder = (room.furniture || []).some(f => !f.damaged && f.defId === 'rolling_ladder') ? 1 : 0;
  return desks + shelves + ladder;
}

/**
 * Resolves who teaches a student for `calculateTeacherDelay` (Section 5).
 */
export function getStudentDelaySource(
  state: FullGameState,
  schedule: AcademySchedule,
  student: Character
): { teacherType: 'teacher' | 'wizard' | 'none'; teacherIvls: number[] } {
  const assign = schedule.studentAssignments.get(student.id);
  if (!assign) {
    return { teacherType: 'none', teacherIvls: [] };
  }
  const roomInfo = schedule.classrooms.get(assign.classRoomId);
  const slot = roomInfo?.periods[assign.period];
  if (!slot || slot.instructor === undefined) {
    return { teacherType: 'none', teacherIvls: [] };
  }
  if (slot.instructor === 'wizard') {
    return { teacherType: 'wizard', teacherIvls: [] };
  }
  const teacher = (state.characters || []).find(c => c.id === slot.instructor);
  if (!teacher || teacher.career !== 'teacher' || teacher.careerState === 'sabbatical') {
    return { teacherType: 'none', teacherIvls: [] };
  }
  let teacherIvls: number[] = [];
  if (teacher.careerSetIds && teacher.careerSetIds.length > 0) {
    const tSet = (state.cardSets || []).find(s => s.id === teacher.careerSetIds[0]);
    if (tSet) {
      teacherIvls = tSet.cardIds.map(id => state.allCards[id]?.honestIvl || 0);
    }
  }
  return { teacherType: 'teacher', teacherIvls };
}

export interface MealSittingAssignment {
  agentId: string;
  sitting: 'A' | 'B' | 'packed';
  roomId?: number;
  chairIndex?: number;
}

/**
 * Assigns present non-injured characters (plus Headmaster if space remains) to Refectory sittings A/B,
 * or 'packed' when beyond 2C or when no refectory table exists.
 */
export function buildMealSittings(
  state: FullGameState,
  reachMap?: Map<number, ReachabilityInfo>
): Map<string, MealSittingAssignment> {
  const reach = reachMap ?? computeReachability(state.rooms || []);
  const reviewIndex = state.reviewIndex || 0;
  const refectories = (state.rooms || [])
    .filter(
      r =>
        r.state === 'built' &&
        r.defId === 'refectory' &&
        (r.lockedUntilReviewIndex ?? -1) <= reviewIndex &&
        reach.get(r.id)?.reachable !== false &&
        !isRoomUnfinished(r) &&
        refectoryChairCount(r) > 0
    )
    .slice()
    .sort((a, b) => a.id - b.id);

  // Build ordered list of chair slots (each has roomId and chairIndex within that refectory)
  const chairs: Array<{ roomId: number; chairIndex: number }> = [];
  for (const r of refectories) {
    const cnt = refectoryChairCount(r);
    for (let i = 0; i < cnt; i++) {
      chairs.push({ roomId: r.id, chairIndex: i });
    }
  }
  const capPerSitting = chairs.length;

  const present = (state.characters || [])
    .filter(c => c.status !== 'away' && !c.injury)
    .slice()
    .sort((a, b) => a.id - b.id);

  const result = new Map<string, MealSittingAssignment>();
  const orderedAgents: Array<{ agentId: string }> = present.map(c => ({ agentId: `char-${c.id}` }));
  orderedAgents.push({ agentId: 'wizard' });

  for (let idx = 0; idx < orderedAgents.length; idx++) {
    const a = orderedAgents[idx];
    if (capPerSitting > 0 && idx < capPerSitting) {
      const ch = chairs[idx];
      result.set(a.agentId, {
        agentId: a.agentId,
        sitting: 'A',
        roomId: ch.roomId,
        chairIndex: ch.chairIndex
      });
    } else if (capPerSitting > 0 && idx < capPerSitting * 2) {
      const ch = chairs[idx - capPerSitting];
      result.set(a.agentId, {
        agentId: a.agentId,
        sitting: 'B',
        roomId: ch.roomId,
        chairIndex: ch.chairIndex
      });
    } else {
      result.set(a.agentId, {
        agentId: a.agentId,
        sitting: 'packed'
      });
    }
  }
  return result;
}

/** Deterministic string/numeric hash for stagger offsets and personal timers. */
export function hashAgentId(agentId: string): number {
  let h = 2166136261;
  for (let i = 0; i < agentId.length; i++) {
    h ^= agentId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Personal arrival/departure stagger offset in minutes `[0.25, 3.0]`. */
export function agentOffsetMinutes(agentId: string): number {
  const h = hashAgentId(agentId);
  return 0.25 + ((h % 166) / 60); // 15s .. 180s (~0.25 .. 3.0 min)
}

