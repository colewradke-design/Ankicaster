/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Interactive Flashcard Study Simulator & Anki Gateway
 * Provides honest review simulation (Again, Hard, Good, Easy) directly in the UI.
 * Enforces Rule H5 (anti-mash guard: answers < 0.8s grant zero mana).
 * Flashcard database access is strictly read-only; never touches Anki scheduling.
 */

import React, { useState, useEffect, useRef } from 'react';
import { AnkiCardSnapshot } from '../types/ankicaster';
import { Sparkles, CheckCircle2, RotateCcw, AlertTriangle, Clock } from 'lucide-react';

interface FlashcardReviewerProps {
  cards: Record<number, AnkiCardSnapshot>;
  onAnswerCard: (cardId: number, ease: 1 | 2 | 3 | 4, elapsedMs: number) => void;
  onSimulateBatch: (count: number) => void;
  devMode?: boolean;
}

export const FlashcardReviewer: React.FC<FlashcardReviewerProps> = ({
  cards,
  onAnswerCard,
  onSimulateBatch,
  devMode = false
}) => {
  const cardList = Object.values(cards);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const cardShownTimeRef = useRef<number>(Date.now());
  const [lastElapsedSec, setLastElapsedSec] = useState<number | null>(null);

  const activeCard = cardList[currentIndex % Math.max(1, cardList.length)];

  // Record card show time whenever card changes or question is presented
  useEffect(() => {
    cardShownTimeRef.current = Date.now();
    setShowAnswer(false);
  }, [currentIndex, activeCard?.id]);

  const handleAnswer = (ease: 1 | 2 | 3 | 4) => {
    if (!activeCard) return;
    const now = Date.now();
    const elapsedMs = now - cardShownTimeRef.current;
    setLastElapsedSec(Math.round(elapsedMs / 100) / 10);

    onAnswerCard(activeCard.id, ease, elapsedMs);
    setShowAnswer(false);
    setCurrentIndex(prev => prev + 1);
  };

  return (
    <div className="bg-slate-900 border border-amber-900/40 rounded-2xl p-5 shadow-2xl text-slate-100 max-w-2xl mx-auto space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm md:text-base font-bold text-amber-300 flex items-center gap-2">
            🗂️ Anki Study Gateway
          </span>
          <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md font-mono border border-slate-700">
            {activeCard?.deckName || 'Default'}
          </span>
        </div>

        {/* Developer batch review buttons (hidden unless devMode is active) */}
        {devMode && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-amber-400 font-mono text-xs hidden sm:inline">[DEV MODE]:</span>
            <button
              onClick={() => onSimulateBatch(1)}
              className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-semibold transition"
              title="Simulate 1 Honest Review (+10 Mana)"
            >
              +1 Review
            </button>
            <button
              onClick={() => onSimulateBatch(10)}
              className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-semibold transition"
              title="Simulate 10 Honest Reviews (+100 Mana & Rings Bell)"
            >
              +10 Reviews
            </button>
          </div>
        )}
      </div>

      {/* Honest study timing feedback badge */}
      {lastElapsedSec !== null && (
        <div className={`p-2 rounded-lg text-xs flex items-center justify-between border ${
          lastElapsedSec < 0.8
            ? 'bg-rose-950/70 border-rose-500/50 text-rose-200'
            : 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
        }`}>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>Last Answer Time: <strong>{lastElapsedSec}s</strong></span>
          </div>
          {lastElapsedSec < 0.8 ? (
            <span className="font-bold text-rose-300">Too Fast (&lt;0.8s) · 0 Mana Earned (Rule H5)</span>
          ) : (
            <span className="font-bold text-emerald-300">Honest Pace · +10 Neutral Mana Earned</span>
          )}
        </div>
      )}

      {/* Active Card Body */}
      {activeCard ? (
        <div className="flex flex-col items-center justify-center p-6 bg-slate-950/80 border border-slate-800 rounded-xl min-h-[180px] text-center shadow-inner">
          <div className="text-xs uppercase tracking-widest text-slate-400 font-bold mb-2">
            Front (Prompt)
          </div>
          <div className="text-sm md:text-base font-semibold text-slate-100 max-w-xl leading-relaxed">
            {activeCard.front}
          </div>

          {showAnswer ? (
            <div className="mt-4 pt-4 border-t border-slate-800 w-full animate-fadeIn space-y-2">
              <div className="text-xs uppercase tracking-widest text-amber-400 font-bold">
                Back (Answer)
              </div>
              <div className="text-sm text-slate-200 max-w-xl mx-auto leading-relaxed">
                {activeCard.back}
              </div>
              <div className="text-xs text-slate-400 pt-2 font-mono">
                Current Memory Retention: <strong>{activeCard.honestIvl} days</strong> interval
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAnswer(true)}
              className="mt-5 px-6 py-2 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/50 rounded-xl text-xs font-bold transition shadow-lg"
            >
              Show Answer (Space)
            </button>
          )}
        </div>
      ) : (
        <div className="text-center text-xs text-slate-400 py-10">
          No flashcards currently in collection.
        </div>
      )}

      {/* Spaced Repetition Answering Buttons */}
      {showAnswer && (
        <div className="space-y-2 pt-1">
          <div className="text-xs text-center text-slate-400">
            Grade your honest memory recall. All 4 buttons award identical mana (+10 neutral mana).
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <button
              onClick={() => handleAnswer(1)}
              className="py-2.5 px-2 bg-red-950/50 hover:bg-red-900/60 text-red-200 border border-red-700/50 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center gap-0.5 shadow"
            >
              <span>1. Again</span>
              <span className="text-xs text-red-300 font-normal">Lapse (1 day)</span>
            </button>
            <button
              onClick={() => handleAnswer(2)}
              className="py-2.5 px-2 bg-amber-950/50 hover:bg-amber-900/60 text-amber-200 border border-amber-700/50 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center gap-0.5 shadow"
            >
              <span>2. Hard</span>
              <span className="text-xs text-amber-300 font-normal">+20% ivl</span>
            </button>
            <button
              onClick={() => handleAnswer(3)}
              className="py-2.5 px-2 bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-200 border border-emerald-700/50 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center gap-0.5 shadow"
            >
              <span>3. Good</span>
              <span className="text-xs text-emerald-300 font-normal">+120% ivl</span>
            </button>
            <button
              onClick={() => handleAnswer(4)}
              className="py-2.5 px-2 bg-sky-950/50 hover:bg-sky-900/60 text-sky-200 border border-sky-700/50 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center gap-0.5 shadow"
            >
              <span>4. Easy</span>
              <span className="text-xs text-sky-300 font-normal">+180% ivl</span>
            </button>
          </div>
        </div>
      )}

      <div className="text-xs text-slate-400 text-center pt-2 border-t border-slate-800">
        Binding Rule BR-03: Neutral Mana Economy · Flashcard database is strictly read-only · Real answer pace measured
      </div>
    </div>
  );
};
