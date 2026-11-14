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
import { createNewAcademy } from './visual/onboarding/freshStart';
import { CharacterCreationModal } from './visual/onboarding/CharacterCreationModal';
import { FoundingDay, GuidedTour, GoalBanner } from './visual/onboarding/FoundingTour';
import { applyTutorialAction, phaseAfterCreate, STUDY_PARTS, tourOpensDetails, tourStepId, tourView } from './visual/onboarding/flow';
import { AnkicasterEngine } from './utils/engine';
import type { DraftDeckId } from './utils/decks';
import { FURNITURE_DEFINITIONS, ROOM_DEFINITIONS } from './data/content';

// Components
import { TopBar } from './components/TopBar';
import { RoomWindow } from './components/RoomWindow';
import { ScreenWindow } from './components/ScreenWindow';
import { PonderOrbPicker, GrimoireBook } from './components/StudyModals';
import { StoresPanel, JournalPanel, VisitorsPanel } from './components/AcademyPanels';
import { ScreenId, SCREEN_DEFS, getAcademyMenuScreens } from './ui/screens';
import { CastleGrid } from './components/CastleGrid';
import { DemolishConfirm } from './components/DemolishConfirm';
import type { PlacementMode } from './visual/AcademyCanvas';
import { CreatureDebugPanel } from './debug/CreatureDebugPanel';
import { normalizeAppearance } from './utils/appearance';
import { wizardOrbQuote } from './utils/formulas';
import { FlashcardReviewer } from './components/FlashcardReviewer';
import {
  RosterPanel,
  RecruitmentPanel,
  BuildMenuPanel,
  CardDraftPanel,
  BestiaryPanel,
  AlchemyPanel,
  RiftPanel
} from './components/GamePanels';

// Icons
import { GraduationCap, Settings as SettingsIcon, Moon, X } from 'lucide-react';

const STORAGE_KEY = 'ankicaster_save_v2';

export default function App() {
  // Load state from localStorage or initial state
  const [state, setState] = useState<FullGameState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        // Older saves: fill appearance / room spend / inventory defaults
        return AnkicasterEngine.normalizeLoadedState(JSON.parse(saved));
      }
    } catch (e) {
      console.warn('Failed to load saved state:', e);
    }
    return createInitialGameState();
  });

  // Room-based navigation (UI declutter pass): the castle map is always the main view.
  // A management screen opens in a window over it, from a room window or the Academy menu.
  const [openScreen, setOpenScreen] = useState<ScreenId | null>(null);

  // Modals & Active Inspector State
  const [selectedRoom, setSelectedRoom] = useState<PlacedRoom | null>(null);
  const [isDraftModalOpen, setIsDraftModalOpen] = useState(false);
  const [draftChoices, setDraftChoices] = useState<DraftCard[]>([]);
  const [draftTutorial, setDraftTutorial] = useState<string | undefined>();
  const [isDaySummaryOpen, setIsDaySummaryOpen] = useState(false);
  const [daySummaryItems, setDaySummaryItems] = useState<string[]>([]);
  const [activeEventModal, setActiveEventModal] = useState<SchoolEvent | null>(null);
  const [isCodexOpen, setIsCodexOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // In-app reset confirm: window.confirm is blocked in some embedded previews (e.g. AI Studio)
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => { if (!confirmReset) return; const t = setTimeout(() => setConfirmReset(false), 5000); return () => clearTimeout(t); }, [confirmReset]);

  // Character Creation / "Choose Your Look" modal
  // Decided in an effect that runs after add-on hydration (after ankicasterLoadSavedGame)
  const [isCreationModalOpen, setIsCreationModalOpen] = useState<boolean>(false);
  // Opened from "Change look": edit the look only, never re-found the Academy
  const [lookOnly, setLookOnly] = useState(false);
  const [roomBox, setRoomBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  // Transient feedback toasts
  const [toasts, setToasts] = useState<Array<{ id: string; text: string; type: string }>>([]);

  // Check if running inside Anki add-on (QWebEngineView or pycmd bridge)
  const isAddonMode = typeof window !== 'undefined' && (
    new URLSearchParams(window.location.search).get('addon') === '1' ||
    !!(window as any).pycmd ||
    !!(window as any).qt
  );

  // Hydration flag: in addon mode, do NOT auto-save until saved game loads (or null is sent)
  const [hydrated, setHydrated] = useState(!isAddonMode);
  const hydratedRef = useRef(hydrated);
  useEffect(() => {
    hydratedRef.current = hydrated;
  }, [hydrated]);

  // Once hydrated (or immediately in standalone browser mode), check if appearance is missing
  useEffect(() => {
    if (hydrated && !state.wizard.appearance) {
      setIsCreationModalOpen(true);
    }
  }, [hydrated, state.wizard.appearance]);

  // Poll for window.pycmd asynchronously up to timeoutMs (every 50ms)
  const waitForPycmd = useCallback((timeoutMs: number = 10000): Promise<boolean> => {
    return new Promise(resolve => {
      if (typeof (window as any).pycmd === 'function') {
        resolve(true);
        return;
      }
      const startTime = Date.now();
      const interval = setInterval(() => {
        if (typeof (window as any).pycmd === 'function') {
          clearInterval(interval);
          resolve(true);
        } else if (Date.now() - startTime >= timeoutMs) {
          clearInterval(interval);
          resolve(false);
        }
      }, 50);
    });
  }, []);

  // Helper to serialize state without unbounded allCards
  const getSerializableState = (full: FullGameState) => {
    // Collect all linked card IDs
    const linkedIds = new Set<number>();
    for (const set of full.cardSets) {
      if (!set.released) {
        for (const cid of set.cardIds) linkedIds.add(cid);
      }
    }
    // Only store linked cards and their honestIvl
    const compactCards: Record<number, any> = {};
    for (const id of linkedIds) {
      if (full.allCards[id]) {
        compactCards[id] = {
          id,
          honestIvl: full.allCards[id].honestIvl,
          deckName: full.allCards[id].deckName
        };
      }
    }

    const { allCards, ...rest } = full;
    return {
      ...rest,
      allCards: compactCards
    };
  };

  // Auto-save state:
  // - In addon mode: NEVER use localStorage! Only save after hydration, and wait for pycmd
  // - In standalone web mode: save to localStorage
  useEffect(() => {
    if (isAddonMode) {
      if (!hydrated) return;
      const compact = getSerializableState(state);
      const jsonStr = JSON.stringify(compact);
      waitForPycmd().then(hasPycmd => {
        if (hasPycmd && typeof (window as any).pycmd === 'function') {
          try {
            (window as any).pycmd(`ankicaster:save:${jsonStr}`);
          } catch (e) {
            console.error('Addon save failed:', e);
          }
        }
      });
    } else {
      try {
        const compact = getSerializableState(state);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(compact));
      } catch (e) {
        console.error('LocalStorage save failed:', e);
      }
    }
  }, [state, isAddonMode, hydrated, waitForPycmd]);

  // Build-time Dev Mode flag (must NEVER be on inside Anki)
  const IS_DEV_MODE = !isAddonMode && (import.meta.env.DEV || import.meta.env.VITE_DEV_MODE === 'true');

  // Check for real-time day elapsed (4 AM calendar day boundary, carrying over leftover hours)
  const checkDayRollover = useCallback(() => {
    setState(current => {
      const res = AnkicasterEngine.processRealTimeElapsedDays(current, Date.now());
      if (res.daysPassed > 0) {
        setDaySummaryItems(res.summary);
        setIsDaySummaryOpen(true);
        return res.state;
      }
      return current;
    });
  }, []);

  // 1. Check on load
  useEffect(() => {
    checkDayRollover();
  }, [checkDayRollover]);

  // 2. Check on automated interval timer (every 30 seconds)
  useEffect(() => {
    const timer = setInterval(() => {
      checkDayRollover();
    }, 30000);
    return () => clearInterval(timer);
  }, [checkDayRollover]);

  // 3. Check when tab or window regains focus or visibility returns
  useEffect(() => {
    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        checkDayRollover();
      }
    };
    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);
    return () => {
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
    };
  }, [checkDayRollover]);

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
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      } else if (type === 'bell') {
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
        osc.start();
        osc.stop(ctx.currentTime + 0.8);
      } else if (type === 'mastery') {
        osc.frequency.setValueAtTime(523.25, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1046.5, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
        osc.start();
        osc.stop(ctx.currentTime + 0.6);
      }
    } catch {
      // AudioContext safe catch
    }
  }, [state.settings.sound]);

  // Add toast notification
  const addToast = (text: string, type: string = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev.slice(-4), { id, text, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  };

  // Handler: Honest Review Answer with real measured elapsed time
  const handleAnswerCard = useCallback((cardId: number, ease: 1 | 2 | 3 | 4, elapsedMs: number = 2400) => {
    setState(current => {
      const result = AnkicasterEngine.applyHonestReview(current, cardId, ease, elapsedMs);
      if (result.toast) {
        addToast(result.toast, ease === 1 ? 'warning' : 'success');
      }
      result.notifications.forEach(n => addToast(n, 'notice'));

      if (result.state.bellIndex > current.bellIndex) {
        playChime('bell');
      } else {
        playChime('review');
      }
      return result.state;
    });
  }, [playChime]);

  // Real Anki Review Bridge (receives reviews and snapshots from Anki addon pycmd/runJavaScript)
  useEffect(() => {
    // 1. Live Review Handler
    (window as any).ankicasterOnReview = (payload: {
      card_id?: number;
      cardId?: number;
      ease: 1 | 2 | 3 | 4;
      elapsed_ms?: number;
      elapsedMs?: number;
      card_age?: number;
      cardAge?: number;
      review_id?: string;
      reviewId?: string;
    }) => {
      const cid = payload.cardId ?? payload.card_id ?? 1;
      const ms = payload.elapsedMs ?? payload.elapsed_ms ?? 2400;
      const age = payload.cardAge ?? payload.card_age;
      const rid = payload.reviewId ?? payload.review_id; // Use only review_id, no Date.now() fallback

      setState(current => {
        const result = AnkicasterEngine.applyHonestReview(current, cid, payload.ease, ms, age, rid);
        if (result.toast) {
          addToast(result.toast, payload.ease === 1 ? 'warning' : 'success');
        }
        result.notifications.forEach(n => addToast(n, 'notice'));
        if (result.state.bellIndex > current.bellIndex) {
          playChime('bell');
        } else {
          playChime('review');
        }

        // Acknowledge review to Anki (ack every review_id applied OR found as duplicate)
        if (rid && isAddonMode) {
          waitForPycmd().then(hasPycmd => {
            if (hasPycmd && typeof (window as any).pycmd === 'function') {
              try {
                (window as any).pycmd(`ankicaster:ack:${rid}`);
              } catch (e) {
                console.error('Ack failed:', e);
              }
            }
          });
        }

        return result.state;
      });
    };

    // 2. Load Saved Game State from Python (user_files/save.json)
    (window as any).ankicasterLoadSavedGame = (savedState: any) => {
      if (savedState && typeof savedState === 'object') {
        savedState = AnkicasterEngine.normalizeLoadedState(savedState);
        setState(current => {
          // Merge saved state, preserving any existing allCards until snapshot arrives
          return {
            ...current,
            ...savedState,
            allCards: {
              ...current.allCards,
              ...(savedState.allCards || {})
            }
          };
        });
      }
      hydratedRef.current = true;
      setHydrated(true);
    };

    // 3. Load Snapshot of Non-Suspended Real Cards from Anki
    (window as any).ankicasterLoadSnapshot = (snapshot: Array<{ id: number; deckName: string; card_age: number; type?: number; queue?: number }>) => {
      if (!Array.isArray(snapshot) || snapshot.length === 0) return;
      setState(current => {
        const next = AnkicasterEngine.loadCardSnapshot(current, snapshot);
        // Persist immediately in addon mode if hydrated
        if (isAddonMode && hydratedRef.current) {
          waitForPycmd().then(hasPycmd => {
            if (hasPycmd && typeof (window as any).pycmd === 'function') {
              try {
                const compact = getSerializableState(next);
                (window as any).pycmd(`ankicaster:save:${JSON.stringify(compact)}`);
              } catch (e) {
                console.error('Save after snapshot failed:', e);
              }
            }
          });
        }
        addToast(`Synchronized ${snapshot.length} cards from Anki collection!`, 'info');
        return next;
      });
    };

    // 4. Batch Replay Pending Reviews
    (window as any).ankicasterReplayPendingReviews = (records: Array<any>) => {
      if (!Array.isArray(records) || records.length === 0) return;

      const reviewBatch = records.map(r => ({
        cardId: r.card_id ?? r.cardId ?? 1,
        ease: (r.ease || 3) as 1 | 2 | 3 | 4,
        elapsedMs: r.elapsed_ms ?? r.elapsedMs ?? 2400,
        cardAge: r.card_age ?? r.cardAge ?? r.honest_ivl,
        reviewId: r.review_id ?? r.reviewId // Only review_id, no Date.now() fallback
      }));

      // Collect all review IDs from the batch to acknowledge all of them (applied or duplicate)
      const batchIds = reviewBatch
        .map(r => r.reviewId)
        .filter((id): id is string => Boolean(id));

      setState(current => {
        const res = AnkicasterEngine.applyBatchHonestReviews(current, reviewBatch);
        if (res.count > 0) {
          addToast(`Processed ${res.count} study reviews from Anki!`, 'success');
        }

        // Send pycmd ack for every review_id replayed or recognized as duplicate
        if (batchIds.length > 0 && isAddonMode) {
          waitForPycmd().then(hasPycmd => {
            if (hasPycmd && typeof (window as any).pycmd === 'function') {
              try {
                (window as any).pycmd(`ankicaster:ack:${batchIds.join(',')}`);
              } catch (e) {
                console.error('Batch ack failed:', e);
              }
            }
          });
        }

        return res.state;
      });
    };

    // 5. PostMessage Bridge Handler
    const handleMessage = (event: MessageEvent) => {
      // Ignore postMessage events that don't come from the same window
      if (event.source !== window) return;

      if (event.data && event.data.type === 'ankicaster_review') {
        const payload = event.data.payload;
        if (payload) {
          const cid = payload.cardId ?? payload.card_id ?? 1;
          const ms = payload.elapsedMs ?? payload.elapsed_ms ?? 2400;
          const age = payload.cardAge ?? payload.card_age;
          const rid = payload.reviewId ?? payload.review_id;
          setState(current => {
            const result = AnkicasterEngine.applyHonestReview(current, cid, payload.ease, ms, age, rid);
            if (result.toast) addToast(result.toast, payload.ease === 1 ? 'warning' : 'success');
            result.notifications.forEach(n => addToast(n, 'notice'));
            return result.state;
          });
        }
      } else if (event.data && event.data.type === 'ankicaster_snapshot') {
        if (Array.isArray(event.data.snapshot)) {
          setState(current => AnkicasterEngine.loadCardSnapshot(current, event.data.snapshot));
        }
      }
    };

    window.addEventListener('message', handleMessage);

    // Ready handshake: Signal to Anki python addon after pycmd is ready
    if (isAddonMode) {
      waitForPycmd().then(hasPycmd => {
        if (hasPycmd && typeof (window as any).pycmd === 'function') {
          try {
            (window as any).pycmd('ankicaster:ready');
          } catch (e) {
            console.error('Ready handshake failed:', e);
          }
        }
      });
    }

    return () => {
      delete (window as any).ankicasterOnReview;
      delete (window as any).ankicasterLoadSavedGame;
      delete (window as any).ankicasterLoadSnapshot;
      delete (window as any).ankicasterReplayPendingReviews;
      window.removeEventListener('message', handleMessage);
    };
  }, [playChime, isAddonMode]);

  // Handler: Batch Simulation of Honest Reviews (gated behind devMode)
  const handleSimulateBatch = (count: number) => {
    let curState = state;
    const cardIds = Object.keys(curState.allCards).map(Number);
    for (let i = 0; i < count; i++) {
      const randomCardId = cardIds[Math.floor(Math.random() * cardIds.length)];
      const randomEase = (Math.floor(Math.random() * 3) + 2) as 2 | 3 | 4;
      const res = AnkicasterEngine.applyHonestReview(curState, randomCardId, randomEase, 2000);
      curState = res.state;
    }
    setState(curState);
    playChime('bell');
    addToast(`Completed ${count} simulated honest reviews (+${count * 10} Mana)!`, 'success');
  };

  // Handler: Day Rollover (Dev Mode / Test Tool)
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
      const started = res.state.wizard.activeSession?.school === school
        ? res.state.wizard.activeSession
        : [...res.state.wizard.queuedSessions].reverse().find(s => s.school === school);
      const freeStart = !isGrimoire
        && school === res.state.wizard.foundingSchool
        && started?.targetLevel === 1
        && started.costPaid === 0;
      if (freeStart) res.state.tutorial = applyTutorialAction(res.state.tutorial, 'start-ponder');
      setState(res.state);
      setOpenScreen(current => (current === 'ponder' ? null : current));
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

  // Handler: Enroll in Second School
  const handleEnrollSecondSchool = (charId: number, school: SchoolType) => {
    const res = AnkicasterEngine.enrollSecondSchool(state, charId, school);
    if (!res.success) {
      addToast(res.error || 'Second school enrollment failed', 'warning');
    } else {
      setState(res.state);
      confetti({ particleCount: 50, spread: 60 });
      addToast('Advanced second-school study commenced (+50 cards linked)!', 'success');
      playChime('mastery');
    }
  };

  // Handler: Retire Character
  const handleRetireCharacter = (charId: number) => {
    const res = AnkicasterEngine.retireCharacter(state, charId);
    if (!res.success) {
      addToast(res.error || 'Retirement not ready', 'warning');
    } else {
      setState(res.state);
      confetti({ particleCount: 70, spread: 80 });
      addToast('Character retired to the Alumni Gallery (+10 Renown)!', 'success');
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

  // Build / Move placement mode (ghost on the map; the engine validates again on confirm)
  const [placement, setPlacement] = useState<PlacementMode | null>(null);
  const [demolishRoomId, setDemolishRoomId] = useState<number | null>(null);

  const reportPlacement = (res: { success: boolean; error?: string; warnings?: string[] }, okText: string) => {
    if (!res.success) {
      addToast(res.error || 'Cannot place room there.', 'warning');
      return false;
    }
    addToast(res.warnings?.length ? `${okText} ${res.warnings[0]}` : okText, res.warnings?.length ? 'warning' : 'success');
    return true;
  };

  // Handler: choose a room in Build -> enter placement mode
  const handlePlaceRoom = (defId: string, _area?: 'castle' | 'grounds') => {
    setOpenScreen(null);
    setSelectedRoom(null);
    setPlacement({ kind: 'build', defId });
  };

  // Handler: Build menu "Auto" -> engine finds a free valid spot (or reports no space)
  const handleAutoPlaceRoom = (defId: string) => {
    const res = AnkicasterEngine.placeRoom(state, defId);
    if (reportPlacement(res, 'New room commissioned!')) {
      setState(res.state);
      playChime('review');
      setOpenScreen(null);
      setPlacement(null);
    }
  };

  const handlePlacementConfirm = (x: number, y: number) => {
    if (!placement) return;
    if (placement.kind === 'build') {
      const def = ROOM_DEFINITIONS[placement.defId];
      const res = AnkicasterEngine.placeRoom(state, placement.defId, def?.area, x, y);
      if (reportPlacement(res, 'New room commissioned!')) {
        setState(res.state);
        playChime('review');
        setPlacement(null);
      }
    } else {
      const res = AnkicasterEngine.moveRoom(state, placement.roomId, x, y);
      if (reportPlacement(res, 'Room moved.')) {
        setState(res.state);
        playChime('review');
        setPlacement(null);
      }
    }
  };

  const handleDemolishConfirm = () => {
    if (demolishRoomId === null) return;
    const res = AnkicasterEngine.demolishRoom(state, demolishRoomId);
    setDemolishRoomId(null);
    if (!res.success) {
      addToast(res.error || 'Cannot demolish.', 'warning');
      return;
    }
    setState(res.state);
    setSelectedRoom(null);
    addToast(res.refund?.cancel ? 'Construction cancelled (full refund).' : 'Room demolished.', 'success');
  };

  // Handler: Draw Draft Deck
  const handleDrawDeck = (deck: DraftDeckId) => {
    const res = AnkicasterEngine.drawDraftCards(state, deck);
    if (res.error) {
      addToast(res.error, 'warning');
    } else {
      setState(res.state);
      setDraftChoices(res.cards);
      setDraftTutorial(res.tutorial);
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

  // Handler: Use Potion
  const handleUsePotion = (potionId: string) => {
    const res = AnkicasterEngine.usePotion(state, potionId);
    if (!res.success) {
      addToast(res.error || 'Failed to use potion', 'warning');
    } else {
      setState(res.state);
      addToast(res.message || 'Potion consumed!', 'success');
      playChime('review');
    }
  };

  // Handler: Resolve Hazard
  const handleResolveHazard = (roomId: number, method: 'warder' | 'spell') => {
    const res = AnkicasterEngine.resolveHazard(state, roomId, method);
    if (!res.success) {
      addToast(res.error || 'Could not dispel hazard', 'warning');
    } else {
      setState(res.state);
      addToast('Hazard dispelled from room!', 'success');
      playChime('mastery');
    }
  };

  // Handler: Feed Creature
  const handleFeedCreature = (creatureId: number) => {
    const res = AnkicasterEngine.feedCreature(state, creatureId);
    if (!res.success) {
      addToast(res.error || 'Could not feed familiar', 'warning');
    } else {
      setState(res.state);
      addToast('Creature fed and content!', 'success');
      playChime('review');
    }
  };

  // Handler: Assign Tamer
  const handleAssignTamer = (creatureId: number, tamerId: number) => {
    const res = AnkicasterEngine.assignTamerToCreature(state, creatureId, tamerId);
    if (res.success) {
      setState(res.state);
      addToast('Tamer assigned to familiar!', 'success');
    }
  };

  // Handler: Assign Teacher Classroom
  const handleAssignTeacherRoom = (charId: number, roomId: number) => {
    const res = AnkicasterEngine.assignTeacherToClassroom(state, charId, roomId);
    if (!res.success) {
      addToast(res.error || 'Cannot assign classroom.', 'warning');
    } else {
      setState(res.state);
      addToast('Teacher assigned to classroom!', 'success');
    }
  };

  // Handler: Launch Expedition
  const handleLaunchExpedition = (destId: string, teamIds: number[], supplies: string[] = [], companionId?: number) => {
    const res = AnkicasterEngine.launchRiftExpedition(state, destId, teamIds, supplies, companionId);
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

  // Navigation: open a management screen (from a room window, the Academy menu or the top bar)
  const handleOpenScreen = (id: ScreenId) => {
    if (id === 'codex') { setIsCodexOpen(true); return; }
    if (id === 'settings') { setIsSettingsOpen(true); return; }
    setOpenScreen(id);
  };

  const handleOpenRoomById = (roomId: number) => {
    const room = state.rooms.find(r => r.id === roomId);
    if (room) {
      setOpenScreen(null);
      setSelectedRoom(room);
      setState(prev => ({ ...prev, tutorial: applyTutorialAction(prev.tutorial, room.defId === 'wizard_study' ? 'open-study' : 'open-other') }));
    }
  };

  // Body of each screen window. Exhaustive over ScreenId so no screen can be left unrendered.
  const renderScreenBody = (id: ScreenId): React.ReactNode => {
    switch (id) {
      case 'reviewer':
        return (
          <FlashcardReviewer
            cards={state.allCards}
            onAnswerCard={handleAnswerCard}
            onSimulateBatch={handleSimulateBatch}
            devMode={IS_DEV_MODE}
            isAddonMode={isAddonMode}
          />
        );
      case 'students':
      case 'faculty':
      case 'alumni':
        return (
          <RosterPanel
            key={id}
            state={state}
            view={id}
            onAssignCareer={handleAssignCareer}
            onAssignTeacherRoom={handleAssignTeacherRoom}
            onRetireCharacter={handleRetireCharacter}
            onEnrollSecondSchool={handleEnrollSecondSchool}
          />
        );
      case 'admissions':
        return <RecruitmentPanel state={state} onEnroll={handleEnrollStudent} />;
      case 'build':
        return <BuildMenuPanel state={state} onPlaceRoom={handlePlaceRoom} onAutoPlace={handleAutoPlaceRoom} onOpenDraft={() => handleOpenScreen('draft')} />;
      case 'draft':
        return <CardDraftPanel state={state} onDrawDeck={handleDrawDeck} />;
      case 'bestiary':
        return <BestiaryPanel state={state} onFeedCreature={handleFeedCreature} onAssignTamer={handleAssignTamer} />;
      case 'alchemy':
        return <AlchemyPanel state={state} onBrewPotion={handleBrewPotion} onUsePotion={handleUsePotion} />;
      case 'rift':
        return <RiftPanel state={state} onLaunchExpedition={handleLaunchExpedition} />;
      case 'stores':
        return <StoresPanel state={state} />;
      case 'journal':
        return <JournalPanel state={state} />;
      case 'events':
        return (
          <VisitorsPanel
            state={state}
            onOpenEvent={ev => { setOpenScreen(null); setActiveEventModal(ev); }}
          />
        );
      case 'ponder':
      case 'grimoire':
      case 'codex':
      case 'settings':
        return null; // rendered as their own modals
      default: {
        const unreachable: never = id;
        return unreachable;
      }
    }
  };

  // Refresh Selected Room Reference if State Changes
  const currentSelectedRoom = selectedRoom
    ? state.rooms.find(r => r.id === selectedRoom.id) || null
    : null;

  const tutorial = state.tutorial;
  const studyOpen = currentSelectedRoom?.defId === 'wizard_study';
  const view = tutorial?.phase === 'tour' ? tourView(tutorial, {
    studyOpen,
    academyLabels: [
      ...getAcademyMenuScreens(state).map(id => SCREEN_DEFS[id].label),
      ...(['reviewer', 'journal', 'codex', 'settings'] as ScreenId[]).map(id => SCREEN_DEFS[id].label)
    ]
  }) : null;

  useEffect(() => {
    if (tutorial?.phase === 'tour' && tourStepId(tutorial) === 'draw' && openScreen !== 'draft') setOpenScreen('draft');
  }, [tutorial, openScreen]);

  useEffect(() => {
    if (tutorial?.phase !== 'tour' || tourStepId(tutorial) !== 'study-parts') return;
    if (STUDY_PARTS[tutorial.part || 0]?.id !== 'ponder') return;
    const school = state.wizard.foundingSchool;
    const free = !!school && wizardOrbQuote({
      foundingSchool: school,
      levels: state.wizard.levels,
      active: state.wizard.activeSession,
      queued: state.wizard.queuedSessions,
      school
    }).free;
    if (!free) {
      setState(prev => ({ ...prev, tutorial: applyTutorialAction(prev.tutorial, 'start-ponder') }));
      return;
    }
    if (openScreen !== 'ponder') setOpenScreen('ponder');
  }, [tutorial, openScreen, state.wizard]);

  useEffect(() => {
    if (tutorial?.phase !== 'goal') return;
    setOpenScreen(s => (s === 'draft' ? null : s));
  }, [tutorial?.phase]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none antialiased">
      {/* Slim top bar: mana, day/term, Veil, hazards, Build, Academy menu, Settings */}
      <div className="sticky top-0 z-40">
        <TopBar
          state={state}
          onOpenScreen={handleOpenScreen}
          onOpenRoom={handleOpenRoomById}
          forceAcademy={!!view?.forceAcademy}
          devControls={IS_DEV_MODE ? (
            <div className="hidden md:flex items-center gap-1.5">
              <button onClick={() => handleSimulateBatch(1)} className="px-2.5 py-1.5 min-h-[32px] bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-[12px] font-bold" title="Dev: one simulated review">+1 Rev</button>
              <button onClick={() => handleSimulateBatch(10)} className="px-2.5 py-1.5 min-h-[32px] bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-[12px] font-bold" title="Dev: ten simulated reviews">+10</button>
              <button onClick={handleNextDay} className="flex items-center gap-1 px-2.5 py-1.5 min-h-[32px] bg-indigo-900/60 hover:bg-indigo-900 text-indigo-200 border border-indigo-700/60 rounded-lg text-[12px] font-bold" title="Dev: advance day (Veil upkeep)">
                <Moon className="w-3.5 h-3.5" /> Dawn
              </button>
            </div>
          ) : undefined}
        />
      </div>

      {/* Main view: the castle map. Rooms are the navigation. */}
      <main className="flex-1 p-3 md:p-5 max-w-7xl mx-auto w-full">
        <CastleGrid
          state={state}
          onSelectRoom={room => {
            setSelectedRoom(room);
            setState(prev => ({ ...prev, tutorial: applyTutorialAction(prev.tutorial, room.defId === 'wizard_study' ? 'open-study' : 'open-other') }));
          }}
          onSelectCreature={() => handleOpenScreen('bestiary')}
          selectedRoomId={selectedRoom?.id}
          onResolveHazard={handleResolveHazard}
          placement={placement}
          onPlacementConfirm={handlePlacementConfirm}
          onPlacementCancel={() => setPlacement(null)}
          onPlacementAuto={placement?.kind === 'build' ? () => handleAutoPlaceRoom(placement.defId) : undefined}
          focusRoomDefId={view?.focusRoom ? 'wizard_study' : null}
          onRoomScreenBox={setRoomBox}
        />
        {state.rooms.length === 0 && (
          <div className="mt-3 text-center text-[13px] text-slate-400">No rooms yet. Use <strong className="text-amber-300">Build</strong> to plan one.</div>
        )}
      </main>

      {/* Management screen windows (former tabs) */}
      {openScreen && openScreen !== 'ponder' && openScreen !== 'grimoire' && openScreen !== 'codex' && openScreen !== 'settings' && (
        <ScreenWindow
          id={openScreen}
          onClose={() => setOpenScreen(null)}
          width={openScreen === 'reviewer' || openScreen === 'journal' || openScreen === 'events' ? 'max-w-2xl' : 'max-w-5xl'}
        >
          {renderScreenBody(openScreen)}
        </ScreenWindow>
      )}
      {openScreen === 'ponder' && (
        <PonderOrbPicker state={state} onPick={sch => handleQueueWizardSession(sch, false)} onClose={() => setOpenScreen(null)} />
      )}
      {openScreen === 'grimoire' && (
        <GrimoireBook state={state} onCast={handleCastSpell} onClose={() => setOpenScreen(null)} />
      )}

      {/* Floating Notice Toasts */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-xl border text-xs shadow-2xl backdrop-blur transition-all duration-300 ${
              toast.type === 'success'
                ? 'bg-emerald-950/95 border-emerald-500/60 text-emerald-200'
                : toast.type === 'warning'
                ? 'bg-amber-950/95 border-amber-500/60 text-amber-200'
                : 'bg-slate-900/95 border-slate-700 text-slate-100'
            }`}
          >
            {toast.text}
          </div>
        ))}
      </div>

      {/* MODAL 1: ROOM WINDOW (header, stats, hazard, 1-3 actions, collapsed details) */}
      {currentSelectedRoom && (
        <RoomWindow
          state={state}
          room={currentSelectedRoom}
          onClose={() => {
            const wasStudy = currentSelectedRoom?.defId === 'wizard_study';
            setSelectedRoom(null);
            if (wasStudy) setState(prev => ({ ...prev, tutorial: applyTutorialAction(prev.tutorial, 'close-study') }));
          }}
          onOpenScreen={handleOpenScreen}
          onResolveHazard={handleResolveHazard}
          onUpgrade={roomId => {
            const res = AnkicasterEngine.upgradeRoom(state, roomId);
            if (!res.success) addToast(res.error || 'Upgrade failed', 'warning');
            else {
              setState(res.state);
              addToast('Room renovated to next level!', 'success');
              playChime('mastery');
            }
          }}
          onAddFurniture={(roomId, fDefId) => {
            const res = AnkicasterEngine.addFurniture(state, roomId, fDefId);
            if (!res.success) addToast(res.error || 'Cannot install', 'warning');
            else {
              setState(res.state);
              addToast(`Installed ${FURNITURE_DEFINITIONS[fDefId]?.name || fDefId}!`, 'success');
              playChime('review');
            }
          }}
          onInstallRequired={(roomId, slotIndex) => {
            const res = AnkicasterEngine.installRequiredFixture(state, roomId, slotIndex);
            if (!res.success) addToast(res.error || 'Cannot install', 'warning');
            else {
              setState(res.state);
              addToast(res.state.notices[res.state.notices.length - 1]?.text || 'Installed!', 'success');
              playChime('review');
            }
          }}
          onMove={roomId => {
            setSelectedRoom(null);
            setPlacement({ kind: 'move', roomId });
          }}
          onDemolish={roomId => setDemolishRoomId(roomId)}
          onTogglePause={(roomId, paused) => {
            const res = AnkicasterEngine.setConstructionPaused(state, roomId, paused);
            if (!res.success) addToast(res.error || 'Cannot change this site', 'warning');
            else setState(res.state);
          }}
          onChangeLook={() => { setSelectedRoom(null); setLookOnly(true); setIsCreationModalOpen(true); }}
          onRemoveFurniture={(roomId, fId) => {
            const res = AnkicasterEngine.removeFurniture(state, roomId, fId);
            if (res.success) setState(res.state);
          }}
          detailsOpen={!!tutorial && tutorial.phase === 'tour' && studyOpen && tourOpensDetails(tutorial)}
        />
      )}

      {/* MODAL 2: GRIMOIRE DRAFT PICKER */}
      {isDraftModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-purple-500/50 rounded-2xl w-full max-w-3xl p-6 shadow-2xl space-y-6">
            <div className="text-center">
              <span className="text-xs font-bold uppercase tracking-widest text-purple-400">
                Rule BR-26 Arcane Inscription
              </span>
              <h3 className="text-lg md:text-xl font-bold text-amber-200 mt-1">
                The Grimoire Reveals Three Destinies
              </h3>
              <p className="text-xs text-slate-300">
                Choose one card to keep. The other two return to the celestial archives.
              </p>
              {draftTutorial && (
                <p className="text-xs text-amber-100/90 mt-2" data-testid="draft-tutorial">{draftTutorial}</p>
              )}
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
                      <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider mb-2">
                        <span>{card.deck} Deck</span>
                        <span className="font-bold">{card.rarity}</span>
                      </div>
                      <h4 className="font-bold text-sm text-slate-100 mb-1">{card.name}</h4>
                      <span className="inline-block text-xs bg-slate-900/80 px-2 py-0.5 rounded-md font-mono mb-2 capitalize">
                        {card.type.replace('_', ' ')}
                      </span>
                      <p className="text-xs text-slate-300 leading-relaxed">{card.description}</p>
                    </div>

                    <button
                      onClick={() => handleSelectDraftCard(card)}
                      className="mt-4 w-full py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg transition"
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
                <span className="text-xs font-mono uppercase tracking-wider text-amber-400">
                  Academy Threshold Event
                </span>
                <h3 className="text-base font-bold text-amber-200">{activeEventModal.name}</h3>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-4 rounded-xl border border-slate-800">
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
                    {opt.cost && <div className="text-xs text-rose-400">Cost: {opt.cost}</div>}
                    <div className="text-xs font-bold text-emerald-400">{opt.reward}</div>
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
                <p className="text-xs text-slate-300">
                  Veil upkeep processed and overnight events resolved.
                </p>
              </div>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto text-xs pr-1">
              {daySummaryItems.map((item, idx) => (
                <div
                  key={idx}
                  className="bg-slate-950/80 p-3 rounded-xl border border-slate-800/80 text-slate-200 flex items-start gap-2"
                >
                  <span className="text-indigo-400 font-bold">•</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => setIsDaySummaryOpen(false)}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow transition"
            >
              Greet the Morning
            </button>
          </div>
        </div>
      )}

      {/* MODAL 5: CODEX GUIDE */}
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
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <h4 className="font-bold text-amber-200 mb-1">
                  BR-01: Neutral Mana Economy
                </h4>
                <p className="leading-relaxed">
                  Mana is earned only from honest flashcard reviews (+10 per review). All answer buttons (Again, Hard, Good, Easy) grant equal mana. Answers faster than 0.8s award 0 mana (Rule H5).
                </p>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <h4 className="font-bold text-emerald-200 mb-1">
                  BR-04 &amp; BR-25: Breaks Are Safe (10% Bank Floor)
                </h4>
                <p className="leading-relaxed">
                  Taking a break never destroys your academy. Daily Veil auto-pay deducts mana down to 10% of your bank, then ceases and holds the Veil completely steady without further decay.
                </p>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <h4 className="font-bold text-sky-200 mb-1">
                  BR-11 to BR-23: Linked Constellations &amp; Polymaths
                </h4>
                <p className="leading-relaxed">
                  Each student links to 50 of your youngest free flashcards. When all 50 cards exceed 30 days maturity, they graduate as Masters. Masters of 2 or more schools can switch careers, linking 20 new cards per career while keeping previous cards.
                </p>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <h4 className="font-bold text-rose-200 mb-1">
                  BR-27: The Otherworldly Rift (Zero Permadeath)
                </h4>
                <p className="leading-relaxed">
                  The Rift portal unlocks only after graduating at least 3 Masters. Safe odds scale directly with your adventurers' review intervals. Heroes never die; injuries rest safely in the Infirmary.
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsCodexOpen(false)}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl transition"
            >
              Close Codex
            </button>
          </div>
        </div>
      )}

      {/* MODAL 6: SETTINGS & DEVELOPER DEBUG CONTROLS */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
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
              {/* Developer Test Tools Status (Build-Time Flag) */}
              <div className="flex items-center justify-between bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <div>
                  <span className="font-bold text-amber-300 block">Developer Mode (Build Flag)</span>
                  <span className="text-xs text-slate-400">Controlled at compile-time via environment flag</span>
                </div>
                <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                  IS_DEV_MODE ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-slate-800 text-slate-400'
                }`}>
                  {IS_DEV_MODE ? 'DEV Flag Active' : 'Production Build'}
                </span>
              </div>

              {/* Sound toggle */}
              <div className="flex items-center justify-between bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <span>Sound Chimes</span>
                <button
                  onClick={() => {
                    setState(prev => ({
                      ...prev,
                      settings: { ...prev.settings, sound: !prev.settings.sound }
                    }));
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    state.settings.sound ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {state.settings.sound ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              {/* Reduce motion (existing setting; Choreographer snaps agents only at phase changes) */}
              <div className="flex items-center justify-between bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <span>Reduce Motion</span>
                <button
                  onClick={() => {
                    setState(prev => ({
                      ...prev,
                      settings: { ...prev.settings, reduceMotion: !prev.settings.reduceMotion }
                    }));
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    state.settings.reduceMotion ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {state.settings.reduceMotion ? 'On' : 'Off'}
                </button>
              </div>

              {/* Safe Floor indicator */}
              <div className="flex items-center justify-between bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <span>Daily Veil Upkeep</span>
                <span className="font-semibold text-indigo-300">Auto-Pay (BR-25 10% Floor Active)</span>
              </div>

              {/* Timed Term / examTimer Configuration */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-sky-300 block">Timed Term (examTimer)</span>
                    <span className="text-xs text-slate-400">Structured academic exam countdown</span>
                  </div>
                  <button
                    onClick={() => {
                      setState(prev => ({
                        ...prev,
                        settings: {
                          ...prev.settings,
                          examTimer: !prev.settings.examTimer,
                          mode: !prev.settings.examTimer ? 'timed' : 'endless'
                        }
                      }));
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                      state.settings.examTimer ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {state.settings.examTimer ? 'Timed Active' : 'Endless Mode'}
                  </button>
                </div>

                {state.settings.examTimer && (
                  <div className="pt-2 border-t border-slate-800/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300">Term End Date:</span>
                      <input
                        type="date"
                        value={state.settings.termEndDate || ''}
                        onChange={e => {
                          const val = e.target.value;
                          setState(prev => ({
                            ...prev,
                            settings: { ...prev.settings, termEndDate: val },
                            termEndDateMs: val ? new Date(val).getTime() : undefined
                          }));
                        }}
                        className="bg-slate-900 border border-slate-700 px-2 py-1 rounded-lg text-slate-200 text-xs"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300">Term Length:</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="7"
                          max="180"
                          value={state.settings.termLengthDays || 30}
                          onChange={e => {
                            const val = Number(e.target.value) || 30;
                            setState(prev => ({
                              ...prev,
                              settings: { ...prev.settings, termLengthDays: val }
                            }));
                          }}
                          className="bg-slate-900 border border-slate-700 px-2 py-1 rounded-lg text-slate-200 text-xs w-16 text-center"
                        />
                        <span className="text-slate-400">days</span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        const res = AnkicasterEngine.checkTimedTermStatus(state, Date.now() + 999999999);
                        setState(res.state);
                        setIsSettingsOpen(false);
                      }}
                      className="w-full py-1.5 bg-sky-950/60 hover:bg-sky-900 text-sky-200 border border-sky-800/60 font-bold rounded-lg transition text-xs"
                    >
                      Conclude Term & View Report
                    </button>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-800 pt-3">
                <button
                  onClick={() => {
                    if (!confirmReset) { setConfirmReset(true); return; }
                    setConfirmReset(false);
                    const fresh = createInitialGameState();
                    setState(fresh);
                    localStorage.removeItem(STORAGE_KEY);
                    setIsSettingsOpen(false);
                    addToast('Academy restarted afresh!', 'info');
                  }}
                  className="w-full py-2.5 bg-rose-950/60 hover:bg-rose-900 text-rose-200 border border-rose-800/60 font-bold rounded-xl transition text-xs shadow"
                >
                  {confirmReset ? 'Click again to reset (all progress will be lost)' : 'Restart Academy (Reset State)'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 7: ACADEMIC TERM CONCLUDED REPORT */}
      {state.termFinishedReport && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300">
              <GraduationCap className="w-8 h-8" />
            </div>

            <div>
              <h3 className="text-xl font-bold text-amber-300">
                Academic Term Concluded!
              </h3>
              <p className="text-xs text-slate-300 mt-1">
                The exam bells have tolled across the spires. Your apprentices and masters stand evaluated.
              </p>
            </div>

            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3 text-left">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-slate-400 font-semibold text-xs">Academic Standing:</span>
                <span className="text-amber-400 font-bold text-xs">
                  {state.termFinishedReport.honorTier}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs">Cards Studied This Term:</span>
                <span className="text-slate-100 font-bold text-xs">{state.termFinishedReport.cardsStudied}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs">Masters Graduated This Term:</span>
                <span className="text-slate-100 font-bold text-xs">{state.termFinishedReport.mastersGraduated}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs">Renown Earned This Term:</span>
                <span className="text-purple-300 font-bold text-xs">+{state.termFinishedReport.renownEarned} Renown</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={() => {
                  const updated = AnkicasterEngine.startNextTerm(state, state.settings.termLengthDays || 30);
                  setState(updated.state);
                  addToast('New academic semester commenced!', 'success');
                }}
                className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg transition text-xs"
              >
                Begin Next Academic Term
              </button>
              <button
                onClick={() => {
                  setState(prev => ({ ...prev, termFinishedReport: undefined }));
                }}
                className="py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition text-xs"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 8: CHARACTER CREATION / CHOOSE YOUR LOOK */}
      {demolishRoomId !== null && (
        <DemolishConfirm
          state={state}
          roomId={demolishRoomId}
          onCancel={() => setDemolishRoomId(null)}
          onConfirm={handleDemolishConfirm}
        />
      )}

      {state.wizard.appearance && state.tutorial?.phase === 'founding' && !isCreationModalOpen && (
        <FoundingDay
          reduceMotion={state.settings.reduceMotion}
          onDone={() => setState(prev => ({ ...prev, tutorial: { phase: 'tour', step: 0, part: 0 } }))}
          onSkip={() => setState(prev => ({ ...prev, tutorial: applyTutorialAction(prev.tutorial, 'skip') }))}
        />
      )}
      {state.tutorial?.phase === 'tour' && view && !isCreationModalOpen && (
        <GuidedTour
          view={view}
          step={state.tutorial.step || 0}
          part={state.tutorial.part || 0}
          reduceMotion={state.settings.reduceMotion}
          roomBox={roomBox}
          onNext={() => setState(prev => ({ ...prev, tutorial: applyTutorialAction(prev.tutorial, 'next') }))}
          onSkip={() => setState(prev => ({ ...prev, tutorial: applyTutorialAction(prev.tutorial, 'skip') }))}
        />
      )}
      {state.tutorial?.phase === 'goal' && !isCreationModalOpen && (
        <GoalBanner onDone={() => setState(prev => ({ ...prev, tutorial: { phase: 'done', step: prev.tutorial?.step || 0, part: 0 } }))} />
      )}

      {isCreationModalOpen && <CharacterCreationModal
        isOpen={isCreationModalOpen}
        isExistingSave={lookOnly || state.reviewIndex > 0 || state.characters.length > 0 || state.mana > 0 || state.renown > 0}
        reduceMotion={state.settings.reduceMotion}
        initialValues={{
          name: state.wizard.name,
          title: state.wizard.title,
          pronouns: state.wizard.pronouns,
          ...(state.wizard.appearance ? normalizeAppearance(state.wizard.appearance) : {}),
          foundingSchool: state.wizard.foundingSchool
        }}
        onComplete={(choices, opts) => {
          const skip = !!opts?.skipTutorial;
          setState(prev => {
            // If already has progress, update wizard look only
            const hasProgress = lookOnly || prev.reviewIndex > 0 || prev.characters.length > 0 || prev.mana > 0 || prev.renown > 0;
            if (hasProgress) {
              return {
                ...prev,
                wizard: {
                  ...prev.wizard,
                  name: choices.name,
                  title: choices.title,
                  pronouns: choices.pronouns,
                  appearance: normalizeAppearance({
                    bodyShape: choices.bodyShape as 1 | 2 | 3 | 4,
                    skin: choices.skin,
                    hair: choices.hair,
                    hairColor: choices.hairColor,
                    eyes: choices.eyes,
                    face: choices.face,
                    shoes: choices.shoes,
                    robeColor: choices.robeColor,
                    hat: choices.hat,
                    staff: choices.staff
                  })
                }
              };
            }
            const next = createNewAcademy(choices);
            next.tutorial = skip || phaseAfterCreate(skip) !== 'founding'
              ? { phase: 'done', step: 0, part: 0 }
              : { phase: 'founding', step: 0, part: 0 };
            return next;
          });
          setIsCreationModalOpen(false);
          setLookOnly(false);
          addToast('Headmaster profile established!', 'success');
        }}
        onClose={() => { setIsCreationModalOpen(false); setLookOnly(false); }}
      />}
      {import.meta.env.VITE_DEBUG_TOOLS === 'true' ? (
        <CreatureDebugPanel state={state} onChange={setState} />
      ) : null}
    </div>
  );
}
