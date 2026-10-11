import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import UpdateToast from './UpdateToast.svelte';

describe('UpdateToast', () => {
  it('offers a reload when a new version is waiting', async () => {
    const onReload = vi.fn();
    render(UpdateToast, { props: { needRefresh: true, onReload, onDismiss: vi.fn() } });
    expect(screen.getByRole('status')).toHaveTextContent('New version available');
    await fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('can be dismissed', async () => {
    const onDismiss = vi.fn();
    render(UpdateToast, { props: { needRefresh: true, onReload: vi.fn(), onDismiss } });
    await fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when no update is waiting', () => {
    render(UpdateToast, { props: { needRefresh: false, onReload: vi.fn(), onDismiss: vi.fn() } });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
