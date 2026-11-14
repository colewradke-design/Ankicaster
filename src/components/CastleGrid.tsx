/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * CastleGrid Wrapper Component
 * Implements Section 1.4 & Section 13.2:
 * - Wraps AcademyCanvas while preserving CastleGrid's props (state, onSelectRoom, selectedRoomId)
 * - Passes the Build / Move placement mode through to the canvas ghost tool.
 */

import React from 'react';
import { PlacedRoom, FullGameState, CreatureInstance } from '../types/ankicaster';
import { AcademyCanvas, PlacementMode } from '../visual/AcademyCanvas';

interface CastleGridProps {
  state: FullGameState;
  onSelectRoom: (room: PlacedRoom) => void;
  onSelectCreature?: (creature: CreatureInstance) => void;
  onSelectEvent?: (eventId: string) => void;
  selectedRoomId?: number;
  onResolveHazard?: (roomId: number, method: 'warder' | 'spell') => void;
  placement?: PlacementMode | null;
  onPlacementConfirm?: (x: number, y: number) => void;
  onPlacementCancel?: () => void;
  onPlacementAuto?: () => void;
  focusRoomDefId?: string | null;
  onRoomScreenBox?: (box: { left: number; top: number; width: number; height: number } | null) => void;
}

export const CastleGrid: React.FC<CastleGridProps> = props => <AcademyCanvas {...props} />;
