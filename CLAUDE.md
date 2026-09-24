# CLAUDE.md

This file gives Claude Code project-specific guidance for this repository.

## App summary

A no-build, single-file PWA for managing youth soccer player rotations during live games. Built specifically for recreational youth soccer teams where equal playing time and sideline-friendly tooling matter most. It tracks playing time, position time, substitutions, goalies, goals, game summaries, season stats, roster data, and photos.

## Development workflow

- Main app file: `index.html`
- Supporting files: `manifest.json`, `sw.js`
- No bundler, framework, transpiler, or build step. npm is used only for Playwright test tooling.
- Edit files directly
- Test by opening `index.html` in a browser, or run:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

Run smoke tests with:

```bash
npm test
```

On this Windows PowerShell setup, prefer:

```powershell
npm.cmd test
```

The Playwright config uses `tests/global-setup.cjs` / `tests/global-teardown.cjs` to manage `scripts/test-server.js`; do not reintroduce Playwright's built-in `webServer` plugin unless its Windows teardown behavior has been verified. Test contexts block service workers, and `tests/app-smoke.spec.js` sets `window.__STM_DISABLE_SW__` before app startup.

## Token / context discipline

`index.html` is large. Use targeted navigation.

- Do not read all of `index.html` by default.
- Read `PROJECT_MAP.md` first when locating a feature area.
- Search by DOM id, function name, state variable, visible text, or section header.
- Read the smallest useful line range.
- Avoid full file dumps and full `git diff` output.
- For recent regressions, start with `git diff --stat` and `git diff --unified=5 -- index.html`.
- Before broad exploration, state why targeted search was insufficient.
- Prefer minimal surgical edits over broad rewrites.
- After changing state logic, verify the relevant render/save function is called.
- Show concise summaries and focused diffs, not full rewritten files.

`PROJECT_MAP.md` is intentionally not imported with `@PROJECT_MAP.md`; read it on demand so it does not consume context in every session.

## User-facing import/backup labels

The Team Settings buttons use coach-friendly labels:

- `Import League CSV` calls `importLeagueCsv()` and imports roster names from a league CSV.
- `Restore Backup` calls `importProfile()` and imports a previously downloaded team JSON backup.
- `Backup Team` calls `exportProfile()` and downloads the full team JSON backup.

Avoid using the older labels `League CSV`, `Load Profile`, or `Save Profile` in user-facing docs or UI unless referring to historical versions.

## Architecture

`index.html` contains the HTML for all screens and modals, plus a single `<script type="module" src="js/app.js">` entry point.

App logic lives in `js/` as browser-native ES modules:

- `js/state.js` — shared singleton `state` object and constants (`POSITIONS`, `FIELD_SVG`, etc.)
- `js/utils.js` — DOM helpers (`escHtml`, `fmt`, `showScreen`, `openModal`, `closeModal`, `applyTheme`, `toggleTheme`)
- `js/persistence.js` - localStorage read/write, import/export validation, file input wiring
- `js/profile-normalizer.js` - pure profile/game JSON validation and normalization
- `js/roster.js` — roster management, attendance tiles, photo upload
- `js/lineup.js` — starting lineup assignment, GK picker, goalie wheel
- `js/game.js` — timer, substitutions, goals, score, half/end flow
- `js/summary.js` — post-game summary, season summary, navigation
- `js/app.js` - entry point: initialises all modules, wires all delegated listeners, registers the service worker unless tests opt out
- `css/styles.css` — extracted stylesheet

There is no virtual DOM or automatic reactivity. After mutating state, call the appropriate render/save function.

## Actual screens

All screens exist in the DOM. `showScreen(id)` switches screens by toggling `.active`.

- `setup-screen` — landing/game-day check-in UI
- `team-setup-screen` — team name, roster, import/export, reset
- `lineup-screen` — starting lineup assignment using the same field diagram as live gameplay
- `game-screen` — compact live header, clock, score, field, bench, substitutions
- `summary-screen` — post-game summary and imported game review display
- `season-summary-screen` — aggregate season stats

Important corrections:

- There is no `gameday-screen` id. Game-day content lives inside `setup-screen` as `gameday-empty` / `gameday-content`.
- There is no separate `review-screen` id. Imported game review data is rendered through `summary-screen`.

## Major flow

1. Load persisted data.
2. Configure roster/team if needed.
3. Select attending players on the game-day landing UI.
4. Assign starting lineup. Full 9-player lineups are not required; at least one assigned field player can start.
5. Pick first-half and second-half goalies manually, by wheel, or explicitly reuse the first-half goalie.
6. Run game clock.
7. Plan or execute substitutions.
8. Record goals.
9. Handle halftime / second half.
10. End game and save history.
11. View game summary or season summary.

## Key state

All mutable app state lives in the `state` singleton exported from `js/state.js`.

```js
state.roster          // permanent roster, persisted
state.players         // active-game players and runtime stats; each entry also carries:
                      //   benchSince: totalElapsed when last benched (null when on field)
state.gameHistory     // completed games
state.playerPhotos    // id -> base64 data URL

state.subPlans        // pending sub pairs shown in the sub tray: [{ inId, pos }]
state.subPick         // current sub tap: null | { zone: 'bench', id } | { zone: 'field', pos }

state.lineupDraft     // pre-game lineup assignment
state.savedChecked    // Set of player ids checked at game-day start
state.selectedLineupSlot
state.selectedLineupPlayer

state.goalie1Id
state.goalie2Id
state.activeGoalieId

state.totalElapsed
state.halfClock
state.timerBase
state.isRunning

state.scoreUs
state.scoreThem
state.goals

state.gameDate
state.opponentName
state.teamName
state.halfMinutes
state.minPlayMinutes  // minimum play time per game in minutes (0 = off); persisted in soccerSettings
```

State changes do not update the UI automatically.

## Persistence

Data is stored in `localStorage`:

- `soccerRoster`
- `soccerSettings`
- `soccerGameHistory`
- `soccerActiveGame`
- `playerPhotos`
- `theme`

When changing data that should survive refresh, update the relevant `save*()` function or call it after mutation.

Profile/game JSON imports are normalized in `js/persistence.js` before they replace state. Keep imported IDs, names, scores, goals, stats, position seconds, half length, and photos inside that validation path. Restore Backup rebuilds `state.playerPhotos` from the imported roster and removes the previous `playerPhotos` key before saving new photos.

## Implementation rules

- Use `escHtml()` for untrusted/user-visible strings inserted into HTML templates.
- Use the import normalization helpers in `js/persistence.js` for JSON backup/review data rather than assigning parsed JSON directly into state.
- When moving a player off the field, commit position time before clearing `position`.
- When putting a player on the field, set `subInAt`, `position`, and start position timing.
- When changing goalie assignment, keep `activeGoalieId`, `goalie1Id`, and `goalie2Id` consistent with the current half.
- Goalie spinner candidates should exclude players who already have positive `GK` time in `gameHistory` when possible; manual selection remains the override path.
- After substitution changes, clear `subPick` and drop related `subPlans`.
- After game-state changes during a live game, call `saveActiveGame()` when persistence matters.
- After changing score/goals, call `renderScore()` and save active game.
- After changing roster/photos/settings/history, call the matching save/render function.

## Naming conventions

- `render*()` — redraws UI from state
- `show*()` / `open*()` / `close*()` — navigation or modal visibility
- `save*()` / `load*()` — localStorage persistence
- `build*()` — creates export/history data structures
- `confirm*()` — modal confirmation handlers
- `goTo*()` / `goBack*()` — screen navigation

## Important function clusters

Use `PROJECT_MAP.md` for line ranges.

- Attendance/check-in: `renderGameDayCheckboxes`, `togglePlayerTile`, `checkedPlayers`, `updateStartBtn`
- Team setup: `renderTeamSetupRoster`, `addRosterPlayer`, `openRenameModal`, `removeRosterPlayer`
- Lineup: `goToLineup`, `showGkPicker`, `renderLineup`, `lineupSlotTap`, `lineupPlayerTap`, `launchGame`
- Goalies: `showGkPicker`, `openGkSpin`, `openGoaliePicker`, `seasonFreshGoalieCandidates`, `spinWheel`, `stopWheel`, `confirmGkFromSpin`
- Game render: `renderGame`, `renderField`, `renderGrid`, `computeFairShare`, `getStatus`
- Substitutions: `pickForSub`, `addSubPair`, `removeSubPair`, `renderSubTray`, `executeAllPlans`, `undoLastSub`, `moveFieldPlayerToBench`
- Timer: `pauseGame`, `resumeGame`, `tick`, `renderClock`
- Goals/score: `openGoalModal`, `recordGoal`, `confirmGoal`, `confirmTheirScore`, `renderScore`, `undoLastGoal`
- Min play / bench assist: `changeMinPlayMinutes`, `isMinPlayAtRisk`
- Half/end/summary: `handleHalfEnd`, `startSecondHalf`, `endGame`, `buildGameRecord`, `showSummary`, `showSeasonSummary`
- Import/export/photos: `exportProfile`, `importProfile`, `importLeagueCsv`, `importGameReview`, `resizeAndStorePhoto`

## Field positions

Fixed formation: 3-3-2 + GK.

```js
LF, CF, RF, LM, CM, RM, LD, RD, GK
```

Coordinates live in `POSITIONS`. Rendering order lives in `POSITION_ORDER`.
Both the starting lineup screen and live game screen insert the shared `FIELD_SVG`.

## Debugging workflow

1. Identify the feature area using `PROJECT_MAP.md`.
2. Search the relevant `js/` module for the function/id/state variable (use Grep or `Select-String`).
3. Read a tight range around the match.
4. Check both the state mutation and the corresponding render/save call.
5. For delegated click listeners on re-rendered elements, check `js/app.js` (bottom section) and the `initEventListeners()` functions in `js/roster.js` and `js/persistence.js`.
6. Use `git diff --stat` and targeted diffs for recent regressions.

Useful PowerShell patterns:

```powershell
Select-String -Path .\js\*.js -Pattern "functionName|dom-id|stateVariable" -Context 5,20
```

```powershell
$lines = Get-Content .\js\game.js
$lines[200..350]
```

```powershell
git diff --stat
git diff --unified=5 -- js css index.html
```

Avoid:

```powershell
Get-Content .\js\game.js
cat .\index.html
git diff
```
