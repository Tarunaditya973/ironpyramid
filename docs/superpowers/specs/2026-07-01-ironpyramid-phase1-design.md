# IronPyramid — Phase 1 Design Spec

**Date:** 2026-07-01
**Status:** Approved for implementation (Phase 1)
**Author:** Tarun + Claude

---

## 1. Overview

IronPyramid is an **offline-first Progressive Web App (PWA)** that turns Tarun's
existing 6-day gym program into an active training tool. It runs on the iPhone
home screen (installable, works offline in a signal-dead gym) and on desktop
browsers. All data lives on-device; there is **no server**.

The app is built around the plan already captured in
`seed/gym_workout_tracker.csv` and centers the feature Tarun asked for from the
start: **an interactive body map that highlights the muscles each exercise
works.**

### The one thing that justifies building this
Neither the Zepp app nor the CSV drives **progressive overload against Tarun's
own plan**. Zepp measures the body but doesn't know the program; the CSV holds
the program but can't coach. IronPyramid closes that gap: it knows the plan,
pre-fills last session's numbers, and tells the lifter when to add weight.

---

## 2. Goals & Non-Goals

### Goals (Phase 1)
- Install to iPhone home screen; launch and function fully **offline**.
- Render the 6-day split from seed data with tap-friendly set logging.
- **Interactive muscle map** (front + back) that highlights primary/secondary
  muscles per exercise and per day.
- **Progression engine**: pre-fill last weights, flag when to increase load.
- **Dashboard**: weekly volume per muscle group, estimated-1RM trend, PR history.
- **Import/Export**: seed from the CSV; export all data to CSV/JSON for backup.

### Non-Goals (Phase 1 — explicitly deferred)
- Recovery/readiness overlay and Apple Health import → **Phase 2**.
- Any Zepp integration (the Helio Strap is screenless, cannot run mini-programs,
  and its muscle data is not exportable — confirmed during design).
- Multi-user accounts, cloud sync, social features.
- Native iOS app / HealthKit live reads.

---

## 3. Architecture

Everything runs client-side. No backend, no build step, no framework.

```
iPhone home screen  →  IronPyramid (PWA)
   ├── App shell cached by service worker   → launches offline
   ├── UI: vanilla HTML / CSS / JS (no build step, no framework)
   ├── State/logic: small pure JS modules (unit-testable)
   ├── Storage: IndexedDB (on-device)
   └── Seed: plan.json (generated from seed/gym_workout_tracker.csv)
```

### Key technical decisions
- **Vanilla JS, no framework/build step.** A personal offline tool should be
  files that *just work* when opened — nothing to `npm install` or rebuild, and
  nothing to rot. (Alternative considered: React+Vite — rejected; the toolchain
  overhead isn't worth it for a single-user offline app.)
- **IndexedDB, not localStorage.** Workout logs will exceed localStorage's ~5MB
  cap over time and IndexedDB stores structured records. A thin promise-based
  wrapper module isolates this so logic code stays storage-agnostic.
- **Service worker** caches the app shell (HTML/CSS/JS/plan.json/icons) so the
  app opens instantly with no connection.
- **Logic separated from DOM.** Pure functions (progression, e1RM, volume
  aggregation, CSV parse/serialize) live in modules with no DOM access so they
  can be unit-tested directly under Node.

---

## 4. Data Model (IndexedDB object stores)

| Store | Key | Shape (fields) |
|---|---|---|
| `plan` | `dayId` | `{dayId, focus, exercises:[{exId, name, order, setType, scheme, primary:[muscle], secondary:[muscle], increment, demoUrl, notes}]}` |
| `sessions` | `sessionId` | `{sessionId, dateISO, dayId, entries:[{exId, sets:[{weight, reps, done}]}]}` |
| `prs` | `exId` | `{exId, bestWeight, bestE1RM, dateISO}` (deadlift seeded at 156kg) |
| `settings` | `key` | e.g. `bodyweightKg:72`, `heightCm:179`, `units:"kg"`, `weightIncrementDefault:2.5` |

`plan` is seeded once on first launch from the bundled `plan.json`. Sessions,
prs, and settings are created/updated as the user logs.

### Muscle taxonomy (canonical keys used by both plan data and the SVG map)
`chest, front-delts, side-delts, rear-delts, traps, lats, mid-back, lower-back,
biceps, triceps, forearms, abs, obliques, glutes, quads, hamstrings, calves,
cardio`

Each exercise's `primary`/`secondary` arrays use these keys. The SVG body map
has one region per key (front and back views), so highlighting is a class toggle.

---

## 5. Phase 1 Features (detailed)

### 5.1 Interactive muscle map
- Front + back SVG body silhouette; each muscle group is a `<path>` with an id
  matching the taxonomy key.
- Opening an **exercise** highlights its muscles: primary = bright/pulsing,
  secondary = dimmer. Opening a **day** shows the union of all muscles that day
  hits, shaded by how much volume targets each.
- This reproduces (and improves on) Zepp's muscle heatmap purely from the
  exercise→muscle lookup — no external data required.

### 5.2 Today view (logging)
- Day auto-suggested by rotation through Day 1–6 (user can override).
- Each exercise is a card: name, set-type badge (Pyramid / Superset / Normal),
  muscle chips, demo link, and set rows.
- **Set rows** use large +/− steppers for weight and reps (usable with sweaty
  hands) and a tap-to-complete check. Supersets/tri-sets render their component
  movements grouped as one block (e.g. incline DB press / push-ups / dips).
- Optional rest timer between sets.

### 5.3 Progression engine (pure module)
- On opening an exercise, pre-fills each set with the **last session's** weight
  and reps for that exercise.
- Reads each exercise's `increment` and target top reps from the scheme. When
  the last session met the rep target on the top set, surfaces a prompt:
  *"Hit target last time → try +{increment}kg."*
- **Estimated 1RM** via the Epley formula: `e1RM = weight × (1 + reps/30)`,
  computed per top set to build a strength curve out of pyramid work.
- Increment defaults by movement class: barbell compound `2.5kg`, dumbbell/
  isolation `1–2kg`, bodyweight → add reps before adding load. Stored per
  exercise so it's editable.

### 5.4 Dashboard
- **Weekly volume per muscle group** (bar chart): sum of `weight × reps` across
  logged sets, attributed to each set's primary muscle.
- **Estimated-1RM trend** (line) for the main lifts (deadlift, squat, bench).
- **PR history**: best weight & best e1RM per lift over time.
- Charts drawn with a tiny dependency-free canvas/SVG helper (no chart library,
  to keep the app buildless and offline).

### 5.5 Import / Export
- **Seed import:** on first run, `plan.json` (generated from the CSV) populates
  the `plan` store.
- **Export:** dump all sessions + prs + settings to CSV and JSON download for
  backup, since on-device data has no cloud copy.
- **Re-import:** accept a previously exported JSON to restore data (e.g. new
  phone).

---

## 6. Testing Approach

- Pure logic modules are unit-tested under Node with a minimal assert-based
  harness (no framework needed): progression prompts, Epley e1RM, weekly-volume
  aggregation, muscle-union computation, CSV parse/serialize round-trips.
- Follow test-driven development for these modules (write the failing test
  first). DOM/PWA behavior (offline launch, install, IndexedDB persistence) is
  verified manually against the acceptance checklist below.

---

## 7. File Structure (proposed)

```
ironpyramid/
├── index.html            # app shell
├── styles.css
├── app.js                # UI wiring / view rendering
├── src/
│   ├── db.js             # IndexedDB wrapper (promise-based)
│   ├── progression.js    # pure: pre-fill + add-weight prompts + e1RM
│   ├── volume.js         # pure: weekly volume per muscle
│   ├── muscles.js        # taxonomy + exercise→muscle helpers
│   └── csv.js            # pure: CSV/JSON import & export
├── assets/
│   └── body.svg          # front/back muscle map (region ids = taxonomy keys)
├── data/
│   └── plan.json         # generated from seed/gym_workout_tracker.csv
├── manifest.webmanifest  # PWA manifest (name, icons, display:standalone)
├── service-worker.js     # offline app-shell cache
├── tests/                # node-run unit tests for pure modules
└── seed/
    └── gym_workout_tracker.csv
```

---

## 8. Phase 2 (future — outline only, not in this build)

- **Apple Health bulk import:** user exports all Health data (`export.xml`,
  tens of MB) and drops it in; parsed in-browser with a **streaming reader**
  (not a naive full-DOM parse, which would freeze the tab). Extracts HRV (SDNN),
  sleep, resting HR.
- **Readiness score:** HRV & resting-HR vs a rolling baseline + sleep →
  green/yellow/red suggestion, always labeled with the data's "as of" date since
  bulk import means it can lag.
- **Overlay:** readiness banner on Today; recovery-vs-training-load chart on the
  dashboard.
- **Prerequisite check:** before building the parser, do one real export and
  confirm HRV/sleep/RHR are actually present (the Zepp→Apple Health HRV bridge
  is new and rolling out).

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Apple Health export may not contain HRV/sleep (Zepp sync) | Verify with a real export **before** building Phase 2 parser |
| On-device-only data can be lost (phone wipe) | Export-to-JSON backup in Phase 1 |
| Large Health XML could freeze the tab | Streaming parse in Phase 2 (deferred) |
| Tool goes unused → wasted build | Phase 1 is standalone-useful; recovery overlay is additive, built only if Phase 1 sticks |

---

## 10. Acceptance Criteria (Phase 1 done = all true)

1. Installs to iPhone home screen and launches **offline**.
2. All 6 training days render from seed data with correct set schemes.
3. Tapping an exercise highlights the correct muscles on the front/back map.
4. Logging a set persists across app restarts (IndexedDB).
5. Re-opening an exercise pre-fills last session's weight/reps and shows an
   add-weight prompt when the prior top set hit its rep target.
6. Dashboard shows weekly volume per muscle group and an e1RM trend for the main
   lifts (deadlift seeded at 156kg).
7. Data exports to CSV/JSON and re-imports from JSON.
8. Pure logic modules pass their unit tests.
