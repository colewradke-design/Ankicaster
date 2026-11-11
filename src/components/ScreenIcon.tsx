/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * One icon per screen, so the Academy menu and room windows stay consistent.
 * (Addendum 11.3: a single icon lookup; pixel icons can replace these later.)
 */
import React from 'react';
import {
  BookOpen, Sparkles, Users, GraduationCap, Hammer, Layers, FlaskConical, Compass, PawPrint,
  Award, Package, ScrollText, NotebookPen, HelpCircle, Settings as SettingsIcon, BookMarked, Briefcase
} from 'lucide-react';
import type { ScreenId } from '../ui/screens';

const ICONS: Record<ScreenId, { C: React.ComponentType<{ className?: string }>; color: string }> = {
  reviewer: { C: BookOpen, color: 'text-sky-400' },
  ponder: { C: Sparkles, color: 'text-purple-400' },
  grimoire: { C: BookMarked, color: 'text-indigo-300' },
  students: { C: Users, color: 'text-emerald-400' },
  faculty: { C: Briefcase, color: 'text-amber-300' },
  alumni: { C: Award, color: 'text-amber-400' },
  admissions: { C: GraduationCap, color: 'text-amber-400' },
  build: { C: Hammer, color: 'text-amber-500' },
  draft: { C: Layers, color: 'text-violet-400' },
  bestiary: { C: PawPrint, color: 'text-emerald-400' },
  alchemy: { C: FlaskConical, color: 'text-orange-400' },
  rift: { C: Compass, color: 'text-rose-400' },
  stores: { C: Package, color: 'text-yellow-600' },
  events: { C: ScrollText, color: 'text-amber-300' },
  journal: { C: NotebookPen, color: 'text-slate-300' },
  codex: { C: HelpCircle, color: 'text-amber-300' },
  settings: { C: SettingsIcon, color: 'text-slate-400' }
};

export const ScreenIcon: React.FC<{ id: ScreenId; className?: string }> = ({ id, className = 'w-4 h-4' }) => {
  const { C, color } = ICONS[id];
  return <C className={`${className} ${color}`} />;
};
