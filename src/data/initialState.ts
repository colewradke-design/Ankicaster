import { FullGameState } from '../types/ankicaster';
import { createNewAcademy } from '../visual/onboarding/freshStart';

export function createInitialGameState(): FullGameState {
  return createNewAcademy();
}

