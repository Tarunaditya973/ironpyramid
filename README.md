# IronPyramid

Offline-first PWA gym tracker. No build step, no dependencies.

## Run locally
    python3 -m http.server 8000
Open http://localhost:8000/

## Rebuild plan.json after editing seed/gym_workout_tracker.csv
    node scripts/build-plan.js

## Test
    node --test

## Deploy (to install on iPhone, HTTPS is required)
Easiest: drag this folder onto https://app.netlify.com/drop — you get an HTTPS URL.
Or via GitHub Pages: push to a GitHub repo, enable Pages on the default branch (root).

## Install on iPhone
Open the HTTPS URL in Safari → Share → Add to Home Screen.
