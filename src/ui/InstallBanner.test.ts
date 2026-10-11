import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import InstallBanner from './InstallBanner.svelte';

describe('InstallBanner', () => {
  it('tells Safari-tab visitors to add the app to the Home Screen', () => {
    render(InstallBanner, { props: { standalone: false } });
    expect(
      screen.getByText(
        'Add to Home Screen to keep your data safe. Tap Share, then Add to Home Screen.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/data in a Safari tab is separate from the installed app/i),
    ).toBeInTheDocument();
  });

  it('is not shown inside the installed app', () => {
    render(InstallBanner, { props: { standalone: true } });
    expect(screen.queryByText(/Add to Home Screen to keep your data safe/)).toBeNull();
  });
});
