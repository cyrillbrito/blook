// Mic state labels, shared by the React pages and the on-page pill (plain DOM, no React).
import type { MicState } from '@blook/core/types';

/** Muted text, colour only when something is wrong. */
export const MIC: Record<MicState, { label: string; tone?: 'warn' | 'danger'; on: boolean }> = {
  off: { label: 'Mic off', on: false },
  starting: { label: 'Mic starting…', on: true },
  recording: { label: 'Mic on', on: true },
  'needs-permission': { label: 'Mic needs permission', tone: 'warn', on: false },
  failed: { label: 'Mic failed', tone: 'danger', on: false },
  stopped: { label: 'Mic stopped', on: false },
};
