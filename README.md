# Soccer Team Management

A browser-only web app for managing youth soccer rotations during live games. It tracks who is on the field, who is on the bench, playing time by player, time by position, goals, game history, and season totals.

The app is a **vanilla HTML/CSS/JavaScript app** with browser-native ES modules. There is no build system, backend, or account requirement.

## What the App Does

### Team setup

- Set the team name.
- Add, rename, and remove roster players.
- Add optional player photos.
- Import players from a league CSV using `player_first_name` and `player_last_name` columns.
- Use **Backup Team** to download a full team JSON backup, and **Restore Backup** to import it later.
- Clear all locally stored data and reset the app.

### Game day setup

- Select which roster players are attending a game.
- Enter the opponent name.
- Set the game date.
- Adjust minutes per half.
- Assign a starting lineup on the same visual field used during live gameplay.
- Start with any number of assigned field players, including short-handed games with fewer than 9 players.
- Pick separate first-half and second-half goalkeepers manually, by spinner, or by explicitly reusing the first-half goalkeeper.
- The goalie spinner avoids players who have already logged GK time in saved season history when possible.
- **Plan Both Halves in Advance** — optionally build the Half 1 and Half 2 lineups ahead of the live game, on the same field diagram. The saved plan pre-fills the starting lineup when you set it live, and offers a one-tap "Use Planned Half 2 Lineup" option at halftime; skipping this entirely leaves the normal live/manual flow unchanged. The plan is saved locally and survives closing the browser until the game is played or the plan is cleared.

### Live game tracking

- Countdown clock for each half.
- Pause and resume the game timer.
- Show the compact game header with half, clock, score, goal button, and controls on one row when space allows.
- Show actual team and opponent names in the score area.
- Track field players, bench players, and active goalkeeper.
- Track total playing time per player.
- Track position-specific time for LF, CF, RF, LM, CM, RM, LD, RD, and GK.
- Stage substitutions ahead of time and execute planned subs together.
- Sub immediately by selecting a field player and then a bench player.
- Move a field player directly to the bench.
- Add late-arriving roster players during a game.
- Mark players as removed from the current game.
- Sort the bench by name, playing time, or substitution priority.
- Use color-coded cards to identify players who are under-played, balanced, or over-played.
- Record goals for either team, with optional scorer attribution for your team.
- **Minimum play time floor** — Set a per-game minimum minutes target; bench cards for players at risk of not meeting it (given remaining game time) are highlighted with an amber border and ⚠ indicator.
- **Bench streak timer** — Each bench card shows how long that player has been sitting in their current stint (⏳ X:XX), so you can prioritize who goes in next.
- **Undo last goal** — A single tap reverses the most recently recorded goal (ours or theirs) without leaving the game screen.

### Summaries and history

- Show a post-game summary with first-half, second-half, and total time.
- Show position breakdown chips for each player.
- Save completed games into local season history.
- Show a season summary with wins, losses, draws, goals for, goals against, games played, player goals, and total playing time.
- Import a previously exported JSON file through **Review Game** to view a saved game summary, including a glove marker beside players who played GK.

### Other features

- Dark/light theme toggle.
- Local active-game recovery after an interrupted session.
- Player avatar generation when no photo is set.
- Player photo resize/crop before saving.
- PWA metadata through `manifest.json`.
- Service worker registration through `sw.js` when served from a supported browser context.

## Running the App

Serve the folder locally. Browser-native ES modules and service workers should be tested over HTTP rather than by opening `index.html` directly:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

On some systems the command may be:

```bash
python3 -m http.server 8000
```

## Basic Usage

1. Open the app.
2. If no team is configured, choose **Set Up My Team**.
3. Add the team name and roster.
4. Return to the main game-day screen.
5. Select the players who showed up.
6. Enter the opponent and game date.
7. Set the half length.
8. Choose **Set Starting Lineup**.
9. Assign players to positions on the field diagram. Assign all players who should start; the app no longer requires a full 9-player lineup.
10. Pick or spin for the first-half and second-half goalkeepers.
11. Start the game.
12. Use the field and bench panels to plan subs, execute subs, record goals, and track playing time.
13. End the game to save it to local game history and view the summary.
14. Use **Export Game JSON** to download the completed game summary, or **Backup Team** to download a full team backup.

## Data Storage and Privacy

All app data is stored locally in the browser using `localStorage`.

The main storage keys are:

- `soccerRoster` — team roster.
- `soccerSettings` — team name and half length.
- `playerPhotos` — resized player photos as base64 image data.
- `soccerGameHistory` — completed game records.
- `soccerActiveGame` — interrupted in-progress game state.
- `soccerGamePlan` — a saved "Plan Both Halves in Advance" lineup, kept independently so it survives closing the browser before the game starts.
- `theme` — light/dark theme preference.

No data is sent to a server by this app.

Important limitations:

- Browser storage is not a real database.
- Clearing browser site data will delete the roster, photos, game history, and active game state.
- Player photos can consume browser storage quickly.
- Use **Backup Team** regularly if the data matters.
- Keep exported JSON backups somewhere safe.

## Import, Backup, and Export Notes

### Backup Team

Downloads a JSON backup of the full team profile, including roster, photos, settings, saved game history, and any lineup plan saved for the next unplayed game. Completed game records retain the planned lineups used for that game.
When a pending plan is included, the filename identifies it with the planned game number, game date, and download time, for example `Oyster_Blueberries_2026-Fall_Game_3_Planned_2026-09-26_0930.json`.

### Restore Backup

Imports a previously downloaded team backup JSON file and restores its profile data. When the backup contains a plan for the next unplayed game, the app offers to restore its planned attendees, opponent, date, and both lineups. A completed game's plan cannot become the default for a later game.
Imported profiles are validated and normalized before replacing local data: roster ids and names, settings, saved games, scores, goals, player stats, position totals, planned lineups, and embedded photos are checked before they are stored. Restoring a backup rebuilds the photo map from that backup so old local photos cannot leak into the restored team.

### Export Game JSON

The summary-screen export uses the same profile-style JSON structure and includes the saved game history. It is useful for backup or later review.

### Review Game

Loads a JSON file, validates the saved game data, and displays the most recent game record found in the file without replacing the current team profile.

## App Versioning

The overflow menu includes **About**, which shows the current app version.

Versions use this format:

```text
1.YYDDD.N
```

- `YY` is the two-digit year.
- `DDD` is the day number of the year.
- `N` is the next versioned update number for that day.

The version is stored in `APP_VERSION` in `js/version.js` and is shown in About plus included as `appVersion` in JSON exports. The service worker cache uses `CACHE_VERSION` in `sw.js`, and the cache name is derived from that value.

A tracked pre-commit hook runs `scripts/Update-AppVersion.ps1` to stamp both `js/version.js` and `sw.js` automatically before each commit. The first versioned commit on a day ends in `.1`, the second ends in `.2`, and so on. On a fresh clone, enable the hook with:

```bash
git config core.hooksPath .githooks
```

### Import League CSV

The CSV importer expects these column names:

```text
player_first_name
player_last_name
```

It imports names as `First L.` and skips duplicates already in the roster.

## File Structure

```text
index.html       App shell and screen/modal markup
css/styles.css   App stylesheet
js/              Browser-native ES modules for app logic
scripts/         Version stamping and test-server helpers
tests/           Playwright smoke tests and test server setup/teardown
manifest.json    PWA manifest
sw.js            Service worker for offline caching
README.md        Project overview and usage notes
CLAUDE.md        Claude Code project guidance
PROJECT_MAP.md   Lightweight map to help target sections and modules
```

## Development Notes

This app intentionally has no build step.

- Edit `index.html`, `css/styles.css`, or the focused module in `js/`.
- Test through the local HTTP server.
- Run smoke tests with `npm.cmd test` on Windows PowerShell, or `npm test` in shells where npm scripts are enabled.
- Use browser DevTools for runtime errors.
- Keep changes targeted; the app is split by file so broad rewrites are rarely needed.
- Avoid dumping large files into AI coding tools unless absolutely necessary.
- Use `PROJECT_MAP.md` to locate the relevant section before editing.

### Playwright smoke tests

The Playwright suite uses `tests/global-setup.cjs` and `tests/global-teardown.cjs` to start and stop `scripts/test-server.js`. This avoids Windows teardown hangs seen with Playwright's built-in `webServer` plugin and Python's `http.server`.

The test browser blocks service workers through Playwright config, and `tests/app-smoke.spec.js` also sets `window.__STM_DISABLE_SW__` before app code runs. This keeps the PWA service worker from affecting smoke-test page reloads while leaving normal browser behavior unchanged.

```bash
npm test
```

On this Windows PowerShell setup, use:

```powershell
npm.cmd test
```

## Code Organization

The app has three main areas:

1. `index.html` contains screen and modal markup.
2. `css/styles.css` contains the stylesheet.
3. `js/` contains app logic, with `js/app.js` as the entry point.

The main screens are:

- `setup-screen` — main landing/game-day screen.
- `team-setup-screen` — roster and team settings.
- `lineup-screen` — starting lineup assignment using the shared field diagram.
- `game-screen` — live game tracking with compact header, score, field, bench, substitutions, and goals.
- `summary-screen` — completed game summary and game review display.
- `season-summary-screen` — aggregate season statistics.

Common modals include:

- `gk-picker-modal`
- `goalie-modal`
- `late-modal`
- `remove-player-modal`
- `remove-roster-modal`
- `rename-modal`
- `goal-modal`
- `half-modal`
- `clear-data-modal`

## Key Concepts for Contributors

### State

Mutable app state lives in `js/state.js`. Mutating state does not automatically update the UI. After changing state, call the appropriate render/update function.

Important state variables include:

```js
roster
players
gameHistory
playerPhotos
teamName
opponentName
scoreUs
scoreThem
goals
subPlans
currentHalf
halfClock
totalElapsed
activeGoalieId
```

### Rendering

UI is refreshed through functions such as:

```js
renderRoster()
renderTeamSetupRoster()
renderGameDayCheckboxes()
renderLineup()
renderGame()
renderField()
renderGrid()
renderClock()
renderScore()
showSummary()
showSeasonSummary()
```

### Substitutions

Substitution flow supports both planned and immediate substitutions:

- Planned: select a bench player, select a field position, then press **Sub Now**.
- Immediate: select a field player, then select a bench player.

Planned substitutions are stored in `subPlans` until executed.

### Timing

The clock uses elapsed real time to reduce drift. Active players accumulate playing time based on `totalElapsed`, `subInAt`, and position timers.

### Position Tracking

Position time is tracked with:

```js
position
positionTime
positionStart
```

Use `commitPositionTime(player)` before changing a player's position or moving them off the field.

## Known Limitations

- Some dynamic UI still attaches event handlers while rendering; static markup uses explicit listeners in `js/app.js`.
- Automated coverage is currently limited to smoke tests.
- Data integrity depends on browser `localStorage`.
- Export/import is JSON-file based, not cloud sync.
- Service worker and PWA install behavior may require serving the app over `localhost` or HTTPS.
- The UI is optimized for practical game-day use, not for multi-user collaboration.

## Suggested Future Improvements

- Split `index.html` into separate `styles.css` and `app.js` files.
- Add more automated coverage for critical flows beyond the current smoke tests.
- Add an explicit backup/reminder flow.
- Consider a lightweight data schema/version field for future migrations.
- Improve mobile layout testing across common phone sizes.
