import { describe, expect, it, vi } from 'vitest';
import { saveFile } from './share';

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
