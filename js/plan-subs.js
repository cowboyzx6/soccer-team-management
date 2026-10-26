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
