import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { createDb } from '../data/db';
import { LOAD_ERROR, SAVE_ERROR, createListsRepo } from '../data/lists-repo';
import { LIST_COLORS } from '../domain/lists';
import Lists from './Lists.svelte';

let dbCounter = 0;

function setup() {
  const db = createDb(`lists-ui-${++dbCounter}`);
  let n = 0;
  const repo = createListsRepo(db, { newId: () => `id-${++n}`, now: () => 1_000 });
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
    expect(screen.getAllByRole('link')).toHaveLength(4);

    await startEditing();
    expect(screen.queryByRole('link')).toBeNull();
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
    for (const label of ['Edit Fitness', 'Move Fitness up', 'Move Fitness down', 'Delete Fitness']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }

    await fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('button', { name: 'Edit Fitness' })).toBeNull();
  });

  it('moves a list, disables the buttons at the edges, and remembers the order', async () => {
    const { repo } = setup();
    const first = render(Lists, { props: { repo } });
    await screen.findByText('Fitness');
    await startEditing();

    expect(screen.getByRole('button', { name: 'Move Fitness up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Personal down' })).toBeDisabled();

    await fireEvent.click(screen.getByRole('button', { name: 'Move Side Business up' }));
    await waitFor(() =>
      expect(rowNames()).toEqual(['Fitness', 'Side Business', 'Work', 'Personal']),
    );

    first.unmount();
    render(Lists, { props: { repo } });
    await screen.findByText('Side Business');
    expect(rowNames()).toEqual(['Fitness', 'Side Business', 'Work', 'Personal']);
  });

  it('moves a list down', async () => {
    const { repo } = setup();
    render(Lists, { props: { repo } });
    await screen.findByText('Fitness');
    await startEditing();

    await fireEvent.click(screen.getByRole('button', { name: 'Move Fitness down' }));
    await waitFor(() =>
      expect(rowNames()).toEqual(['Work', 'Fitness', 'Side Business', 'Personal']),
    );
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

    await fireEvent.click(screen.getByRole('button', { name: 'Move Work up' }));
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
