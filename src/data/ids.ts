/** Needs a secure context, which HTTPS (GitHub Pages) and localhost both are. */
export const newId = (): string => crypto.randomUUID();
