import type { Page } from '@playwright/test';

/**
 * How many completions are stored in IndexedDB. The screen updates before the save
 * finishes, so a test that reloads right after a tap must first wait for this to settle,
 * or the browser can cancel the save mid-write.
 */
export function completionCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('habit-tracker');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const request = db.transaction('completions').objectStore('completions').count();
          request.onsuccess = () => {
            db.close();
            resolve(request.result);
          };
          request.onerror = () => reject(request.error);
        };
      }),
  );
}
