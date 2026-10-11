import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/svelte';
import { afterEach } from 'vitest';

// Testing Library only auto-cleans when Vitest globals are on; we keep globals off.
afterEach(() => cleanup());
