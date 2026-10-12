import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVE_ERROR } from '../data/errors';
import { ITEMS_LOAD_ERROR } from '../data/items-repo';
import { LOAD_ERROR } from '../data/lists-repo';
import { routerProps, setupApp, type AppCtx } from '../testing/app-fixture';
import Router from './Router.svelte';

const setup = () => setupApp(new Date(2026, 9, 14, 9, 0), 'polish-ui');
const at = (day: number) => new Date(2026, 9, day, 12).getTime();

function renderAt(ctx: AppCtx, hash: string, overrides: Partial<ReturnType<typeof routerProps>> = {}) {
  location.hash = hash;
  return render(Router, { props: { ...routerProps(ctx), ...overrides } });
}

/** Starter lists are list-1 Fitness, list-2 Work, list-3 Side Business, list-4 Personal. */
async function seed(ctx: AppCtx) {
  await ctx.listsRepo.ensureStarterLists();
  const make = async (title: string, type: string, listId = 'list-4', extra = {}) => {
    const made = await ctx.itemsRepo.create({ title, type, listId, target: 3, ...extra });
    if (!made.ok) throw new Error(made.error);
    return made.value.id;
  };
  return make;
}

describe('Recently deleted', () => {
  it('lists deleted items newest first with what, where and when', async () => {
    const ctx = setup();
    const make = await seed(ctx);
    const meditate = await make('Meditate', 'daily');
    const call = await make('Call mom', 'todo');
    await ctx.db.items.update(meditate, { archivedAt: at(12) });
    await ctx.db.items.update(call, { archivedAt: at(13) });
    renderAt(ctx, '#/deleted');

    expect(await screen.findByRole('heading', { level: 1, name: 'Recently deleted' })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toContainElement(
      screen.getAllByRole('link', { name: 'Lists' })[0]!,
    );
    const rows = await screen.findAllByRole('listitem');
    expect(rows.map((row) => row.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Call mom To-do · Personal · Deleted Oct 13 Restore',
      'Meditate Daily habit · Personal · Deleted Oct 12 Restore',
    ]);
    const tabs = screen.getByRole('navigation', { name: 'Main' });
    expect(within(tabs).getByRole('link', { name: 'Lists' })).toHaveAttribute('aria-current', 'page');
  });

  it('says when nothing is deleted', async () => {
    const ctx = setup();
    renderAt(ctx, '#/deleted');
    expect(await screen.findByText('Nothing deleted.')).toBeInTheDocument();
  });

  it('restores a habit with its streak, at the end of its list', async () => {
    const ctx = setup();
    const make = await seed(ctx);
    const meditate = await make('Meditate', 'daily');
    await make('Read', 'daily');
    for (const day of ['2026-10-12', '2026-10-13', '2026-10-14']) await ctx.itemsRepo.toggleDay(meditate, day);
    await ctx.itemsRepo.archive(meditate);
    renderAt(ctx, '#/deleted');

    await fireEvent.click(await screen.findByRole('button', { name: 'Restore Meditate' }));

    expect(await screen.findByText('Restored “Meditate”.')).toBeInTheDocument();
    expect(await screen.findByText('Nothing deleted.')).toBeInTheDocument();
    location.hash = '#/today';
    const personal = await screen.findByRole('region', { name: 'Personal' });
    await waitFor(() =>
      expect(within(personal).getAllByRole('checkbox').map((box) => box.getAttribute('aria-label'))).toEqual([
        'Read',
        'Meditate',
      ]),
    );
    expect(screen.getByRole('img', { name: '3 day streak' })).toBeInTheDocument();
  });

  it('restores into the first list when its own list was deleted, and says so', async () => {
    const ctx = setup();
    const make = await seed(ctx);
    await make('Post on Instagram', 'daily', 'list-3');
    await ctx.listsRepo.remove('list-3');
    renderAt(ctx, '#/deleted');

    await fireEvent.click(await screen.findByRole('button', { name: 'Restore Post on Instagram' }));

    expect(
      await screen.findByText('Restored “Post on Instagram” to Fitness because its list was deleted.'),
    ).toBeInTheDocument();
    expect((await ctx.db.items.get('item-1'))?.listId).toBe('list-1');
  });

  it('explains that a list is needed when there are none', async () => {
    const ctx = setup();
    const make = await seed(ctx);
    await make('Meditate', 'daily');
    for (const id of ['list-1', 'list-2', 'list-3', 'list-4']) await ctx.listsRepo.remove(id);
    renderAt(ctx, '#/deleted');

    await fireEvent.click(await screen.findByRole('button', { name: 'Restore Meditate' }));

    expect(await screen.findByText('Create a list first, then restore.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore Meditate' })).toBeInTheDocument();
  });

  it('reports a restore that could not be saved', async () => {
    const ctx = setup();
    const make = await seed(ctx);
    const id = await make('Meditate', 'daily');
    await ctx.itemsRepo.archive(id);
    renderAt(ctx, '#/deleted');
    const button = await screen.findByRole('button', { name: 'Restore Meditate' });
    ctx.db.close();

    await fireEvent.click(button);

    expect(await screen.findByText(SAVE_ERROR)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore Meditate' })).toBeInTheDocument();
  });

  it.each([
    ['lists', { getAll: async () => ({ ok: false as const, error: LOAD_ERROR }) }, 'listsRepo', LOAD_ERROR],
    [
      'deleted items',
      { listArchived: async () => ({ ok: false as const, error: ITEMS_LOAD_ERROR }) },
      'itemsRepo',
      ITEMS_LOAD_ERROR,
    ],
  ])('reports when the %s cannot be loaded', async (_what, broken, repo, message) => {
    const ctx = setup();
    const base = repo === 'listsRepo' ? ctx.listsRepo : ctx.itemsRepo;
    renderAt(ctx, '#/deleted', { [repo]: { ...base, ...broken } });
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByText('Nothing deleted.')).toBeNull();
  });

  it('shows deleted names as plain text', async () => {
    const ctx = setup();
    const make = await seed(ctx);
    const id = await make('<img src=x onerror=alert(1)>', 'daily');
    await ctx.itemsRepo.archive(id);
    const { container } = renderAt(ctx, '#/deleted');
    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(container.querySelectorAll('img')).toHaveLength(0);
  });

  // Timed in e2e/polish.spec.ts in a real browser; here only that all of them are shown.
  it('shows 500 deleted items', async () => {
    const ctx = setup();
    await ctx.listsRepo.ensureStarterLists();
    await ctx.db.items.bulkAdd(
      Array.from({ length: 500 }, (_, i) => ({
        id: `x${i}`,
        listId: 'list-4',
        type: 'daily' as const,
        title: `Old ${i}`,
        order: i,
        archivedAt: i,
      })),
    );
    renderAt(ctx, '#/deleted');
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Restore / })).toHaveLength(500));
  }, 30_000);
});

describe('Clear completed', () => {
  async function withCompleted(ctx: AppCtx) {
    const make = await seed(ctx);
    for (const title of ['A', 'B', 'C']) {
      const id = await make(title, 'todo');
      await ctx.itemsRepo.setTodoDone(id, true);
    }
    await make('Open', 'todo');
    const elsewhere = await make('Work done', 'todo', 'list-2');
    await ctx.itemsRepo.setTodoDone(elsewhere, true);
  }

  const clearButton = () => screen.findByRole('button', { name: 'Clear completed' });

  it('asks first, and Cancel keeps everything', async () => {
    const ctx = setup();
    await withCompleted(ctx);
    renderAt(ctx, '#/list/list-4');

    await fireEvent.click(await clearButton());
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Clear 3 completed to-dos? You can restore them from Recently deleted.');
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Completed (3)' })).toBeInTheDocument();
    expect((await ctx.db.items.toArray()).filter((item) => item.archivedAt)).toHaveLength(0);
  });

  it('moves them to Recently deleted and leaves the rest alone', async () => {
    const ctx = setup();
    await withCompleted(ctx);
    renderAt(ctx, '#/list/list-4');

    await fireEvent.click(await clearButton());
    await fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Clear' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: /^Completed/ })).toBeNull());
    expect(screen.getByRole('checkbox', { name: 'Open' })).toBeInTheDocument();
    location.hash = '#/deleted';
    expect(await screen.findByRole('button', { name: 'Restore A' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Restore / })).toHaveLength(3);
    location.hash = '#/list/list-2';
    expect(await screen.findByRole('button', { name: 'Completed (1)' })).toBeInTheDocument();
  });

  it('says so when clearing cannot be saved', async () => {
    const ctx = setup();
    await withCompleted(ctx);
    renderAt(ctx, '#/list/list-4');
    await fireEvent.click(await clearButton());
    ctx.db.close();

    await fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Clear' }));

    expect(await screen.findByText(SAVE_ERROR)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Completed (3)' })).toBeInTheDocument();
  });

  it('says "to-do" for one', async () => {
    const ctx = setup();
    const make = await seed(ctx);
    const id = await make('A', 'todo');
    await ctx.itemsRepo.setTodoDone(id, true);
    renderAt(ctx, '#/list/list-4');
    await fireEvent.click(await clearButton());
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Clear 1 completed to-do?');
  });
});

describe('reordering habits in a list', () => {
  const ROW = 50;
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 320, height: ROW }),
    );
  });
  afterEach(() => vi.restoreAllMocks());

  async function fitness(ctx: AppCtx) {
    const make = await seed(ctx);
    await make('Stretch', 'daily', 'list-1');
    await make('Buy shoes', 'todo', 'list-1');
    await make('Peloton ride', 'weekly', 'list-1');
  }
  const names = () => [...document.querySelectorAll('.reorder-name')].map((name) => name.textContent);

  it('shows handles for habits and goals only, in Edit mode', async () => {
    const ctx = setup();
    await fitness(ctx);
    renderAt(ctx, '#/list/list-1');

    await fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));

    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reorder Stretch' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reorder Peloton ride' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reorder Buy shoes' })).toBeNull();
    expect(names()).toEqual(['Stretch', 'Peloton ride']);
  });

  it('has no Edit button with fewer than two habits and goals', async () => {
    const ctx = setup();
    const make = await seed(ctx);
    await make('Stretch', 'daily', 'list-1');
    await make('Buy shoes', 'todo', 'list-1');
    renderAt(ctx, '#/list/list-1');
    await screen.findByRole('checkbox', { name: 'Stretch' });
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('drags a goal above a habit, and Today follows after Done', async () => {
    const ctx = setup();
    await fitness(ctx);
    renderAt(ctx, '#/list/list-1');
    await fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));

    const handle = screen.getByRole('button', { name: 'Reorder Peloton ride' });
    await fireEvent.pointerDown(handle, { clientY: 200, pointerId: 1, button: 0 });
    await fireEvent.pointerMove(handle, { clientY: 200 - ROW, pointerId: 1 });
    await fireEvent.pointerUp(handle, { clientY: 200 - ROW, pointerId: 1 });

    expect(names()).toEqual(['Peloton ride', 'Stretch']);
    await fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    location.hash = '#/today';
    const group = await screen.findByRole('region', { name: 'Fitness' });
    await waitFor(() =>
      expect(within(group).getAllByRole('link').map((link) => link.textContent?.trim())).toEqual([
        'Peloton ride',
        'Stretch',
      ]),
    );
  });

  it('moves with the hidden VoiceOver buttons too', async () => {
    const ctx = setup();
    await fitness(ctx);
    renderAt(ctx, '#/list/list-1');
    await fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));

    await fireEvent.click(screen.getByRole('button', { name: 'Move Peloton ride up' }));

    await waitFor(() => expect(names()).toEqual(['Peloton ride', 'Stretch']));
    expect(screen.queryByRole('button', { name: 'Move Peloton ride up' })).toBeNull();
    await waitFor(async () => {
      const stored = await ctx.itemsRepo.listActive();
      expect(stored.ok && stored.value.filter((item) => item.listId === 'list-1').map((item) => item.title)).toEqual([
        'Peloton ride',
        'Stretch',
        'Buy shoes',
      ]);
    });
  });

  it('puts the order back when it cannot be saved', async () => {
    const ctx = setup();
    await fitness(ctx);
    renderAt(ctx, '#/list/list-1');
    await fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    ctx.db.close();

    await fireEvent.click(screen.getByRole('button', { name: 'Move Peloton ride up' }));

    expect(await screen.findByText(SAVE_ERROR)).toBeInTheDocument();
    expect(names()).toEqual(['Stretch', 'Peloton ride']);
  });
});
