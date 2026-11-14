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
import type { DropTargetInput } from '../visual/layout/furniturePlacement';

interface CastleGridProps {
  state: FullGameState;
  onSelectRoom: (room: PlacedRoom) => void;
  onPickupRoom?: (roomId: number) => void;
  onSelectPerson?: (personId: 'wizard' | number) => void;
  onSelectCreature?: (creature: CreatureInstance) => void;
  onSelectEvent?: (eventId: string) => void;
  personActivityRef?: React.MutableRefObject<((personId: 'wizard' | number) => string) | null>;
  creatureActivityRef?: React.MutableRefObject<((creatureId: number) => string) | null>;
  buildModeOpen?: boolean;
  selectedRoomId?: number;
  onResolveHazard?: (roomId: number, method: 'warder' | 'spell') => void;
  placement?: PlacementMode | null;
  onPlacementConfirm?: (x: number, y: number) => void;
  onFurnitureDropConfirm?: (target: DropTargetInput) => void;
  onPlacementReject?: (reason: string) => void;
  onPlacementCancel?: () => void;
  onPlacementAuto?: () => void;
  focusRoomDefId?: string | null;
  onRoomScreenBox?: (box: { left: number; top: number; width: number; height: number } | null) => void;
}

export const CastleGrid: React.FC<CastleGridProps> = props => <AcademyCanvas {...props} />;
