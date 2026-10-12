import type { DeviceKind, InstallPrompt } from '../platform/install';

export interface InstallHintDeps {
  standalone: boolean;
  device: DeviceKind;
  /** Whether "Got it" was tapped before; may throw where the browser blocks storage. */
  isDismissed: () => boolean;
  markDismissed: () => void;
  /** Hands over Chrome's install prompt whenever it offers one. */
  onPrompt: (callback: (prompt: InstallPrompt) => void) => void;
  /** Called when the app gets installed (from the card or the browser's own menu). */
  onInstalled: (callback: () => void) => void;
}

/** The Today card telling browser-tab visitors to install the app. */
export class InstallHint {
  readonly device: DeviceKind;
  visible: boolean;
  canInstall: boolean;
  #prompt: InstallPrompt | null = null;
  #markDismissed: () => void;

  constructor(deps: InstallHintDeps) {
    this.device = deps.device;
    this.#markDismissed = deps.markDismissed;
    this.visible = $state(!deps.standalone && !safely(deps.isDismissed, false));
    this.canInstall = $state(false);
    deps.onPrompt((prompt) => {
      this.#prompt = prompt;
      this.canInstall = true;
    });
    deps.onInstalled(() => {
      this.visible = false;
    });
  }

  dismiss() {
    this.visible = false;
    safely(this.#markDismissed, undefined);
  }

  /** Chrome allows each prompt once, so the button goes whatever the answer. */
  async install() {
    const prompt = this.#prompt;
    if (!prompt) return;
    this.#prompt = null;
    this.canInstall = false;
    await prompt.prompt();
    if ((await prompt.userChoice).outcome === 'accepted') this.visible = false;
  }
}

function safely<T>(run: () => T, fallback: T): T {
  try {
    return run();
  } catch {
    return fallback;
  }
}
