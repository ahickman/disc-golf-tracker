// The field workflow as a pure state machine: Set Tee -> Set Line -> (Mark Disc -> review -> Confirm)* (Section 2.1).
// The app calls `step` with each event and performs side effects (saving, marking) around it.

import { type CentreLine, DEFAULT_SHORT_BASELINE_M, makeCentreLine, measureThrow, type ThrowMeasurement } from './geometry.ts';
import { DEFAULT_JITTER_LIMIT_M, type MarkQuality, markQuality } from './gps.ts';
import type { Mark } from './types.ts';

export type Stage =
  | { name: 'tee' }
  | { name: 'line'; tee: Mark }
  /** The baseline is under the short-baseline limit: use the line anyway, or walk further and redo it. */
  | { name: 'short-line'; tee: Mark; aim: Mark; line: CentreLine }
  | { name: 'throw'; tee: Mark; aim: Mark; line: CentreLine }
  | {
      name: 'review';
      tee: Mark;
      aim: Mark;
      line: CentreLine;
      disc: Mark;
      measurement: ThrowMeasurement;
      quality: MarkQuality;
    };

export type Notice =
  | { kind: 'no-fixes'; what: MarkTarget }
  | { kind: 'mark-quality'; what: 'tee' | 'aim'; quality: Exclude<MarkQuality, 'steady'>; spreadM: number }
  | { kind: 'baseline-too-short'; baselineM: number };

export type MarkTarget = 'tee' | 'aim' | 'disc' | 'tee-check';

export interface WorkflowState {
  stage: Stage;
  notice: Notice | null;
}

export type WorkflowEvent =
  | { type: 'mark-failed'; what: MarkTarget }
  | { type: 'tee-marked'; mark: Mark }
  | { type: 'aim-marked'; mark: Mark }
  | { type: 'accept-line' }
  | { type: 'redo-line' }
  | { type: 'disc-marked'; mark: Mark }
  | { type: 'confirm' }
  | { type: 'discard' }
  | { type: 'reset-tee' }
  | { type: 'dismiss-notice' }
  /** Resume a saved session: straight to throwing (DGT-SES-004). */
  | { type: 'restore'; tee: Mark; aim: Mark };

export interface WorkflowSettings {
  shortBaselineM: number;
  jitterLimitM: number;
}

export const DEFAULT_WORKFLOW_SETTINGS: WorkflowSettings = {
  shortBaselineM: DEFAULT_SHORT_BASELINE_M,
  jitterLimitM: DEFAULT_JITTER_LIMIT_M,
};

export function initialWorkflow(): WorkflowState {
  return { stage: { name: 'tee' }, notice: null };
}

function qualityNotice(what: 'tee' | 'aim', mark: Mark, settings: WorkflowSettings): Notice | null {
  const quality = markQuality(mark, settings.jitterLimitM);
  return quality === 'steady' ? null : { kind: 'mark-quality', what, quality, spreadM: mark.spreadM };
}

/** The next state. Events that do not apply to the current stage leave the state unchanged. */
export function step(
  state: WorkflowState,
  event: WorkflowEvent,
  settings: WorkflowSettings = DEFAULT_WORKFLOW_SETTINGS,
): WorkflowState {
  const s = state.stage;
  const to = (stage: Stage, notice: Notice | null = null): WorkflowState => ({ stage, notice });

  switch (event.type) {
    case 'mark-failed':
      return { ...state, notice: { kind: 'no-fixes', what: event.what } };
    case 'dismiss-notice':
      return { ...state, notice: null };
    case 'reset-tee':
      return to({ name: 'tee' });
    case 'tee-marked':
      return s.name === 'tee' ? to({ name: 'line', tee: event.mark }, qualityNotice('tee', event.mark, settings)) : state;
    case 'aim-marked': {
      if (s.name !== 'line') return state;
      const r = makeCentreLine(s.tee, event.mark, settings.shortBaselineM);
      if (!r.ok) return { ...state, notice: { kind: 'baseline-too-short', baselineM: r.baselineM } };
      const notice = qualityNotice('aim', event.mark, settings);
      return r.shortBaseline
        ? to({ name: 'short-line', tee: s.tee, aim: event.mark, line: r.line }, notice)
        : to({ name: 'throw', tee: s.tee, aim: event.mark, line: r.line }, notice);
    }
    case 'accept-line':
      return s.name === 'short-line' ? to({ name: 'throw', tee: s.tee, aim: s.aim, line: s.line }) : state;
    case 'redo-line':
      return s.name === 'short-line' ? to({ name: 'line', tee: s.tee }) : state;
    case 'restore': {
      const r = makeCentreLine(event.tee, event.aim, settings.shortBaselineM);
      return r.ok ? to({ name: 'throw', tee: event.tee, aim: event.aim, line: r.line }) : to({ name: 'tee' });
    }
    case 'disc-marked':
      if (s.name !== 'throw') return state;
      return to({
        name: 'review',
        tee: s.tee,
        aim: s.aim,
        line: s.line,
        disc: event.mark,
        measurement: measureThrow(s.line, event.mark),
        quality: markQuality(event.mark, settings.jitterLimitM),
      });
    case 'confirm':
    case 'discard':
      return s.name === 'review' ? to({ name: 'throw', tee: s.tee, aim: s.aim, line: s.line }) : state;
  }
}
