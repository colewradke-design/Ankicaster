/**
 * Founding Day (6 s) and the four-panel tour. Copy matches the current three-room start.
 */
import React, { useEffect, useState } from 'react';
import { FIRST_GOAL, FOUNDING_MS, TOUR_STEPS } from './flow';

const STAGES = ['The doors are shut.', 'The doors open.', 'Your crest unfurls.', 'You walk up to the Study.'];

export const FoundingDay: React.FC<{ reduceMotion?: boolean; onDone: () => void }> = ({ reduceMotion, onDone }) => {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (reduceMotion) return;
    const started = Date.now();
    const id = window.setInterval(() => {
      const t = Date.now() - started;
      setStage(Math.min(STAGES.length - 1, Math.floor(t / (FOUNDING_MS / STAGES.length))));
      if (t >= FOUNDING_MS) {
        window.clearInterval(id);
        onDone();
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [reduceMotion, onDone]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/55 p-4" data-testid="founding-day">
      <div className="w-full max-w-lg bg-slate-900 border border-amber-500/40 rounded-2xl p-5 text-slate-100 shadow-2xl">
        <div className="text-xs uppercase tracking-wider text-amber-300 font-bold">Founding Day</div>
        <p className="mt-2 text-sm" data-testid="founding-stage">{STAGES[stage]}</p>
        <p className="mt-1 text-xs text-slate-400">The Entrance Hall, the Wizard's Study and the Vegetable Patch are yours.</p>
        <button type="button" onClick={onDone} className="mt-4 px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-sm font-bold" data-testid="founding-skip">
          {reduceMotion ? 'Continue' : 'Skip'}
        </button>
      </div>
    </div>
  );
};

export const GuidedTour: React.FC<{ step: number; onNext: () => void; onSkip: () => void }> = ({ step, onNext, onSkip }) => {
  const panel = TOUR_STEPS[Math.max(0, Math.min(TOUR_STEPS.length - 1, step))];
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] w-[min(36rem,calc(100%-2rem))]" data-testid="guided-tour" data-tour-step={panel.id}>
      <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-4 shadow-2xl text-slate-100">
        <div className="text-xs text-amber-300 font-bold">{step + 1} / {TOUR_STEPS.length} · {panel.title}</div>
        <p className="mt-2 text-sm leading-relaxed">{panel.body}</p>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onSkip} className="px-3 py-1.5 text-xs text-slate-400" data-testid="tour-skip">Skip</button>
          <button type="button" onClick={onNext} className="px-4 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-sm font-bold" data-testid="tour-next">
            {step >= TOUR_STEPS.length - 1 ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};

export const GoalBanner: React.FC<{ onDone: () => void }> = ({ onDone }) => (
  <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[60] w-[min(36rem,calc(100%-2rem))]" data-testid="first-goal">
    <div className="bg-amber-500 text-slate-950 rounded-xl px-4 py-3 shadow-xl flex items-center justify-between gap-3">
      <p className="text-sm font-semibold">{FIRST_GOAL}</p>
      <button type="button" onClick={onDone} className="shrink-0 px-3 py-1 rounded-lg bg-slate-950 text-amber-200 text-xs font-bold">Got it</button>
    </div>
  </div>
);
