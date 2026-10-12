import type { Page } from '@playwright/test';

/**
 * How many completions are stored in IndexedDB. The screen updates before the save
 * finishes, so a test that reloads right after a tap must first wait for this to settle,
 * or the browser can cancel the save mid-write.
 */
/** Taps + and answers "What are you adding?". */
export async function startAdding(page: Page, kind: 'Daily habit' | 'Weekly goal' | 'To-do') {
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: kind, exact: true }).click();
}

export const completionCount = (page: Page) => storeCount(page, 'completions');

/** How many stored to-dos are checked off (have a completedAt). Same reason as above. */
export function completedTodoCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('habit-tracker');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const request = db.transaction('items').objectStore('items').getAll();
          request.onsuccess = () => {
            db.close();
            const items = request.result as { type: string; completedAt?: number }[];
            resolve(items.filter((item) => item.type === 'todo' && item.completedAt).length);
          };
          request.onerror = () => reject(request.error);
        };
      }),
  );
}

/** List names in stored order. Same reason as above: wait for this before reloading. */
export function storedListNames(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open('habit-tracker');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const request = db.transaction('lists').objectStore('lists').getAll();
          request.onsuccess = () => {
            db.close();
            const lists = request.result as { name: string; order: number }[];
            resolve(lists.sort((a, b) => a.order - b.order).map((list) => list.name));
          };
          request.onerror = () => reject(request.error);
        };
      }),
  );
}

function storeCount(page: Page, store: string): Promise<number> {
  return page.evaluate(
    (name) =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('habit-tracker');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const request = db.transaction(name).objectStore(name).count();
          request.onsuccess = () => {
            db.close();
            resolve(request.result);
          };
          request.onerror = () => reject(request.error);
        };
      }),
    store,
  );
}
