import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Today from './Today.svelte';

describe('Today screen', () => {
  it('shows the date header and the first-run empty state', () => {
    render(Today, { props: { now: new Date(2026, 9, 14, 9, 0) } });
    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
    expect(screen.getByText('Wednesday, October 14')).toBeInTheDocument();
    expect(
      screen.getByText('Nothing here yet. Tap + to add your first habit or to-do.'),
    ).toBeInTheDocument();
  });
});
