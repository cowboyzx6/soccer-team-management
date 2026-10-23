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
