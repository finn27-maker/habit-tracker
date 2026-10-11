/**
 * Runs once in the main process before test workers start, which inherit this value.
 * The daylight-saving tests assume America/Chicago (2026-03-08 has 23 hours and
 * 2026-11-01 has 25); on a UTC machine they would pass without proving anything.
 */
export default function setup(): void {
  process.env.TZ = 'America/Chicago';
}
