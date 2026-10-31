import { state } from './state.js';

// state.gamePlan is the plan for the NEXT game to be played. Plans for later
// games (e.g. game 2 of a double header) live in state.queuedPlans. The setup
// screen edits whichever game state.planOffset points at (0 = next game).
export const MAX_PLAN_OFFSET = 3;

export const nextGameNumber = () => state.gameHistory.length + 1;
export const targetGameNumber = () => nextGameNumber() + state.planOffset;

export function getActivePlan() {
  if (!state.planOffset) return state.gamePlan;
  const n = targetGameNumber();
  return state.queuedPlans.find(p => p.gameNumber === n) || null;
}

export function setActivePlan(plan) {
  if (!state.planOffset) {
    state.gamePlan = plan;
    return;
  }
  const n = targetGameNumber();
  state.queuedPlans = state.queuedPlans.filter(p => p.gameNumber !== n);
  if (plan) state.queuedPlans.push(plan);
}

export function ensureActivePlan() {
  let plan = getActivePlan();
  if (!plan) {
    plan = { gameNumber: targetGameNumber() };
    setActivePlan(plan);
  }
  return plan;
}

// ---- Quarter planning ----
// The planning flow walks four "quarters": Q1/Q3 are the starting lineups of
// each half (plan.half1 / plan.half2) and Q2/Q4 are the lineups after the one
// planned mid-half sub round. Q2/Q4 are stored as that sub round
// (plan.half1Subs[0] / plan.half2Subs[0]), which is what the live game's
// "Planned Subs" button loads, and are rebuilt from it when editing.
export const QUARTER_LABELS = {
  1: 'Q1 · Start of Half 1',
  2: 'Q2 · Mid Half 1',
  3: 'Q3 · Start of Half 2',
  4: 'Q4 · Mid Half 2',
};

// Older plans have no progress marker and treat each saved half as complete.
export function lastPlannedQuarter(plan) {
  return plan?.plannedThroughQuarter ?? (plan?.half2 ? 4 : plan?.half1 ? 2 : 0);
}

// Applies the first `roundCount` rounds onto a copy of the base position map.
// Skips a pair whose incoming player is already on the field in the map.
export function effectiveLineupAt(baseLineup, rounds, roundCount) {
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

// The sub pairs that turn `prevMap` into `nextMap`: a pair for each position
// now held by a player who was not on the field in `prevMap`. Position swaps
// between players already on the field aren't sub pairs and are not captured.
export function deriveSubRound(prevMap, nextMap) {
  const wasOnField = new Set(Object.values(prevMap || {}));
  return Object.entries(nextMap)
    .filter(([, id]) => !wasOnField.has(id))
    .map(([pos, inId]) => ({ inId, pos }));
}

// The saved lineup for quarter q, or null when its half has no starting lineup.
export function quarterLineup(plan, q) {
  if (!plan) return null;
  const half = q <= 2 ? 1 : 2;
  const base = plan[`half${half}`];
  if (!base) return null;
  if (q % 2) return base;
  return effectiveLineupAt(base, plan[`half${half}Subs`] || [], 1);
}

// Seconds each player is on the field in each half, given the planned
// lineups. `quarters` is a list of { half, lineup } (position -> player id),
// each lasting `quarterSeconds`. Players in `playerIds` who are never on the
// field still appear, with zero.
export function projectedSecondsByHalf(quarters, quarterSeconds, playerIds = []) {
  const totals = {};
  playerIds.forEach(id => { totals[id] = { half1: 0, half2: 0 }; });
  quarters.forEach(({ half, lineup }) => {
    Object.values(lineup).forEach(id => {
      if (!totals[id]) totals[id] = { half1: 0, half2: 0 };
      totals[id][`half${half}`] += quarterSeconds;
    });
  });
  return totals;
}
