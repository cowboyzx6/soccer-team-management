# Rec Team Assist Features — Design Spec

**Date:** 2026-05-20
**App:** soccer-team-management PWA (Oyster Blueberries Player Tracker)
**Target device:** iPad (primary), phone (secondary)
**Audience:** Recreational youth soccer coach on a sideline

---

## Overview

Three quality-of-life features aimed at rec team coaches who need quick, glanceable information during a live game. All three follow the existing no-build ES module architecture: surgical state changes, targeted renders, no new abstractions.

---

## Feature 1 — Minimum Play Time Floor

### Purpose
Ensure every player gets a minimum amount of field time per game. The app highlights bench players who are at risk of not reaching that minimum given the remaining game time.

### State
- `state.minPlayMinutes: 0` — added to the state singleton in `js/state.js`. Zero means off.
- Persisted alongside `halfMinutes` in `soccerSettings` via `saveSettings()` / `loadSettings()`.

### UI — Setup screen
- New +/- control on the setup screen, directly below the existing half-duration control.
- Label: "Min play" with current value displayed (e.g., "0 min" = off, "10 min", etc.).
- Increments: 5 minutes. Range: 0–45 min. 0 = off (no highlighting).

### UI — In-game adjustment
- Overflow menu item: "Min play: X min" (or "Min play: off" when 0).
- Tapping cycles through 0, 5, 10, 15, 20, 25, 30 and back to 0.
- Updates `saveSettings()` immediately.

### Logic — `isMinPlayAtRisk(player)` in `js/game.js`
Returns `true` when all of:
1. `state.minPlayMinutes > 0`
2. Player is on bench (`!player.onField`)
3. `(state.minPlayMinutes * 60 - player.totalPlayed) > remainingGameSeconds`

`remainingGameSeconds = (state.halfMinutes * 60 * 2) - state.totalElapsed`

Runs at render time in `renderGrid`. Does not fire during half-time break.

### Visual treatment
At-risk bench cards receive an `at-risk` CSS class:
- Amber/orange left border (distinct from red/green/yellow fairness colors).
- Small ⚠ icon rendered before the bench streak timer (if bench streak is also shown).
- No additional sound or modal — visual only.

### New function
`changeMinPlayMinutes(delta)` in `js/roster.js` — increments by delta, clamps 0–45, calls `saveSettings()` and updates the display element. Wired to setup screen buttons and overflow menu item in `js/app.js`.

---

## Feature 2 — Current Bench Streak

### Purpose
Show how long each bench player has been sitting in their current stint so the coach can prioritize who goes in next.

### State
`benchSince: null` — added to each player object. Holds the `state.totalElapsed` value at the moment the player was benched. `null` when the player is on the field.

No separate persistence needed — `benchSince` is part of each player object saved in `saveActiveGame()`.

### When `benchSince` is set (player goes to bench)
- `makeSub` — outgoing player (leaving field)
- `executeAllPlans` — outgoing player
- `moveFieldPlayerToBench` — drag-benched player
- `startSecondHalf` — any player who starts the second half on bench
- `confirmLateArrival` — late arrivals start on bench
- `initGame` / `launchGame` — players not in the starting lineup start on bench

### When `benchSince` is cleared (player goes to field)
- `makeSub` — incoming player
- `executeAllPlans` — incoming player
- `moveFieldPlayerToPosition` — drag-to-field player
- `startSecondHalf` — players who start the second half on field

### Display
In `renderGrid` (bench card rendering):
- Show `⏳ fmt(state.totalElapsed - p.benchSince)` when `benchSince != null`.
- Rendered as a small secondary line below the player name.
- Styled to match existing `.summary-pos-chip` look (small, muted, compact).
- When `minPlayMinutes > 0` and player is at risk, the ⚠ icon precedes the bench streak: `⚠ ⏳ 3:42`.

---

## Feature 3 — Undo Last Goal

### Purpose
Allow the coach to instantly reverse a mis-tapped or mis-recorded goal (ours or theirs) without navigating away from the game screen.

### Logic — `undoLastGoal()` in `js/game.js`
1. If `state.goals.length === 0`, return early.
2. Pop the last entry from `state.goals`.
3. If `goal.team === 'us'`, decrement `state.scoreUs` (floor 0).
4. If `goal.team === 'them'`, decrement `state.scoreThem` (floor 0).
5. Call `renderScore()` and `saveActiveGame()`.

No confirmation prompt — sideline speed matters, and recording a new goal is the natural re-do.

### UI — HTML (`index.html`, score area in `game-screen`)
- Small undo button (↩ icon + "Undo" label) placed adjacent to the goal button in the score area.
- Styled as a secondary button — smaller and less prominent than the main goal button to reduce accidental taps.

### UI — `renderScore()` in `js/game.js`
- Shows the undo button when `state.goals.length > 0`.
- Hides it (or disables it) when `state.goals` is empty.

### Wiring
- Button click delegated in `js/app.js`, calls `undoLastGoal()`.

---

## Docs updates

- **CLAUDE.md** — add rec team context note at top of App summary; document new state variables (`minPlayMinutes`, `benchSince`); document new functions (`isMinPlayAtRisk`, `changeMinPlayMinutes`, `undoLastGoal`).
- **PROJECT_MAP.md** — add `minPlayMinutes`/`benchSince` to state variable list; add new functions to the Common bug targets table.
- **README.md** — brief mention of min play floor and bench streak features in the feature list.
- **sw.js** — no changes needed; JS modules are already cached by filename and will be cache-busted by the version stamp on next commit.

---

## Files changed

| File | Change |
|---|---|
| `js/state.js` | Add `minPlayMinutes: 0` to state singleton |
| `js/persistence.js` | Add `minPlayMinutes` to `saveSettings` / `loadSettings` / `applySettingsToUi` |
| `js/roster.js` | Add `changeMinPlayMinutes(delta)` |
| `js/game.js` | Add `isMinPlayAtRisk`, `undoLastGoal`; update `renderGrid`, `renderScore`, `makeSub`, `executeAllPlans`, `moveFieldPlayerToBench`, `moveFieldPlayerToPosition`, `startSecondHalf`, `confirmLateArrival`; set `benchSince` in game init |
| `js/lineup.js` | Set `benchSince` on bench players in `launchGame` / `initGame` |
| `js/app.js` | Wire undo button, `changeMinPlayMinutes` setup control, overflow menu min-play item |
| `index.html` | Add min-play +/- control to setup screen; add undo button to score area; add overflow menu item |
| `css/styles.css` | Add `.at-risk` bench card style; add bench-streak chip style; add undo button style |
| `CLAUDE.md` | Rec team context, new state/functions |
| `PROJECT_MAP.md` | New state vars, new functions |
| `README.md` | Feature list update |
