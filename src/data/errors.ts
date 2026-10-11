import { err, type Result } from '../domain/result';

export const SAVE_ERROR = "Couldn't save. Your phone may be out of storage.";

/** IndexedDB can fail on iOS (e.g. "Connection to Indexed Database server lost"); never throw. */
export async function guard<T>(
  failure: string,
  run: () => Promise<Result<T>>,
): Promise<Result<T>> {
  try {
    return await run();
  } catch {
    return err(failure);
  }
}
