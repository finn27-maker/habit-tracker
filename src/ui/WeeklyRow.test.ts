import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { WeeklyRow } from '../domain/today';
import WeeklyRowView from './WeeklyRow.svelte';

const row = (overrides: Partial<Omit<WeeklyRow, 'item' | 'kind'>> = {}): WeeklyRow => ({
  kind: 'weekly',
  item: { id: 'item-1', listId: 'list-1', type: 'weekly', title: 'Peloton ride', order: 0 },
  count: 0,
  target: 3,
  met: false,
  streak: 0,
  streakAtRisk: false,
  ...overrides,
});

function renderRow(value: WeeklyRow) {
  const handlers = { onLog: vi.fn(), onUndo: vi.fn() };
  render(WeeklyRowView, { props: { row: value, ...handlers } });
  return handlers;
}

const ring = (count: number, target: number, suffix = '') =>
  screen.getByRole('button', { name: `Log Peloton ride, ${count} of ${target} this week${suffix}` });

describe('WeeklyRow', () => {
  it('shows the count and target in the ring, with no minus button or badge at zero', () => {
    renderRow(row());
    expect(ring(0, 3)).toHaveTextContent('0/3');
    expect(screen.queryByRole('button', { name: /Remove last/ })).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('logs when the ring is tapped', async () => {
    const handlers = renderRow(row());
    await fireEvent.click(ring(0, 3));
    expect(handlers.onLog).toHaveBeenCalledTimes(1);
  });

  it('shows the name as a link to the goal’s page', () => {
    renderRow(row());
    const name = screen.getByRole('link', { name: 'Peloton ride details' });
    expect(name).toHaveTextContent('Peloton ride');
    expect(name).toHaveAttribute('href', '#/item/item-1');
  });

  it('offers a minus button once something is logged', async () => {
    const handlers = renderRow(row({ count: 2 }));
    expect(ring(2, 3)).toHaveTextContent('2/3');
    await fireEvent.click(screen.getByRole('button', { name: 'Remove last Peloton ride log' }));
    expect(handlers.onUndo).toHaveBeenCalledTimes(1);
  });

  it('is marked met at the target and keeps counting beyond it', () => {
    const { unmount } = render(WeeklyRowView, {
      props: { row: row({ count: 3, met: true }), onLog: vi.fn(), onUndo: vi.fn() },
    });
    expect(ring(3, 3, ', goal met')).toHaveTextContent('3/3');
    expect(document.querySelector('.progress')?.classList.contains('met')).toBe(true);
    unmount();

    renderRow(row({ count: 5, met: true }));
    expect(ring(5, 3, ', goal met')).toHaveTextContent('5/3');
  });

  it('fills the ring in proportion to the count and caps it when the goal is exceeded', () => {
    const dash = () =>
      Number.parseFloat(
        document.querySelector('.progress')!.getAttribute('stroke-dasharray')!.split(' ')[0]!,
      );
    const circumference = 2 * Math.PI * 20;

    const first = render(WeeklyRowView, {
      props: { row: row({ count: 1 }), onLog: vi.fn(), onUndo: vi.fn() },
    });
    expect(dash()).toBeCloseTo(circumference / 3, 1);
    first.unmount();

    const over = render(WeeklyRowView, {
      props: { row: row({ count: 5, met: true }), onLog: vi.fn(), onUndo: vi.fn() },
    });
    expect(dash()).toBeCloseTo(circumference, 1);
    over.unmount();

    renderRow(row());
    expect(dash()).toBe(0);
  });

  it.each([
    [row({ count: 3, met: true, streak: 4 }), '4 week streak', '🔥 4', false],
    [row({ count: 1, streak: 3, streakAtRisk: true }), '3 week streak, not met yet this week', '🔥 3', true],
  ])('shows a flame badge for the weeks in a row', (value, label, text, risky) => {
    renderRow(value);
    const badge = screen.getByRole('img', { name: label });
    expect(badge).toHaveTextContent(text);
    expect(badge.classList.contains('risk')).toBe(risky);
  });
});
