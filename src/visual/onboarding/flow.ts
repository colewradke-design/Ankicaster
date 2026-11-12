/**
 * Onboarding phases for a new academy (Addendum 10, matched to the current game).
 * Skip tutorial skips Founding Day, the tour and the first-goal banner.
 * Creation itself always runs. Starting rooms stay the three the game already uses.
 *
 * The guided tour after Founding Day waits for the player's action. Progress is
 * stored on the save (`tutorial`) so a reload resumes at the same step.
 */
import type { TutorialProgress } from '../../types/ankicaster';

export type OnboardingPhase = 'welcome' | 'create' | 'founding' | 'tour' | 'goal' | 'play';

export const FOUNDING_MS = 6000;

export const TOUR_STEP_IDS = ['welcome', 'study', 'study-parts', 'close', 'materials', 'academy', 'draw'] as const;
export type TourStepId = (typeof TOUR_STEP_IDS)[number];

export const STUDY_PARTS: Array<{ id: string; title: string; body: string; selector: string; waits?: 'start-ponder' }> = [
  { id: 'header', title: 'Room window', body: 'Click a room and its window opens. The name, level and quality are up here.', selector: '[data-tour="room-header"]' },
  { id: 'stats', title: 'How the room is doing', body: 'These chips are efficiency, cleanliness, Veil upkeep and quality.', selector: '[data-tour="room-stats"]' },
  { id: 'efficiency', title: 'Efficiency', body: 'This line is the efficiency percent, and what makes it: level, quality, cleanliness, staff and neighbours.', selector: '[data-tour="efficiency"]' },
  { id: 'fixtures', title: 'Required fixtures', body: 'The Study needs its orb stand and lectern. Missing fixtures leave a room Unfinished, at 0%.', selector: '[data-testid="required-fixtures"]' },
  { id: 'orb', title: 'Pondering the Orb', body: 'Pondering the Orb happens here. Honest reviews fill the bar. Your founding school only suggests the first orb. It grants no level and no mana by itself.', selector: '[data-testid="study-summary"]' },
  { id: 'look', title: 'Your look', body: 'Change look opens the headmaster screen again, if you want a new hat, robe or staff.', selector: '[data-testid="change-look"]' },
  { id: 'ponder', title: 'Free first ponder', body: 'Start the free ponder in your founding school. It trains that school over the next 25 honest reviews. Again, Hard, Good and Easy all count the same, and taking a break never sets you back.', selector: '[data-testid="free-ponder"]', waits: 'start-ponder' },
  { id: 'grimoire', title: 'Grimoire', body: 'The Grimoire lists the spells you know.', selector: '[data-room-window="wizard_study"] [data-screen="grimoire"]' },
  { id: 'draft', title: 'Card Draft', body: 'Card Draft is where you draw room cards.', selector: '[data-room-window="wizard_study"] [data-screen="draft"]' },
  { id: 'move', title: 'Move', body: 'Move keeps the room’s level, furniture and progress, and lets you pick a new spot.', selector: '[data-tour="room-move"]' },
  { id: 'demolish', title: 'Demolish', body: 'Demolish returns half the materials. It never gives mana back.', selector: '[data-tour="room-demolish"]' },
  { id: 'details', title: 'Room details', body: 'Room details hides the description, what is already installed, and furniture you can add.', selector: '[data-tour="room-details"]' },
  { id: 'installed', title: 'Installed', body: 'Everything in the room is listed here. Required fixtures stay. Optional ones can be removed.', selector: '[data-tour="room-installed"]' },
  { id: 'furnish', title: 'Furnish', body: 'Furnish buys an optional piece for this room. It spends materials, not mana.', selector: '[data-tour="room-furnish"]' },
  { id: 'renovate', title: 'Renovate', body: 'Renovate raises the room one level. It costs mana. Level 3 unlocks the room’s perk.', selector: '[data-tour="room-renovate"]' }
];

/** Labels a brand-new academy's Academy menu actually shows. */
export const FRESH_ACADEMY_MENU = ['Ponder Orb', 'Grimoire', 'Card Draft', 'Admissions', 'Study Desk', 'Journal', 'Codex', 'Settings'];

export interface TourView {
  id: TourStepId;
  title: string;
  body: string;
  /** Next is the action. Study-click and close-click hide it. */
  showNext: boolean;
  /** DOM spotlight. Null means the Wizard's Study on the map. */
  selector: string | null;
  focusRoom: boolean;
  openDraft: boolean;
  forceAcademy: boolean;
}

export function tourOpensDetails(t: Pick<TutorialProgress, 'step' | 'part'> | undefined): boolean {
  if (tourStepId(t) !== 'study-parts') return false;
  const id = STUDY_PARTS[Math.max(0, t?.part || 0)]?.id;
  return id === 'details' || id === 'installed' || id === 'furnish' || id === 'renovate';
}

export function tourStepId(t: Pick<TutorialProgress, 'step'> | undefined): TourStepId {
  return TOUR_STEP_IDS[t?.step ?? 0] || 'welcome';
}

export function tourView(t: TutorialProgress, opts: { studyOpen: boolean; academyLabels?: string[] } = { studyOpen: false }): TourView {
  const id = tourStepId(t);
  const labels = opts.academyLabels?.length ? opts.academyLabels : FRESH_ACADEMY_MENU;
  const base = { id, showNext: true, selector: null as string | null, focusRoom: false, openDraft: false, forceAcademy: false };
  if (id === 'welcome') {
    return { ...base, title: 'Welcome', body: 'This is your academy. Mana comes from honest Anki reviews. Again, Hard, Good and Easy all count the same, and taking a break never costs you anything.', selector: '[data-testid="mana-chip"]' };
  }
  if (id === 'study') {
    return { ...base, title: "Wizard's Study", body: 'Click any room to open its window and see what it does. Start with the Wizard\'s Study.', showNext: false, focusRoom: true };
  }
  if (id === 'study-parts') {
    if (!opts.studyOpen) {
      return { ...base, title: "Wizard's Study", body: 'Open the Wizard\'s Study again to keep looking around.', showNext: false, focusRoom: true };
    }
    const part = STUDY_PARTS[Math.max(0, Math.min(STUDY_PARTS.length - 1, t.part || 0))];
    return { ...base, title: part.title, body: part.body, selector: part.selector, showNext: !part.waits };
  }
  if (id === 'close') {
    if (!opts.studyOpen) {
      return { ...base, title: 'Close the window', body: 'Open the Wizard\'s Study, then close the window.', showNext: false, focusRoom: true };
    }
    return { ...base, title: 'Close the window', body: 'Close the window when you are done. The castle stays right here.', showNext: false, selector: '[data-tour="room-close"]' };
  }
  if (id === 'materials') {
    return { ...base, title: 'Materials', body: 'Timber, stone, glass, cloth, provisions and greens sit up here. Hover one to see income and use per bell. The little arrow opens everything else. Common materials cap at 200, plus 100 for each finished Storage Vault.', selector: '[data-tour="resources"]' };
  }
  if (id === 'academy') {
    return { ...base, title: 'Academy menu', body: `This menu is the rest of the school: ${labels.join(', ')}. More rooms unlock more entries.`, selector: '[data-tour="academy-menu"], [data-tour="academy-panel"]', forceAcademy: true };
  }
  return { ...base, title: 'First goal', body: 'Draw from the Foundation deck (50 mana) to find a Dormitory. A room card is one build, paid in materials, not mana.', selector: '[data-tour="deck-foundation"]', openDraft: true };
}

export type TutorialAction = 'next' | 'skip' | 'open-study' | 'close-study' | 'open-other' | 'start-ponder';

function advanceStudyPart(cur: TutorialProgress): TutorialProgress {
  if ((cur.part || 0) < STUDY_PARTS.length - 1) return { ...cur, part: (cur.part || 0) + 1 };
  return { phase: 'tour', step: cur.step + 1, part: 0 };
}

/** Advance only on the action the current step is waiting for. Skip ends it from any step. */
export function applyTutorialAction(t: TutorialProgress | undefined, action: TutorialAction): TutorialProgress {
  const cur: TutorialProgress = t && (t.phase === 'founding' || t.phase === 'tour' || t.phase === 'goal' || t.phase === 'done')
    ? { phase: t.phase, step: t.step || 0, part: t.part || 0 }
    : { phase: 'done', step: 0, part: 0 };
  if (action === 'skip') return { phase: 'done', step: cur.step, part: cur.part };
  if (cur.phase !== 'tour') return cur;
  const id = tourStepId(cur);
  if (action === 'open-other') return cur;
  if (action === 'open-study') {
    if (id === 'study') return { phase: 'tour', step: cur.step + 1, part: 0 };
    return cur;
  }
  if (action === 'close-study') {
    if (id === 'close') return { phase: 'tour', step: cur.step + 1, part: 0 };
    return cur;
  }
  if (action === 'start-ponder') {
    if (id === 'study-parts' && STUDY_PARTS[cur.part || 0]?.waits === 'start-ponder') return advanceStudyPart(cur);
    return cur;
  }
  if (action !== 'next') return cur;
  if (id === 'study' || id === 'close') return cur;
  if (id === 'study-parts') {
    if (STUDY_PARTS[cur.part || 0]?.waits) return cur;
    return advanceStudyPart(cur);
  }
  if (cur.step >= TOUR_STEP_IDS.length - 1) return { phase: 'goal', step: cur.step, part: 0 };
  return { phase: 'tour', step: cur.step + 1, part: 0 };
}

/** One-line bodies for the older step walker. The live tour uses tourView. */
export const TOUR_STEPS: Array<{ id: string; title: string; body: string }> = TOUR_STEP_IDS.map(id => {
  const view = tourView({ phase: 'tour', step: TOUR_STEP_IDS.indexOf(id), part: 0 }, { studyOpen: true });
  return { id, title: view.title, body: view.body };
});

export const FIRST_GOAL = 'Study in Anki as usual. Your first 8 reviews pay for your first orb.';

export function phaseAfterCreate(skipTutorial: boolean): OnboardingPhase {
  return skipTutorial ? 'play' : 'founding';
}

export function phaseAfterFounding(): OnboardingPhase {
  return 'tour';
}

export function advanceTour(step: number): { phase: 'tour' | 'goal'; step: number } {
  if (step >= TOUR_STEP_IDS.length - 1) return { phase: 'goal', step };
  return { phase: 'tour', step: step + 1 };
}

export const DEFAULT_TOUR_VIEWPORT = { width: 1280, height: 800 };

export interface TourRect { left: number; top: number; width: number; height: number }
export type TourSide = 'above' | 'below' | 'left' | 'right';

export function rectsIntersect(a: TourRect, b: TourRect): boolean {
  return a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
}

/**
 * Put the tutorial text on the side of the spotlight with the most free space.
 * The box stays fully on screen and never covers the target (or its 8px glow).
 */
export function placeTourBox(
  target: TourRect,
  viewport: { width: number; height: number },
  box: { width: number; height: number },
  margin = 8
): TourRect & { side: TourSide } {
  const vw = Math.max(1, viewport.width);
  const vh = Math.max(1, viewport.height);
  const bw = Math.min(Math.max(120, box.width), Math.max(120, vw - margin * 2));
  const bh = Math.min(Math.max(72, box.height), Math.max(72, vh - margin * 2));
  const gap = 48;
  const spot: TourRect = {
    left: target.left - 8,
    top: target.top - 8,
    width: target.width + 16,
    height: target.height + 16
  };
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
  const maxLeft = Math.max(margin, vw - bw - margin);
  const maxTop = Math.max(margin, vh - bh - margin);
  const space = {
    above: spot.top - margin,
    below: vh - (spot.top + spot.height) - margin,
    left: spot.left - margin,
    right: vw - (spot.left + spot.width) - margin
  };
  const candidates: Array<{ side: TourSide; left: number; top: number; space: number }> = [
    { side: 'above', space: space.above, left: clamp(spot.left + spot.width / 2 - bw / 2, margin, maxLeft), top: spot.top - gap - bh },
    { side: 'below', space: space.below, left: clamp(spot.left + spot.width / 2 - bw / 2, margin, maxLeft), top: spot.top + spot.height + gap },
    { side: 'left', space: space.left, left: spot.left - gap - bw, top: clamp(spot.top + spot.height / 2 - bh / 2, margin, maxTop) },
    { side: 'right', space: space.right, left: spot.left + spot.width + gap, top: clamp(spot.top + spot.height / 2 - bh / 2, margin, maxTop) }
  ];
  const fits = (c: { left: number; top: number }) => {
    const r = { left: c.left, top: c.top, width: bw, height: bh };
    const onScreen = r.left >= margin - 0.01 && r.top >= margin - 0.01 && r.left + bw <= vw - margin + 0.01 && r.top + bh <= vh - margin + 0.01;
    return onScreen && !rectsIntersect(r, spot) && !rectsIntersect(r, target);
  };
  const usable = candidates.filter(fits).sort((a, b) => b.space - a.space);
  const chosen = usable[0];
  if (chosen) {
    return { left: Math.round(chosen.left), top: Math.round(chosen.top), width: bw, height: bh, side: chosen.side };
  }
  const roomiest = [...candidates].sort((a, b) => b.space - a.space)[0];
  let left = clamp(roomiest.left, margin, maxLeft);
  let top = clamp(roomiest.top, margin, maxTop);
  const pushed = { left, top, width: bw, height: bh };
  if (rectsIntersect(pushed, target) || rectsIntersect(pushed, spot)) {
    if (space.above >= space.below && space.above >= space.left && space.above >= space.right) top = clamp(spot.top - gap - bh, margin, maxTop);
    else if (space.below >= space.left && space.below >= space.right) top = clamp(spot.top + spot.height + gap, margin, maxTop);
    else if (space.left >= space.right) left = clamp(spot.left - gap - bw, margin, maxLeft);
    else left = clamp(spot.left + spot.width + gap, margin, maxLeft);
  }
  return { left: Math.round(left), top: Math.round(top), width: bw, height: bh, side: roomiest.side };
}

/** Spotlight rectangles for every tour step at the default window, including the lower Study rows. */
export function defaultTourTargets(viewport: { width: number; height: number } = DEFAULT_TOUR_VIEWPORT): Array<{ step: string; target: TourRect }> {
  const W = viewport.width;
  const H = viewport.height;
  const dialogW = Math.min(512, W - 32);
  const dialogLeft = (W - dialogW) / 2;
  const dialogTop = Math.round(H * 0.05);
  const dialogH = Math.min(Math.round(H * 0.9), H - dialogTop * 2);
  const out: Array<{ step: string; target: TourRect }> = [
    { step: 'welcome', target: { left: 12, top: 10, width: 140, height: 36 } },
    { step: 'study', target: { left: W / 2 - 48, top: H * 0.42, width: 96, height: 72 } }
  ];
  for (const part of STUDY_PARTS) {
    let target: TourRect;
    if (part.id === 'move' || part.id === 'demolish') {
      target = { left: dialogLeft + dialogW - (part.id === 'demolish' ? 76 : 112), top: dialogTop + 14, width: 32, height: 32 };
    } else if (part.id === 'furnish' || part.id === 'renovate' || part.id === 'installed' || part.id === 'details') {
      target = { left: dialogLeft + 20, top: dialogTop + dialogH - 56, width: dialogW - 40, height: 40 };
    } else if (part.id === 'ponder') {
      target = { left: W / 2 - 56, top: H / 2 - 18, width: 112, height: 44 };
    } else {
      const i = STUDY_PARTS.findIndex(p => p.id === part.id);
      target = { left: dialogLeft + 20, top: dialogTop + 70 + (i % 8) * 46, width: Math.min(dialogW - 40, 360), height: 36 };
    }
    out.push({ step: `study:${part.id}`, target });
  }
  out.push({ step: 'close', target: { left: dialogLeft + dialogW - 44, top: dialogTop + 12, width: 32, height: 32 } });
  out.push({ step: 'materials', target: { left: 160, top: 8, width: Math.min(720, W - 280), height: 40 } });
  out.push({ step: 'academy', target: { left: W - 220, top: 48, width: 200, height: 280 } });
  out.push({ step: 'draw', target: { left: W / 2 - 180, top: H / 2 + 80, width: 240, height: 140 } });
  out.push({ step: 'study-bottom-edge', target: { left: 16, top: H - 56, width: W - 32, height: 40 } });
  return out;
}
