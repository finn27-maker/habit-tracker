import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import TabBar from './TabBar.svelte';

describe('TabBar', () => {
  it('links to Today and Lists and marks the Lists tab as current', () => {
    render(TabBar, { props: { current: 'lists' } });
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Today' })).toHaveAttribute('href', '#/today');
    expect(screen.getByRole('link', { name: 'Lists' })).toHaveAttribute('href', '#/lists');
    expect(screen.getByRole('link', { name: 'Lists' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Today' })).not.toHaveAttribute('aria-current');
  });

  it('marks the Today tab as current', () => {
    render(TabBar, { props: { current: 'today' } });
    expect(screen.getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Lists' })).not.toHaveAttribute('aria-current');
  });
});
