# Sub Tray — Unified Substitution Flow

Date: 2026-09-24
Status: Draft for review

## Problem

Live-game substitutions are hard to use on the sideline:

- **Tap order changes the outcome.** Bench → field queues a planned sub (needs Sub Now); field → bench subs immediately; empty slot → bench places immediately. Nothing on screen explains the rule.
- **Hidden toggles.** Tapping a planned bench card or a dashed field slot silently cancels its plan; field taps are ignored while a bench player is selected.
- **No undo.** A mis-tap on an immediate sub needs a manual fix-up sequence.
- **Small targets.** The ↓ bench strip is tiny and only appears after selecting a field player.

The coach does a mix of batched subs at stoppages and one-off subs (injury, tired player).

## Goals

- One rule for making subs, in either tap order.
- Nothing on the field changes until the coach presses **Sub Now**.
- Each pending pair can be removed individually.
- The last executed sub can be undone.

## Non-goals

- Auto-suggested subs.
- Dragging bench cards onto the field.
- Changes to lineup screen, halftime editor, or position-swap drag on the field.

## Interaction design

### Picking and pairing

- Tapping any bench player or field slot (filled or empty) makes it the **current pick** (highlighted).
- Tapping the same item again clears the pick.
- Tapping another item in the **same zone** moves the pick to it.
- Tapping an item in the **other zone** creates a pair `{ inId, pos }` and clears the pick.
  - Bench player + filled slot: "Sam → LM ⇄ Alex out".
  - Bench player + empty slot: "Sam → LM (empty)". (Previously immediate; now goes through the tray.)
- Uniqueness: one pair per bench player, one pair per position. A new pair that conflicts with an existing pair replaces it.
- Tapping a player/slot that's already paired simply picks it (it does **not** cancel the pair). Pairing it again replaces the old pair; removing a pair uses the tray's ✕.

### Visual markers

- Picked item: existing `selected` / `planning-active` style.
- While something is picked, valid targets in the other zone get the existing target glow (`slot-target`, `slot-sel-empty`, and an equivalent bench-card highlight).
- Paired field slot: dashed orange border + "↑ Sam" (existing `planned-out` / `pos-incoming`).
- Paired bench card: sublabel "→ LM" (existing `has-plan`).

### The tray

- Replaces `#sub-now-wrap` in the same location (top of the bench panel, above the grid) so it stays visible on phones without scrolling. Hidden when there are no pairs.
- One row per pair: `Sam → LM ⇄ Alex out   [✕]` (or `→ LM (empty)`). Rows and ✕ are at least 44px tall.
- ✕ removes that pair only.
- Full-width **Sub Now (n)** button below the rows executes all pairs.

### Undo

- After Sub Now, an **↶ Undo last sub** button appears in the tray area.
- Also offered after the ↓ "send to bench" action.
- Undo restores every affected player's pre-sub fields (`onField`, `position`, `subInAt`, `totalPlayed`, `benchSince`, position-timing fields) plus `activeGoalieId` / `goalie1Id` / `goalie2Id`. Because original `subInAt` / position-start values are restored, time elapsed since the sub is credited to the players who were on the field before the sub — as if it never happened.
- Undo is cleared by: the next Sub Now or ↓ action, a field position-swap drag, halftime (`handleHalfEnd`), end of game, a late arrival, or removing a player.
- Undo is in memory only (not persisted in `soccerActiveGame`).

### Hint text

`#sub-hint` shows one line:

- No pick: "Tap a bench player and a field spot to pair them" (hidden when bench empty).
- Bench player picked: "Sam picked — tap a field spot".
- Field slot picked: "LM picked — tap a bench player".

### Unchanged

- Dragging a field player to another slot swaps positions immediately.
- ↓ send-to-bench stays immediate (now undoable). Its button becomes easier to hit (taller strip).
- GK: pairing into GK makes the incoming player the active goalie on execute.
- Remove-player (✕ on bench card) and late arrival flows.

## State changes

`js/state.js`:

- Replace `selectedId`, `planningBenchId`, `planningPosition` with `subPick: null | { zone: 'bench', id } | { zone: 'field', pos }`.
  - Field picks store `pos` (not player id) so empty slots and filled slots behave the same.
- Keep `subPlans: [{ inId, pos }]`.
- Add module-level `lastSubUndo` in `js/game.js` (not in `state`, not persisted).

`js/persistence.js`:

- Save `subPlans` as today; stop saving the three old pick fields; do not save `subPick`.
- On load, ignore old `planningBenchId` / `planningPosition` fields if present; drop any `subPlans` entry whose `inId` is on the field or missing.

`js/lineup.js`: reset `subPick` instead of the three old fields.

## Code changes (js/game.js)

- New `pickForSub(zone, key)` replaces the branching in `handleTap` and the per-state `onclick` branches in `renderField`.
- `addSubPair(inId, pos)` replaces `createPlan` (no immediate empty-slot placement).
- `removeSubPair(pos)` replaces `cancelPlanForPos`; wired to tray ✕ via delegated listener in `js/app.js`.
- `executeAllPlans()` captures an undo snapshot before mutating.
- `moveFieldPlayerToBench()` captures an undo snapshot.
- `undoLastSub()` restores the snapshot. After an undone Sub Now, the executed pairs go back into the tray (so a too-early Sub Now can be fixed with one ✕ and re-sent); current pairs that conflict with them are dropped. Calls `renderGame()` and `saveActiveGame()`.
- `makeSub()` is no longer reachable from taps; remove if unused elsewhere.
- `renderGame()` renders the tray rows, Sub Now, Undo, and hint.
- `handleFieldSlotPointerDown` gate changes from `planningBenchId !== null` to `subPick?.zone === 'bench'`.

`index.html`: tray container + undo button in place of `#sub-now-wrap`.
`css/styles.css`: tray row, ✕, undo button, bench-card target highlight, taller ↓ strip.

## Testing

Playwright additions in `tests/app-smoke.spec.js`:

1. Bench → field and field → bench both create the same pair; field is unchanged until Sub Now.
2. Two pairs, ✕ one, Sub Now executes only the remaining pair.
3. Sub Now then Undo restores positions, `onField`, and play time (clock advanced between sub and undo).
4. Bench player + empty slot goes to tray, fills on Sub Now.
5. Re-pairing a bench player to a new position replaces the old pair.

Run `npm.cmd test`; manual check on a phone-width viewport.
