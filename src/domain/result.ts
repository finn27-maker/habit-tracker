/** Expected failures are returned, not thrown, so callers must handle them. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const err = (error: string): Result<never> => ({ ok: false, error });
