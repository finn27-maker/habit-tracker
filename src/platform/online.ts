/**
 * Runs `run` now if online, otherwise once the device reconnects.
 * Any network request in Airplane Mode makes iOS show a "Turn Off Airplane Mode"
 * alert over the Home Screen app, so network-only work waits for a connection.
 */
export function whenOnline(
  nav: { onLine: boolean },
  target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>,
  run: () => void,
): void {
  if (nav.onLine) {
    run();
    return;
  }
  const onOnline = () => {
    target.removeEventListener('online', onOnline);
    run();
  };
  target.addEventListener('online', onOnline);
}
