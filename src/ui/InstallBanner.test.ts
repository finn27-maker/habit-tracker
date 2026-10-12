import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { installHintFor } from '../testing/app-fixture';
import InstallBanner from './InstallBanner.svelte';

const IOS = 'Add to Home Screen to keep your data safe. Tap Share, then Add to Home Screen.';
const ANDROID = 'Add to Home screen to keep your data safe. Tap ⋮, then Add to Home screen.';
const OTHER =
  "Install this app to keep your data safe. Use your browser's Install or Add to Home Screen option.";
const card = () => screen.queryByRole('region', { name: 'Install this app' });

describe('InstallBanner', () => {
  it('gives iPhone steps with Got it and no Install button', () => {
    render(InstallBanner, { props: { hint: installHintFor({ device: 'ios' }).hint } });
    expect(card()).toHaveTextContent(IOS);
    expect(card()).toHaveTextContent(
      'Your data in a browser tab is separate from the installed app, and the browser may clear it after 7 days.',
    );
    expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
  });

  it('gives Android and computer steps', () => {
    render(InstallBanner, { props: { hint: installHintFor({ device: 'android' }).hint } });
    expect(card()).toHaveTextContent(ANDROID);
    render(InstallBanner, { props: { hint: installHintFor({ device: 'other' }).hint } });
    expect(screen.getByText(OTHER)).toBeInTheDocument();
  });

  it('is not shown inside the installed app', () => {
    render(InstallBanner, { props: { hint: installHintFor({ standalone: true }).hint } });
    expect(card()).toBeNull();
  });

  it('Got it hides it and remembers that', async () => {
    const fake = installHintFor();
    render(InstallBanner, { props: { hint: fake.hint } });
    await fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(card()).toBeNull();
    expect(fake.dismissals).toEqual(['dismissed']);
  });

  it('stays hidden once dismissed earlier', () => {
    render(InstallBanner, { props: { hint: installHintFor({ isDismissed: () => true }).hint } });
    expect(card()).toBeNull();
  });

  it('still hides for this visit when the browser blocks saved settings', async () => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    const fake = installHintFor({ isDismissed: blocked, markDismissed: blocked });
    render(InstallBanner, { props: { hint: fake.hint } });
    expect(card()).not.toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(card()).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it("offers Install when Chrome allows it, and hides once it's accepted", async () => {
    const fake = installHintFor({ device: 'android' });
    render(InstallBanner, { props: { hint: fake.hint } });
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
    const opened = fake.offerPrompt('accepted');
    await fireEvent.click(await screen.findByRole('button', { name: 'Install' }));
    await waitFor(() => expect(card()).toBeNull());
    expect(opened.count).toBe(1);
  });

  it('keeps the card but drops Install when Chrome’s prompt is declined', async () => {
    const fake = installHintFor({ device: 'android' });
    render(InstallBanner, { props: { hint: fake.hint } });
    fake.offerPrompt('dismissed');
    await fireEvent.click(await screen.findByRole('button', { name: 'Install' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Install' })).toBeNull());
    expect(card()).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument();
  });

  it('hides when the app is installed from the browser menu', async () => {
    const fake = installHintFor({ device: 'android' });
    render(InstallBanner, { props: { hint: fake.hint } });
    fake.installFromMenu();
    await waitFor(() => expect(card()).toBeNull());
  });

  it('ignores Install with no prompt to show', async () => {
    const fake = installHintFor();
    await fake.hint.install();
    expect(fake.hint.visible).toBe(true);
  });
});
