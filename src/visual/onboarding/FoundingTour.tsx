/**
 * Founding Day, then the guided tour. Each tour step waits for the player.
 * Skip is on every step. The arrow bounces unless reduceMotion is on.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DEFAULT_TOUR_VIEWPORT, FIRST_GOAL, FOUNDING_MS, placeTourBox, type TourRect, type TourSide } from './flow';
import type { TourView } from './flow';

const STAGES = ['The doors are shut.', 'The doors open.', 'Your crest unfurls.', 'You walk up to the Study.'];

export const FoundingDay: React.FC<{ reduceMotion?: boolean; onDone: () => void; onSkip?: () => void }> = ({ reduceMotion, onDone, onSkip }) => {
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
        {onSkip && (
          <button type="button" onClick={onSkip} className="mt-2 ml-2 px-3 py-2 text-xs text-slate-400" data-testid="tour-skip">
            Skip tutorial
          </button>
        )}
      </div>
    </div>
  );
};

function unionRect(selector: string): { left: number; top: number; width: number; height: number } | null {
  const nodes = document.querySelectorAll(selector);
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity, n = 0;
  nodes.forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 && r.height < 1) return;
    left = Math.min(left, r.left);
    top = Math.min(top, r.top);
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom);
    n++;
  });
  if (!n || !Number.isFinite(left)) return null;
  return { left, top, width: right - left, height: bottom - top };
}

function arrowFor(side: TourSide, target: TourRect, viewport: { width: number; height: number }) {
  const cx = Math.round(target.left + target.width / 2 - 10);
  const cy = Math.round(target.top + target.height / 2 - 10);
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
  if (side === 'above') return { left: clamp(cx, 4, viewport.width - 24), top: target.top - 30, rotate: 0 };
  if (side === 'below') return { left: clamp(cx, 4, viewport.width - 24), top: target.top + target.height + 12, rotate: 180 };
  if (side === 'left') return { left: target.left - 30, top: clamp(cy, 4, viewport.height - 24), rotate: -90 };
  return { left: target.left + target.width + 12, top: clamp(cy, 4, viewport.height - 24), rotate: 90 };
}

export const GuidedTour: React.FC<{
  view: TourView;
  step: number;
  part?: number;
  reduceMotion?: boolean;
  roomBox?: { left: number; top: number; width: number; height: number } | null;
  onNext: () => void;
  onSkip: () => void;
}> = ({ view, step, part = 0, reduceMotion, roomBox, onNext, onSkip }) => {
  const [domBox, setDomBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  useEffect(() => {
    if (!view.selector) { setDomBox(null); return; }
    const measure = () => {
      const sel = view.selector!;
      const nodes = document.querySelectorAll(sel);
      const first = nodes[0] as HTMLElement | undefined;
      if (first) {
        const r = first.getBoundingClientRect();
        const off = r.width < 1 || r.height < 1 || r.bottom < 64 || r.top > window.innerHeight - 96 || r.right < 0 || r.left > window.innerWidth;
        if (off) first.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
      }
      setDomBox(unionRect(sel));
    };
    measure();
    const id = window.setInterval(measure, 200);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [view.selector, reduceMotion]);

  const rect = view.selector ? domBox : roomBox;
  const total = 7;
  const boxRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState(DEFAULT_TOUR_VIEWPORT);
  const [boxSize, setBoxSize] = useState({ width: 560, height: 188 });
  const placed = rect ? placeTourBox(rect, viewport, boxSize) : null;
  const arrow = rect && placed ? arrowFor(placed.side, rect, viewport) : null;

  useLayoutEffect(() => {
    const read = () => setViewport({ width: window.innerWidth || DEFAULT_TOUR_VIEWPORT.width, height: window.innerHeight || DEFAULT_TOUR_VIEWPORT.height });
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, []);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setBoxSize(prev => (Math.abs(prev.width - r.width) < 1 && Math.abs(prev.height - r.height) < 1 ? prev : { width: r.width, height: r.height }));
  }, [view.id, view.title, view.body, view.showNext, placed?.side, placed?.width]);

  return (
    <div className="fixed inset-0 z-[70] pointer-events-none" data-testid="guided-tour" data-tour-step={view.id} data-tour-part={part}>
      {rect && (
        <div
          data-testid="tour-spot"
          className="fixed rounded-xl pointer-events-none"
          style={{ left: rect.left - 8, top: rect.top - 8, width: Math.max(8, rect.width + 16), height: Math.max(8, rect.height + 16), boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.72)' }}
        />
      )}
      {rect && arrow && (
        <div
          data-testid="tour-arrow"
          data-side={placed?.side}
          data-motion={reduceMotion ? 'off' : 'bounce'}
          className="fixed pointer-events-none text-amber-300"
          style={{
            left: arrow.left,
            top: arrow.top,
            animation: reduceMotion ? undefined : 'tour-bob 0.7s ease-in-out infinite'
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden style={{ transform: arrow.rotate ? `rotate(${arrow.rotate}deg)` : undefined }}>
            <path d="M10 16 L4 6 H16 Z" fill="#f5c451" stroke="#1b1822" strokeWidth="1" />
          </svg>
        </div>
      )}
      <div
        ref={boxRef}
        data-testid="tour-callout"
        data-side={placed?.side || 'bottom'}
        className="fixed w-[min(36rem,calc(100%-2rem))] max-w-[36rem] pointer-events-auto"
        style={placed
          ? { left: placed.left, top: placed.top, width: placed.width }
          : { left: '50%', bottom: 16, transform: 'translateX(-50%)' }}
      >
        <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-4 shadow-2xl text-slate-100">
          <div className="text-xs text-amber-300 font-bold">{step + 1} / {total} · {view.title}</div>
          <p className="mt-2 text-sm leading-relaxed">{view.body}</p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={onSkip} className="px-3 py-1.5 text-xs text-slate-400" data-testid="tour-skip">Skip tutorial</button>
            {view.showNext && (
              <button type="button" onClick={onNext} className="px-4 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-sm font-bold" data-testid="tour-next">
                {view.id === 'draw' ? 'Done' : 'Next'}
              </button>
            )}
          </div>
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
