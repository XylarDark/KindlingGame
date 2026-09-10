# Android Emulator for Kindling PWA checks

**Purpose:** use the industry-standard Android toolkit on Windows to verify
**installability**, **service-worker control**, and the **idle activate+reload**
path — not as the FPS acceptance oracle.

Emulator GL (host GPU / SwiftShader) does **not** match a mid-range phone. Treat
frame times from an AVD as smoke only. Smoothness ship/no-ship stays on a
physical phone or a lane PostFX A/B (see [automation-gaps.md](../operational/automation-gaps.md)).

## Prerequisites

1. Install [Android Studio](https://developer.android.com/studio) (or command-line
   tools + an SDK).
2. In SDK Manager: **Android SDK Platform 34+**, **Android Emulator**,
   **Google Play** system image for a Pixel-class device.
3. Create one AVD, e.g. `Kindling_Pixel_API34` (Pixel 6 / 7, API 34, Google Play).
4. Ensure `adb` is on `PATH` (`%LOCALAPPDATA%\Android\Sdk\platform-tools`).

## Daily checklist (smoothness / PWA changes)

```
npm run emu:pwa
```

That script only **preflights** `adb` (device up, `adb reverse tcp:5174`, prints a
Chrome intent URL). Then:

1. Start the AVD and unlock it.
2. Start the Kindling dev server if needed (`npm run dev` → port **5174**).
3. Open Chrome on the emulator → load `http://127.0.0.1:5174/` (after reverse)
   or the GitHub Pages URL.
4. Fresh tab: game boots; install coach may appear on coarse pointers.
5. **Install app** / Add to Home screen → open as standalone.
6. In Chrome DevTools remote (or `chrome://inspect`): confirm
   `navigator.serviceWorker.controller` is set and the worker is **navigate-only**
   (no blanket asset `respondWith`).
7. After a deploy that leaves a **waiting** worker: leave the game on the title
   screen or end a shift (idle). The page should show **Updating…**, post
   `kindling-skip-waiting`, and reload **once** onto the new controller.
   Mid-shop / mid-drive must not.

## Optimal play path (installed mobile)

Installed **standalone** PWA is the preferred play surface: no browser chrome,
navigate-only SW (no asset hop), idle activate with a visible Updating gate, and
the install coach can own BIP after ~30s engagement. Browser-tab play must still
be correct (desktop letterbox via contain; phone height-fill). Cold boot shows
**Loading Kindling…** while fonts/art/shaders warm, then Title.

## Manual adb notes

```
adb devices
adb reverse tcp:5174 tcp:5174
adb shell am start -a android.intent.action.VIEW -d "http://127.0.0.1:5174/" com.android.chrome
```

For Pages: open the live URL in Chrome on the AVD (no reverse needed).

## Out of scope

- iOS Simulator (macOS-only)
- Using emulator `actualFps` as the RenderBudget gate
- Mid-shift `skipWaiting`
