/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Fixed left-edge Queue Panel (beside Build Mode in TopBar).
 * Keeps the live castle & grounds map mounted and visible.
 * Top: Build queue (un-shelved sites, reorder + pause/resume).
 * Bottom: Services queue (orb, grimoire, summon, reorder + cancel, Workshop override banner).
 * Note: Worker assignment lives in Summoning Chamber and Workplace RoomWindows, never here.
 */

import React from 'react';
import {
  ListOrdered,
  Hammer,
  Sparkles,
  Pause,
  Play,
  ArrowUp,
  ArrowDown,
  X,
  AlertTriangle
} from 'lucide-react';
import type { FullGameState, SchoolType } from '../types/ankicaster';
import { ROOM_DEFINITIONS } from '../data/content';
import { serviceQueueTitle } from '../utils/banner';
import {
  computeConstructionPlan,
  constructionSites,
  reviewsToGoText
} from '../utils/construction';
import {
  finishedSummoningChambers,
  summonServantQuote
} from '../utils/servants';

export interface QueuePanelProps {
  state: FullGameState;
  onMoveSite: (roomId: number, direction: -1 | 1) => void;
  onTogglePause: (roomId: number, paused: boolean) => void;
  onMoveService: (index: number, direction: -1 | 1) => void;
  onCancelService: (index: number) => void;
  onOpenRoom?: (roomId: number) => void;
  onClose: () => void;
}

interface UnifiedServiceItem {
  id: number;
  kind: 'orb' | 'grimoire' | 'summon';
  school?: SchoolType;
  targetLevel?: number;
  spellId?: string;
  summonTier?: 1 | 2 | 3;
  progress: number;
  required: number;
  costPaid: number;
  state?: 'active' | 'paused';
}

function describeServiceTitle(item: UnifiedServiceItem): string {
  return serviceQueueTitle(item);
}

function workerLabel(kind: 'wizard' | 'servant', id: number, state: FullGameState): string {
  if (kind === 'wizard') return state.wizard?.title || 'Wizard';
  return state.servants?.find(s => s.id === id)?.name || `Servant #${id}`;
}

export const QueuePanel: React.FC<QueuePanelProps> = ({
  state,
  onMoveSite,
  onTogglePause,
  onMoveService,
  onCancelService,
  onOpenRoom,
  onClose
}) => {
  const sites = constructionSites(state.rooms || []);
  const constructionPlan = computeConstructionPlan(state);
  const planByRoomId = new Map(constructionPlan.map(p => [p.roomId, p]));
  const wizardOnSite = constructionPlan.some(p => p.crew.some(m => m.kind === 'wizard'));

  const services: UnifiedServiceItem[] = [];
  if (state.wizard?.activeSession) {
    services.push({
      ...state.wizard.activeSession,
      progress: state.wizard.activeSession.progress || 0
    });
  }
  for (const q of state.wizard?.queuedSessions || []) {
    services.push({
      ...q,
      progress: q.progress ?? 0
    });
  }

  const chambers = finishedSummoningChambers(state);
  const maxChamberLv = chambers.length > 0 ? Math.max(...chambers.map(c => c.level || 1)) : 1;
  const currentQuote = summonServantQuote((state.servants || []).length, maxChamberLv);

  return (
    <aside
      data-testid="queue-panel"
      aria-label="Work Queue Panel"
      className="fixed left-0 top-[52px] bottom-0 z-30 w-72 sm:w-80 bg-slate-900/95 backdrop-blur-md border-r border-amber-900/50 shadow-2xl flex flex-col text-slate-100"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-slate-800 bg-gradient-to-r from-amber-900/25 to-transparent shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <ListOrdered className="w-4 h-4 text-amber-400 shrink-0" />
          <h2 className="text-sm font-bold text-amber-200 truncate">Queues</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          data-testid="queue-panel-close"
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-700 text-xs font-bold text-slate-200 hover:bg-slate-800 transition"
        >
          <X className="w-3.5 h-3.5" />
          Done
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* TOP: BUILD QUEUE */}
        <section data-testid="queue-build-section" className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] uppercase tracking-wider font-bold text-amber-300 flex items-center gap-1.5">
              <Hammer className="w-3.5 h-3.5" />
              Build Queue ({sites.length})
            </h3>
            {constructionPlan[0] && (
              <span className="text-[11px] font-mono text-emerald-300">
                {constructionPlan[0].rate} pts/rev
              </span>
            )}
          </div>

          {constructionPlan[0] && (
            <div className="text-[11px] text-slate-300 bg-slate-950/70 border border-slate-800 rounded-lg px-2.5 py-1.5">
              Crew ({constructionPlan[0].crew.length}/4):{' '}
              <span className="text-amber-200 font-semibold">
                {constructionPlan[0].crew.map(m => workerLabel(m.kind, m.id, state)).join(', ')}
              </span>
            </div>
          )}

          {sites.length === 0 ? (
            <div
              data-testid="queue-build-empty"
              className="bg-slate-950/50 border border-dashed border-slate-800 rounded-xl p-3 text-center text-xs text-slate-400"
            >
              No un-shelved construction sites.
            </div>
          ) : (
            <div className="space-y-2">
              {sites.map((site, idx) => {
                const name = ROOM_DEFINITIONS[site.defId]?.name || site.defId;
                const activePlan = planByRoomId.get(site.id);
                const progress = Math.round((site.buildProgress || 0) * 10) / 10;
                const req = Math.max(1, site.buildRequired || 1);
                const pct = Math.min(100, (progress / req) * 100);
                return (
                  <div
                    key={site.id}
                    data-testid={`queue-site-${site.id}`}
                    data-site-def={site.defId}
                    className={`rounded-xl border p-2.5 space-y-1.5 ${
                      site.buildPaused
                        ? 'bg-slate-950/50 border-slate-800/80 opacity-85'
                        : activePlan
                        ? 'bg-slate-950/90 border-amber-500/40'
                        : 'bg-slate-950/75 border-slate-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {onOpenRoom ? (
                          <button
                            type="button"
                            onClick={() => onOpenRoom(site.id)}
                            className="text-xs font-bold text-slate-100 hover:text-amber-200 truncate block text-left"
                            title={`Inspect ${name}`}
                          >
                            {idx + 1}. {name}
                          </button>
                        ) : (
                          <span className="text-xs font-bold text-slate-100 truncate block">
                            {idx + 1}. {name}
                          </span>
                        )}
                        <div className="text-[11px] font-mono text-slate-400">
                          {progress}/{req} pts ·{' '}
                          {site.buildPaused
                            ? 'Paused'
                            : activePlan
                            ? reviewsToGoText(site, 0, activePlan.rate)
                            : 'Waiting'}
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border shrink-0 ${
                          site.buildPaused
                            ? 'bg-slate-900 border-slate-700 text-slate-300'
                            : activePlan
                            ? 'bg-emerald-950/70 border-emerald-600/50 text-emerald-300'
                            : 'bg-slate-900 border-slate-700 text-slate-400'
                        }`}
                      >
                        {site.buildPaused ? 'Paused' : activePlan ? 'Building' : 'Queued'}
                      </span>
                    </div>

                    <div className="w-full bg-slate-800 rounded h-1.5 overflow-hidden">
                      <div
                        className={site.buildPaused ? 'bg-slate-500 h-full' : 'bg-amber-400 h-full'}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-1.5 pt-0.5">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Move ${name} up in build queue`}
                          disabled={idx === 0}
                          onClick={() => onMoveSite(site.id, -1)}
                          className="p-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 disabled:opacity-30"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${name} down in build queue`}
                          disabled={idx === sites.length - 1}
                          onClick={() => onMoveSite(site.id, 1)}
                          className="p-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 disabled:opacity-30"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        data-action="queue-toggle-pause"
                        aria-label={site.buildPaused ? `Resume ${name}` : `Pause ${name}`}
                        onClick={() => onTogglePause(site.id, !site.buildPaused)}
                        className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-bold text-slate-200"
                      >
                        {site.buildPaused ? (
                          <>
                            <Play className="w-3 h-3 text-emerald-300" />
                            Resume
                          </>
                        ) : (
                          <>
                            <Pause className="w-3 h-3 text-amber-300" />
                            Pause
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* BOTTOM: SERVICES QUEUE */}
        <section data-testid="queue-services-section" className="space-y-2 border-t border-slate-800 pt-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] uppercase tracking-wider font-bold text-purple-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Services Queue ({services.length})
            </h3>
            <span className="text-[11px] text-slate-400">Wizard</span>
          </div>

          {wizardOnSite && (
            <div
              data-testid="wizard-workshop-override-banner"
              className="flex items-start gap-2 bg-amber-950/60 border border-amber-500/45 rounded-xl p-2.5 text-[11px] text-amber-200 leading-snug"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <span>
                <strong>On scaffold:</strong> Headmaster is building at the active site. Services pause with saved progress until the site completes or the Wizard leaves the Workshop.
              </span>
            </div>
          )}

          {services.length === 0 ? (
            <div
              data-testid="queue-services-empty"
              className="bg-slate-950/50 border border-dashed border-slate-800 rounded-xl p-3 text-center text-xs text-slate-400"
            >
              Orb, Grimoire, and Summoning Chamber work queues here.
            </div>
          ) : (
            <div className="space-y-2">
              {services.map((item, idx) => {
                const title = describeServiceTitle(item);
                const progress = Math.round((item.progress || 0) * 10) / 10;
                const req = Math.max(1, item.required || 1);
                const pct = Math.min(100, (progress / req) * 100);
                const waitingMana = idx === 0 && item.kind === 'summon' && item.costPaid === 0;
                const isTop = idx === 0;
                const statusLabel = isTop
                  ? wizardOnSite
                    ? 'Paused (Build)'
                    : waitingMana
                    ? `Needs ${currentQuote.mana}m`
                    : 'Active'
                  : 'Queued';
                return (
                  <div
                    key={item.id}
                    data-testid={`queue-service-${idx}`}
                    data-service-kind={item.kind}
                    className={`rounded-xl border p-2.5 space-y-1.5 ${
                      isTop
                        ? wizardOnSite || waitingMana
                          ? 'bg-slate-950/85 border-amber-500/40'
                          : 'bg-purple-950/35 border-purple-500/45'
                        : 'bg-slate-950/70 border-slate-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-100 truncate">
                          {idx + 1}. {title}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400">
                          {progress}/{req} revs ·{' '}
                          {item.costPaid > 0
                            ? `Paid ${item.costPaid}m`
                            : item.kind === 'summon'
                            ? 'Pays on start'
                            : 'Free'}
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border shrink-0 ${
                          isTop
                            ? wizardOnSite || waitingMana
                              ? 'bg-amber-950/60 border-amber-600/50 text-amber-200'
                              : 'bg-purple-900/60 border-purple-500/50 text-purple-200'
                            : 'bg-slate-900 border-slate-700 text-slate-400'
                        }`}
                      >
                        {statusLabel}
                      </span>
                    </div>

                    <div className="w-full bg-slate-800 rounded h-1.5 overflow-hidden">
                      <div className="bg-purple-400 h-full" style={{ width: `${pct}%` }} />
                    </div>

                    <div className="flex items-center justify-between gap-1.5 pt-0.5">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Move ${title} up in services queue`}
                          disabled={idx === 0}
                          onClick={() => onMoveService(idx, -1)}
                          className="p-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 disabled:opacity-30"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${title} down in services queue`}
                          disabled={idx === services.length - 1}
                          onClick={() => onMoveService(idx, 1)}
                          className="p-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 disabled:opacity-30"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        data-action="queue-cancel-service"
                        aria-label={`Cancel ${title}`}
                        title={
                          item.costPaid > 0
                            ? `Cancel and refund ${item.costPaid} Mana`
                            : 'Cancel unstarted item (0 Mana refund)'
                        }
                        onClick={() => onCancelService(idx)}
                        className="flex items-center gap-1 px-2 py-1 rounded bg-rose-950/50 hover:bg-rose-900/60 border border-rose-700/50 text-[11px] font-bold text-rose-200"
                      >
                        <X className="w-3 h-3" />
                        {item.costPaid > 0 ? `Cancel (+${item.costPaid}m)` : 'Cancel'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </aside>
  );
};
