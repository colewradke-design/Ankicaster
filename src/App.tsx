/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Ankicaster - Magic Academy School Simulation & Honest Anki Spaced-Repetition Economy
 * Complete implementation based on GDD specification
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  FullGameState,
  PlacedRoom,
  SchoolType,
  CareerType,
  DraftCard,
  SchoolEvent
} from './types/ankicaster';
import { createInitialGameState } from './data/initialState';
import { AnkicasterEngine } from './utils/engine';
import {
  ROOM_DEFINITIONS,
  FURNITURE_DEFINITIONS,
  SCHOOL_EVENTS,
  RIFT_DESTINATIONS
} from './data/content';
import {
  calculateRoomQuality,
  calculateRoomEfficiency,
  calculateStudentSkill
} from './utils/formulas';

// Components
import { TopBar } from './components/TopBar';
import { CastleGrid } from './components/CastleGrid';
import { FlashcardReviewer } from './components/FlashcardReviewer';
import {
  WizardStudyPanel,
  RosterPanel,
  RecruitmentPanel,
  BuildMenuPanel,
  CardDraftPanel,
  AlchemyPanel,
  RiftPanel
} from './components/GamePanels';

// Icons
import {
  Castle,
  BookOpen,
  Sparkles,
  Users,
  GraduationCap,
  Hammer,
  Layers,
  FlaskConical,
  Compass,
  HelpCircle,
  Settings as SettingsIcon,
  Moon,
  Sun,
  X,
  CheckCircle2,
  AlertTriangle,
  Wrench,
  Bed,
  Heart,
  Volume2,
  VolumeX,
  RotateCcw
} from 'lucide-react';

const STORAGE_KEY = 'ankicaster_save_v1';

export default function App() {
  // Load state from localStorage or initial state
  const [state, setState] = useState<FullGameState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to load saved state:', e);
    }
    return createInitialGameState();
  });

  // Active Main Navigation Tab
  type TabType =
    | 'castle'
    | 'reviewer'
    | 'study'
    | 'roster'
    | 'recruitment'
    | 'build'
    | 'draft'
    | 'alchemy'
    | 'rift';

  const [activeTab, setActiveTab] = useState<TabType>('castle');

  // Modals & Active Inspector State
  const [selectedRoom, setSelectedRoom] = useState<PlacedRoom | null>(null);
  const [isDraftModalOpen, setIsDraftModalOpen] = useState(false);
  const [draftChoices, setDraftChoices] = useState<DraftCard[]>([]);
  const [isDaySummaryOpen, setIsDaySummaryOpen] = useState(false);
  const [daySummaryItems, setDaySummaryItems] = useState<string[]>([]);
  const [activeEventModal, setActiveEventModal] = useState<SchoolEvent | null>(null);
  const [isCodexOpen, setIsCodexOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [furnishCategory, setFurnishCategory] = useState<string>('all');

  // Transient feedback toasts
  const [toasts, setToasts] = useState<Array<{ id: string; text: string; type: string }>>([]);

  // Auto-save state
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Save failed:', e);
    }
  }, [state]);

  // Audio synthesizer chime helper
  const playChime = useCallback((type: 'review' | 'bell' | 'mastery' | 'build') => {
    if (!state.settings.sound) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'review') {
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      } else if (type === 'bell') {
        osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
        osc.start();
        osc.stop(ctx.currentTime + 0.8);
      } else if (type === 'mastery') {
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc.frequency.exponentialRampToValueAtTime(1046.5, ctx.currentTime + 0.3); // C6
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
        osc.start();
        osc.stop(ctx.currentTime + 0.6);
      }
    } catch {
      // AudioContext policy safe catch
    }
  }, [state.settings.sound]);

  // Add toast notification
  const addToast = (text: string, type: string = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev.slice(-4), { id, text, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4200);
  };

  // Check notices for new events
  useEffect(() => {
    if (state.activeEvents.length > 0 && !activeEventModal) {
      const topEventId = state.activeEvents[0].eventId;
      const evt = SCHOOL_EVENTS.find(e => e.id === topEventId);
      if (evt) {
        setActiveEventModal(evt);
      }
    }
  }, [state.activeEvents, activeEventModal]);

  // Handler: Honest Review Answer
  const handleAnswerCard = (cardId: number, ease: 1 | 2 | 3 | 4) => {
    const result = AnkicasterEngine.applyHonestReview(state, cardId, ease);
    setState(result.state);

    if (result.toast) {
      addToast(result.toast, ease === 1 ? 'warning' : 'success');
    }
    result.notifications.forEach(n => addToast(n, 'notice'));

    if (result.state.bellIndex > state.bellIndex) {
      playChime('bell');
    } else {
      playChime('review');
    }
  };

  // Handler: Batch Simulation of Honest Reviews
  const handleSimulateBatch = (count: number) => {
    let curState = state;
    const cardIds = Object.keys(curState.allCards).map(Number);
    for (let i = 0; i < count; i++) {
      const randomCardId = cardIds[Math.floor(Math.random() * cardIds.length)];
      const randomEase = (Math.floor(Math.random() * 3) + 2) as 2 | 3 | 4; // Hard/Good/Easy
      const res = AnkicasterEngine.applyHonestReview(curState, randomCardId, randomEase);
      curState = res.state;
    }
    setState(curState);
    playChime('bell');
    addToast(`Completed ${count} simulated honest reviews (+${count * 10} Mana)!`, 'success');
  };

  // Handler: Day Rollover
  const handleNextDay = () => {
    const { state: nextState, summary } = AnkicasterEngine.triggerDayTick(state);
    setState(nextState);
    setDaySummaryItems(summary);
    setIsDaySummaryOpen(true);
  };

  // Handler: Wizard Queue Session
  const handleQueueWizardSession = (school: SchoolType, isGrimoire?: boolean, spellId?: string) => {
    const res = AnkicasterEngine.queueWizardSession(state, school, isGrimoire, spellId);
    if (!res.success) {
      addToast(res.error || 'Failed to queue session', 'warning');
    } else {
      setState(res.state);
      addToast(`Orb session queued for ${school.toUpperCase()}!`, 'success');
      playChime('review');
    }
  };

  // Handler: Wizard Cast Spell
  const handleCastSpell = (spellId: string) => {
    const res = AnkicasterEngine.castSpell(state, spellId);
    if (!res.success) {
      addToast(res.error || 'Failed to cast spell', 'warning');
    } else {
      setState(res.state);
      addToast(res.notice || 'Spell cast successfully!', 'success');
      playChime('mastery');
    }
  };

  // Handler: Enroll Student
  const handleEnrollStudent = (
    school: SchoolType,
    name: string,
    personality: any,
    traits: string[]
  ) => {
    const res = AnkicasterEngine.enrollStudent(state, school, name, personality, traits);
    if (!res.success) {
      addToast(res.error || 'Enrollment blocked.', 'warning');
    } else {
      setState(res.state);
      confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
      addToast(`🎓 ${name} enrolled into ${school.toUpperCase()} with 50 cards linked!`, 'success');
      playChime('mastery');
    }
  };

  // Handler: Assign Career
  const handleAssignCareer = (charId: number, career: CareerType) => {
    const res = AnkicasterEngine.assignCareer(state, charId, career);
    if (!res.success) {
      addToast(res.error || 'Career assignment failed', 'warning');
    } else {
      setState(res.state);
      addToast(`Career appointed: ${career.toUpperCase()}!`, 'success');
      playChime('mastery');
    }
  };

  // Handler: Place Room
  const handlePlaceRoom = (defId: string, area: 'castle' | 'grounds') => {
    const res = AnkicasterEngine.placeRoom(state, defId, area);
    if (!res.success) {
      addToast(res.error || 'Cannot build room.', 'warning');
    } else {
      setState(res.state);
      addToast(`New room commissioned!`, 'success');
      playChime('review');
      setActiveTab('castle');
    }
  };

  // Handler: Draw Draft Deck
  const handleDrawDeck = (deck: 'foundation' | SchoolType) => {
    const res = AnkicasterEngine.drawDraftCards(state, deck);
    if (res.error) {
      addToast(res.error, 'warning');
    } else {
      setState(res.state);
      setDraftChoices(res.cards);
      setIsDraftModalOpen(true);
      playChime('review');
    }
  };

  // Handler: Pick Draft Card
  const handleSelectDraftCard = (card: DraftCard) => {
    const res = AnkicasterEngine.chooseDraftCard(state, card);
    setState(res.state);
    setIsDraftModalOpen(false);
    confetti({ particleCount: 40, spread: 60 });
    addToast(res.message, 'success');
  };

  // Handler: Brew Potion
  const handleBrewPotion = (potionId: string) => {
    const res = AnkicasterEngine.brewPotion(state, potionId);
    if (!res.success) {
      addToast(res.error || 'Failed to brew.', 'warning');
    } else {
      setState(res.state);
      addToast('Potion brewed in laboratory!', 'success');
      playChime('review');
    }
  };

  // Handler: Launch Expedition
  const handleLaunchExpedition = (destId: string, teamIds: number[]) => {
    const res = AnkicasterEngine.launchRiftExpedition(state, destId, teamIds);
    if (!res.success) {
      addToast(res.error || 'Expedition launch blocked.', 'warning');
    } else {
      setState(res.state);
      confetti({ particleCount: 50, spread: 50, origin: { y: 0.5 } });
      addToast(`Expedition launched through the Rift!`, 'success');
      playChime('bell');
    }
  };

  // Handler: Resolve Event Choice
  const handleResolveEventOption = (action: string) => {
    if (!activeEventModal) return;
    const res = AnkicasterEngine.resolveEvent(state, activeEventModal.id, action);
    setState(res.state);
    setActiveEventModal(null);
    addToast(res.summary, 'success');
  };

  // Refresh Selected Room Reference if State Changes
  const currentSelectedRoom = selectedRoom
    ? state.rooms.find(r => r.id === selectedRoom.id) || null
    : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none antialiased">
      {/* Top Header Status Bar */}
      <TopBar
        state={state}
        onOpenCodex={() => setIsCodexOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Gate Event Notification Banner */}
      {state.activeEvents.length > 0 && (
        <div className="bg-gradient-to-r from-amber-950/80 via-amber-900/40 to-slate-950 border-b border-amber-600/40 px-4 py-2 flex items-center justify-between text-xs text-amber-200 shadow-md">
          <div className="flex items-center gap-2">
            <span className="text-base animate-bounce">📜</span>
            <span className="font-semibold">Event at Academy Gates:</span>
            <span className="text-amber-300">
              {SCHOOL_EVENTS.find(e => e.id === state.activeEvents[0].eventId)?.name || 'A traveler has arrived!'}
            </span>
          </div>
          <button
            onClick={() => {
              const evt = SCHOOL_EVENTS.find(e => e.id === state.activeEvents[0].eventId);
              if (evt) setActiveEventModal(evt);
            }}
            className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 rounded text-xs font-bold transition shadow"
          >
            Attend Gate
          </button>
        </div>
      )}

      {/* Main Tab Navigation */}
      <nav className="bg-slate-900/90 backdrop-blur border-b border-slate-800 px-4 py-2 flex items-center gap-1.5 overflow-x-auto scrollbar-none sticky top-10 z-30 shadow-md">
        <button
          onClick={() => setActiveTab('castle')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
            activeTab === 'castle'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-inner'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Castle className="w-3.5 h-3.5 text-amber-400" />
          Castle &amp; Grounds
        </button>

        <button
          onClick={() => setActiveTab('reviewer')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
            activeTab === 'reviewer'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-inner'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5 text-sky-400" />
          Anki Gateway
          <span className="bg-sky-950/80 text-sky-300 text-[10px] px-1.5 py-0.2 rounded border border-sky-800 font-mono">
            +10⚡
          </span>
        </button>

        <button
          onClick={() => setActiveTab('study')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
            activeTab === 'study'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-inner'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          Wizard Study
        </button>

        <button
          onClick={() => setActiveTab('roster')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
            activeTab === 'roster'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-inner'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Users className="w-3.5 h-3.5 text-emerald-400" />
          Students &amp; Faculty
          <span className="bg-slate-800 text-slate-300 text-[10px] px-1.5 py-0.2 rounded font-mono">
            {state.characters.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('recruitment')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
            activeTab === 'recruitment'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-inner'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <GraduationCap className="w-3.5 h-3.5 text-amber-400" />
          Admissions
        </button>

        <button
          onClick={() => setActiveTab('build')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
            activeTab === 'build'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-inner'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Hammer className="w-3.5 h-3.5 text-amber-500" />
          Architect
        </button>

        <button
          onClick={() => setActiveTab('draft')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
            activeTab === 'draft'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-inner'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-indigo-400" />
          Grimoire Draft
        </button>

        <button
          onClick={() => setActiveTab('alchemy')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
            activeTab === 'alchemy'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-inner'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <FlaskConical className="w-3.5 h-3.5 text-orange-400" />
          Alchemy Lab
        </button>

        <button
          onClick={() => setActiveTab('rift')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
            activeTab === 'rift'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-inner'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Compass className="w-3.5 h-3.5 text-rose-400" />
          The Rift
          {state.expeditions.some(e => e.state === 'active') && (
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          )}
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleNextDay}
            className="flex items-center gap-1 px-3 py-1 bg-indigo-900/40 hover:bg-indigo-900/60 text-indigo-200 border border-indigo-700/50 rounded-lg text-xs font-bold transition shadow"
            title="Advance Day and calculate Veil upkeep"
          >
            <Moon className="w-3 h-3 text-indigo-300" />
            <span>Day {state.day} Rollover</span>
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 p-4 max-w-7xl mx-auto w-full">
        {activeTab === 'castle' && (
          <div className="space-y-4">
            <CastleGrid
              state={state}
              onSelectRoom={room => setSelectedRoom(room)}
              selectedRoomId={selectedRoom?.id}
            />

            {/* Compact Anki Quick Bar Under Castle */}
            <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl flex items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-3">
                <span className="font-bold text-amber-300 flex items-center gap-1">
                  ⚡ Mana Study Gateway:
                </span>
                <span className="text-slate-400 hidden sm:inline">
                  Every honest review awards +10 neutral Mana.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleSimulateBatch(1)}
                  className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded font-semibold transition"
                >
                  +1 Quick Review
                </button>
                <button
                  onClick={() => handleSimulateBatch(10)}
                  className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/50 rounded font-semibold transition"
                >
                  +10 Batch (Ring Bell)
                </button>
                <button
                  onClick={() => setActiveTab('reviewer')}
                  className="px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded shadow transition"
                >
                  Open Study Desk
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'reviewer' && (
          <div className="max-w-2xl mx-auto py-2">
            <FlashcardReviewer
              cards={state.allCards}
              onAnswerCard={handleAnswerCard}
              onSimulateBatch={handleSimulateBatch}
            />
          </div>
        )}

        {activeTab === 'study' && (
          <WizardStudyPanel
            state={state}
            onQueueSession={handleQueueWizardSession}
            onCastSpell={handleCastSpell}
          />
        )}

        {activeTab === 'roster' && (
          <RosterPanel state={state} onAssignCareer={handleAssignCareer} />
        )}

        {activeTab === 'recruitment' && (
          <RecruitmentPanel state={state} onEnroll={handleEnrollStudent} />
        )}

        {activeTab === 'build' && (
          <BuildMenuPanel state={state} onPlaceRoom={handlePlaceRoom} />
        )}

        {activeTab === 'draft' && (
          <CardDraftPanel state={state} onDrawDeck={handleDrawDeck} />
        )}

        {activeTab === 'alchemy' && (
          <AlchemyPanel state={state} onBrewPotion={handleBrewPotion} />
        )}

        {activeTab === 'rift' && (
          <RiftPanel state={state} onLaunchExpedition={handleLaunchExpedition} />
        )}
      </main>

      {/* Floating Notice Toasts */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`px-4 py-2.5 rounded-lg border text-xs shadow-2xl backdrop-blur transition-all duration-300 ${
              toast.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
                : toast.type === 'warning'
                ? 'bg-amber-950/90 border-amber-500/50 text-amber-200'
                : 'bg-slate-900/90 border-slate-700 text-slate-200'
            }`}
          >
            {toast.text}
          </div>
        ))}
      </div>

      {/* MODAL 1: ROOM INSPECTOR & FURNITURE PLACEMENT */}
      {currentSelectedRoom && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-900/40 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-6">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-amber-300">
                    {ROOM_DEFINITIONS[currentSelectedRoom.defId]?.name || currentSelectedRoom.defId}
                  </h3>
                  <span className="text-xs bg-amber-500/20 border border-amber-500/40 text-amber-200 px-2 py-0.5 rounded font-bold">
                    Level {currentSelectedRoom.level}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    ({currentSelectedRoom.area === 'castle' ? `F${currentSelectedRoom.y}` : 'Sacred Grounds'})
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {ROOM_DEFINITIONS[currentSelectedRoom.defId]?.description}
                </p>
              </div>
              <button
                onClick={() => setSelectedRoom(null)}
                className="p-1 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Room Stats & Efficiency Breakdown (Formula F19) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Quality Tier</span>
                {(() => {
                  const { q, tier } = calculateRoomQuality(currentSelectedRoom);
                  return (
                    <span className="font-bold text-amber-300 capitalize">
                      {tier} (Q: {Math.round(q)})
                    </span>
                  );
                })()}
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Cleanliness</span>
                <span className="font-bold text-slate-200">
                  {Math.round(currentSelectedRoom.cleanliness)}%
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Daily Veil</span>
                <span className="font-bold text-indigo-300">
                  {ROOM_DEFINITIONS[currentSelectedRoom.defId]?.veil || 4} Mana
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Efficiency</span>
                {(() => {
                  const eff = calculateRoomEfficiency(currentSelectedRoom, true, true);
                  return (
                    <span className="font-bold text-emerald-300">
                      {(eff * 100).toFixed(0)}%
                    </span>
                  );
                })()}
              </div>
            </div>

            {/* Renovation Upgrade Button */}
            {currentSelectedRoom.level < 3 && (
              <div className="bg-amber-950/30 border border-amber-600/30 p-3.5 rounded-xl flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-amber-200">
                    Renovate to Level {currentSelectedRoom.level + 1}
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    +2 optional furniture slots, improved efficiency, and unlocks Level 3 perk.
                  </p>
                </div>
                <button
                  onClick={() => {
                    const res = AnkicasterEngine.upgradeRoom(state, currentSelectedRoom.id);
                    if (!res.success) addToast(res.error || 'Upgrade failed', 'warning');
                    else {
                      setState(res.state);
                      addToast('Room renovated to next level!', 'success');
                      playChime('mastery');
                    }
                  }}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-lg shadow transition"
                >
                  Upgrade (
                  {Math.round((ROOM_DEFINITIONS[currentSelectedRoom.defId]?.cost.mana || 100) * 0.75) + 50} Mana)
                </button>
              </div>
            )}

            {/* Placed Furniture List */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Installed Furniture &amp; Fixtures ({currentSelectedRoom.furniture.length} items)
                </h4>
              </div>

              {currentSelectedRoom.furniture.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-500 bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
                  No furniture installed yet. Choose fixtures below to furnish this room.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {currentSelectedRoom.furniture.map(f => {
                    const fDef = FURNITURE_DEFINITIONS[f.defId];
                    return (
                      <div
                        key={f.id}
                        className="bg-slate-950/80 border border-slate-800 p-2.5 rounded-lg flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-semibold text-slate-200">{fDef?.name || f.defId}</div>
                          <div className="text-[10px] text-slate-500">
                            {f.slotKind.startsWith('required:') ? 'Required Fixture' : 'Optional Furnishing'}
                          </div>
                        </div>
                        {!f.slotKind.startsWith('required:') && (
                          <button
                            onClick={() => {
                              const res = AnkicasterEngine.removeFurniture(state, currentSelectedRoom.id, f.id);
                              if (res.success) setState(res.state);
                            }}
                            className="text-[11px] text-rose-400 hover:text-rose-300 px-2 py-0.5"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Furnish Room: Available Options */}
            <div className="border-t border-slate-800 pt-4">
              <h4 className="text-xs font-bold text-amber-200 mb-2">
                Install New Furniture
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                {Object.values(FURNITURE_DEFINITIONS)
                  .filter(f => f.role !== 'required')
                  .slice(0, 8)
                  .map(fDef => (
                    <div
                      key={fDef.id}
                      className="bg-slate-950 border border-slate-800/80 p-2.5 rounded-lg flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-semibold text-slate-200">{fDef.name}</div>
                        <div className="text-[10px] text-slate-400">
                          {fDef.cost.mana} Mana · {fDef.cost.timber || 0} Timber
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          const res = AnkicasterEngine.addFurniture(state, currentSelectedRoom.id, fDef.id);
                          if (!res.success) addToast(res.error || 'Cannot install', 'warning');
                          else {
                            setState(res.state);
                            addToast(`Installed ${fDef.name}!`, 'success');
                            playChime('review');
                          }
                        }}
                        className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded text-xs font-bold"
                      >
                        Install
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: GRIMOIRE CARD DRAFT PICKER (DRAW 3, KEEP 1) */}
      {isDraftModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-purple-500/50 rounded-2xl w-full max-w-3xl p-6 shadow-2xl space-y-6">
            <div className="text-center">
              <span className="text-xs font-bold uppercase tracking-widest text-purple-400">
                Rule BR-26 Arcane Inscription
              </span>
              <h3 className="text-xl font-bold text-amber-200 mt-1">
                The Grimoire Reveals Three Destinies
              </h3>
              <p className="text-xs text-slate-400">
                Choose one card to keep. The other two return to the celestial archives.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {draftChoices.map(card => {
                const rarityColor =
                  card.rarity === 'legendary'
                    ? 'border-amber-400 bg-amber-950/40 text-amber-200'
                    : card.rarity === 'epic'
                    ? 'border-purple-400 bg-purple-950/40 text-purple-200'
                    : card.rarity === 'rare'
                    ? 'border-sky-400 bg-sky-950/40 text-sky-200'
                    : card.rarity === 'uncommon'
                    ? 'border-emerald-400 bg-emerald-950/40 text-emerald-200'
                    : 'border-slate-700 bg-slate-950/60 text-slate-200';

                return (
                  <div
                    key={card.id}
                    className={`border-2 rounded-xl p-4 flex flex-col justify-between shadow-xl transition transform hover:scale-[1.02] ${rarityColor}`}
                  >
                    <div>
                      <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider mb-2">
                        <span>{card.deck} Deck</span>
                        <span className="font-bold">{card.rarity}</span>
                      </div>
                      <h4 className="font-bold text-sm text-slate-100 mb-1">{card.name}</h4>
                      <span className="inline-block text-[10px] bg-slate-900/80 px-2 py-0.5 rounded font-mono mb-2 capitalize">
                        {card.type.replace('_', ' ')}
                      </span>
                      <p className="text-xs text-slate-300 leading-relaxed">{card.description}</p>
                    </div>

                    <button
                      onClick={() => handleSelectDraftCard(card)}
                      className="mt-4 w-full py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs rounded-lg shadow-lg transition"
                    >
                      Choose This Card
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: ACADEMY GATE EVENT */}
      {activeEventModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/50 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">📜</span>
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400">
                  Academy Threshold Event
                </span>
                <h3 className="text-lg font-bold text-amber-200">{activeEventModal.name}</h3>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
              {activeEventModal.description}
            </p>

            <div className="space-y-2 pt-2">
              {activeEventModal.options.map((opt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleResolveEventOption(opt.action)}
                  className="w-full text-left p-3 rounded-xl border border-slate-800 bg-slate-950 hover:bg-amber-950/20 hover:border-amber-500/40 transition flex items-center justify-between text-xs"
                >
                  <span className="font-semibold text-slate-200">{opt.text}</span>
                  <div className="text-right">
                    {opt.cost && <div className="text-[10px] text-rose-400">Cost: {opt.cost}</div>}
                    <div className="text-[11px] font-bold text-emerald-400">{opt.reward}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: DAY ROLLOVER SUMMARY */}
      {isDaySummaryOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-indigo-500/40 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <Moon className="w-6 h-6 text-indigo-400" />
              <div>
                <h3 className="text-base font-bold text-indigo-200">
                  Dawn Breaks: Day {state.day}
                </h3>
                <p className="text-xs text-slate-400">
                  Veil upkeep processed and overnight events resolved.
                </p>
              </div>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto text-xs pr-1">
              {daySummaryItems.map((item, idx) => (
                <div
                  key={idx}
                  className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80 text-slate-300 flex items-start gap-2"
                >
                  <span className="text-indigo-400 font-bold">•</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => setIsDaySummaryOpen(false)}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow transition"
            >
              Greet the Morning
            </button>
          </div>
        </div>
      )}

      {/* MODAL 5: CODEX & PHILOSOPHY GUIDE */}
      {isCodexOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-900/40 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 shadow-2xl space-y-4 text-xs text-slate-300">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-amber-300 flex items-center gap-2">
                📖 Ankicaster Codex &amp; Core Philosophy
              </h3>
              <button
                onClick={() => setIsCodexOpen(false)}
                className="text-slate-400 hover:text-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <h4 className="font-bold text-amber-200 mb-1">
                  BR-01: Neutral Mana Economy
                </h4>
                <p>
                  Mana is earned only from honest flashcard reviews (+10 per review). Past history grants nothing.
                  All answer buttons (Again, Hard, Good, Easy) grant equal mana. You never earn more by rushing or pressing Good.
                </p>
              </div>

              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <h4 className="font-bold text-emerald-200 mb-1">
                  BR-04: Breaks Are Safe (Sleep Under the Veil)
                </h4>
                <p>
                  Taking a break never deletes your school or characters. If you step away, the Academy enters
                  a restful state under the Veil, auto-paying upkeep down to a safe floor.
                </p>
              </div>

              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <h4 className="font-bold text-sky-200 mb-1">
                  BR-11 to BR-23: Linked Constellations
                </h4>
                <p>
                  Each student links to 50 of your youngest free flashcards. Their skill level directly mirrors
                  your actual memory retention (card intervals). When all 50 cards exceed 30 days maturity,
                  they achieve Master status and can be appointed to faculty or expeditions!
                </p>
              </div>

              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <h4 className="font-bold text-rose-200 mb-1">
                  BR-27 to BR-33: The Perilous Rift (Zero Permadeath)
                </h4>
                <p>
                  At 3 masters, the Rift opens. Teams of 1–3 adventurers explore 5 dangerous realms. Their safe odds
                  scale with their linked flashcard intervals. Per the Ankicaster promise, heroes never die; they may suffer
                  injuries that rest in the Infirmary while you continue studying.
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsCodexOpen(false)}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg transition"
            >
              Close Codex
            </button>
          </div>
        </div>
      )}

      {/* MODAL 6: SETTINGS & SIMULATION CONTROLS */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-200 flex items-center gap-2">
                <SettingsIcon className="w-4 h-4 text-slate-400" />
                Academy Settings
              </h3>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="text-slate-400 hover:text-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span>Sound Chimes</span>
                <button
                  onClick={() => {
                    setState(prev => ({
                      ...prev,
                      settings: { ...prev.settings, sound: !prev.settings.sound }
                    }));
                  }}
                  className={`px-3 py-1 rounded text-xs font-bold ${
                    state.settings.sound ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {state.settings.sound ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              <div className="flex items-center justify-between bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span>Daily Veil Upkeep</span>
                <span className="font-semibold text-indigo-300">Auto-Pay (BR-25 Safe Floor)</span>
              </div>

              <div className="flex items-center justify-between bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span>Flashcards per Student</span>
                <span className="font-mono text-amber-300 font-bold">50 Cards (BR-11)</span>
              </div>

              <div className="border-t border-slate-800 pt-3">
                <button
                  onClick={() => {
                    if (window.confirm('Reset the academy and start fresh? All progress will be re-initialized.')) {
                      const fresh = createInitialGameState();
                      setState(fresh);
                      localStorage.removeItem(STORAGE_KEY);
                      setIsSettingsOpen(false);
                      addToast('Academy restarted afresh!', 'info');
                    }
                  }}
                  className="w-full py-2 bg-rose-950/60 hover:bg-rose-900 text-rose-200 border border-rose-800/60 font-bold rounded-lg transition"
                >
                  Restart Academy (Reset State)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
