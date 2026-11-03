# Repository Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the reviewed state, rotation, summary, date, and data-integrity defects through seven independently testable commits.

**Architecture:** Keep the existing browser-native module structure. Add only small helpers at the modules that already own each responsibility, and place regression coverage in the existing Playwright smoke spec so every commit can be exercised through the real app.

**Tech Stack:** Vanilla JavaScript ES modules, browser `localStorage`, Playwright, Node/npm scripts.

**Spec:** `docs/superpowers/specs/2026-11-03-repo-hardening-design.md`

## Global Constraints

- Keep the browser-only ES-module architecture and existing `localStorage` keys.
- Add no runtime dependencies and no build step.
- Keep game-day touch workflows and existing import/export formats stable.
- Use `npm.cmd` for npm commands on Windows PowerShell.
- Each task must end in exactly one focused commit containing its implementation, regression test, and directly related documentation.
- Before Task 1, verify `git config --get core.hooksPath` returns `.githooks`; configure it with `git config core.hooksPath .githooks` if needed.
- The tracked pre-commit hook intentionally stamps and stages `js/version.js` and `sw.js` on every commit. Keep those generated version changes with each commit; do not revert them as unrelated edits.

## Review Focus

- A removed second-half goalkeeper must never become active or return to the field; test both fallback-goalie and no-eligible-goalie cases in Task 3.
- Clearing data with an active plan and non-default settings must leave no stale runtime values; test storage, state, controls, and theme in Task 4.
- A removed-and-re-added same-name player must have one season row with combined statistics; test row count and totals in Task 5.
- Valid JSON with the wrong shape must not crash startup; test arrays, objects, nulls, and partially invalid entries in Task 6.
- Duplicate-name comparison must ignore case and surrounding whitespace without blocking an unchanged rename; test all three cases in Task 7.

---

### Task 1: Make Playwright Browser Setup Explicit

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Add: `docs/superpowers/specs/2026-11-03-repo-hardening-design.md`
- Add: `docs/superpowers/plans/2026-11-03-repo-hardening.md`

**Interfaces:**
- Consumes: Existing `@playwright/test` dev dependency.
- Produces: npm script `test:install` that installs Chromium for the smoke suite.

- [ ] **Step 1: Add the browser-install script**

Add `"test:install": "playwright install chromium"` beside the existing test scripts in `package.json`.

- [ ] **Step 2: Document first-run test setup**

In the Playwright section of `README.md`, state that contributors run `npm.cmd run test:install` once before `npm.cmd test`, and explain that browser installation is intentionally not a `pretest` hook.

- [ ] **Step 3: Verify the script resolves without downloading**

Run: `npm.cmd run test:install -- --dry-run`

Expected: exit 0 and output naming the Chromium installation target.

- [ ] **Step 4: Commit**

```powershell
git add package.json README.md docs/superpowers/specs/2026-11-03-repo-hardening-design.md docs/superpowers/plans/2026-11-03-repo-hardening.md
git commit -m "Document Playwright browser setup"
```

### Task 2: Use Local Calendar Dates

**Files:**
- Modify: `js/utils.js`
- Modify: `js/roster.js`
- Modify: `js/lineup.js`
- Modify: `js/persistence.js`
- Modify: `tests/app-smoke.spec.js`

**Interfaces:**
- Consumes: A `Date` instance or the current time.
- Produces: `localDateString(date = new Date()) -> string` in `js/utils.js`, formatted as local `YYYY-MM-DD`.

- [ ] **Step 1: Write the failing regression test**

Add `local date helper does not roll an Eastern evening into tomorrow`. Create a browser context with `timezoneId: 'America/New_York'`, dynamically import `/js/utils.js`, call `localDateString(new Date('2026-11-04T01:30:00Z'))`, and assert `2026-11-03`.

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm.cmd test -- --grep "local date helper"`

Expected: FAIL because `localDateString` is not exported.

- [ ] **Step 3: Implement and adopt the helper**

Export `localDateString(date = new Date())` from `js/utils.js` using local year, month, and day accessors. Import it in `roster.js`, `lineup.js`, and `persistence.js`; replace every `new Date().toISOString().slice(0, 10)` used for a game-date default.

- [ ] **Step 4: Verify the focused test and syntax**

Run: `npm.cmd test -- --grep "local date helper"`

Expected: 1 passed.

Run: `node --check js/utils.js; node --check js/roster.js; node --check js/lineup.js; node --check js/persistence.js`

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```powershell
git add js/utils.js js/roster.js js/lineup.js js/persistence.js tests/app-smoke.spec.js
git commit -m "Use local dates for game defaults"
```

### Task 3: Keep Removed Goalkeepers Off the Field

**Files:**
- Modify: `js/game.js`
- Modify: `tests/app-smoke.spec.js`

**Interfaces:**
- Consumes: `state.goalie2Id`, `state.goalie1Id`, and `state.players[*].leftEarly`.
- Produces: Halftime selection of the first eligible preselected goalkeeper, or `null` when neither is eligible.

- [ ] **Step 1: Write failing halftime regression tests**

Add `halftime falls back when the second-half goalie has left` and `halftime leaves GK empty when every selected goalie has left`. Seed state through a dynamic module import, invoke `startSecondHalf(false)`, and assert that no `leftEarly` player is on field or active; in the first test also assert the eligible first-half goalie becomes GK.

- [ ] **Step 2: Run the tests and verify the defect**

Run: `npm.cmd test -- --grep "halftime .* goalie has left|halftime leaves GK empty"`

Expected: at least one FAIL showing a `leftEarly` player returned to the field.

- [ ] **Step 3: Select only eligible fallback goalkeepers**

In `startSecondHalf`, choose from `[state.goalie2Id, state.goalie1Id]`, removing nulls and duplicate IDs, and select the first player whose ID matches and whose `leftEarly` flag is not true. Preserve the existing no-goalie behavior when no candidate qualifies.

- [ ] **Step 4: Verify focused tests and syntax**

Run: `npm.cmd test -- --grep "halftime .* goalie has left|halftime leaves GK empty"`

Expected: 2 passed.

Run: `node --check js/game.js`

Expected: exit 0.

- [ ] **Step 5: Commit**

```powershell
git add js/game.js tests/app-smoke.spec.js
git commit -m "Keep removed goalkeepers off the field"
```

### Task 4: Fully Reset State When Clearing Data

**Files:**
- Modify: `js/state.js`
- Modify: `js/summary.js`
- Modify: `tests/app-smoke.spec.js`

**Interfaces:**
- Consumes: The mutable singleton `state`.
- Produces: `resetState() -> void` in `js/state.js`, restoring every state property to a fresh default value.

- [ ] **Step 1: Write the failing clear-data regression test**

Add `clear all data resets storage runtime plans settings and controls`. Seed non-default values for every state category, set a light theme, add all relevant local-storage keys, invoke `executeClearData()`, and assert: storage is empty; players, goals, plans, queued plans, saved attendance, and timer fields are reset; scores and minimum-play are zero; setup controls show defaults; and the dark theme is applied.

- [ ] **Step 2: Run the test and verify stale state remains**

Run: `npm.cmd test -- --grep "clear all data resets"`

Expected: FAIL on stale runtime fields such as `gamePlan` or `minPlayMinutes`.

- [ ] **Step 3: Add a single source of state defaults**

Refactor `js/state.js` to create defaults through an internal factory and export `resetState()`. Ensure new arrays, objects, and `Set` instances are created on every reset rather than shared.

- [ ] **Step 4: Use the reset in the clear-data flow**

In `executeClearData()`, clear storage, call `resetState()`, call the existing UI/settings render helpers needed to reflect defaults, clear relevant inputs, and apply the default dark theme. Do not change the separate **Start New Season** behavior.

- [ ] **Step 5: Verify focused tests and syntax**

Run: `npm.cmd test -- --grep "clear all data resets"`

Expected: 1 passed.

Run: `node --check js/state.js; node --check js/summary.js`

Expected: both commands exit 0.

- [ ] **Step 6: Commit**

```powershell
git add js/state.js js/summary.js tests/app-smoke.spec.js
git commit -m "Reset all runtime state when clearing data"
```

### Task 5: Deduplicate Season Player Aliases

**Files:**
- Modify: `js/summary.js`
- Modify: `tests/app-smoke.spec.js`

**Interfaces:**
- Consumes: Existing `playerMap` aliases created when a historical ID matches a current roster name.
- Produces: One season-summary row per accumulator object.

- [ ] **Step 1: Write the failing season-summary regression test**

Add `season summary merges a re-added same-name player into one row`. Seed a roster player named Avery with a new ID and game history containing Avery under the old ID plus the new ID. Open the season summary and assert one Avery row, combined games, combined seconds, and combined goals.

- [ ] **Step 2: Run the test and verify duplicate rows**

Run: `npm.cmd test -- --grep "season summary merges"`

Expected: FAIL because two rows render for the aliased accumulator.

- [ ] **Step 3: Deduplicate accumulator identities**

Build `seasonPlayers` from the unique object identities in `playerMap` before sorting and rendering. Preserve the current ID-first and name-fallback lookup behavior.

- [ ] **Step 4: Verify focused and existing season tests**

Run: `npm.cmd test -- --grep "season summary merges|season review includes"`

Expected: 2 passed.

Run: `node --check js/summary.js`

Expected: exit 0.

- [ ] **Step 5: Commit**

```powershell
git add js/summary.js tests/app-smoke.spec.js
git commit -m "Deduplicate players in season summaries"
```

### Task 6: Normalize Stored Roster and History Data

**Files:**
- Modify: `js/persistence.js`
- Modify: `tests/app-smoke.spec.js`

**Interfaces:**
- Consumes: Parsed `soccerRoster` and `soccerGameHistory` values plus existing `normalizeProfile(...)`.
- Produces: Valid `state.roster`, `state.gameHistory`, and `state.nextId`, or safe empty defaults with invalid storage keys removed.

- [ ] **Step 1: Write failing storage-shape regression tests**

Add `startup discards wrong-shaped stored roster and history` using object/null values, and `startup normalizes valid entries while dropping invalid stored entries` using mixed arrays. Reload the page and assert no page error, valid normalized records only, and correct `nextId`.

- [ ] **Step 2: Run the tests and verify startup failure or malformed state**

Run: `npm.cmd test -- --grep "startup .* stored"`

Expected: FAIL because parsed values are currently assigned without shape validation.

- [ ] **Step 3: Normalize both storage paths**

In `loadRoster()` and `loadGameHistory()`, parse each key, pass the value through `normalizeProfile` using a minimal profile object, map normalized roster entries to `{ id, name }`, and reject a non-array top-level value. On any parse or validation error, reset the corresponding state field and remove that storage key.

- [ ] **Step 4: Verify focused import and startup tests**

Run: `npm.cmd test -- --grep "startup .* stored|restore backup normalizes|review game import validates"`

Expected: 4 passed.

Run: `node --check js/persistence.js`

Expected: exit 0.

- [ ] **Step 5: Commit**

```powershell
git add js/persistence.js tests/app-smoke.spec.js
git commit -m "Validate roster and history from local storage"
```

### Task 7: Reject Manual Duplicate Roster Names

**Files:**
- Modify: `js/roster.js`
- Modify: `tests/app-smoke.spec.js`

**Interfaces:**
- Consumes: Candidate name and optional player ID to exclude.
- Produces: Internal `rosterNameExists(name, excludeId = null) -> boolean` using trimmed, case-insensitive comparison.

- [ ] **Step 1: Write failing duplicate-name regression tests**

Add `manual add rejects duplicate roster names regardless of case`, `rename rejects another player's name`, and `rename allows the player's unchanged effective name`. Assert roster size/names and the duplicate warning behavior.

- [ ] **Step 2: Run the tests and verify duplicates are accepted**

Run: `npm.cmd test -- --grep "duplicate roster names|rename rejects|rename allows"`

Expected: the add and conflicting-rename tests FAIL; unchanged rename remains usable.

- [ ] **Step 3: Centralize duplicate comparison**

Add `rosterNameExists(name, excludeId = null)` in `js/roster.js`. Call it from `addRosterPlayer()` and `confirmRename()` after trimming and before title casing. On conflict, show a concise alert and leave the roster unchanged; exclude the current player during rename.

- [ ] **Step 4: Verify focused roster and CSV tests**

Run: `npm.cmd test -- --grep "duplicate roster names|rename rejects|rename allows|league CSV import skips duplicate"`

Expected: 4 passed.

Run: `node --check js/roster.js`

Expected: exit 0.

- [ ] **Step 5: Commit**

```powershell
git add js/roster.js tests/app-smoke.spec.js
git commit -m "Prevent duplicate manual roster names"
```

### Final Verification Gate

- [ ] Install Chromium if it is not already available: `npm.cmd run test:install`.
- [ ] Run the full suite: `npm.cmd test`.
- [ ] Expected: all Playwright tests pass with 0 failures.
- [ ] Run syntax checks for every JavaScript file and `sw.js`.
- [ ] Expected: every `node --check` command exits 0.
- [ ] Run `git status --short --branch` and `git log --oneline -7`.
- [ ] Expected: clean worktree and seven focused commits in the planned order.
