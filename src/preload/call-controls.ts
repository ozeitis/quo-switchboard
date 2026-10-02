import type { CallPhase } from '../shared/model';

function label(element: HTMLElement): string {
  return (element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent || '').trim().replace(/\s+/g, ' ');
}

function visible(element: HTMLElement): boolean {
  const style = getComputedStyle(element);
  return element.isConnected && element.getClientRects().length > 0 && style.visibility !== 'hidden' && style.display !== 'none';
}

function usable(element: HTMLElement): boolean { return visible(element) && !element.hasAttribute('disabled') && element.getAttribute('aria-disabled') !== 'true'; }

const CALL_REGION = '[role="dialog"], [role="alertdialog"], dialog, [aria-label="Call controls"], [aria-label="Active call"]';
const END = /^(end call|hang up|hangup)$/i;
const HOLD = /^(hold( call)?|put call on hold)$/i;
const RESUME = /^(resume( call)?|unhold( call)?|take call off hold)$/i;

export function findIncomingCallButton(root: Document): HTMLElement | null {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>('button, [role="button"]')).filter(element => {
    if (!visible(element)) return false;
    const text = label(element);
    if (/^(answer|accept) call$/i.test(text)) return true;
    if (!/^(answer|accept)$/i.test(text)) return false;
    const region = element.closest('[role="dialog"], [role="alertdialog"], dialog');
    return !!region && /incoming call/i.test(`${region.getAttribute('aria-label') ?? ''} ${region.textContent ?? ''}`);
  });
  // Ambiguous controls must never answer the wrong call.
  return candidates.length === 1 ? candidates[0]! : null;
}

export function findAnswerButton(root: Document): HTMLElement | null {
  const button = findIncomingCallButton(root);
  return button && usable(button) ? button : null;
}

export function hasActiveCall(root: Document): boolean {
  return Array.from(root.querySelectorAll<HTMLElement>('button, [role="button"]'))
    .some(element => visible(element) && END.test(label(element)));
}

export function readCallState(root: Document): { inCall: boolean; callPhase: CallPhase; muted: boolean } {
  const controls = Array.from(root.querySelectorAll<HTMLElement>('button, [role="button"]')).filter(visible);
  const end = controls.filter(element => END.test(label(element)));
  if (!end.length) return { inCall: false, callPhase: findIncomingCallButton(root) ? 'ringing' : 'idle', muted: false };
  // Ambiguous or multiple call panels remain busy without guessing their state.
  if (end.length !== 1) return { inCall: true, callPhase: 'active', muted: false };
  const region = end[0]!.closest<HTMLElement>(CALL_REGION);
  if (!region) return { inCall: true, callPhase: 'active', muted: false };
  const buttons = controls.filter(element => region.contains(element));
  const held = buttons.some(element => RESUME.test(label(element))
    || (HOLD.test(label(element)) && element.getAttribute('aria-pressed') === 'true'));
  const muted = buttons.some(element => /^unmute( microphone)?$/i.test(label(element))
    || (/^mute( microphone)?$/i.test(label(element)) && element.getAttribute('aria-pressed') === 'true'));
  const markers = Array.from(region.querySelectorAll<HTMLElement>('[role="status"], [aria-live], [aria-label]')).filter(visible).map(label);
  const phases: [RegExp, CallPhase][] = [[/^reconnecting(…|\.\.\.)?$/i, 'reconnecting'], [/^transferring( call)?(…|\.\.\.)?$/i, 'transferring'],
    [/^(ending|disconnecting)( call)?(…|\.\.\.)?$/i, 'ending'], [/^connecting(…|\.\.\.)?$/i, 'connecting'], [/^(dialing|calling)(…|\.\.\.)?$/i, 'dialing']];
  return { inCall: true, callPhase: phases.find(([pattern]) => markers.some(marker => pattern.test(marker)))?.[1] ?? (held ? 'held' : 'active'), muted };
}

export function callButtons(root: Document): Partial<Record<import('../shared/model').CallAction, HTMLElement>> {
  const answer = findAnswerButton(root);
  const result: Partial<Record<import('../shared/model').CallAction, HTMLElement>> = {};
  if (answer) result.answer = answer;
  const controls = Array.from(root.querySelectorAll<HTMLElement>('button, [role="button"]')).filter(usable);
  const ends = controls.filter(element => END.test(label(element)));
  if (ends.length === 1) result.end = ends[0];
  const incoming = findIncomingCallButton(root);
  if (incoming) delete result.end;
  const anchor = incoming ?? (ends.length === 1 ? ends[0] : undefined);
  const region = anchor?.closest<HTMLElement>(CALL_REGION);
  if (!region) return result;
  const patterns: [import('../shared/model').CallAction, RegExp][] = incoming
    ? [['decline', /^(decline|reject)( call)?$/i]]
    : [['mute', /^mute( microphone)?$/i], ['unmute', /^unmute( microphone)?$/i], ['hold', HOLD], ['resume', RESUME]];
  for (const [action, pattern] of patterns) {
    const matches = controls.filter(element => region.contains(element) && pattern.test(label(element)));
    if (matches.length === 1) {
      const element = matches[0]!;
      const target = element.getAttribute('aria-pressed') === 'true' ? action === 'mute' ? 'unmute' : action === 'hold' ? 'resume' : action : action;
      result[target] = element;
    }
  }
  return result;
}
