import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { NOTE_TOO_LONG } from '../domain/items';
import { routerProps, setupApp, type AppCtx } from '../testing/app-fixture';
import Router from './Router.svelte';

const TODAY = '2026-10-30';
const setup = () => setupApp(new Date(2026, 9, 30, 9, 0), 'notes-ui');

function renderAt(ctx: AppCtx, hash: string) {
  location.hash = hash;
  return render(Router, { props: routerProps(ctx) });
}

/** Fixture lists are list-1 Fitness, list-2 Work, list-3 Side Business, list-4 Personal. */
async function addTodo(ctx: AppCtx, title: string, note?: string, dueDate = TODAY) {
  await ctx.listsRepo.ensureStarterLists();
  const made = await ctx.itemsRepo.create({ title, listId: 'list-4', type: 'todo', dueDate, note });
  if (!made.ok) throw new Error(made.error);
  return made.value.id;
}

const notesField = () => screen.getByLabelText('Notes') as HTMLTextAreaElement;
const edit = async (title: string) =>
  fireEvent.click(await screen.findByRole('button', { name: `Edit ${title}` }));

describe('showing notes', () => {
  it('shows a note under the name on Today, and the Edit button is described by it', async () => {
    const ctx = setup();
    await addTodo(ctx, 'Pay the plumber', 'next week');
    renderAt(ctx, '#/today');
    const button = await screen.findByRole('button', { name: 'Edit Pay the plumber' });
    expect(within(button).getByText('next week')).toBeInTheDocument();
    expect(button).toHaveAccessibleDescription('next week');
  });

  it('shows notes on a list page, including completed to-dos', async () => {
    const ctx = setup();
    const id = await addTodo(ctx, 'Call mom', 'about Sunday', '');
    await addTodo(ctx, 'Buy paint', 'the blue one', '');
    await ctx.itemsRepo.setTodoDone(id, true);
    renderAt(ctx, '#/list/list-4');
    expect(await screen.findByText('the blue one')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Completed (1)' }));
    expect(screen.getByText('about Sunday')).toBeInTheDocument();
  });

  it('shows nothing extra without a note, and notes as plain text', async () => {
    const ctx = setup();
    await addTodo(ctx, 'Pay rent');
    await addTodo(ctx, 'Odd', '<img src=x onerror=alert(1)>');
    const { container } = renderAt(ctx, '#/today');
    const rent = await screen.findByRole('button', { name: 'Edit Pay rent' });
    expect(rent.querySelector('.note')).toBeNull();
    expect(rent).not.toHaveAttribute('aria-describedby');
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(container.querySelectorAll('img')).toHaveLength(0);
  });
});

describe('adding and editing notes', () => {
  it('adds a to-do with a note from the + sheet', async () => {
    const ctx = setup();
    await ctx.listsRepo.ensureStarterLists();
    renderAt(ctx, '#/today');
    await screen.findByText(/Nothing here yet/);
    await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Buy paint' } });
    await fireEvent.input(notesField(), { target: { value: 'the blue one by the door' } });
    expect(notesField()).toHaveAttribute('maxlength', '200');
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('the blue one by the door')).toBeInTheDocument();
  });

  it('turns a vague date into a real one and clears the note', async () => {
    const ctx = setup();
    const id = await addTodo(ctx, 'Pay the plumber', 'next week', '');
    renderAt(ctx, '#/list/list-4');
    await edit('Pay the plumber');
    expect(notesField()).toHaveValue('next week');
    await fireEvent.change(screen.getByLabelText('Due'), { target: { value: 'pick' } });
    await fireEvent.input(screen.getByLabelText('Date'), { target: { value: '2026-11-04' } });
    await fireEvent.input(notesField(), { target: { value: '' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const saved = await ctx.db.items.get(id);
    expect(saved?.dueDate).toBe('2026-11-04');
    expect(saved && 'note' in saved).toBe(false);
  });

  it('keeps the sheet open when a note is too long', async () => {
    const ctx = setup();
    await addTodo(ctx, 'Pay rent');
    renderAt(ctx, '#/today');
    await edit('Pay rent');
    await fireEvent.input(notesField(), { target: { value: 'x'.repeat(201) } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(NOTE_TOO_LONG)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('keeps the Notes field, and what is typed in it, for every type (s19)', async () => {
    const ctx = setup();
    await ctx.listsRepo.ensureStarterLists();
    renderAt(ctx, '#/today');
    await screen.findByText(/Nothing here yet/);
    await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await fireEvent.input(notesField(), { target: { value: '20 minutes' } });
    for (const kind of ['Daily habit', 'Weekly goal', 'To-do']) {
      await fireEvent.click(screen.getByRole('radio', { name: kind }));
      expect(notesField()).toHaveValue('20 minutes');
    }
  });
});
