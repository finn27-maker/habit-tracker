import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { TodayRow } from '../domain/today';
import HabitRow from './HabitRow.svelte';

const row = (overrides: Partial<Omit<TodayRow, 'item'>> = {}): TodayRow => ({
  item: { id: 'item-1', listId: 'list-1', type: 'daily', title: 'Meditate', order: 0 },
  streak: 0,
  doneToday: false,
  atRisk: false,
  ...overrides,
});

const renderRow = (value: TodayRow, onToggle = vi.fn()) => {
  render(HabitRow, { props: { row: value, onToggle } });
  return { onToggle, checkbox: screen.getByRole('checkbox', { name: 'Meditate' }) };
};

describe('HabitRow', () => {
  it('is an unchecked checkbox named after the habit, with no badge at zero', () => {
    const { checkbox } = renderRow(row());
    expect(checkbox).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('is checked when the habit is done today', () => {
    const { checkbox } = renderRow(row({ doneToday: true, streak: 1 }));
    expect(checkbox).toHaveAttribute('aria-checked', 'true');
  });

  it('asks to toggle when tapped', async () => {
    const { checkbox, onToggle } = renderRow(row());
    await fireEvent.click(checkbox);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it.each([
    [1, 'a done habit', row({ doneToday: true, streak: 1 }), '1 day streak', '🔥 1', false],
    [4, 'a done habit', row({ doneToday: true, streak: 4 }), '4 day streak', '🔥 4', false],
    [2, 'an at-risk habit', row({ streak: 2, atRisk: true }), '2 day streak, not done today', '🔥 2', true],
  ])('shows a flame badge for %i days of %s', (_n, _what, value, label, text, risky) => {
    renderRow(value);
    const badge = screen.getByRole('img', { name: label });
    expect(badge).toHaveTextContent(text);
    expect(badge.classList.contains('risk')).toBe(risky);
  });
});
