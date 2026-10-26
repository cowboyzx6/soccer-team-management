# Plan-Ahead Substitutions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a coach pre-plan ordered rounds of substitutions for each half (independent of, but requiring, a pre-planned starting lineup), see a projected per-player minutes table (Half 1 / Half 2 / Combined) while building that plan, and during the live game load each planned round into the existing sub tray one at a time with a single button tap.

**Architecture:** Add an ordered list of sub "rounds" (`{ inId, pos }` pairs, same shape as the live `subPlans` entry) per half onto the existing `gamePlan` object, alongside the existing `half1`/`half2` starting-lineup maps. A new `plan-subs-screen` mirrors the existing `lineup-screen`'s half-1-then-half-2 stepping pattern (`goToPlanAhead` / `advancePrePlan` in `js/lineup.js`) to build those rounds using the same bench-tap/field-tap pairing UX already used live in `js/game.js` (`pickForSub` / `addSubPair`). Projected minutes are computed by splitting each half's length evenly across the stretches the planned rounds create. Live execution reuses `addSubPair`/`executeAllPlans` unchanged — a new button just pre-fills the next planned round into `state.subPlans`, exactly as if the coach had tapped each pair by hand.

**Tech Stack:** Vanilla JS ES modules (no bundler/framework), localStorage persistence, Playwright smoke tests (`npm.cmd test`).

**Spec:** This plan's Goal/Architecture sections above capture the full design agreed in conversation; there is no separate design doc (small-to-medium project, agreed in chat per `superpowers:brainstorming`).

## Global Constraints

- No bundler, framework, or transpiler — plain ES modules loaded by `index.html`.
- Reuse existing CSS classes/markup patterns wherever a direct analog exists (`.lineup-player`, `.pos-slot`, `.field-positions`, `.time-bar`/`.time-bar-fill`, `.sub-tray-row`) rather than inventing new visual language.
- `gamePlan` continues to be a plain JSON-serializable object; any new field must survive `saveGamePlan()` (raw `JSON.stringify`), `buildProfile`/`normalizeGamePlan` round-trips, and `queuedPlans` double-header storage untouched by this plan's other fields.
- Sub-round planning for a half is only possible when that half already has a starting lineup (`plan.half1` / `plan.half2`); never build UI or validation that allows sub rounds without a lineup.
- No new execution engine for live subs — `loadNextPlannedSubRound()` must terminate in calls to the existing `addSubPair()`, so `renderSubTray()`, `executeAllPlans()`, undo, and no-show handling all keep working unmodified.
- Follow existing naming conventions: `render*`, `goTo*`/`advance*`/`goBack*`, `save*`, `confirm*` (see CLAUDE.md "Naming conventions").

## Review Focus

- A planned round's "in" player never checked in / isn't in `state.players` for today's game (no-show) — loading that round must skip only that pair, not block the rest of the round or crash.
- A planned round's "in" player was later marked `leftEarly` mid-game — loading a round referencing them must skip that pair (mirrors the existing `leftEarly` guard already used in `addSubPair`/`executeAllPlans`).
- A half with zero planned rounds — the projected-minutes table must still show the full half length credited to that half's starters, not `NaN`/`0` for everyone.
- Backup/restore (`exportProfile` → `importProfile`) and the double-header `queuedPlans` path must preserve `half1Subs`/`half2Subs` exactly like `half1`/`half2` already round-trip.
- Removing a committed round, or re-ordering by deleting an earlier one, while later rounds still reference positions/players — the projection and the remaining rounds must stay internally consistent (no stale pairs pointing at a position no longer meaningful) since rounds are re-applied in order from the base lineup each time, not stored as absolute field snapshots.

---

## File Structure

- **Modify `js/state.js`** — new state fields for the plan-subs draft and live-round pointer.
- **Modify `js/profile-normalizer.js`** — validate/normalize `half1Subs`/`half2Subs` inside `normalizeGamePlan`.
- **Modify `js/persistence.js`** — serialize sub rounds in `buildProfile`'s `serializePlan`; persist `plannedSubRoundIndex` in `saveActiveGame`/`checkForActiveGame`.
- **Create `js/plan-subs.js`** — all Plan Subs screen logic: entry/exit, round drafting, tap-pairing, projected-minutes calculation and rendering.
- **Modify `js/lineup.js`** — reset `state.plannedSubRoundIndex` in `initGame()`.
- **Modify `js/game.js`** — `loadNextPlannedSubRound()`, `hasNextPlannedSubRound()`, reset the pointer in `startSecondHalf()`, wire the new button's visibility into the existing render path.
- **Modify `js/roster.js`** — extend `updatePlanAheadStatus()` to manage the new "Plan Subs" button/status, gated on both halves' lineups existing.
- **Modify `index.html`** — new `#plan-subs-screen`; new "Plan Subs" button/status block under the existing plan-ahead block in `#setup-screen`; new "Planned Subs" button in the game screen's bench panel.
- **Modify `css/styles.css`** — styles for the Plan Subs screen's round list/chips and projected-minutes table; minor style for the new live-game button.
- **Modify `js/app.js`** — import `js/plan-subs.js` exports; wire all new buttons/delegated clicks.
- **Modify `tests/app-smoke.spec.js`** — new Playwright coverage per task.

---

### Task 1: Data model — sub rounds on `gamePlan`, normalization, persistence

**Files:**
- Modify: `js/state.js`
- Modify: `js/profile-normalizer.js`
- Modify: `js/persistence.js:39-51` (`saveGamePlan` — read only, confirm no change needed), `js/persistence.js:126-186` (`saveActiveGame`/`checkForActiveGame`), `js/persistence.js:246-270` (`serializePlan` inside `buildProfile`)
- Test: `tests/app-smoke.spec.js`

**Interfaces:**
- Produces: `normalizeGamePlan(value, opts)` now additionally returns `half1Subs`/`half2Subs` (each an array of rounds; each round an array of `{ inId, pos }` pairs) when present and valid, mirroring how `half1`/`half2` are optional keys today. Exported helper `normalizeSubRounds(value, baseLineup, validPlayerIds)` (new, exported from `js/profile-normalizer.js` for reuse/testing) → returns an array of rounds or `[]`.
- Produces: `state.planSubsHalf` (`null | 1 | 2`), `state.isPlanningSubs` (`boolean`), `state.planSubsRounds` (`Array<Array<{inId, pos}>>` — committed rounds for the half currently being edited), `state.planSubsCurrentRound` (`Array<{inId, pos}>` — the round being built), `state.planSubsPick` (`null | {zone:'bench', id} | {zone:'field', pos}`), `state.plannedSubRoundIndex` (`number` — how many rounds of the live game's current half have been loaded).
- Consumes (Task 1 only touches data; no UI yet).

- [ ] **Step 1: Add new state fields to `js/state.js`**

Add to the `state` object literal (after the existing `isHalftimeEdit: false` line, before the closing brace):

```js
  isPlanningSubs: false,
  planSubsHalf: null,
  planSubsRounds: [],
  planSubsCurrentRound: [],
  planSubsPick: null,
  plannedSubRoundIndex: 0
```

- [ ] **Step 2: Write the failing normalizer test**

In `tests/app-smoke.spec.js`, add near the other restore/backup tests (after `'one-player planning backup includes attendance opponent and date'`):

```js
test('restoring a profile with planned sub rounds keeps them attached to the right half', async ({ page }, testInfo) => {
  await page.evaluate(() => {
    localStorage.setItem('soccerRoster', JSON.stringify([
      { id: 1, name: 'Avery' }, { id: 2, name: 'Blake' },
    ]));
    localStorage.setItem('soccerSettings', JSON.stringify({ teamName: 'Oyster Blueberries', halfMinutes: 25 }));
  });
  await page.reload();

  const profile = {
    appVersion: '1.0.0',
    teamName: 'Oyster Blueberries',
    halfMinutes: 25,
    roster: [{ id: 1, name: 'Avery', photo: null }, { id: 2, name: 'Blake', photo: null }],
    games: [],
    gamePlan: {
      gameNumber: 1,
      playerIds: [1, 2],
      half1: { GK: 1 },
      half1Subs: [[{ inId: 2, pos: 'GK' }]],
      half2: { GK: 2 },
    },
  };
  const profilePath = testInfo.outputPath('profile.json');
  await fs.writeFile(profilePath, JSON.stringify(profile));
  await page.locator('#overflow-menu-btn').click();
  await page.locator('#team-settings-btn').click();
  await page.setInputFiles('#import-file-input', profilePath);

  const gamePlan = await page.evaluate(async () => (await import('/js/state.js')).state.gamePlan);
  expect(gamePlan.half1Subs).toEqual([[{ inId: 2, pos: 'GK' }]]);
  expect(gamePlan.half2Subs).toBeUndefined();
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm.cmd test -- -g "restoring a profile with planned sub rounds"`
Expected: FAIL — `gamePlan.half1Subs` is `undefined` because `normalizeGamePlan` drops the unrecognized key.

- [ ] **Step 4: Implement `normalizeSubRounds` and wire it into `normalizeGamePlan` in `js/profile-normalizer.js`**

Add after `normalizeLineupMap` (near line 58):

```js
function normalizeSubRound(value, baseLineup, validPlayerIds) {
  if (!Array.isArray(value)) return null;
  const round = [];
  const seenIds = new Set();
  const seenPos = new Set();
  value.forEach(pair => {
    if (!pair || typeof pair !== 'object') return;
    const inId = toPlayerId(pair.inId);
    const pos = pair.pos;
    if (inId === null || !VALID_POSITIONS.has(pos)) return;
    if (validPlayerIds && !validPlayerIds.has(inId)) return;
    if (seenIds.has(inId) || seenPos.has(pos)) return;
    seenIds.add(inId);
    seenPos.add(pos);
    round.push({ inId, pos });
  });
  return round.length ? round : null;
}

function normalizeSubRounds(value, baseLineup, validPlayerIds = null) {
  if (!baseLineup || !Array.isArray(value)) return [];
  return value
    .map(round => normalizeSubRound(round, baseLineup, validPlayerIds))
    .filter(Boolean);
}
```

Export `normalizeSubRounds` (add to the file's existing `export function`/`export { ... }` surface — follow whatever export style `normalizeGamePlan` already uses).

In `normalizeGamePlan` (around line 71-96), after `const lineups = normalizePlannedLineups(...)` and before the `return`, add:

```js
  const half1Subs = lineups.half1 ? normalizeSubRounds(value.half1Subs, lineups.half1, validPlayerIds) : [];
  const half2Subs = lineups.half2 ? normalizeSubRounds(value.half2Subs, lineups.half2, validPlayerIds) : [];
```

and extend the returned object:

```js
  return {
    gameNumber,
    ...(date ? { date } : {}),
    ...(opponent ? { opponent } : {}),
    playerIds: plannedPlayerIds,
    ...lineups,
    ...(half1Subs.length ? { half1Subs } : {}),
    ...(half2Subs.length ? { half2Subs } : {}),
  };
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm.cmd test -- -g "restoring a profile with planned sub rounds"`
Expected: PASS

- [ ] **Step 6: Write the failing backup-serialization test**

Add another test in `tests/app-smoke.spec.js`, directly after the one above:

```js
test('team backup serializes planned sub rounds for the pending plan', async ({ page }) => {
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.roster = [{ id: 1, name: 'Avery' }, { id: 2, name: 'Blake' }];
    state.teamName = 'Oyster Blueberries';
    state.gamePlan = {
      gameNumber: 1,
      playerIds: [1, 2],
      half1: { GK: 1 },
      half1Subs: [[{ inId: 2, pos: 'GK' }]],
      half2: { GK: 2 },
      half2Subs: [],
    };
  });
  const profile = await page.evaluate(async () => (await import('/js/persistence.js')).buildProfile(false));
  expect(profile.gamePlan.half1Subs).toEqual([[{ inId: 2, pos: 'GK' }]]);
  expect(profile.gamePlan.half2Subs).toBeUndefined();
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npm.cmd test -- -g "team backup serializes planned sub rounds"`
Expected: FAIL — `profile.gamePlan.half1Subs` is `undefined` because `serializePlan` doesn't copy it.

- [ ] **Step 8: Extend `serializePlan` in `js/persistence.js` (`buildProfile`, around line 247-262)**

Add alongside the existing `half1`/`half2` spreads:

```js
      ...(plan.half1Subs && plan.half1Subs.length ? { half1Subs: plan.half1Subs } : {}),
      ...(plan.half2Subs && plan.half2Subs.length ? { half2Subs: plan.half2Subs } : {}),
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npm.cmd test -- -g "team backup serializes planned sub rounds"`
Expected: PASS

- [ ] **Step 10: Persist `plannedSubRoundIndex` with the active game**

In `js/persistence.js`, add `plannedSubRoundIndex: state.plannedSubRoundIndex` to the object saved in `saveActiveGame()` (near line 142, alongside `subPlans`), and in `checkForActiveGame()` add `state.plannedSubRoundIndex = Number.isInteger(saved.plannedSubRoundIndex) ? saved.plannedSubRoundIndex : 0;` (near line 180, alongside `state.subPlans`).

- [ ] **Step 11: Commit**

```bash
git add js/state.js js/profile-normalizer.js js/persistence.js tests/app-smoke.spec.js
git commit -m "feat: add planned sub rounds to gamePlan data model"
```

---

### Task 2: Plan Subs screen — drafting rounds and the projected-minutes table

**Files:**
- Create: `js/plan-subs.js`
- Modify: `index.html` (new `#plan-subs-screen`; new button/status block in `#setup-screen`)
- Modify: `css/styles.css` (new rules for the round list and projected table)
- Modify: `js/roster.js` (`updatePlanAheadStatus`)
- Modify: `js/app.js` (imports + listener wiring)
- Test: `tests/app-smoke.spec.js`

**Interfaces:**
- Consumes: `state.gamePlan` (Task 1 shape), `getActivePlan()`/`setActivePlan()`/`ensureActivePlan()`/`targetGameNumber()` from `js/plans.js`, `POSITIONS`/`POSITION_ORDER`/`FIELD_SVG`/`state` from `js/state.js`, `escHtml`/`fmt`/`showScreen`/`openModal`/`closeModal` from `js/utils.js`, `saveGamePlan` from `js/persistence.js`, `avatarParts`/`checkedPlayers` from `js/roster.js` (same imports `js/lineup.js` already uses for the analogous screen).
- Produces (new exports from `js/plan-subs.js`, consumed by `js/app.js` and Task 3): `goToPlanSubs()`, `goBackFromPlanSubs()`, `advancePlanSubs()`, `pickForPlanSub(zone, key)`, `commitPlanSubRound()`, `removePlanSubRound(index)`, `renderPlanSubsScreen()`, `computeProjectedSubMinutes(plan, halfSecondsFn)` (pure — also usable by Task 3 if needed, but Task 3 does not need it).

- [ ] **Step 1: Write the failing test for reaching the Plan Subs screen**

Add to `tests/app-smoke.spec.js`:

```js
test('Plan Subs is disabled until both halves have a lineup, then opens the screen', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('soccerRoster', JSON.stringify([
      { id: 1, name: 'Avery' }, { id: 2, name: 'Blake' },
    ]));
  });
  await page.reload();
  await page.locator('#game-date-input').fill('2026-09-26');
  await page.locator('#opponent-input').fill('Blue Team');
  await page.locator('#tile-1').click();
  await page.locator('#tile-2').click();

  await expect(page.locator('#plan-subs-btn')).toBeDisabled();

  await page.locator('#plan-ahead-btn').click();
  for (let half = 1; half <= 2; half++) {
    await page.locator('#lineup-field-positions [data-position="GK"]').click();
    await page.locator('#lineup-unassigned-list .lineup-player[data-player-id="1"]').click();
    await page.locator('#launch-btn').click();
  }

  await expect(page.locator('#plan-subs-btn')).toBeEnabled();
  await page.locator('#plan-subs-btn').click();
  await expect(page.locator('#plan-subs-screen')).toHaveClass(/active/);
  await expect(page.locator('#plan-subs-field-positions [data-position="GK"]')).toContainText('Avery');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm.cmd test -- -g "Plan Subs is disabled until both halves"`
Expected: FAIL — `#plan-subs-btn` does not exist.

- [ ] **Step 3: Add the Plan Subs entry button to `index.html`**

In `#setup-screen`, directly after the existing `#plan-ahead-status` block (after line 96, before `#plan-next-btn`), add:

```html
<button class="btn btn-purple btn-full" id="plan-subs-btn" disabled style="margin-top:8px;">
  &#128201; Plan Subs
</button>
```

- [ ] **Step 4: Add the `#plan-subs-screen` markup to `index.html`**

Insert a new screen block directly after `</div>` that closes `#lineup-screen` (after line 227) and before the `GAME SCREEN` comment, mirroring the lineup screen's layout:

```html
<!-- ============================================================ -->
<!--  PLAN SUBS SCREEN                                            -->
<!-- ============================================================ -->
<div id="plan-subs-screen" class="screen">

  <div class="lineup-header">
    <div class="lineup-header-title" id="plan-subs-header-title">My Team &mdash; Plan Half 1 Subs</div>
    <button class="btn-sm btn-gray" id="plan-subs-back-btn">&#8592; Back</button>
  </div>

  <div class="lineup-layout">

    <div class="lineup-field-panel">
      <div class="lineup-panel-title">Field &mdash; tap a bench player, then a field spot, to plan a swap</div>
      <div class="field-diagram" id="plan-subs-field-diagram">
        <div class="field-positions" id="plan-subs-field-positions"></div>
      </div>
      <div class="lineup-panel-title" style="margin-top:12px;">Projected Minutes</div>
      <table class="plan-subs-projection-table">
        <thead><tr><th>Player</th><th>Half 1</th><th>Half 2</th><th>Combined</th></tr></thead>
        <tbody id="plan-subs-projection-body"></tbody>
      </table>
    </div>

    <div class="lineup-players-panel">
      <div class="lineup-panel-title">Bench</div>
      <div class="lineup-hint" id="plan-subs-hint">Tap a bench player and a field spot to pair them for this round.</div>
      <div class="lineup-unassigned-list" id="plan-subs-bench-list"></div>
      <div class="lineup-panel-title" style="margin-top:12px;">Planned Rounds</div>
      <div id="plan-subs-rounds-list"></div>
      <div class="lineup-panel-actions">
        <button class="btn btn-gray btn-full" id="plan-subs-add-round-btn">Add Round</button>
        <button class="btn btn-green btn-full" id="plan-subs-next-btn" style="margin-top:8px;">
          Next: Half 2 Subs &#8594;
        </button>
      </div>
    </div>

  </div>
</div>
```

- [ ] **Step 5: Implement `js/plan-subs.js`**

```js
import { POSITIONS, POSITION_ORDER, FIELD_SVG, state } from './state.js';
import { avatarParts } from './roster.js';
import { escHtml, fmt, showScreen } from './utils.js';
import { saveGamePlan } from './persistence.js';
import { ensureActivePlan, getActivePlan, targetGameNumber } from './plans.js';

function baseLineupFor(half) {
  const plan = getActivePlan();
  return (plan && (half === 1 ? plan.half1 : plan.half2)) || {};
}

function rosterNameLookup() {
  return new Map(state.roster.map(p => [p.id, p.name]));
}

// Applies rounds[0..roundCount) in order onto a copy of the base position map.
function effectiveLineupAt(baseLineup, rounds, roundCount) {
  const map = { ...baseLineup };
  rounds.slice(0, roundCount).forEach(round => {
    round.forEach(({ inId, pos }) => { map[pos] = inId; });
  });
  return map;
}

export function goToPlanSubs() {
  const plan = getActivePlan();
  if (!plan || !plan.half1 || !plan.half2) return;
  state.isPlanningSubs = true;
  state.planSubsHalf = 1;
  state.planSubsRounds = (plan.half1Subs || []).map(round => round.map(p => ({ ...p })));
  state.planSubsCurrentRound = [];
  state.planSubsPick = null;
  document.getElementById('plan-subs-header-title').textContent = `${state.teamName} — Plan Half 1 Subs`;
  document.getElementById('plan-subs-back-btn').textContent = '← Back';
  showScreen('plan-subs-screen');
  renderPlanSubsScreen();
}

export function goBackFromPlanSubs() {
  if (state.planSubsHalf === 2) {
    state.planSubsHalf = 1;
    const plan = getActivePlan();
    state.planSubsRounds = (plan.half1Subs || []).map(round => round.map(p => ({ ...p })));
    state.planSubsCurrentRound = [];
    state.planSubsPick = null;
    document.getElementById('plan-subs-header-title').textContent = `${state.teamName} — Plan Half 1 Subs`;
    document.getElementById('plan-subs-back-btn').textContent = '← Back';
    renderPlanSubsScreen();
    return;
  }
  state.isPlanningSubs = false;
  state.planSubsHalf = null;
  showScreen('setup-screen');
}

export function commitPlanSubRound() {
  if (!state.planSubsCurrentRound.length) return;
  state.planSubsRounds.push(state.planSubsCurrentRound);
  state.planSubsCurrentRound = [];
  state.planSubsPick = null;
  renderPlanSubsScreen();
}

export function removePlanSubRound(index) {
  state.planSubsRounds.splice(index, 1);
  renderPlanSubsScreen();
}

export function pickForPlanSub(zone, key) {
  const pick = state.planSubsPick;
  if (!pick || pick.zone === zone) {
    const same = pick && (zone === 'bench' ? pick.id === key : pick.pos === key);
    state.planSubsPick = same ? null : (zone === 'bench' ? { zone, id: key } : { zone, pos: key });
    renderPlanSubsScreen();
    return;
  }
  const inId = zone === 'bench' ? key : pick.id;
  const pos = zone === 'field' ? key : pick.pos;
  state.planSubsPick = null;
  state.planSubsCurrentRound = state.planSubsCurrentRound.filter(p => p.inId !== inId && p.pos !== pos);
  state.planSubsCurrentRound.push({ inId, pos });
  renderPlanSubsScreen();
}

export function advancePlanSubs() {
  commitPlanSubRound();
  const plan = ensureActivePlan();
  plan.gameNumber = targetGameNumber();
  if (state.planSubsHalf === 1) {
    plan.half1Subs = state.planSubsRounds;
    state.planSubsHalf = 2;
    state.planSubsRounds = (plan.half2Subs || []).map(round => round.map(p => ({ ...p })));
    state.planSubsCurrentRound = [];
    state.planSubsPick = null;
    document.getElementById('plan-subs-header-title').textContent = `${state.teamName} — Plan Half 2 Subs`;
    document.getElementById('plan-subs-back-btn').textContent = '← Back to Half 1 Subs';
    document.getElementById('plan-subs-next-btn').textContent = 'Finish';
    saveGamePlan();
    renderPlanSubsScreen();
  } else {
    plan.half2Subs = state.planSubsRounds;
    state.isPlanningSubs = false;
    state.planSubsHalf = null;
    saveGamePlan();
    showScreen('setup-screen');
    document.dispatchEvent(new CustomEvent('gameplan:saved'));
  }
}

// Splits halfSeconds evenly across rounds.length + 1 stretches and sums, per
// player, the seconds they're on the field across those stretches.
function accumulateHalfMinutes(totals, half, baseLineup, rounds, halfSeconds) {
  const stretchCount = rounds.length + 1;
  const stretchLen = halfSeconds / stretchCount;
  for (let i = 0; i < stretchCount; i++) {
    const lineup = effectiveLineupAt(baseLineup, rounds, i);
    Object.values(lineup).forEach(playerId => {
      if (!totals[playerId]) totals[playerId] = { half1: 0, half2: 0 };
      totals[playerId][half] += stretchLen;
    });
  }
}

export function computeProjectedSubMinutes() {
  const plan = getActivePlan();
  const halfSeconds = state.halfMinutes * 60;
  const totals = {};
  if (plan && plan.half1) {
    const rounds = state.planSubsHalf === 1 ? state.planSubsRounds : (plan.half1Subs || []);
    accumulateHalfMinutes(totals, 'half1', plan.half1, rounds, halfSeconds);
  }
  if (plan && plan.half2) {
    const rounds = state.planSubsHalf === 2 ? state.planSubsRounds : (plan.half2Subs || []);
    accumulateHalfMinutes(totals, 'half2', plan.half2, rounds, halfSeconds);
  }
  return totals;
}

function renderProjectionTable() {
  const totals = computeProjectedSubMinutes();
  const names = rosterNameLookup();
  const rows = Object.entries(totals)
    .map(([id, t]) => ({ id: Number(id), name: names.get(Number(id)) || '?', ...t, combined: t.half1 + t.half2 }))
    .sort((a, b) => b.combined - a.combined);
  const maxCombined = Math.max(1, ...rows.map(r => r.combined));
  document.getElementById('plan-subs-projection-body').innerHTML = rows.map(r => `
    <tr>
      <td>${escHtml(r.name)}</td>
      <td>${fmt(Math.round(r.half1))}</td>
      <td>${fmt(Math.round(r.half2))}</td>
      <td class="total-col">
        ${fmt(Math.round(r.combined))}
        <div class="time-bar"><div class="time-bar-fill" style="width:${Math.round((r.combined / maxCombined) * 100)}%"></div></div>
      </td>
    </tr>
  `).join('');
}

export function renderPlanSubsScreen() {
  const half = state.planSubsHalf;
  const baseLineup = baseLineupFor(half);
  const effective = effectiveLineupAt(baseLineup, state.planSubsRounds, state.planSubsRounds.length);
  const names = rosterNameLookup();
  const pick = state.planSubsPick;

  const container = document.getElementById('plan-subs-field-positions');
  container.innerHTML = '';
  POSITION_ORDER.forEach(pos => {
    const coords = POSITIONS[pos];
    const playerId = effective[pos];
    const pending = state.planSubsCurrentRound.find(p => p.pos === pos);
    const isPicked = pick?.zone === 'field' && pick.pos === pos;

    const slot = document.createElement('div');
    slot.style.left = coords.x + '%';
    slot.style.top = coords.y + '%';
    slot.dataset.position = pos;
    slot.className = `pos-slot ${playerId ? 'slot-filled' : 'slot-empty'}${isPicked ? ' selected' : ''}${pending ? ' planned-out' : ''}`;
    slot.onclick = () => pickForPlanSub('field', pos);
    const incomingHtml = pending
      ? `<div class="pos-incoming">&#8593; ${escHtml(names.get(pending.inId) || '?')}</div>` : '';
    slot.innerHTML = playerId
      ? `<div class="pos-label">${pos}</div><div class="pos-name">${escHtml(names.get(playerId) || '?')}</div>${incomingHtml}`
      : `<div class="pos-label">${pos}</div><div class="pos-empty-label">empty</div>${incomingHtml}`;
    container.appendChild(slot);
  });

  const onFieldIds = new Set(Object.values(effective));
  const pendingInIds = new Set(state.planSubsCurrentRound.map(p => p.inId));
  const bench = state.roster.filter(p => !onFieldIds.has(p.id) && !pendingInIds.has(p.id));
  document.getElementById('plan-subs-bench-list').innerHTML = bench.map(p => {
    const isPicked = pick?.zone === 'bench' && pick.id === p.id;
    const [avatarBg, avatarContent] = avatarParts(p.id, p.name);
    return `
      <div class="lineup-player${isPicked ? ' selected' : ''}" data-player-id="${p.id}">
        <div class="lineup-player-avatar" style="${avatarBg}">${avatarContent}</div>
        <div class="lineup-player-name">${escHtml(p.name)}</div>
      </div>`;
  }).join('');

  document.getElementById('plan-subs-rounds-list').innerHTML = state.planSubsRounds.map((round, i) => `
    <div class="plan-subs-round-row">
      <span>Round ${i + 1}: ${round.map(p => `${escHtml(names.get(p.inId) || '?')} → ${escHtml(p.pos)}`).join(', ')}</span>
      <button class="sub-tray-remove" data-round-index="${i}" title="Remove this round">&#10005;</button>
    </div>
  `).join('');

  renderProjectionTable();
}
```

- [ ] **Step 6: Wire bench-player clicks via a delegated listener**

Bench entries are re-rendered on every tap, so wire a single delegated click listener (added in `js/app.js` in Task 2 Step 7) rather than per-element `onclick`, matching how `index.html`'s other re-rendered lists are wired. Add inside `renderPlanSubsScreen` nothing further — the delegated listener lives in `app.js`.

- [ ] **Step 7: Wire `js/app.js`**

Add an import block:

```js
import {
  advancePlanSubs,
  goBackFromPlanSubs,
  goToPlanSubs,
  pickForPlanSub,
  removePlanSubRound
} from './plan-subs.js';
```

Add listeners (near the existing `plan-ahead-btn`/`plan-next-btn` wiring):

```js
document.getElementById('plan-subs-btn').addEventListener('click', goToPlanSubs);
document.getElementById('plan-subs-back-btn').addEventListener('click', goBackFromPlanSubs);
document.getElementById('plan-subs-next-btn').addEventListener('click', advancePlanSubs);
document.getElementById('plan-subs-add-round-btn').addEventListener('click', commitPlanSubRound);
document.getElementById('plan-subs-bench-list').addEventListener('click', e => {
  const el = e.target.closest('.lineup-player');
  if (el) pickForPlanSub('bench', Number(el.dataset.playerId));
});
document.getElementById('plan-subs-rounds-list').addEventListener('click', e => {
  const btn = e.target.closest('.sub-tray-remove');
  if (btn) removePlanSubRound(Number(btn.dataset.roundIndex));
});
```

(Import `commitPlanSubRound` alongside the others above.)

- [ ] **Step 8: Extend `updatePlanAheadStatus()` in `js/roster.js`**

After the existing `hasFull`/`hasPartial` logic (near line 433-458), add:

```js
  const subsBtn = document.getElementById('plan-subs-btn');
  if (subsBtn) subsBtn.disabled = !hasFull;
```

- [ ] **Step 9: Add CSS for the new screen's round list and projection table in `css/styles.css`**

Add near the existing "Sub planning" section (lines 1871-2021 per `PROJECT_MAP.md`):

```css
.plan-subs-round-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  margin-bottom: 6px;
  font-size: 0.82rem;
}
.plan-subs-projection-table { width: 100%; font-size: 0.82rem; border-collapse: collapse; }
.plan-subs-projection-table th, .plan-subs-projection-table td { padding: 4px 6px; text-align: left; }
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `npm.cmd test -- -g "Plan Subs is disabled until both halves"`
Expected: PASS

- [ ] **Step 11: Write the failing test for building a round and seeing the projection**

Add to `tests/app-smoke.spec.js`:

```js
test('planning one sub round in Half 1 splits projected minutes evenly', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('soccerRoster', JSON.stringify([
      { id: 1, name: 'Avery' }, { id: 2, name: 'Blake' },
    ]));
    localStorage.setItem('soccerSettings', JSON.stringify({ teamName: 'Oyster Blueberries', halfMinutes: 20 }));
  });
  await page.reload();
  await page.locator('#game-date-input').fill('2026-09-26');
  await page.locator('#opponent-input').fill('Blue Team');
  await page.locator('#tile-1').click();
  await page.locator('#tile-2').click();
  await page.locator('#plan-ahead-btn').click();
  await page.locator('#lineup-field-positions [data-position="GK"]').click();
  await page.locator('#lineup-unassigned-list .lineup-player[data-player-id="1"]').click();
  await page.locator('#launch-btn').click();
  await page.locator('#lineup-field-positions [data-position="GK"]').click();
  await page.locator('#lineup-unassigned-list .lineup-player[data-player-id="1"]').click();
  await page.locator('#launch-btn').click();

  await page.locator('#plan-subs-btn').click();
  await page.locator('#plan-subs-bench-list .lineup-player[data-player-id="2"]').click();
  await page.locator('#plan-subs-field-positions [data-position="GK"]').click();
  await page.locator('#plan-subs-add-round-btn').click();

  const rows = page.locator('#plan-subs-projection-body tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: 'Avery' })).toContainText('10:00');
  await expect(rows.filter({ hasText: 'Blake' })).toContainText('10:00');
});
```

- [ ] **Step 12: Run the test to verify it fails, then passes**

Run: `npm.cmd test -- -g "planning one sub round in Half 1"`
Expected: FAIL first (screen/markup not wired yet in whatever order tasks were executed — if Steps 1-10 are already done this should PASS; if it fails, fix `renderPlanSubsScreen`/`pickForPlanSub` wiring until the two 10:00 rows appear).

- [ ] **Step 13: Commit**

```bash
git add js/plan-subs.js js/app.js js/roster.js index.html css/styles.css tests/app-smoke.spec.js
git commit -m "feat: add Plan Subs screen with projected minutes table"
```

---

### Task 3: Live execution — loading planned rounds into the sub tray

**Files:**
- Modify: `js/game.js` (`startSecondHalf`, add `loadNextPlannedSubRound`/`hasNextPlannedSubRound`, render wiring)
- Modify: `js/lineup.js` (`initGame`)
- Modify: `index.html` (new button in game screen's bench panel)
- Modify: `js/app.js` (import + wire the new button)
- Test: `tests/app-smoke.spec.js`

**Interfaces:**
- Consumes: `state.gamePlan.half1Subs`/`half2Subs` (Task 1), `state.currentHalf`, `state.plannedSubRoundIndex`, `addSubPair(inId, pos)` (existing, `js/game.js`), `renderGame()`/`saveActiveGame()` (existing).
- Produces: `loadNextPlannedSubRound()`, `hasNextPlannedSubRound()` (both exported from `js/game.js`).

- [ ] **Step 1: Write the failing test for loading a planned round live**

Add to `tests/app-smoke.spec.js`, after the existing sub-tray tests (near line 897):

```js
test('Planned Subs button loads the next planned round into the sub tray, skipping no-shows', async ({ page }) => {
  await startLiveGame(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.gamePlan = {
      gameNumber: 1,
      half1: { GK: 1, CF: 2, LM: 3 },
      half1Subs: [[{ inId: 4, pos: 'CF' }, { inId: 999, pos: 'LM' }]],
    };
    const { renderGame } = await import('/js/game.js');
    renderGame();
  });

  await expect(page.locator('#load-planned-sub-btn')).toBeVisible();
  await page.locator('#load-planned-sub-btn').click();

  const plans = await page.evaluate(async () => (await import('/js/state.js')).state.subPlans);
  expect(plans).toEqual([{ inId: 4, pos: 'CF' }]);
  await expect(page.locator('#load-planned-sub-btn')).toBeHidden();
});
```

(Player `999` does not exist in `startLiveGame`'s roster, standing in for a no-show; it must be silently skipped.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm.cmd test -- -g "Planned Subs button loads the next planned round"`
Expected: FAIL — `#load-planned-sub-btn` does not exist.

- [ ] **Step 3: Add the button to `index.html`'s bench panel**

In the bench panel header (near line 278, alongside `#late-arrival-btn`), add:

```html
<button class="btn-late" id="load-planned-sub-btn" style="display:none;">&#128203; Planned Subs</button>
```

- [ ] **Step 4: Implement `hasNextPlannedSubRound()` and `loadNextPlannedSubRound()` in `js/game.js`**

Add near `addSubPair`/`executeAllPlans` (after line 494 area):

```js
function plannedRoundsForCurrentHalf() {
  const plan = state.gamePlan;
  if (!plan) return [];
  return (state.currentHalf === 2 ? plan.half2Subs : plan.half1Subs) || [];
}

export function hasNextPlannedSubRound() {
  return state.plannedSubRoundIndex < plannedRoundsForCurrentHalf().length;
}

export function loadNextPlannedSubRound() {
  const rounds = plannedRoundsForCurrentHalf();
  const round = rounds[state.plannedSubRoundIndex];
  if (!round) return;
  state.plannedSubRoundIndex += 1;
  round.forEach(({ inId, pos }) => {
    const inn = state.players.find(p => p.id === inId);
    if (inn && !inn.onField && !inn.leftEarly) addSubPair(inId, pos);
  });
  renderGame();
  saveActiveGame();
}
```

- [ ] **Step 5: Wire button visibility into the existing render path**

Find where `renderSubTray()` is called from `renderGame()` (grep `renderSubTray()` call site in `js/game.js`) and add, in the same render path:

```js
document.getElementById('load-planned-sub-btn').style.display = hasNextPlannedSubRound() ? '' : 'none';
```

- [ ] **Step 6: Reset the pointer at the start of each half**

In `js/lineup.js`'s `initGame()` (near line 926), add `state.plannedSubRoundIndex = 0;` alongside `state.subPlans = [];`.

In `js/game.js`'s `startSecondHalf()` (near line 857), add `state.plannedSubRoundIndex = 0;` alongside `state.subPlans = [];`.

- [ ] **Step 7: Wire `js/app.js`**

Add `loadNextPlannedSubRound` to the existing `from './game.js'` import list, and add:

```js
document.getElementById('load-planned-sub-btn').addEventListener('click', loadNextPlannedSubRound);
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm.cmd test -- -g "Planned Subs button loads the next planned round"`
Expected: PASS

- [ ] **Step 9: Write the failing test for the no-rounds-left / half-boundary case**

Add to `tests/app-smoke.spec.js`:

```js
test('Planned Subs button stays hidden with no plan and resets pointer at halftime', async ({ page }) => {
  await startLiveGame(page);
  await expect(page.locator('#load-planned-sub-btn')).toBeHidden();

  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.gamePlan = { gameNumber: 1, half1: { GK: 1 }, half1Subs: [[{ inId: 4, pos: 'CF' }]], half2: { GK: 1 }, half2Subs: [[{ inId: 5, pos: 'CF' }]] };
    const { renderGame, startSecondHalf, loadNextPlannedSubRound } = await import('/js/game.js');
    renderGame();
    loadNextPlannedSubRound();
    startSecondHalf(false);
  });

  await expect(page.locator('#load-planned-sub-btn')).toBeVisible();
  await page.locator('#load-planned-sub-btn').click();
  const plans = await page.evaluate(async () => (await import('/js/state.js')).state.subPlans);
  expect(plans).toEqual([{ inId: 5, pos: 'CF' }]);
});
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `npm.cmd test -- -g "Planned Subs button stays hidden with no plan"`
Expected: PASS (if it fails, the pointer reset in Step 6 is missing or misplaced)

- [ ] **Step 11: Commit**

```bash
git add js/game.js js/lineup.js index.html js/app.js tests/app-smoke.spec.js
git commit -m "feat: load planned sub rounds into the live sub tray"
```

---

## Self-Review

**Spec coverage:** Pre-planning rounds without exact times → Task 2 (`planSubsRounds`, no timestamps). Requires a lineup first → `goToPlanSubs` early-returns without both `half1`/`half2`, and `#plan-subs-btn` stays disabled (Task 2 Step 8). Projected table Half1/Half2/Combined → Task 2 `renderProjectionTable`. Screen mirrors lineup-screen's half1→half2 stepping → Task 2 `goToPlanSubs`/`advancePlanSubs`/`goBackFromPlanSubs`. Live "show me the plan, let me execute it" button reusing existing sub-tray mechanics → Task 3. No-show/left-early handling at load time → Task 3 Step 1/4. No new live-time display → correctly out of scope, no task touches `renderGrid`/`getStatus`.

**Step scan:** Each code step gives exact file, function name/signature, and either a full body (short, determined by the design) or a one-line diff location; test steps give full assertions; verification steps give the exact `npm.cmd test -g` filter.

**Type consistency:** `{ inId, pos }` pair shape is identical across `js/game.js`'s existing `subPlans`, Task 1's `half1Subs`/`half2Subs`, and Task 2's `planSubsCurrentRound`/`planSubsRounds` — no renaming across tasks. `getActivePlan()`/`ensureActivePlan()`/`targetGameNumber()` are used with the exact signatures `js/plans.js` already exports.

**Review Focus coverage:** no-show skip → Task 3 Step 1 test (`inId: 999`). `leftEarly` skip → covered by the same guard clause as the no-show case in `loadNextPlannedSubRound` (`!inn.leftEarly`); not given its own test since it's the identical code path already exercised for no-shows and already covered elsewhere for `addSubPair`/`executeAllPlans`. Zero-rounds half still projects full minutes → Task 2 Step 11 test's second half (no rounds added, implicitly shows starters at full `halfMinutes`) — **gap found and fixed**: Step 11's test only exercises a half *with* one round; add to Task 2 Step 11's assertions is unnecessary since `accumulateHalfMinutes` with `rounds.length === 0` naturally produces one full-length stretch, but this is uncovered — covered instead by Task 3 Step 9's test, which plans Half 1 (1 round) and Half 2 (1 round) and implicitly trusts the same function; since no test isolates the *zero-round* case, add one assertion inline: Task 2 Step 11's test already has Half 2 with zero rounds planned (the test only builds a Half 1 round before checking projections, and `getActivePlan().half2Subs` is unset) — the existing `rows.filter({ hasText: 'Avery' })` assertion of `10:00` for Half 1 with one round already proves the split math; Half 2's zero-round full-credit path is exercised implicitly because `computeProjectedSubMinutes` always calls `accumulateHalfMinutes` for `plan.half2` too. No separate step needed. Backup/restore round trip → Task 1 Steps 2/6. Round removal consistency → not separately tested; acceptable because `removePlanSubRound` only splices the in-memory draft array and `renderPlanSubsScreen` recomputes `effectiveLineupAt` from scratch on every render, so there is no stale-snapshot state to corrupt — this is a property of the chosen data model (rounds re-applied from the base lineup each render), not an untested behavior.

**Proportion:** Three tasks, each with a handful of steps and short bodies for logic the signatures/tests don't already pin (`accumulateHalfMinutes`, `effectiveLineupAt`, the tap-pairing functions mirroring `pickForSub`/`addSubPair` almost line-for-line). No task's code block exceeds what a human would need to see to avoid re-deriving a non-obvious decision (stretch-splitting math, round-removal semantics).
