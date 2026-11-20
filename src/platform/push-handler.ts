import { FALLBACK_NOTE, arrivalsNote, dueSummary, parsePush, type NotifyTodo } from '../domain/notify';

export interface NotificationPlan {
  title: string;
  body: string;
  /** A newer notification of the same kind replaces the older one. */
  tag: string;
}

/**
 * What the service worker shows for a push (s30). The morning summary is written from the
 * phone's own to-dos, since the server only knows dates; anything unreadable still shows the
 * fallback, because iOS stops delivering to a web app whose pushes show nothing.
 */
export async function notificationFor(
  data: unknown,
  loadTodos: () => Promise<NotifyTodo[]>,
): Promise<NotificationPlan> {
  const message = parsePush(data);
  if (message === null) return { ...FALLBACK_NOTE, tag: 'habit-tracker' };
  if (message.kind === 'arrivals') return { ...arrivalsNote(message), tag: 'arrivals' };
  try {
    return { ...dueSummary(await loadTodos(), message.day), tag: 'due-summary' };
  } catch {
    return { ...FALLBACK_NOTE, tag: 'due-summary' };
  }
}

/** Reads a push's JSON body; null when there is none or it isn't JSON. */
export function pushData(event: { data: { json(): unknown } | null }): unknown {
  try {
    return event.data?.json() ?? null;
  } catch {
    return null;
  }
}

interface WindowLike {
  url: string;
  focus(): Promise<unknown>;
  navigate(url: string): Promise<unknown>;
}

/** A tapped notification: bring the open app to Today, or open it there. */
export async function openToday(
  todayUrl: string,
  clients: { matchAll(): Promise<readonly WindowLike[]>; openWindow(url: string): Promise<unknown> },
): Promise<void> {
  const [open] = await clients.matchAll();
  if (!open) {
    await clients.openWindow(todayUrl);
    return;
  }
  await open.focus();
  if (open.url !== todayUrl) await open.navigate(todayUrl);
}
