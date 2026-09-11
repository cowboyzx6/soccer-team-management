# Codex Instructions for soccer-team-management

Soccer Team Management is a browser-only youth soccer rotation app. It is vanilla HTML, CSS, and JavaScript using browser-native ES modules.

## Architecture

- No backend.
- No build step.
- Data lives in browser `localStorage`.
- Main files are `index.html`, `css/styles.css`, `js/`, `manifest.json`, and `sw.js`.
- Use `PROJECT_MAP.md` when present to locate the relevant module before editing.

## Local Development

Serve the repo over HTTP; do not test by opening `index.html` directly because ES modules, `fetch()`, and service workers need a browser context.

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Validation

- Playwright smoke tests are available through `npm test`.
- On Windows PowerShell, prefer `npm.cmd test` if script resolution is troublesome.
- The Playwright setup intentionally blocks service workers during tests.

## Versioning

- App version lives in `js/version.js`.
- Service-worker cache version lives in `sw.js`.
- A tracked pre-commit hook stamps both through `scripts/Update-AppVersion.ps1`.
- On a fresh clone, enable the hook with:

```powershell
git config core.hooksPath .githooks
```

## Editing Guidance

- Keep live game-day workflows stable and touch-friendly.
- Be careful with substitutions, goalkeeper logic, timing, saved game history, import/export, and localStorage migrations.
- After changing state, call the appropriate render/update function; mutating state alone does not refresh the UI.
- Avoid broad rewrites. This app is intentionally simple and split by feature modules.
