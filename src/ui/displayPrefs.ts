export type DisplayPrefs = {
  startInFullscreen: boolean;
};

export const START_IN_FULLSCREEN_KEY = "kindling.startInFullscreen";

export function defaultDisplayPrefs(): DisplayPrefs {
  return { startInFullscreen: false };
}

export function loadDisplayPrefs(
  storage: Pick<Storage, "getItem"> | null = globalThis.localStorage,
): DisplayPrefs {
  const prefs = defaultDisplayPrefs();
  try {
    const raw = storage?.getItem(START_IN_FULLSCREEN_KEY);
    if (raw === "1") prefs.startInFullscreen = true;
    if (raw === "0") prefs.startInFullscreen = false;
  } catch {
    /* quota / private mode */
  }
  return prefs;
}

export function saveDisplayPrefs(
  prefs: DisplayPrefs,
  storage: Pick<Storage, "setItem"> | null = globalThis.localStorage,
): void {
  try {
    storage?.setItem(START_IN_FULLSCREEN_KEY, prefs.startInFullscreen ? "1" : "0");
  } catch {
    /* quota / private mode */
  }
}

export type FullscreenHost = {
  fullscreenElement: Element | null;
  documentElement: {
    requestFullscreen?: () => Promise<void> | void;
  };
};

function defaultHost(): FullscreenHost | null {
  if (typeof document === "undefined") return null;
  return document;
}

/**
 * Prefer `document.documentElement` so the Kindling shell (rails + #game-root) keeps
 * laying out against the visual viewport after the browser chrome drops away.
 */
export function requestGameFullscreen(host: FullscreenHost | null = defaultHost()): Promise<boolean> {
  if (!host) return Promise.resolve(false);
  if (host.fullscreenElement) return Promise.resolve(true);
  const request = host.documentElement.requestFullscreen;
  if (typeof request !== "function") return Promise.resolve(false);
  try {
    return Promise.resolve(request.call(host.documentElement))
      .then(() => true)
      .catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

/**
 * Title Start / Play path: if the pref is on, request fullscreen from the user gesture.
 * Failures never block entering the game.
 */
export function maybeEnterFullscreenOnStart(
  prefs: DisplayPrefs = loadDisplayPrefs(),
  request: () => Promise<boolean> = () => requestGameFullscreen(),
): void {
  if (!prefs.startInFullscreen) return;
  try {
    void request().catch(() => undefined);
  } catch {
    /* denied / unsupported — continue into the game */
  }
}
