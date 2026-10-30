# Disc Golf Tracker

A minimalist Android app for measuring disc golf throws. Set a tee, walk out to set the centre line, throw, walk to
the disc and mark it: the app reports downrange distance and cross range from GPS, and keeps every throw for
progress reports per disc.

What to build is in [`docs/requirements.md`](docs/requirements.md).

## Getting the app onto the phone

Every push to GitHub builds an APK (about 10-15 minutes) and publishes it on the repository's **Releases** page.

1. On the phone, open this repository's Releases page in the GitHub app or a browser signed in to GitHub.
2. Open the newest release and tap the `.apk` file to download it.
3. Open the download. The first time, Android asks you to allow installs from that app (browser or GitHub);
   allow it.
4. Later builds install over the top as updates and keep the app's data.

Builds from `main` are normal releases; builds from other branches are marked **Pre-release**.

## Status

| Milestone (requirements §10) | State |
| --- | --- |
| 1. Measurement core (`src/core/`) | Done |
| 2. Field prototype: Set Tee / Set Line / Mark Disc / Confirm, saved on the phone | Done |
| 3. Throw plot, with earlier throws overlaid | Built; needs field testing |
| 4-5. Discs and history; progress and export | Not started |

## Layout

| Path | What it is |
| --- | --- |
| `App.tsx`, `src/app/` | The app: screens, GPS hooks, SQLite storage (Expo / React Native). |
| `src/core/` | Measurement, GPS quality, workflow, statistics and formatting: plain TypeScript, no React, each file with its tests. |
| `docs/requirements.md` | Requirements (`DGT-<area>-<nnn>`); tests cite the IDs they verify. |
| `.github/workflows/android.yml` | Tests, type-check, and APK build and release on every push. |
| `signing/app.keystore` | The app's signing key (see below). |

## Development

Needs Node.js 22.18 or later.

| Command | What it does |
| --- | --- |
| `npm ci` | Install the pinned packages. |
| `npm test` | Unit tests (Node's built-in test runner runs the TypeScript directly). |
| `npm run typecheck` | Type-check. |
| `npm start` | Start the Expo dev server, to try changes in the Expo Go app without building an APK (optional). |

Imports use explicit `.ts` extensions so Node can run the core and its tests without a build step.

## Signing

Android only installs an update if it is signed with the same key as the installed app. `signing/app.keystore` is
that key, committed so every build uses it; the build copies it over the generated project's default key. It is
fine for a private, side-loaded app. If the app is ever published on the Play Store, make a new key and keep it in
GitHub secrets instead.
