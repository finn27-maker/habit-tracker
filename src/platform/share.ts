export type SaveOutcome = 'shared' | 'downloaded' | 'cancelled';

/** The browser pieces used to hand a file to the user; injected so tests need no real browser. */
export interface ShareEnv {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
  download: (file: File) => void;
  copyText?: (text: string) => Promise<void>;
}

export type LinkOutcome = 'shared' | 'copied' | 'shown' | 'cancelled';

export const SHARE_TITLE = 'Habit Tracker';
export const SHARE_TEXT = 'Try this habit and to-do tracker:';

const isCancel = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

/**
 * Sends the app's link through the share sheet, else copies it, else leaves it to be shown
 * ('shown'). The link goes inside the text: on iOS, Copy in the sheet copies only the text.
 */
export async function shareLink(url: string, env: ShareEnv): Promise<LinkOutcome> {
  if (env.share) {
    try {
      await env.share({ title: SHARE_TITLE, text: `${SHARE_TEXT} ${url}` });
      return 'shared';
    } catch (error) {
      if (isCancel(error)) return 'cancelled';
    }
  }
  if (env.copyText) {
    try {
      await env.copyText(url);
      return 'copied';
    } catch {
      // Clipboard refused (no permission or no tap): show the link instead.
    }
  }
  return 'shown';
}

/**
 * Opens the share sheet with `file` (Save to Files, iCloud Drive, AirDrop, Mail...). Where
 * files can't be shared, or the browser refuses (e.g. NotAllowedError for the file type or a
 * lost tap), the file is downloaded instead. Closing the sheet is a cancel, not a save.
 *
 * Call it straight from the tap, with the file already built: share() needs a fresh tap.
 */
export async function saveFile(file: File, env: ShareEnv): Promise<SaveOutcome> {
  const data: ShareData = { files: [file], title: file.name };
  if (env.share && env.canShare?.(data)) {
    try {
      await env.share(data);
      return 'shared';
    } catch (error) {
      if (isCancel(error)) return 'cancelled';
    }
  }
  env.download(file);
  return 'downloaded';
}
