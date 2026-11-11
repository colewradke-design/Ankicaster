/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Demolish confirmation dialog (GDD 15.4: demolition is always a deliberate player action
 * with a confirmation dialog). Shows exactly what comes back, from the engine's preview.
 */

import React from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { FullGameState } from '../types/ankicaster';
import { ROOM_DEFINITIONS } from '../data/content';
import { AnkicasterEngine } from '../utils/engine';
import { REFUND_MATERIALS } from '../utils/placement';

export const DemolishConfirm: React.FC<{
  state: FullGameState;
  roomId: number;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ state, roomId, onCancel, onConfirm }) => {
  const room = state.rooms.find(r => r.id === roomId);
  const preview = AnkicasterEngine.demolishPreview(state, roomId);
  if (!room || !preview) return null;
  const def = ROOM_DEFINITIONS[room.defId];
  const { refund } = preview;
  const back = REFUND_MATERIALS.filter(k => refund[k] > 0).map(k => `${refund[k]} ${k[0].toUpperCase()}${k.slice(1)}`);
  if (refund.mana > 0) back.unshift(`${refund.mana} Mana`);
  const verb = refund.cancel ? 'Cancel construction' : 'Demolish';

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div role="alertdialog" aria-label={`${verb} ${def?.name}`} data-testid="demolish-confirm" className="bg-slate-900 border border-rose-800/60 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-800">
          <AlertTriangle className="w-5 h-5 text-rose-400" />
          <h3 className="font-bold text-rose-200">{verb}: {def?.name || room.defId}?</h3>
        </div>
        <div className="p-5 space-y-3 text-[13px] text-slate-300">
          {preview.blocked ? (
            <p className="text-rose-300">{preview.blocked}.</p>
          ) : (
            <>
              <ul className="space-y-1.5">
                <li>
                  <span className="text-slate-400">You get back: </span>
                  <strong className="text-slate-100">{back.length ? back.join(' · ') : 'nothing'}</strong>
                </li>
                <li className="text-slate-400">
                  {refund.cancel
                    ? 'No construction progress yet, so everything you paid is returned.'
                    : 'Demolishing returns 50% of the materials paid and no mana (GDD 15.4).'}
                </li>
                {preview.furniture > 0 && <li><strong className="text-slate-100">{preview.furniture}</strong> furniture item{preview.furniture > 1 ? 's' : ''} go to storage (free to re-install).</li>}
                {preview.occupants > 0 && <li><strong className="text-slate-100">{preview.occupants}</strong> occupant assignment{preview.occupants > 1 ? 's' : ''} move to another room of this kind, or wait between rooms.</li>}
                {preview.renownLoss > 0 && <li className="text-amber-300">−{preview.renownLoss} Renown earned by renovating this room.</li>}
              </ul>
              <p className="text-slate-500 text-[12px]">This can't be undone.</p>
            </>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onCancel} className="px-4 py-2 min-h-[36px] rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800">Keep it</button>
            <button
              onClick={onConfirm}
              disabled={!!preview.blocked}
              data-testid="demolish-confirm-button"
              className="flex items-center gap-1.5 px-4 py-2 min-h-[36px] rounded-lg bg-rose-700 hover:bg-rose-600 text-white font-bold disabled:opacity-40"
            >
              <Trash2 className="w-4 h-4" /> {verb}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
