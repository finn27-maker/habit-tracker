import { describe, expect, it, vi } from 'vitest';
import { SHARE_TEXT, SHARE_TITLE, saveFile, shareLink } from './share';

const file = new File(['{}'], 'habit-tracker-backup-2026-10-14.json', { type: 'application/json' });

describe('saveFile', () => {
  it('opens the share sheet with the file when it can', async () => {
    const env = { canShare: vi.fn(() => true), share: vi.fn(async () => {}), download: vi.fn() };
    expect(await saveFile(file, env)).toBe('shared');
    expect(env.share).toHaveBeenCalledWith({ files: [file], title: file.name });
    expect(env.download).not.toHaveBeenCalled();
  });

  it('downloads when files cannot be shared or sharing is missing', async () => {
    const cannot = { canShare: () => false, share: vi.fn(async () => {}), download: vi.fn() };
    expect(await saveFile(file, cannot)).toBe('downloaded');
    expect(cannot.share).not.toHaveBeenCalled();
    expect(cannot.download).toHaveBeenCalledWith(file);

    const missing = { download: vi.fn() };
    expect(await saveFile(file, missing)).toBe('downloaded');
  });

  it('downloads when the share is refused', async () => {
    const env = {
      canShare: () => true,
      share: vi.fn(async () => {
        throw new DOMException('no', 'NotAllowedError');
      }),
      download: vi.fn(),
    };
    expect(await saveFile(file, env)).toBe('downloaded');
    expect(env.download).toHaveBeenCalledWith(file);
  });

  it('counts closing the share sheet as cancelled, without downloading', async () => {
    const env = {
      canShare: () => true,
      share: vi.fn(async () => {
        throw new DOMException('closed', 'AbortError');
      }),
      download: vi.fn(),
    };
    expect(await saveFile(file, env)).toBe('cancelled');
    expect(env.download).not.toHaveBeenCalled();
  });
});

describe('shareLink', () => {
  const url = 'https://finn27-maker.github.io/habit-tracker/';
  const download = () => {};
  const refuse = (name: string) => async () => {
    throw new DOMException('no', name);
  };

  it('shares the link inside the text, so Copy in the iOS sheet keeps it', async () => {
    const env = { share: vi.fn(async () => {}), copyText: vi.fn(async () => {}), download };
    expect(await shareLink(url, env)).toBe('shared');
    expect(env.share).toHaveBeenCalledWith({ title: SHARE_TITLE, text: `${SHARE_TEXT} ${url}` });
    expect(SHARE_TEXT).toBe('Try this habit and to-do tracker:');
    expect(env.copyText).not.toHaveBeenCalled();
  });

  it('does nothing else when the sheet is closed', async () => {
    const env = { share: refuse('AbortError'), copyText: vi.fn(async () => {}), download };
    expect(await shareLink(url, env)).toBe('cancelled');
    expect(env.copyText).not.toHaveBeenCalled();
  });

  it('copies the link when there is no share sheet or it refuses', async () => {
    const copyText = vi.fn(async () => {});
    expect(await shareLink(url, { copyText, download })).toBe('copied');
    expect(await shareLink(url, { share: refuse('NotAllowedError'), copyText, download })).toBe(
      'copied',
    );
    expect(copyText).toHaveBeenCalledTimes(2);
    expect(copyText).toHaveBeenCalledWith(url);
  });

  it('leaves the link to be shown when copying fails or is missing', async () => {
    expect(await shareLink(url, { copyText: refuse('NotAllowedError'), download })).toBe('shown');
    expect(await shareLink(url, { download })).toBe('shown');
  });
});
