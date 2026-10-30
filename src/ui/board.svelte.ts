import { SvelteSet } from 'svelte/reactivity';
import type { ItemsRepo } from '../data/items-repo';
import type { ListsRepo } from '../data/lists-repo';
import { dayKey, weekStartKey } from '../domain/dates';
import type { Item, ItemType } from '../domain/items';
import type { List } from '../domain/lists';
import { moveRecurring } from '../domain/order';
import type { Result } from '../domain/result';
import type { TodayRow } from '../domain/today';
import { latestDayInWeek, type TargetPoint } from '../domain/weekly';
import type { Clock } from '../platform/clock';

/** How long a checked-off to-do stays in place, so a second tap can undo it. */
export const LINGER_MS = 3000;

export type FormValues = {
  title: string;
  listId: string;
  type: ItemType;
  target: number;
  /** YYYY-MM-DD, or '' for no date. Only used by to-dos. */
  dueDate: string;
  /** '' for no note. Only used by to-dos. */
  note: string;
};
export type FormState = { kind: 'new'; listId?: string } | { kind: 'edit'; row: TodayRow };

export interface BoardDeps {
  listsRepo: ListsRepo;
  itemsRepo: ItemsRepo;
  clock: Clock;
  lingerMs?: number;
}

function reopened(item: Item): Item {
  const copy = { ...item };
  delete copy.completedAt;
  return copy;
}

/**
 * Everything a screen of habits and to-dos needs: what is in storage, the current day,
 * and the actions that change them. Screens only decide which rows to show.
 */
export class Board {
  now: Date;
  lists = $state<List[]>([]);
  items = $state<Item[]>([]);
  days = $state<Record<string, string[]>>({});
  targets = $state<Record<string, TargetPoint[]>>({});
  /** To-dos just checked off that stay in place for a moment. */
  readonly lingering = new SvelteSet<string>();
  loaded = $state(false);
  notice = $state('');
  form = $state<FormState | null>(null);
  formError = $state('');

  readonly today: string;

  readonly #deps: BoardDeps;
  /** Linger timers by to-do id. Not reactive: nothing renders from them. */
  #timers: Record<string, ReturnType<typeof setTimeout>> = {};

  constructor(deps: BoardDeps) {
    this.#deps = deps;
    this.now = $state(deps.clock.now());
    this.today = $derived(dayKey(this.now));
  }

  /** Starts loading and watching the clock. The returned function stops both. */
  mount(): () => void {
    const stopWatching = this.#deps.clock.watch((next) => {
      this.now = next;
    });
    void this.#start();
    return () => {
      stopWatching();
      for (const timer of Object.values(this.#timers)) clearTimeout(timer);
      this.#timers = {};
    };
  }

  async #start() {
    // The starter lists must exist before anyone can add anything. If seeding fails,
    // the load below fails too and reports it.
    await this.#deps.listsRepo.ensureStarterLists();
    await this.refresh();
  }

  /** Shows what is actually in storage, or the first thing that could not be read. */
  async refresh() {
    const { listsRepo, itemsRepo } = this.#deps;
    const [listResult, itemResult, dayResult, targetResult] = await Promise.all([
      listsRepo.getAll(),
      itemsRepo.listActive(),
      itemsRepo.completionDays(),
      itemsRepo.listTargets(),
    ]);
    if (!listResult.ok) {
      this.notice = listResult.error;
    } else if (!itemResult.ok) {
      this.notice = itemResult.error;
    } else if (!dayResult.ok) {
      this.notice = dayResult.error;
    } else if (!targetResult.ok) {
      this.notice = targetResult.error;
    } else {
      this.lists = listResult.value;
      this.items = itemResult.value;
      this.days = dayResult.value;
      this.targets = targetResult.value;
      this.notice = '';
      this.loaded = true;
    }
  }

  /**
   * Reads the clock at tap time: the screen may still show yesterday (or last week) just
   * after midnight, and the tap belongs to the real day. Returns that day.
   */
  #stampNow(): string {
    const current = this.#deps.clock.now();
    this.now = current;
    return dayKey(current);
  }

  /** Updates the screen at once, then saves; puts it back if saving fails. */
  async #applyDays(
    itemId: string,
    before: string[],
    next: string[],
    save: () => Promise<Result<unknown>>,
  ) {
    this.days = { ...this.days, [itemId]: next };
    const result = await save();
    if (!result.ok) {
      this.days = { ...this.days, [itemId]: before };
      this.notice = result.error;
    }
  }

  async toggle(itemId: string) {
    const day = this.#stampNow();
    const before = this.days[itemId] ?? [];
    const next = before.includes(day) ? before.filter((d) => d !== day) : [...before, day];
    await this.#applyDays(itemId, before, next, () => this.#deps.itemsRepo.toggleDay(itemId, day));
  }

  async logWeekly(itemId: string) {
    const day = this.#stampNow();
    const before = this.days[itemId] ?? [];
    await this.#applyDays(itemId, before, [...before, day], () =>
      this.#deps.itemsRepo.addCompletion(itemId, day),
    );
  }

  async undoWeekly(itemId: string) {
    const weekStart = weekStartKey(this.#stampNow());
    const before = this.days[itemId] ?? [];
    const latest = latestDayInWeek(before, weekStart);
    if (latest === undefined) return; // nothing logged in the week the clock is really in
    const index = before.lastIndexOf(latest);
    await this.#applyDays(
      itemId,
      before,
      before.filter((_, i) => i !== index),
      () => this.#deps.itemsRepo.removeLatestCompletion(itemId, weekStart),
    );
  }

  /**
   * Calendar backfill for a past (or today's) day: a daily habit toggles that day; a weekly
   * goal gains a log, or loses one if the day already has any.
   */
  async backfill(itemId: string, day: string) {
    const item = this.items.find((candidate) => candidate.id === itemId);
    if (!item) return;
    const { itemsRepo } = this.#deps;
    const before = this.days[itemId] ?? [];
    const has = before.includes(day);

    if (item.type === 'daily') {
      const next = has ? before.filter((d) => d !== day) : [...before, day];
      await this.#applyDays(itemId, before, next, () => itemsRepo.toggleDay(itemId, day));
    } else if (has) {
      const index = before.lastIndexOf(day);
      await this.#applyDays(
        itemId,
        before,
        before.filter((_, i) => i !== index),
        () => itemsRepo.removeCompletionOn(itemId, day),
      );
    } else {
      await this.#applyDays(itemId, before, [...before, day], () =>
        itemsRepo.addCompletion(itemId, day),
      );
    }
  }

  /**
   * Checks a to-do off (it lingers, checked, before moving to Completed) or reopens it,
   * which also undoes a check-off that is still lingering.
   */
  async toggleTodo(itemId: string) {
    const before = this.items.find((item) => item.id === itemId);
    if (!before) return;
    const done = before.completedAt === undefined;

    this.#endLinger(itemId);
    this.#putItem(done ? { ...before, completedAt: this.#deps.clock.now().getTime() } : reopened(before));
    if (done) this.#startLinger(itemId);

    const result = await this.#deps.itemsRepo.setTodoDone(itemId, done);
    if (!result.ok) {
      this.#endLinger(itemId);
      this.#putItem(before);
      this.notice = result.error;
    }
  }

  #putItem(next: Item) {
    this.items = this.items.map((item) => (item.id === next.id ? next : item));
  }

  #startLinger(itemId: string) {
    this.lingering.add(itemId);
    const ms = this.#deps.lingerMs ?? LINGER_MS;
    this.#timers[itemId] = setTimeout(() => this.#endLinger(itemId), ms);
  }

  #endLinger(itemId: string) {
    clearTimeout(this.#timers[itemId]);
    delete this.#timers[itemId];
    this.lingering.delete(itemId);
  }

  /** Deletes a list's completed to-dos (they go to Recently deleted). */
  async clearCompleted(listId: string) {
    const result = await this.#deps.itemsRepo.clearCompleted(listId);
    if (!result.ok) {
      this.notice = result.error;
      return;
    }
    await this.refresh();
  }

  /** Moves a habit or goal within its list: shown at once, put back if saving fails. */
  async moveItem(itemId: string, to: number) {
    const item = this.items.find((candidate) => candidate.id === itemId);
    if (!item) return;
    const before = this.items;
    const moved = moveRecurring(
      before.filter((other) => other.listId === item.listId),
      itemId,
      to,
    );
    this.items = before.map((other) => moved.find((next) => next.id === other.id) ?? other);
    const result = await this.#deps.itemsRepo.moveTo(itemId, to);
    if (!result.ok) {
      this.items = before;
      this.notice = result.error;
    }
  }

  openForm(next: FormState) {
    this.formError = '';
    this.form = next;
  }

  closeForm() {
    this.form = null;
  }

  async save(current: FormState, values: FormValues) {
    const { itemsRepo } = this.#deps;
    if (current.kind === 'new') {
      await this.#finishForm(await itemsRepo.create(values));
      return;
    }
    const { type } = values;
    await this.#finishForm(
      await itemsRepo.update(current.row.item.id, {
        title: values.title,
        listId: values.listId,
        type,
        ...(type === 'weekly' ? { target: values.target } : {}),
        ...(type === 'todo' ? { dueDate: values.dueDate, note: values.note } : {}),
      }),
    );
  }

  async remove(itemId: string) {
    await this.#finishForm(await this.#deps.itemsRepo.archive(itemId));
  }

  /** Closes the sheet and refreshes on success; otherwise keeps it open with the error. */
  async #finishForm(result: Result<unknown>) {
    if (!result.ok) {
      this.formError = result.error;
      return;
    }
    this.form = null;
    await this.refresh();
  }
}

/** The values the edit sheet starts with for a row. */
export function editValues(row: TodayRow): FormValues {
  return {
    title: row.item.title,
    listId: row.item.listId,
    type: row.item.type,
    target: row.kind === 'weekly' ? row.target : 3,
    dueDate: row.item.dueDate ?? '',
    note: row.item.note ?? '',
  };
}
