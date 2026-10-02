export interface UnreadState { unread: number; unreadKnown: boolean }

const bounded = (value: string) => Math.min(Number(value), 9999);

export class UnreadCounter {
  private inboxCounts = new WeakMap<Element, number>();

  read(document: Document): UnreadState {
    const title = document.title.match(/^\((\d+)\)/)?.[1];
    const inboxes = document.querySelector('#sideMenu nav[aria-label="Inboxes"] [role="list"]');
    if (!inboxes) return { unread: title === undefined ? 0 : bounded(title), unreadKnown: title !== undefined };

    let unread = 0, unreadKnown = true;
    for (const row of inboxes.querySelectorAll('[role="listitem"]')) {
      const badge = Array.from(row.querySelectorAll('[aria-label]')).map(element => element.getAttribute('aria-label')!.match(/^(\d+) unread conversations?$/i)?.[1]).find(value => value !== undefined);
      // Quo replaces the badge with More while hovering. Keep that row's last
      // observed count until its badge returns; never infer zero from the menu.
      const hovering = !!row.querySelector('[aria-label="More menu"]');
      const count = badge !== undefined ? bounded(badge) : hovering ? this.inboxCounts.get(row) : 0;
      if (count === undefined) unreadKnown = false;
      else { this.inboxCounts.set(row, count); unread += count; }
    }
    // These are separate badges, not copies of the selected conversation list.
    for (const badge of document.querySelectorAll('#sideMenu nav[aria-label="Your team"] [aria-label]')) {
      const count = badge.getAttribute('aria-label')!.match(/^(\d+) unread messages?$/i)?.[1];
      if (count !== undefined) unread += bounded(count);
    }
    return { unread: Math.min(unread, 9999), unreadKnown };
  }
}
