function label(element: HTMLElement): string {
  return (element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent || '').trim().replace(/\s+/g, ' ');
}

function usable(element: HTMLElement): boolean {
  const style = getComputedStyle(element);
  return element.isConnected && element.getClientRects().length > 0 && style.visibility !== 'hidden' && style.display !== 'none'
    && !element.hasAttribute('disabled') && element.getAttribute('aria-disabled') !== 'true';
}

export function findAnswerButton(root: Document): HTMLElement | null {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>('button, [role="button"]')).filter(element => {
    if (!usable(element)) return false;
    const text = label(element);
    if (/^(answer|accept) call$/i.test(text)) return true;
    if (!/^(answer|accept)$/i.test(text)) return false;
    const region = element.closest('[role="dialog"], [role="alertdialog"], dialog');
    return !!region && /incoming call/i.test(region.textContent ?? '');
  });
  // Ambiguous controls must never answer the wrong call.
  return candidates.length === 1 ? candidates[0]! : null;
}

export function hasActiveCall(root: Document): boolean {
  return Array.from(root.querySelectorAll<HTMLElement>('button, [role="button"]'))
    .some(element => usable(element) && /^(end call|hang up|hangup)$/i.test(label(element)));
}
