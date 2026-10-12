import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The shared link must carry none of the owner's own lists (features/s10-starter-lists.feature).
const SRC = join(process.cwd(), 'src');
const appFiles = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter(
  (path) =>
    /\.(ts|svelte)$/.test(path) && !/\.test\.ts$/.test(path) && !path.startsWith('testing'),
);

describe('the app source', () => {
  it('is found', () => {
    expect(appFiles).toContain(join('domain', 'lists.ts'));
  });

  it("contains none of the owner's original list names", () => {
    for (const path of appFiles) {
      const text = readFileSync(join(SRC, path), 'utf8');
      expect(text, path).not.toMatch(/Fitness|Side Business/);
    }
  });
});
