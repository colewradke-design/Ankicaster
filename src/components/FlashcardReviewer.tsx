/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Interactive Flashcard Study Simulator
 * Provides honest review simulation (Again, Hard, Good, Easy) directly in the UI
 * to generate honest mana, progress bells, and advance the magic academy.
 */

import React, { useState } from 'react';
import { AnkiCardSnapshot } from '../types/ankicaster';
import { Sparkles, CheckCircle2, RotateCcw, AlertTriangle } from 'lucide-react';

interface FlashcardReviewerProps {
  cards: Record<number, AnkiCardSnapshot>;
  onAnswerCard: (cardId: number, ease: 1 | 2 | 3 | 4) => void;
  onSimulateBatch: (count: number) => void;
}

export const FlashcardReviewer: React.FC<FlashcardReviewerProps> = ({
  cards,
  onAnswerCard,
  onSimulateBatch
}) => {
  const cardList = Object.values(cards);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  const activeCard = cardList[currentIndex % cardList.length];

  const handleAnswer = (ease: 1 | 2 | 3 | 4) => {
    if (!activeCard) return;
    onAnswerCard(activeCard.id, ease);
    setShowAnswer(false);
    setCurrentIndex(prev => prev + 1);
  };

  return (
    <div className="bg-slate-900 border border-amber-900/40 rounded-xl p-4 shadow-xl text-slate-200">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-amber-300 flex items-center gap-1.5">
            🗂️ Anki Reviewer Gateway
          </span>
          <span className="text-[11px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
            {activeCard?.deckName}
          </span>
        </div>

        {/* Quick Review Batch Simulators */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400 hidden sm:inline">Simulate Honest Session:</span>
          <button
            onClick={() => onSimulateBatch(1)}
            className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded transition text-xs font-semibold"
            title="Complete 1 Honest Review (+10 Mana)"
          >
            +1 Review
          </button>
          <button
            onClick={() => onSimulateBatch(10)}
            className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded transition text-xs font-semibold"
            title="Complete 10 Honest Reviews (+100 Mana & Rings 1 Bell)"
          >
            +10 Reviews (1 Bell)
          </button>
        </div>
      </div>

      {/* Active Card Body */}
      {activeCard ? (
        <div className="flex flex-col items-center justify-center p-4 bg-slate-950/70 border border-slate-800 rounded-lg min-h-[140px] text-center">
          <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">
            Question
          </div>
          <div className="text-sm font-medium text-slate-100 max-w-xl">
            {activeCard.front}
          </div>

          {showAnswer ? (
            <div className="mt-3 pt-3 border-t border-slate-800/80 w-full animate-fadeIn">
              <div className="text-[11px] uppercase tracking-wider text-amber-400 font-semibold mb-1">
                Answer
              </div>
              <div className="text-xs text-slate-300 max-w-xl mx-auto">
                {activeCard.back}
              </div>
              <div className="text-[10px] text-slate-500 mt-2 font-mono">
                Current Interval: {activeCard.honestIvl} days
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAnswer(true)}
              className="mt-3 px-4 py-1.5 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 rounded-lg text-xs font-semibold transition"
            >
              Show Answer (Space)
            </button>
          )}
        </div>
      ) : (
        <div className="text-center text-xs text-slate-500 py-6">
          No cards available in collection.
        </div>
      )}

      {/* Spaced Repetition Answering Buttons */}
      {showAnswer && (
        <div className="grid grid-cols-4 gap-2 mt-3">
          <button
            onClick={() => handleAnswer(1)}
            className="py-2 px-1 bg-red-950/50 hover:bg-red-900/60 text-red-200 border border-red-700/50 rounded-lg text-xs font-bold transition flex flex-col items-center"
          >
            <span>Again</span>
            <span className="text-[10px] font-normal text-red-400/80">1 day · +10 mana</span>
          </button>
          <button
            onClick={() => handleAnswer(2)}
            className="py-2 px-1 bg-amber-950/50 hover:bg-amber-900/60 text-amber-200 border border-amber-700/50 rounded-lg text-xs font-bold transition flex flex-col items-center"
          >
            <span>Hard</span>
            <span className="text-[10px] font-normal text-amber-400/80">+20% ivl · +10 mana</span>
          </button>
          <button
            onClick={() => handleAnswer(3)}
            className="py-2 px-1 bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-200 border border-emerald-700/50 rounded-lg text-xs font-bold transition flex flex-col items-center"
          >
            <span>Good</span>
            <span className="text-[10px] font-normal text-emerald-400/80">+120% ivl · +10 mana</span>
          </button>
          <button
            onClick={() => handleAnswer(4)}
            className="py-2 px-1 bg-sky-950/50 hover:bg-sky-900/60 text-sky-200 border border-sky-700/50 rounded-lg text-xs font-bold transition flex flex-col items-center"
          >
            <span>Easy</span>
            <span className="text-[10px] font-normal text-sky-400/80">+180% ivl · +10 mana</span>
          </button>
        </div>
      )}

      <div className="text-[11px] text-slate-500 text-center mt-2">
        Binding Rule BR-03: All answer buttons grant identical mana. Honest answering powers true student mastery.
      </div>
    </div>
  );
};
