export type SaveOutcome = 'shared' | 'downloaded' | 'cancelled';

/** The browser pieces used to hand a file to the user; injected so tests need no real browser. */
export interface ShareEnv {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
  download: (file: File) => void;
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
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    }
  }
  env.download(file);
  return 'downloaded';
}
