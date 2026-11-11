/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * CastleGrid Wrapper Component
 * Implements Section 1.4 & Section 13.2:
 * - Wraps AcademyCanvas while preserving CastleGrid's props (state, onSelectRoom, selectedRoomId)
 * - App.tsx remains completely unchanged.
 */

import React from 'react';
import { PlacedRoom, FullGameState } from '../types/ankicaster';
import { AcademyCanvas } from '../visual/AcademyCanvas';

interface CastleGridProps {
  state: FullGameState;
  onSelectRoom: (room: PlacedRoom) => void;
  selectedRoomId?: number;
  onResolveHazard?: (roomId: number, method: 'warder' | 'spell') => void;
}

export const CastleGrid: React.FC<CastleGridProps> = ({
  state,
  onSelectRoom,
  selectedRoomId,
  onResolveHazard
}) => {
  return (
    <AcademyCanvas
      state={state}
      onSelectRoom={onSelectRoom}
      selectedRoomId={selectedRoomId}
      onResolveHazard={onResolveHazard}
    />
  );
};
