/**
 * Onboarding phases for a new academy (Addendum 10, matched to the current game).
 * Skip tutorial skips Founding Day, the tour and the first-goal banner.
 * Creation itself always runs. Starting rooms stay the three the game already uses.
 */
export type OnboardingPhase = 'welcome' | 'create' | 'founding' | 'tour' | 'goal' | 'play';

export const FOUNDING_MS = 6000;

export const TOUR_STEPS: Array<{ id: string; title: string; body: string }> = [
  {
    id: 'study',
    title: "Wizard's Study",
    body: 'Ponder orbs and read the grimoire here. Your founding school only suggests the first orb. It grants no level and no mana.'
  },
  {
    id: 'hall',
    title: 'Entrance Hall',
    body: 'Students arrive through these doors, and ceremonies happen here. The hall and the study are already built.'
  },
  {
    id: 'grounds',
    title: 'Vegetable Patch',
    body: 'A new academy has the Entrance Hall, the Wizard\'s Study and this Vegetable Patch. Every other room comes from a draw: Foundation or Grounds for 50 mana, Magic for 100. Building spends materials, not mana.'
  },
  {
    id: 'topbar',
    title: 'Top bar',
    body: 'The top bar shows mana, your resources and the Veil. Study in Anki as usual. Your first 8 reviews pay for your first orb.'
  }
];

export const FIRST_GOAL = 'Study in Anki as usual. Your first 8 reviews pay for your first orb.';

export function phaseAfterCreate(skipTutorial: boolean): OnboardingPhase {
  return skipTutorial ? 'play' : 'founding';
}

export function phaseAfterFounding(): OnboardingPhase {
  return 'tour';
}

export function advanceTour(step: number): { phase: 'tour' | 'goal'; step: number } {
  if (step >= TOUR_STEPS.length - 1) return { phase: 'goal', step };
  return { phase: 'tour', step: step + 1 };
}
