import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Read from disk: Vitest turns CSS imports (even ?raw) into empty strings. Tests run from the repo root.
const css = readFileSync(resolve(process.cwd(), 'src/app.css'), 'utf8');

describe('app.css', () => {
  it('follows the iPhone text size only on iOS, keeping the app font', () => {
    const block = css.slice(css.indexOf('@supports (font: -apple-system-body) and (-webkit-touch-callout: none)'));
    expect(block).toMatch(
      /^@supports \(font: -apple-system-body\) and \(-webkit-touch-callout: none\) \{\s*:root \{\s*font: -apple-system-body;\s*font-family: -apple-system/,
    );
  });

  it('gives filled buttons their own colours in both schemes', () => {
    expect(css.match(/--fill:/g)).toHaveLength(2);
    expect(css.match(/--danger-fill:/g)).toHaveLength(1);
  });
});
