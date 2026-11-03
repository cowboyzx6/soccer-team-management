# Repository Hardening Design

## Intent

Fix the four defects found in the November 3 repository review, complete the related improvement work, and leave each change independently reviewable and releasable. Every behavioral fix ships with a regression test in the same commit.

## Goals

- Never return a player marked `leftEarly` to the field at halftime.
- Make **Clear All Data** reset persistent storage, runtime state, and visible controls in the current session.
- Render each logical player once in the season summary when historical and current roster IDs differ.
- Use the user's local calendar date for default game dates.
- Validate roster and game-history values read from `localStorage` before application code consumes them.
- Reject case-insensitive duplicate names during manual add and rename operations.
- Document and script the one-time Playwright Chromium installation needed before running smoke tests.

## Behavioral Decisions

- If the selected second-half goalkeeper has left, use the other eligible preselected goalkeeper. If neither is eligible, start the half with no assigned goalkeeper rather than reviving a removed player.
- Clearing all data returns runtime state to the defaults in `js/state.js`, including game, plan, timer, score, and minimum-play fields. The current theme also returns to the default dark theme because the stored theme is removed.
- Historical player IDs may alias a current roster player only when the names match. Aliases must share one accumulator and produce one season-summary row.
- Duplicate roster names are compared after trimming and case folding. Renaming a player without changing their effective name remains allowed.
- Malformed or wrong-shaped stored roster/history values are discarded safely; valid entries are normalized with the existing profile normalizer.

## Constraints

- Keep the browser-only ES-module architecture and existing `localStorage` keys.
- Add no runtime dependencies and no build step.
- Keep game-day touch workflows and existing import/export formats stable.
- Use the existing Playwright smoke suite and test server.
- Keep each concern in a separate commit with its regression test.

## Non-goals

- Redesigning the UI or season-summary presentation.
- Introducing a general migration framework or schema-version system.
- Changing how CSV duplicate names are handled.
- Automatically downloading Playwright browsers during every `npm test` run.

## Commit Sequence

1. Add an explicit Playwright Chromium setup command and documentation.
2. Centralize local-date formatting and replace UTC-derived defaults.
3. Prevent removed goalkeepers from returning at halftime.
4. Fully reset runtime state when clearing all data.
5. Deduplicate aliased players in season summaries.
6. Normalize roster and history values loaded from local storage.
7. Reject duplicate names during manual roster add and rename.
