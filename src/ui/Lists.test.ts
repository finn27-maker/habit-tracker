import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDb } from '../data/db';
import { LOAD_ERROR, SAVE_ERROR, createListsRepo } from '../data/lists-repo';
import { LIST_COLORS } from '../domain/lists';
import { FIXTURE_LISTS } from '../testing/fixture-lists';
import Lists from './Lists.svelte';

let dbCounter = 0;

function setup() {
  const db = createDb(`lists-ui-${++dbCounter}`);
  let n = 0;
  const repo = createListsRepo(db, {
    newId: () => `id-${++n}`,
    now: () => 1_000,
    starters: FIXTURE_LISTS,
  });
  return { db, repo };
}

const rowNames = () =>
  screen.getAllByRole('listitem').map((li) => li.querySelector('.name')?.textContent);

async function openCreateForm() {
  await fireEvent.click(screen.getByRole('button', { name: 'New list' }));
}

async function fillForm(name: string, emoji: string, color?: string) {
  await fireEvent.input(screen.getByLabelText('Name'), { target: { value: name } });
  await fireEvent.input(screen.getByLabelText('Emoji'), { target: { value: emoji } });
  if (color) await fireEvent.click(screen.getByRole('radio', { name: color }));
  await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
}

async function startEditing() {
  await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
}

describe('Lists screen', () => {
  it('shows the four starter lists with emoji and colors on first open', async () => {
    const { repo } = setup();
    render(Lists, { props: { repo } });
    await screen.findByText('Fitness');

    expect(screen.getByRole('heading', { level: 1, name: 'Lists' })).toBeInTheDocument();
    expect(rowNames()).toEqual(['Fitness', 'Work', 'Side Business', 'Personal']);
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('🏋️');
    expect(rows[0]!.querySelector('.icon')).toHaveStyle(`background: ${LIST_COLORS.orange}`);
    expect(rows[3]!.querySelector('.icon')).toHaveStyle(`background: ${LIST_COLORS.green}`);
  });

  it('opens a list page from each row, but not in Edit mode', async () => {
    const { repo } = setup();
    render(Lists, { props: { repo } });
    await screen.findByText('Fitness');

    expect(screen.getByRole('link', { name: 'Personal' })).toHaveAttribute('href', '#/list/id-4');
    const listLinks = () =>
      screen.queryAllByRole('link').filter((link) => link.getAttribute('href')?.startsWith('#/list/'));
    expect(listLinks()).toHaveLength(4);
    expect(screen.getByRole('link', { name: 'Recently deleted' })).toHaveAttribute('href', '#/deleted');

    expect(screen.queryByRole('button', { name: /^Reorder / })).toBeNull();

    await startEditing();
    expect(listLinks()).toHaveLength(0);
    expect(rowNames()).toEqual(['Fitness', 'Work', 'Side Business', 'Personal']);
  });

  it('shows an empty state when every list has been deleted', async () => {
    const { repo } = setup();
    await repo.ensureStarterLists();
    for (const id of ['id-1', 'id-2', 'id-3', 'id-4']) await repo.remove(id);
    render(Lists, { props: { repo } });
    expect(await screen.findByText('No lists yet. Tap + to create one.')).toBeInTheDocument();
  });

  it('creates a list with a name, emoji and color, and keeps it after reopening', async () => {
    const { repo } = setup();
    const first = render(Lists, { props: { repo } });
    await screen.findByText('Fitness');

    await openCreateForm();
    expect(screen.getByRole('dialog', { name: 'New list' })).toBeInTheDocument();
    await fillForm('Reading', '📚', 'teal');

    await screen.findByText('Reading');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(rowNames()).toEqual(['Fitness', 'Work', 'Side Business', 'Personal', 'Reading']);
    expect(screen.getAllByRole('listitem')[4]!.querySelector('.icon')).toHaveStyle(
      `background: ${LIST_COLORS.teal}`,
    );

    first.unmount();
    render(Lists, { props: { repo } });
    await screen.findByText('Reading');
    expect(rowNames()).toHaveLength(5);
  });

  it('keeps the form open and explains what is wrong with the input', async () => {
    const { repo } = setup();
    render(Lists, { props: { repo } });
    await screen.findByText('Fitness');

    await openCreateForm();
    await fillForm('   ', '📚');
    expect(await screen.findByRole('alert')).toHaveTextContent("List name can't be empty");
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await fillForm('Reading', 'ab');
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Pick exactly one emoji'),
    );
    expect(rowNames()).toHaveLength(4);

    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows list names containing HTML as plain text', async () => {
    const { repo } = setup();
    render(Lists, { props: { repo } });
    await screen.findByText('Fitness');

    await openCreateForm();
    await fillForm('<img src=x onerror=alert(1)>', '📚', 'teal');

    await screen.findByText('<img src=x onerror=alert(1)>');
    expect(document.querySelectorAll('img')).toHaveLength(0);
  });

  it('only shows the edit tools in Edit mode, and Done leaves it', async () => {
    const { repo } = setup();
    render(Lists, { props: { repo } });
    await screen.findByText('Fitness');
    expect(screen.queryByRole('button', { name: 'Edit Fitness' })).toBeNull();

    await startEditing();
    for (const label of ['Edit Fitness', 'Delete Fitness', 'Reorder Fitness']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    // Move buttons exist only for VoiceOver: visually hidden, and none past either end.
    expect(screen.getByRole('button', { name: 'Move Fitness down' })).toHaveClass('sr-only');
    expect(screen.queryByRole('button', { name: 'Move Fitness up' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Move Personal down' })).toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('button', { name: 'Edit Fitness' })).toBeNull();
  });

  describe('drag to reorder', () => {
    const ROW = 50;
    // jsdom has no layout, so every row reports the same height for the drag maths.
    beforeEach(() => {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
        DOMRect.fromRect({ x: 0, y: 0, width: 320, height: ROW }),
      );
    });
    afterEach(() => vi.restoreAllMocks());

    const handle = (name: string) => screen.getByRole('button', { name: `Reorder ${name}` });
    const row = (name: string) => handle(name).closest('li') as HTMLElement;

    async function press(name: string, button = 0) {
      await fireEvent.pointerDown(handle(name), { clientY: 200, pointerId: 1, button });
    }
    async function moveBy(name: string, dy: number) {
      await fireEvent.pointerMove(handle(name), { clientY: 200 + dy, pointerId: 1 });
    }
    async function drag(name: string, dy: number) {
      await press(name);
      await moveBy(name, dy);
      await fireEvent.pointerUp(handle(name), { clientY: 200 + dy, pointerId: 1 });
    }

    async function renderEditing(repo = setup().repo) {
      const view = render(Lists, { props: { repo } });
      await screen.findByText('Fitness');
      await startEditing();
      return view;
    }

    it('drops a list two places down and remembers the order', async () => {
      const { repo } = setup();
      const first = await renderEditing(repo);

      await drag('Fitness', 2 * ROW);
      expect(rowNames()).toEqual(['Work', 'Side Business', 'Fitness', 'Personal']);
      await waitFor(async () => {
        const stored = await repo.getAll();
        expect(stored.ok && stored.value.map((l) => l.name)).toEqual([
          'Work',
          'Side Business',
          'Fitness',
          'Personal',
        ]);
      });

      first.unmount();
      render(Lists, { props: { repo } });
      await screen.findByText('Fitness');
      expect(rowNames()).toEqual(['Work', 'Side Business', 'Fitness', 'Personal']);
    });

    it('drops a list at the top', async () => {
      await renderEditing();
      await drag('Personal', -3 * ROW);
      expect(rowNames()).toEqual(['Personal', 'Fitness', 'Work', 'Side Business']);
    });

    it('stops at the first and last places when dragged past them', async () => {
      await renderEditing();
      await drag('Fitness', 10 * ROW);
      expect(rowNames()).toEqual(['Work', 'Side Business', 'Personal', 'Fitness']);
      await drag('Personal', -10 * ROW);
      await waitFor(() =>
        expect(rowNames()).toEqual(['Personal', 'Work', 'Side Business', 'Fitness']),
      );
    });

    it('moves the row with the finger and makes room, without saving until let go', async () => {
      const { repo } = setup();
      const spy = { ...repo, moveTo: vi.fn(repo.moveTo) };
      await renderEditing(spy);

      await press('Work');
      await moveBy('Work', 30);

      expect(row('Work')).toHaveStyle('transform: translateY(30px)');
      expect(row('Side Business')).toHaveStyle(`transform: translateY(-${ROW}px)`);
      expect(row('Fitness').style.transform).toBe('');
      expect(spy.moveTo).not.toHaveBeenCalled();
    });

    it('changes nothing for a tiny drag', async () => {
      const { repo } = setup();
      const spy = { ...repo, moveTo: vi.fn(repo.moveTo) };
      await renderEditing(spy);

      await drag('Work', 10);

      expect(rowNames()).toEqual(['Fitness', 'Work', 'Side Business', 'Personal']);
      expect(spy.moveTo).not.toHaveBeenCalled();
      expect(row('Work').style.transform).toBe('');
    });

    it('puts the row back when the touch is cancelled', async () => {
      await renderEditing();
      await press('Work');
      await moveBy('Work', 2 * ROW);
      await fireEvent.pointerCancel(handle('Work'), { pointerId: 1 });

      expect(row('Work').style.transform).toBe('');
      expect(rowNames()).toEqual(['Fitness', 'Work', 'Side Business', 'Personal']);
    });

    it('ignores the right mouse button and moves without a press', async () => {
      const { repo } = setup();
      const spy = { ...repo, moveTo: vi.fn(repo.moveTo) };
      await renderEditing(spy);

      await press('Work', 2);
      await moveBy('Work', 2 * ROW);
      await fireEvent.pointerUp(handle('Work'), { pointerId: 1 });

      expect(row('Work').style.transform).toBe('');
      expect(spy.moveTo).not.toHaveBeenCalled();
    });

    it('moves one place per arrow key and keeps focus on the handle', async () => {
      const { repo } = setup();
      const spy = { ...repo, moveTo: vi.fn(repo.moveTo) };
      await renderEditing(spy);

      handle('Side Business').focus();
      await fireEvent.keyDown(handle('Side Business'), { key: 'ArrowUp' });
      await waitFor(() =>
        expect(rowNames()).toEqual(['Fitness', 'Side Business', 'Work', 'Personal']),
      );
      await waitFor(() => expect(handle('Side Business')).toHaveFocus());

      await fireEvent.keyDown(handle('Side Business'), { key: 'ArrowDown' });
      await waitFor(() =>
        expect(rowNames()).toEqual(['Fitness', 'Work', 'Side Business', 'Personal']),
      );

      spy.moveTo.mockClear();
      await fireEvent.keyDown(handle('Fitness'), { key: 'ArrowUp' });
      await fireEvent.keyDown(handle('Personal'), { key: 'ArrowDown' });
      await fireEvent.keyDown(handle('Work'), { key: 'Enter' });
      expect(spy.moveTo).not.toHaveBeenCalled();
    });

    it('puts the old order back and says so when saving fails', async () => {
      const { repo, db } = setup();
      await renderEditing(repo);
      db.close();

      await drag('Personal', -3 * ROW);

      expect(await screen.findByRole('status')).toHaveTextContent(SAVE_ERROR);
      expect(rowNames()).toEqual(['Fitness', 'Work', 'Side Business', 'Personal']);
    });

    it('reorders with the hidden Move buttons that VoiceOver reaches', async () => {
      await renderEditing();
      await fireEvent.click(screen.getByRole('button', { name: 'Move Work down' }));
      await waitFor(() =>
        expect(rowNames()).toEqual(['Fitness', 'Side Business', 'Work', 'Personal']),
      );
      await waitFor(() => expect(handle('Work')).toHaveFocus());
      await fireEvent.click(screen.getByRole('button', { name: 'Move Work up' }));
      await waitFor(() =>
        expect(rowNames()).toEqual(['Fitness', 'Work', 'Side Business', 'Personal']),
      );
    });

    it('labels the handle with the name as plain text', async () => {
      const { repo } = setup();
      await repo.create({ name: '<img src=x onerror=alert(1)>', emoji: '📚', color: 'teal' });
      await renderEditing(repo);
      expect(handle('<img src=x onerror=alert(1)>')).toBeInTheDocument();
      expect(document.querySelectorAll('img')).toHaveLength(0);
    });
  });

  it('starts on blue and lets the last picked color win', async () => {
    const { repo } = setup();
    render(Lists, { props: { repo } });
    await screen.findByText('Fitness');
    await openCreateForm();

    expect(screen.getByRole('radio', { name: 'blue' })).toBeChecked();
    await fireEvent.click(screen.getByRole('radio', { name: 'red' }));
    await fireEvent.click(screen.getByRole('radio', { name: 'teal' }));
    expect(screen.getByRole('radio', { name: 'teal' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'red' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'blue' })).not.toBeChecked();
  });

  it('renames and recolors a list from its edit form', async () => {
    const { repo } = setup();
    render(Lists, { props: { repo } });
    await screen.findByText('Work');
    await startEditing();

    await fireEvent.click(screen.getByRole('button', { name: 'Edit Work' }));
    expect(screen.getByRole('dialog', { name: 'Edit list' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Work');
    await fillForm('Day Job', '💼', 'red');

    await screen.findByText('Day Job');
    expect(rowNames()).toEqual(['Fitness', 'Day Job', 'Side Business', 'Personal']);
    expect(screen.getAllByRole('listitem')[1]!.querySelector('.icon')).toHaveStyle(
      `background: ${LIST_COLORS.red}`,
    );
  });

  it('asks before deleting an empty list, and Cancel keeps it', async () => {
    const { repo } = setup();
    render(Lists, { props: { repo } });
    await screen.findByText('Personal');
    await startEditing();

    await fireEvent.click(screen.getByRole('button', { name: 'Delete Personal' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Delete "Personal"?');

    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(rowNames()).toHaveLength(4);

    await fireEvent.click(screen.getByRole('button', { name: 'Delete Personal' }));
    await fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    );
    await waitFor(() => expect(rowNames()).toEqual(['Fitness', 'Work', 'Side Business']));
  });

  it.each([
    [4, 'Delete "Work" and its 4 items? Their history will be archived.'],
    [1, 'Delete "Work" and its 1 item? Their history will be archived.'],
  ])('archives the %i items of a deleted list after confirming', async (count, message) => {
    const { repo, db } = setup();
    render(Lists, { props: { repo } });
    await screen.findByText('Work');
    await db.items.bulkAdd(
      Array.from({ length: count }, (_, i) => ({
        id: `item-${i}`,
        listId: 'id-2',
        type: 'todo' as const,
        title: `Task ${i}`,
        order: i,
      })),
    );
    await startEditing();

    await fireEvent.click(screen.getByRole('button', { name: 'Delete Work' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(message);
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(rowNames()).not.toContain('Work'));
    const items = await db.items.toArray();
    expect(items).toHaveLength(count);
    expect(items.every((i) => i.archivedAt === 1_000)).toBe(true);
  });

  it('reports storage failures instead of pretending they worked', async () => {
    const { repo, db } = setup();
    render(Lists, { props: { repo } });
    await screen.findByText('Fitness');
    await startEditing();
    db.close();

    await fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder Work' }), { key: 'ArrowUp' });
    expect(await screen.findByRole('status')).toHaveTextContent(SAVE_ERROR);

    await fireEvent.click(screen.getByRole('button', { name: 'Delete Fitness' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(LOAD_ERROR));
    expect(screen.queryByRole('alertdialog')).toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await openCreateForm();
    await fillForm('Reading', '📚', 'teal');
    expect(await screen.findByRole('alert')).toHaveTextContent(SAVE_ERROR);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('reports a failure to load the lists at launch', async () => {
    const { repo, db } = setup();
    await repo.ensureStarterLists();
    db.close();
    render(Lists, { props: { repo } });
    expect(await screen.findByRole('status')).toHaveTextContent(LOAD_ERROR);
    expect(screen.queryByText('No lists yet. Tap + to create one.')).toBeNull();
  });
});
