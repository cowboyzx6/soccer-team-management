# PROJECT_MAP.md

Purpose: quick navigation map for Claude Code and humans working on the browser app. This file is intentionally concise so Claude can read it instead of scanning all of `index.html`.

## How to use this map

- Start here before broad exploration of `index.html`.
- Search by section name, DOM id, function name, or line range.
- Read only the smallest useful range first.
- Do not load the whole `index.html` unless a targeted search fails and the reason is stated.

## Project files

- `index.html` - main PWA shell: HTML and a single ES module entry tag, currently 506 lines.
- `css/styles.css` - extracted app stylesheet, currently 1899 lines.
- `js/` - browser-native ES modules for app logic; see the JavaScript modules map below.
- `manifest.json` - PWA metadata.
- `sw.js` - service worker/offline caching.
- `README.md` - user-facing app overview, setup, data/export notes, limitations.
- `CLAUDE.md` - repo-specific guidance for AI coding agents.
- `scripts/Update-AppVersion.ps1` - version stamping helper used by the git hook.
- `scripts/test-server.js` - tiny Node static server used by Playwright smoke tests.
- `tests/` - Playwright smoke specs plus global setup/teardown for the test server.
- `.githooks/` - tracked git hook setup.
- `GameResults/` - exported game JSON examples/history:
  - `Oyster_Blueberries_Game_1_2026-04-18_1100.json`
  - `Oyster_Blueberries_Game_2_2026-04-25_1158.json`
  - `Oyster_Blueberries_Game_3_2026-05-02_1902.json`
  - `Oyster_Blueberries_Game_4_2026-05-09_1757.json`
- `docs/superpowers/specs/` and `docs/superpowers/plans/` - design specs and implementation plans for recent screen/layout work.
- `.superpowers/` - local generated brainstorm/session scratch files; currently untracked.

## Important correction

There is no separate `gameday-screen` element. The game-day landing/check-in UI is inside `#setup-screen`, with `#gameday-empty` and `#gameday-content`.

There is no separate `review-screen` element. Game review imports are rendered through `#summary-screen`.

## CSS map in `css/styles.css`

| Lines | Section | What lives here |
|---:|---|---|
| 1-78 | Global/reset/theme variables | Base CSS, dark/light theme variables, body, `.screen` toggling |
| 79-416 | Setup screen | Setup/team screens, roster list, buttons, text inputs, overflow menu, responsive setup layout |
| 417-454 | Game info row | Game number/date/opponent inputs and responsive layout |
| 455-591 | Gameday player tiles | Attendance tiles, selected check mark, attendance counter/bar, theme button |
| 592-730 | Game header / score bar | Live header, half pill, clock, score labels/buttons, compact action controls |
| 731-1013 | Game panels / cards | Game body, field/bench panels, player cards, avatars, status colors, roster avatars |
| 1014-1154 | Lineup screen | Lineup layout, unassigned player list, shared field board, lineup actions |
| 1155-1196 | Modals | Overlay/modal generic styles and modal button rows |
| 1197-1557 | Summary screens | Game/season summary tables, stat cards, time bars, chips, review goalie icon |
| 1558-1593 | Goalie styles | Goalie status, GK badges/buttons |
| 1594-1646 | Goalie wheel | Wheel container, fades, track, items |
| 1647-1810 | Field diagram | Shared field diagram, position slots, pos labels/avatar/time, GK/bench slot buttons |
| 1811-1899 | Sub planning | Planned sub indicators, incoming player strip, Sub Now button |

## HTML / DOM map in `index.html`

| Lines | Section | What lives here |
|---:|---|---|
| 18-83 | Game day screen / setup-screen | Landing screen. Theme button, overflow menu, no-roster empty state, game info, attendance grid, half duration controls. |
| 84-127 | Team setup screen | Team settings, roster management, import/export inputs, clear data button. |
| 128-141 | Clear data confirm modal | Reset confirmation dialog. |
| 142-158 | About modal | Displays `APP_VERSION` and app metadata from the overflow menu. |
| 159-193 | Lineup screen | Starting lineup assignment field + unassigned players. |
| 194-267 | Game screen | Compact live header, score area, field panel, bench panel, planned subs. |
| 268-299 | Summary screen | Post-game/review summary and manual Export Game JSON button. |
| 300-350 | Season summary screen | Aggregate season record/stats table with sortable columns and top-right back button. |
| 351-375 | Goalie wheel modal | Spin wheel controls and goalie confirm buttons. |
| 376-389 | Remove from roster modal | Permanent roster removal. |
| 390-403 | Rename player modal | Player rename input. |
| 404-417 | GK picker modal | Two-step manual GK picker plus spin option. |
| 418-428 | Late arrival modal | Add not-present roster player to active game bench. |
| 429-442 | Remove player from game modal | Mark player as left/removed from active game. |
| 443-475 | Goal modal | Our goal/opponent goal and scorer/score adjustment UI. |
| 478-488 | Download-prompt modal | Post-game download confirmation (yes/skip). |
| 489-503 | Half time / end game modal | Half-time summary, second-half start, and end-game controls. |
| 504 | Script tag | Loads `js/app.js` as the ES module entry point. |

## JavaScript modules in `js/`

| File | Responsibility | Key exports |
|---|---|---|
| `js/state.js` | State singleton + constants | `state`, `POSITIONS`, `POSITION_ORDER`, `FIELD_SVG` |
| `js/version.js` | Shared app version | `APP_VERSION` |
| `js/utils.js` | DOM helpers + theme | `escHtml`, `fmt`, `showScreen`, `openModal`, `closeModal`, `applyTheme`, `toggleTheme` |
| `js/persistence.js` | localStorage + validated import/export | `saveSettings`, `loadSettings`, `applySettingsToUi`, `saveRoster`, `loadRoster`, `saveActiveGame`, `loadGameHistory`, `exportProfile`, `importProfile`, `importLeagueCsv`, `buildGameRecord`, `initEventListeners` |
| `js/profile-normalizer.js` | Pure profile/game import validation | `normalizeProfile` |
| `js/roster.js` | Roster, attendance, photos | `renderTeamSetupRoster`, `renderGameDayCheckboxes`, `togglePlayerTile`, `renderRoster`, `avatarHtml`, `changeHalfMinutes`, `initEventListeners` |
| `js/lineup.js` | Lineup, GK picker, goalie wheel | `goToLineup`, `renderLineup`, `launchGame`, `initGame`, `spinWheel`, `handleLineupPointerDown` |
| `js/game.js` | Timer, render, subs, goals, game flow | `handleTap`, `renderGame`, `executeAllPlans`, `endGame`, `renderScore`, `handleFieldSlotPointerDown` |
| `js/summary.js` | Summary, season, navigation | `showSummary`, `showSeasonSummary`, `goToSetup`, `confirmClearData`, `setSeasonSort` |
| `js/app.js` | Entry point, init, delegated listeners | No exports |

## Common bug targets

| Symptom / task | Start by searching for |
|---|---|
| Attendance / who showed up / start button | `renderGameDayCheckboxes`, `togglePlayerTile`, `checkedPlayers`, `updateStartBtn`, `#gameday-roster`, `#start-btn` |
| Team setup / roster add/remove/rename | `renderTeamSetupRoster`, `addRosterPlayer`, `openRenameModal`, `removeRosterPlayer`, `#roster-list` |
| Lineup assignment / short-handed starts | `renderLineup`, `renderLineupField`, `handleLineupPointerDown`, `moveLineupPlayerToPosition`, `lineupSlotTap`, `lineupPlayerTap`, `updateLineupLaunchBtn`, `lineupDraft` |
| Goalkeeper picker/wheel | `showGkPicker`, `openGkSpin`, `openGoaliePicker`, `seasonFreshGoalieCandidates`, `spinWheel`, `stopWheel`, `confirmGkFromSpin`, `confirmGoalies` |
| Timer / clock / pause | `togglePause`, `pauseGame`, `resumeGame`, `tick`, `renderClock`, `syncGamePhaseUi`, `halfClock`, `totalElapsed`, `timerBase` |
| Bench sorting / card colors | `computeFairShare`, `getStatus`, `setBenchSort`, `renderGame`, `renderGrid`, `benchSort` |
| Field diagram / position slots | `POSITIONS`, `FIELD_SVG`, `renderField`, `.pos-slot`, `#field-positions`, `handleFieldSlotPointerDown`, `moveFieldPlayerToPosition`, `moveFieldPlayerToBench` |
| Planned substitutions | `handleTap`, `createPlan`, `cancelPlanForPos`, `executeAllPlans`, `subPlans`, `planningBenchId`, `planningPosition` |
| Immediate substitution | `handleTap`, `makeSub`, `selectedId`, `activeGoalieId` |
| Late arrivals | `openLateModal`, `confirmLateArrival`, `#late-player-list` |
| Remove player from active game | `promptRemovePlayer`, `confirmRemovePlayer`, `leftEarly`, delegated bench listener |
| Goals / score | `openGoalModal`, `recordGoal`, `confirmGoal`, `confirmTheirScore`, `renderScore`, `goals`, `scoreUs`, `scoreThem` |
| Half time / second half | `handleHalfEnd`, `startSecondHalf`, `h1Snapshot`, `goalie2Id`, `activeGoalieId`; halftime lineup edit: `editHalf2Lineup` → `openHalftimeLineup` (lineup.js, `state.isHalftimeEdit`) → `halftime-lineup:start` / `:cancel` events → `startSecondHalfWithLineup` / `returnToHalftime` |
| End game / summary | `endGame`, `buildGameRecord`, `showSummary`, `renderGoalsHtml`, `saveGameHistory`, `download-prompt-modal` |
| Season summary | `showSeasonSummary`, `setSeasonSort`, `compareSeasonPlayers`, `gameHistory`, `season-body` |
| Backup/restore/import | UI labels: `Backup Team`, `Restore Backup`, `Import League CSV`. Code targets: `normalizeProfile`, `buildProfile`, `exportProfile`, `importProfile`, `importLeagueCsv`, `parseCsvRoster` |
| Game review import | `importGameReview`, `showGameReviewFromRecord`, `review-file-input` |
| Photos / avatars | `loadPhotos`, `avatarHtml`, `avatarParts`, `triggerPhotoUpload`, `resizeAndStorePhoto`, `playerPhotos` |
| Theme | `applyTheme`, `toggleTheme`, `[data-theme="light"]`, `theme-btn` |
| About/version/cache | `js/version.js`, `APP_VERSION`, `sw.js`, `CACHE_VERSION`, `openAboutModal`, `about-modal`, `about-version`, `scripts/Update-AppVersion.ps1` |
| Resume interrupted game | `saveActiveGame`, `checkForActiveGame`, `soccerActiveGame` |
| Service worker / PWA | `navigator.serviceWorker.register`, `manifest.json`, `sw.js` |
| Playwright smoke tests | `npm.cmd test`, `playwright.config.js`, `tests/app-smoke.spec.js`, `tests/global-setup.cjs`, `tests/global-teardown.cjs`, `scripts/test-server.js` |
| Min play floor / bench streak | `isMinPlayAtRisk`, `changeMinPlayMinutes`, `benchSince`, `renderGrid`, `min-play-display` |
| Undo last goal | `undoLastGoal`, `renderScore`, `undo-goal-btn`, `state.goals` |

## Key DOM ids

### Screens

- `setup-screen`
- `team-setup-screen`
- `lineup-screen`
- `game-screen`
- `summary-screen`
- `season-summary-screen`

### Setup / game-day

- `theme-btn`
- `overflow-menu-btn`
- `overflow-menu`
- `app-title-name`
- `gameday-empty`
- `gameday-content`
- `game-number-label`
- `game-date-input`
- `opponent-input`
- `check-all-btn`
- `gameday-roster`
- `selected-count`
- `total-count`
- `attendance-bar-fill`
- `half-minutes-display`
- `start-btn`

### Team setup

- `team-name-input`
- `roster-list`
- `new-player-input`
- `add-player-btn`
- `photo-file-input`
- `import-file-input`
- `csv-file-input`
- `review-file-input`

### Lineup

- `lineup-header-title`
- `lineup-field-diagram`
- `lineup-field-positions`
- `lineup-hint`
- `lineup-unassigned-list`
- `launch-btn`

### Live game

- `half-pill`
- `clock`
- `pause-btn`
- `action-btn`
- `score-us-label`
- `score-them-label`
- `score-us`
- `score-them`
- `goal-btn`
- `field-count`
- `sub-status`
- `game-field-diagram`
- `field-positions`
- `bench-count`
- `sort-name-btn`
- `sort-time-btn`
- `sort-priority-btn`
- `sub-hint`
- `sub-now-wrap`
- `sub-now-btn`
- `bench-grid`

### Summary / season

- `summary-team-name`
- `summary-vs-line`
- `summary-meta`
- `summary-export-btn`
- `summary-goals-title`
- `summary-goals`
- `summary-body`
- `season-team-name`
- `season-wins`
- `season-losses`
- `season-draws`
- `season-gf`
- `season-ga`
- `season-meta`
- `season-sort-player`
- `season-sort-gp`
- `season-sort-goals`
- `season-sort-time`
- `season-body`

### Modals

- `download-prompt-modal`
- `download-prompt-yes-btn`
- `download-prompt-no-btn`
- `clear-data-modal`
- `about-modal`
- `about-version`
- `goalie-modal`
- `goalie-wheel-title`
- `goalie-wheel-subtitle`
- `wheel-track`
- `gk-picker-modal`
- `gk-picker-title`
- `gk-picker-subtitle`
- `gk-picker-list`
- `remove-roster-modal`
- `rename-modal`
- `late-modal`
- `late-player-list`
- `remove-player-modal`
- `goal-modal`
- `goal-scorer-section`
- `goal-scorer-list`
- `goal-them-section`
- `goal-them-preview`
- `half-modal`
- `half-modal-title`
- `half-modal-body`
- `half-confirm-btn`
- `half-end-early-btn`

## State variables to understand before editing logic

- `roster` - permanent team roster, persisted in `soccerRoster`.
- `players` - active game players and runtime stats.
- `gameHistory` - completed game records, persisted in `soccerGameHistory`.
- `playerPhotos` - id-to-base64 photo map, persisted in `playerPhotos`.
- `subPlans` - queued planned substitutions: `{ inId, pos }`.
- `planningBenchId` - bench player selected while planning a sub.
- `planningPosition` - empty/field slot selected while planning a sub.
- `selectedId` - field player selected for immediate substitution.
- `lineupDraft` - temporary pre-game lineup assignment.
- `savedChecked` - `Set` of player ids that were checked on game-day; used to restore attendance after navigating back.
- `selectedLineupPlayer`, `lineupPointerDrag` - lineup tap/drag assignment state.
- `fieldPointerDrag` - live-game field drag/reposition state.
- `goalie1Id`, `goalie2Id`, `activeGoalieId` - goalie assignment state.
- `totalElapsed`, `halfClock`, `timerBase`, `isRunning` - timer state.
- `scoreUs`, `scoreThem`, `goals` - scoring state.
- `gameDate`, `opponentName`, `teamName`, `halfMinutes` - game/team metadata.
- `minPlayMinutes` - per-game minimum play time target in minutes (0 = off); persisted in settings.
- `benchSince` (per-player) - `totalElapsed` value when the player was last benched; `null` when on field. Used to compute bench streak display.
- `seasonSortKey`, `seasonSortDir` - season summary sorting state.
- `APP_VERSION` - exported from `js/version.js`; shown in About and included in JSON exports.
- `CACHE_VERSION` - declared in `sw.js`; stamped with `APP_VERSION` by `scripts/Update-AppVersion.ps1`.

## Targeted PowerShell snippets for Claude Code

Find likely code without dumping the whole file:

```powershell
Select-String -Path .\js\roster.js -Pattern "renderGameDayCheckboxes|togglePlayerTile|updateStartBtn" -Context 5,20
```

Read a tight range:

```powershell
$lines = Get-Content .\js\lineup.js
$lines[120..230]
```

Recent regression first:

```powershell
git diff --stat
git diff --unified=5 -- index.html css/styles.css js
```

Avoid:

```powershell
Get-Content .\css\styles.css
Get-Content .\js\game.js
git diff
```
