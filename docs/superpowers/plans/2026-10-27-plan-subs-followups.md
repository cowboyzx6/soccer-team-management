# Plan Subs Follow-Ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the four non-blocking issues the final whole-branch review of the Plan Subs feature (`docs/superpowers/plans/2026-10-26-plan-ahead-subs.md`) deferred as follow-ups: a stale button label, a round-removal consistency bug in the projected-minutes table, a planned round that can't be reloaded after being cancelled, and a Plan Subs bench list that shows the whole roster instead of just the game's checked-in players.

**Architecture:** All four fixes are small, targeted edits to already-shipped code (`js/plan-subs.js`, `js/game.js`, `js/state.js`, `js/persistence.js`, `js/lineup.js`). No new screens, no new data-model fields beyond one new scalar (`pendingPlannedRoundIndex`) for the round-reload fix. Each fix is independently testable and ships in its own task so a reviewer can approve one without blocking on another.

**Tech Stack:** Vanilla JS ES modules (no bundler/framework), Playwright smoke tests (`npm.cmd test`).

**Spec:** This plan's Goal/Architecture sections, plus the four findings themselves, which are the full spec — each finding below is quoted from the final review that originated it (see the prior plan's `docs/superpowers/plans/2026-10-26-plan-ahead-subs.md` and its SDD ledger history for origin, now cleaned up). No separate design doc; these are bug fixes with an already-agreed fix approach, not new design decisions.

## Global Constraints

- No bundler, framework, or transpiler — plain ES modules.
- `gamePlan` stays a plain JSON-serializable object; any new state field added for Task 2 must survive `saveActiveGame()`/`checkForActiveGame()` round-trips the same way `plannedSubRoundIndex` already does.
- No new execution engine for live subs — Task 2's fix must still terminate in the existing `addSubPair()`/`executeAllPlans()` calls, unchanged in their own logic.
- Follow existing naming conventions (`render*`, `goTo*`/`advance*`/`goBack*`, `save*`).
- Reuse existing CSS/markup; none of these fixes should need new CSS.

## Review Focus

- Task 1's label fix must cover both paths that can leave the stale "Finish" text: re-opening Plan Subs after a prior full run, and tapping Back from Half 2 to Half 1 (the original review found the first path was missed by an earlier, narrower assumption).
- Task 1's round-removal fix must not break the ordinary case (no removal, rounds applied in order) — a regression there would be worse than the bug it fixes.
- Task 1's bench-list fix must not hide a player from the bench who legitimately belongs there (e.g. a player on `plan.playerIds` who hasn't been subbed in yet) — only players outside `plan.playerIds` should disappear.
- Task 2's pending-index fix must still let `hasNextPlannedSubRound()` correctly hide the button once every round is genuinely consumed, and must not let a round be skipped (counted as done when it wasn't) or double-executed.
- Task 2's fix must survive an app reload mid-game (the `pendingPlannedRoundIndex` needs the same persistence treatment `plannedSubRoundIndex` already gets), and must reset cleanly at both half boundaries (game start, second half start) like `plannedSubRoundIndex` already does.

---

## File Structure

- **Modify `js/plan-subs.js`** — Task 1: button-label reset, round-removal consistency, bench-list scoping.
- **Modify `js/state.js`** — Task 2: new `pendingPlannedRoundIndex` field.
- **Modify `js/game.js`** — Task 2: `loadNextPlannedSubRound()`/`executeAllPlans()` changes, reset site.
- **Modify `js/lineup.js`** — Task 2: reset site (`initGame()`).
- **Modify `js/persistence.js`** — Task 2: persist/restore the new field.
- **Modify `tests/app-smoke.spec.js`** — both tasks' tests.

---

### Task 1: Plan Subs screen consistency fixes (label, round removal, bench scoping)

**Files:**
- Modify: `js/plan-subs.js`
- Test: `tests/app-smoke.spec.js`

**Interfaces:**
- Consumes: `getActivePlan()` from `js/plans.js` (already imported in this file); `plan.playerIds` (already populated by `js/profile-normalizer.js`'s `normalizeGamePlan`, unchanged by this task).
- Produces: no new exports; `effectiveLineupAt`, `renderPlanSubsScreen`, `goToPlanSubs`, `goBackFromPlanSubs` keep their existing signatures.

- [ ] **Step 1: Write the failing test for the button-label reset**

Add to `tests/app-smoke.spec.js`, near the existing Plan Subs tests:

```js
test('Plan Subs next-button label resets after a full run and after going back to Half 1', async ({ page }) => {
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
  await page.locator('#plan-ahead-btn').click();
  for (let half = 1; half <= 2; half++) {
    await page.locator('#lineup-field-positions [data-position="GK"]').click();
    await page.locator('#lineup-unassigned-list .lineup-player[data-player-id="1"]').click();
    await page.locator('#launch-btn').click();
  }

  await page.locator('#plan-subs-btn').click();
  await expect(page.locator('#plan-subs-next-btn')).toHaveText(/Next: Half 2 Subs/);
  await page.locator('#plan-subs-next-btn').click();
  await expect(page.locator('#plan-subs-next-btn')).toHaveText('Finish');
  await page.locator('#plan-subs-back-btn').click();
  await expect(page.locator('#plan-subs-next-btn')).toHaveText(/Next: Half 2 Subs/);
  await page.locator('#plan-subs-next-btn').click();

  // Re-open Plan Subs after a completed run — label must not still say "Finish".
  await page.locator('#plan-subs-btn').click();
  await expect(page.locator('#plan-subs-next-btn')).toHaveText(/Next: Half 2 Subs/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm.cmd test -- -g "Plan Subs next-button label resets"`
Expected: FAIL — the final assertion fails because re-opening Plan Subs leaves the button reading "Finish" from the prior run.

- [ ] **Step 3: Fix `goToPlanSubs()` and `goBackFromPlanSubs()` in `js/plan-subs.js`**

In `goToPlanSubs()` (currently lines 25-37), add a line resetting the next-button text alongside the existing header/back-button resets:

```js
  document.getElementById('plan-subs-next-btn').textContent = 'Next: Half 2 Subs →';
```

In `goBackFromPlanSubs()`'s half-2-to-half-1 branch (currently lines 39-50), add the same line alongside its existing header/back-button resets.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm.cmd test -- -g "Plan Subs next-button label resets"`
Expected: PASS

- [ ] **Step 5: Write the failing test for round-removal consistency**

Add to `tests/app-smoke.spec.js`:

```js
test('removing an earlier planned-sub round does not double-book a player in the projection', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('soccerRoster', JSON.stringify([
      { id: 1, name: 'Avery' }, { id: 2, name: 'Blake' }, { id: 3, name: 'Casey' },
    ]));
    localStorage.setItem('soccerSettings', JSON.stringify({ teamName: 'Oyster Blueberries', halfMinutes: 30 }));
  });
  await page.reload();
  await page.locator('#game-date-input').fill('2026-09-26');
  await page.locator('#opponent-input').fill('Blue Team');
  await page.locator('#tile-1').click();
  await page.locator('#tile-2').click();
  await page.locator('#tile-3').click();
  await page.locator('#plan-ahead-btn').click();
  for (let half = 1; half <= 2; half++) {
    await page.locator('#lineup-field-positions [data-position="GK"]').click();
    await page.locator('#lineup-unassigned-list .lineup-player[data-player-id="1"]').click();
    await page.locator('#launch-btn').click();
  }

  await page.locator('#plan-subs-btn').click();
  // Round 1: Blake in for Avery at GK.
  await page.locator('#plan-subs-bench-list .lineup-player[data-player-id="2"]').click();
  await page.locator('#plan-subs-field-positions [data-position="GK"]').click();
  await page.locator('#plan-subs-add-round-btn').click();
  // Round 2: Avery back in for Blake at GK (undoes round 1).
  await page.locator('#plan-subs-bench-list .lineup-player[data-player-id="1"]').click();
  await page.locator('#plan-subs-field-positions [data-position="GK"]').click();
  await page.locator('#plan-subs-add-round-btn').click();

  // Remove round 1 — round 2 ("Avery in for Blake") now points at a position
  // Avery already effectively holds. The projection must not credit Avery
  // twice (or drop Blake) for that stretch.
  await page.locator('#plan-subs-rounds-list .sub-tray-remove[data-round-index="0"]').click();

  const totalSeconds = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { computeProjectedSubMinutes } = await import('/js/plan-subs.js');
    const totals = computeProjectedSubMinutes();
    return Object.values(totals).reduce((sum, t) => sum + t.half1 + t.half2, 0);
  });
  // 2 halves * 30 min * 60s, credited to exactly one on-field player (GK) per
  // stretch — no player should be double-counted.
  expect(totalSeconds).toBe(2 * 30 * 60);
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm.cmd test -- -g "does not double-book a player in the projection"`
Expected: FAIL — total seconds exceeds the expected value because `effectiveLineupAt` applies round 2's stale pair unconditionally.

- [ ] **Step 7: Fix `effectiveLineupAt` in `js/plan-subs.js`**

Replace the current body (lines 17-23):

```js
function effectiveLineupAt(baseLineup, rounds, roundCount) {
  const map = { ...baseLineup };
  rounds.slice(0, roundCount).forEach(round => {
    round.forEach(({ inId, pos }) => { map[pos] = inId; });
  });
  return map;
}
```

with a version that skips a pair when its incoming player is already present elsewhere in the map (mirroring the live loader's own already-on-field guard in `loadNextPlannedSubRound`):

```js
function effectiveLineupAt(baseLineup, rounds, roundCount) {
  const map = { ...baseLineup };
  rounds.slice(0, roundCount).forEach(round => {
    const onField = new Set(Object.values(map));
    round.forEach(({ inId, pos }) => {
      if (onField.has(inId)) return;
      map[pos] = inId;
      onField.add(inId);
    });
  });
  return map;
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm.cmd test -- -g "does not double-book a player in the projection"`
Expected: PASS

- [ ] **Step 9: Run the earlier round-planning test to confirm no regression**

Run: `npm.cmd test -- -g "planning one sub round in Half 1"`
Expected: PASS (this is the Task 2 test from the prior plan; confirms the ordinary one-round case still projects correctly after the `effectiveLineupAt` change)

- [ ] **Step 10: Write the failing test for bench-list scoping**

Add to `tests/app-smoke.spec.js`:

```js
test('Plan Subs bench list only shows players checked in for this game', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('soccerRoster', JSON.stringify([
      { id: 1, name: 'Avery' }, { id: 2, name: 'Blake' }, { id: 3, name: 'Casey' },
    ]));
  });
  await page.reload();
  await page.locator('#game-date-input').fill('2026-09-26');
  await page.locator('#opponent-input').fill('Blue Team');
  await page.locator('#tile-1').click();
  await page.locator('#tile-2').click();
  // Casey (id 3) is NOT checked in for this game.
  await page.locator('#plan-ahead-btn').click();
  for (let half = 1; half <= 2; half++) {
    await page.locator('#lineup-field-positions [data-position="GK"]').click();
    await page.locator('#lineup-unassigned-list .lineup-player[data-player-id="1"]').click();
    await page.locator('#launch-btn').click();
  }

  await page.locator('#plan-subs-btn').click();
  await expect(page.locator('#plan-subs-bench-list .lineup-player[data-player-id="2"]')).toBeVisible();
  await expect(page.locator('#plan-subs-bench-list .lineup-player[data-player-id="3"]')).toHaveCount(0);
});
```

- [ ] **Step 11: Run the test to verify it fails**

Run: `npm.cmd test -- -g "bench list only shows players checked in"`
Expected: FAIL — Casey (id 3) appears in the bench list because it's built from the whole roster.

- [ ] **Step 12: Fix the bench-list filter in `renderPlanSubsScreen` (`js/plan-subs.js`)**

Currently (around line 161-190), `baseLineup`/`effective` are computed but `plan` itself isn't kept in scope for the bench filter. Add, near the top of `renderPlanSubsScreen`:

```js
  const plan = getActivePlan();
  const gamePlayerIds = new Set(plan && Array.isArray(plan.playerIds) ? plan.playerIds : []);
```

Then change the bench line from:

```js
  const bench = state.roster.filter(p => !onFieldIds.has(p.id) && !pendingInIds.has(p.id));
```

to:

```js
  const bench = state.roster.filter(p => gamePlayerIds.has(p.id) && !onFieldIds.has(p.id) && !pendingInIds.has(p.id));
```

- [ ] **Step 13: Run the test to verify it passes**

Run: `npm.cmd test -- -g "bench list only shows players checked in"`
Expected: PASS

- [ ] **Step 14: Run the full suite**

Run: `npm.cmd test`
Expected: all tests pass (42 existing + 3 new = 45)

- [ ] **Step 15: Commit**

```bash
git add js/plan-subs.js tests/app-smoke.spec.js
git commit -m "fix: Plan Subs stale label, round-removal double-booking, bench scoping"
```

---

### Task 2: a cancelled/no-show planned round can be reloaded instead of permanently skipped

**Files:**
- Modify: `js/state.js`
- Modify: `js/game.js` (`loadNextPlannedSubRound`, `executeAllPlans`, the `startSecondHalf` reset site)
- Modify: `js/lineup.js` (`initGame` reset site)
- Modify: `js/persistence.js` (`saveActiveGame`, `checkForActiveGame`)
- Test: `tests/app-smoke.spec.js`

**Interfaces:**
- Consumes: `state.plannedSubRoundIndex` (existing), `state.subPlans` (existing), `addSubPair`/`executeAllPlans`/`renderGame`/`saveActiveGame` (existing, unchanged signatures).
- Produces: new state field `state.pendingPlannedRoundIndex` (`number | null`) — the round index that was loaded into the tray but not yet confirmed by Sub Now. `null` means no planned round is currently pending.

- [ ] **Step 1: Write the failing test**

Add to `tests/app-smoke.spec.js`, after the existing "Planned Subs button loads the next planned round..." test:

```js
test('clearing a loaded planned round without executing it lets it be reloaded', async ({ page }) => {
  await startLiveGame(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.gamePlan = {
      gameNumber: 1,
      half1: { GK: 1, CF: 2, LM: 3 },
      half1Subs: [[{ inId: 4, pos: 'CF' }]],
    };
    const { renderGame } = await import('/js/game.js');
    renderGame();
  });

  await page.locator('#load-planned-sub-btn').click();
  let plans = await page.evaluate(async () => (await import('/js/state.js')).state.subPlans);
  expect(plans).toEqual([{ inId: 4, pos: 'CF' }]);

  // Coach changes their mind and removes the pair instead of hitting Sub Now.
  await page.evaluate(async () => {
    const { removeSubPair, renderGame } = await import('/js/game.js');
    removeSubPair('CF');
    renderGame();
  });
  plans = await page.evaluate(async () => (await import('/js/state.js')).state.subPlans);
  expect(plans).toEqual([]);

  // The round was never executed, so it must still be loadable.
  await expect(page.locator('#load-planned-sub-btn')).toBeVisible();
  await page.locator('#load-planned-sub-btn').click();
  plans = await page.evaluate(async () => (await import('/js/state.js')).state.subPlans);
  expect(plans).toEqual([{ inId: 4, pos: 'CF' }]);
});

test('executing a loaded planned round advances the pointer so it cannot be reloaded', async ({ page }) => {
  await startLiveGame(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.gamePlan = {
      gameNumber: 1,
      half1: { GK: 1, CF: 2, LM: 3 },
      half1Subs: [[{ inId: 4, pos: 'CF' }]],
    };
    const { renderGame } = await import('/js/game.js');
    renderGame();
  });

  await page.locator('#load-planned-sub-btn').click();
  await page.evaluate(async () => {
    const { executeAllPlans, renderGame } = await import('/js/game.js');
    executeAllPlans();
    renderGame();
  });

  await expect(page.locator('#load-planned-sub-btn')).toBeHidden();
  const onField = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    return state.players.find(p => p.position === 'CF')?.id;
  });
  expect(onField).toBe(4);
});
```

- [ ] **Step 2: Write the failing test for surviving an app reload mid-game**

Add to `tests/app-smoke.spec.js`, directly after the two tests from Step 1:

```js
test('a pending planned round survives saveActiveGame/checkForActiveGame round-trip', async ({ page }) => {
  await startLiveGame(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.gamePlan = {
      gameNumber: 1,
      half1: { GK: 1, CF: 2, LM: 3 },
      half1Subs: [[{ inId: 4, pos: 'CF' }]],
    };
    const { renderGame } = await import('/js/game.js');
    renderGame();
  });
  await page.locator('#load-planned-sub-btn').click();

  const roundTripped = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { saveActiveGame } = await import('/js/persistence.js');
    saveActiveGame();
    const before = state.pendingPlannedRoundIndex;
    state.pendingPlannedRoundIndex = null; // simulate a fresh load before restore runs
    const raw = JSON.parse(localStorage.getItem('soccerActiveGame'));
    return { savedValue: raw.pendingPlannedRoundIndex, before };
  });
  expect(roundTripped.before).toBe(0);
  expect(roundTripped.savedValue).toBe(0);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm.cmd test -- -g "loaded planned round|pending planned round survives"`
Expected: the first two FAIL (as described above); the third FAILS because `saveActiveGame()` doesn't yet serialize `pendingPlannedRoundIndex`, so `raw.pendingPlannedRoundIndex` is `undefined`.

- [ ] **Step 4: Add the new state field to `js/state.js`**

Add `pendingPlannedRoundIndex: null,` to the `state` object literal, alongside `plannedSubRoundIndex: 0`.

- [ ] **Step 5: Change `loadNextPlannedSubRound()` in `js/game.js` (currently lines 507-518)**

Replace:

```js
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

with:

```js
export function loadNextPlannedSubRound() {
  const rounds = plannedRoundsForCurrentHalf();
  const round = rounds[state.plannedSubRoundIndex];
  if (!round) return;
  state.pendingPlannedRoundIndex = state.plannedSubRoundIndex;
  round.forEach(({ inId, pos }) => {
    const inn = state.players.find(p => p.id === inId);
    if (inn && !inn.onField && !inn.leftEarly) addSubPair(inId, pos);
  });
  renderGame();
  saveActiveGame();
}
```

(The pointer no longer advances here — only `executeAllPlans` advances it now, in Step 6.)

- [ ] **Step 6: Change `executeAllPlans()` in `js/game.js` (currently starting at line 580)**

After the existing `state.subPlans = []; state.subPick = null;` lines near the end of the function (right before `renderGame(); saveActiveGame();`), add:

```js
  if (state.pendingPlannedRoundIndex !== null) {
    state.plannedSubRoundIndex = Math.max(state.plannedSubRoundIndex, state.pendingPlannedRoundIndex + 1);
    state.pendingPlannedRoundIndex = null;
  }
```

- [ ] **Step 7: Reset the new field alongside `plannedSubRoundIndex` at both half-boundary reset sites**

In `js/lineup.js`'s `initGame()` (line 928), add `state.pendingPlannedRoundIndex = null;` directly after `state.plannedSubRoundIndex = 0;`.

In `js/game.js`'s `startSecondHalf()` (line 882), add `state.pendingPlannedRoundIndex = null;` directly after `state.plannedSubRoundIndex = 0;`.

- [ ] **Step 8: Persist the new field in `js/persistence.js`**

In `saveActiveGame()` (near line 143), add `pendingPlannedRoundIndex: state.pendingPlannedRoundIndex,` alongside `plannedSubRoundIndex: state.plannedSubRoundIndex,`.

In `checkForActiveGame()` (near line 182), add:

```js
  state.pendingPlannedRoundIndex = Number.isInteger(saved.pendingPlannedRoundIndex) ? saved.pendingPlannedRoundIndex : null;
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npm.cmd test -- -g "loaded planned round|pending planned round survives"`
Expected: all three PASS

- [ ] **Step 10: Run the full suite**

Run: `npm.cmd test`
Expected: all tests pass (45 from Task 1 + 3 new = 48)

- [ ] **Step 11: Commit**

```bash
git add js/state.js js/game.js js/lineup.js js/persistence.js tests/app-smoke.spec.js
git commit -m "fix: let a cancelled planned sub round be reloaded instead of permanently skipped"
```

---

## Self-Review

**Spec coverage:** all four findings from the prior final review have an owning task and step: stale label → Task 1 Steps 1-4; round-removal double-booking → Task 1 Steps 5-9; bench scoping → Task 1 Steps 10-13; cancelled-round reload → Task 2 (all steps).

**Step scan:** each code step gives the exact function, file, and either a full before/after body (short, logic-determined) or a precise one-line insertion point; test steps carry full assertions; verification steps carry exact `npm.cmd test -g` filters.

**Type consistency:** `pendingPlannedRoundIndex` is `number | null` throughout Task 2 — declared `null` in `state.js`, set to a number in `loadNextPlannedSubRound`, read/cleared in `executeAllPlans`, reset to `null` at both half boundaries, and round-tripped as `null`/integer in `persistence.js` using the same `Number.isInteger(...) ?? fallback` idiom `plannedSubRoundIndex` already uses one line above it.

**Review Focus coverage:** both label-reset paths → Task 1 Step 1's test exercises re-open-after-full-run AND back-from-half-2 in one test. Round-removal regression safety → Task 1 Step 9 re-runs the prior plan's single-round projection test after the `effectiveLineupAt` change. Bench scoping not hiding legitimate players → Task 1 Step 10's test asserts Blake (checked in, not yet subbed) IS visible, not just that Casey (not checked in) is absent. Pending-index correctness (no skip, no double-execute) → Task 2 Step 1's two tests. Reload-survival → Task 2 Step 2's dedicated round-trip test (added during self-review; originally missing).

**Proportion:** two tasks, eleven total code-change/verification steps across five files, each a few lines; test code is the majority of the diff, which is expected and appropriate for bug-fix verification at this scope.
