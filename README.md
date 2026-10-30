# Habit Tracker

Daily habits, weekly "N times a week" goals and to-dos in one home-screen app.

**Open it:** https://finn27-maker.github.io/habit-tracker/

## Install on iPhone

1. Open the link above in **Safari**.
2. Tap **Share**, then **Add to Home Screen**.
3. Launch it from the new **Habits** icon. It works offline.

Your data is stored only on your phone. It is never uploaded and never stored in this repository.
The app makes no outside connections. The one exception is the owner's own copy, once paired with their personal assistant: it then fetches new to-dos from app.80dventures.com and sends back only its pairing code and the ids of the to-dos it saved, never your lists, habits or check-ins. A copy that was never paired never contacts it.
Use the app from the Home Screen icon, not a Safari tab: Safari keeps tab data separately and may clear it after 7 days.

## Development

```sh
npm install
npm run dev        # local dev server
npm test           # unit tests with coverage (95% gate)
npm run test:e2e   # Playwright (WebKit iPhone + Chromium)
npm run build
```

Pushing to `main` runs lint, type checks and all tests, then deploys to GitHub Pages.
Behaviour is specified in [`features/habit-tracker.feature`](features/habit-tracker.feature).
