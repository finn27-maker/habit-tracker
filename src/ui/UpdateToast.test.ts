import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import UpdateToast from './UpdateToast.svelte';

const baseProps = {
  needRefresh: false,
  offlineReady: false,
  onReload: vi.fn(),
  onDismiss: vi.fn(),
};

describe('UpdateToast', () => {
  it('offers a reload when a new version is waiting', async () => {
    const onReload = vi.fn();
    render(UpdateToast, { props: { ...baseProps, needRefresh: true, onReload } });
    expect(screen.getByRole('status')).toHaveTextContent('New version available');
    await fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('can be dismissed', async () => {
    const onDismiss = vi.fn();
    render(UpdateToast, { props: { ...baseProps, needRefresh: true, onDismiss } });
    await fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('confirms when the app is saved for offline use', async () => {
    const onDismiss = vi.fn();
    render(UpdateToast, { props: { ...baseProps, offlineReady: true, onDismiss } });
    expect(screen.getByRole('status')).toHaveTextContent('Ready to work offline');
    expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('prefers the update prompt when both are pending', () => {
    render(UpdateToast, { props: { ...baseProps, needRefresh: true, offlineReady: true } });
    expect(screen.getByRole('status')).toHaveTextContent('New version available');
  });

  it('renders nothing when nothing is pending', () => {
    render(UpdateToast, { props: baseProps });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
