import { POSITIONS, POSITION_ORDER, state } from './state.js';
import { buildGameRecord, clearActiveGame, exportProfile, saveActiveGame, saveGameHistory } from './persistence.js';
import { avatarHtml, avatarParts } from './roster.js';
import { showSummary } from './summary.js';
import { closeModal, escHtml, fmt, openModal, showScreen } from './utils.js';
import { createFieldDragPreview, findNearestSlot, moveFieldDragPreview, openHalftimeLineup, removeFieldDragPreview } from './lineup.js';

let intervalId = null;
const HALF_DURATION = () => state.halfMinutes * 60;
export function togglePause() {
  if (state.isRunning) pauseGame(); else resumeGame();
}

export function pauseGame() {
  state.isRunning = false;
  clearInterval(intervalId);
  intervalId = null;
  state.timerBase  = null;
  const btn = document.getElementById('pause-btn');
  btn.textContent  = '\u25B6 RESUME';
  btn.style.background = '#2e7d32';
  updateGoalBtn();
}

export function resumeGame() {
  if (intervalId) clearInterval(intervalId);
  state.isRunning = true;
  state.timerBase = {
    ts: Date.now(),
    halfClock: state.halfClock,
    totalElapsed: state.totalElapsed
  };
  const btn = document.getElementById('pause-btn');
  btn.textContent  = '\u23F8 PAUSE';
  btn.style.background = '#e65100';
  intervalId = setInterval(tick, 1000);
  updateGoalBtn();
}

export function tick() {
  if (!state.timerBase) return;
  const secs        = Math.floor((Date.now() - state.timerBase.ts) / 1000);
  const newHalf     = state.timerBase.halfClock - secs;
  const newElapsed  = state.timerBase.totalElapsed + secs;

  if (newHalf > 0) {
    const prevBucket = Math.floor(state.totalElapsed / 30);
    state.halfClock    = newHalf;
    state.totalElapsed = newElapsed;
    if (Math.floor(state.totalElapsed / 30) !== prevBucket) saveActiveGame();
  } else {
    state.totalElapsed = state.timerBase.totalElapsed + state.timerBase.halfClock;
    state.halfClock    = 0;
    pauseGame();
    state.halfActionIsEnd = state.currentHalf === 2;
    document.getElementById('action-btn').style.background = '#ef5350';
    document.getElementById('pause-btn').style.display = 'none';
  }
  renderClock();
  renderGame();
}

export function renderClock() {
  const m   = Math.floor(state.halfClock / 60).toString().padStart(2, '0');
  const s   = (state.halfClock % 60).toString().padStart(2, '0');
  const el  = document.getElementById('clock');
  el.textContent = `${m}:${s}`;
  el.className   = 'clock-display';
  if (state.halfClock <= 60)       el.classList.add('urgent');
  else if (state.halfClock <= 300) el.classList.add('warn');
}

export function syncGamePhaseUi() {
  const halfPill = document.getElementById('half-pill');
  const actionBtn = document.getElementById('action-btn');
  const pauseBtn = document.getElementById('pause-btn');

  halfPill.textContent = state.currentHalf === 2 ? 'HALF 2' : 'HALF 1';
  actionBtn.textContent = state.currentHalf === 2 ? 'END' : 'HALF';
  actionBtn.style.background = state.halfClock === 0 ? '#ef5350' : '#4527a0';
  pauseBtn.style.display = state.halfClock === 0 ? 'none' : '';
}

// ------------------------------------------------------------
//  GAME RENDER
// ------------------------------------------------------------
export function getPlayedTime(player) {
  if (player.onField && player.subInAt !== null) {
    return player.totalPlayed + (state.totalElapsed - player.subInAt);
  }
  return player.totalPlayed;
}

const GRACE_PERIOD = () => HALF_DURATION() / 3;

export function computeFairShare() {
  if (state.players.length === 0 || state.totalElapsed < GRACE_PERIOD()) return Infinity;
  const active           = state.players.filter(p => !p.leftEarly);
  const nonGoaliePlayers = active.filter(p => p.id !== state.activeGoalieId);
  if (!nonGoaliePlayers.length) return Infinity;
  const playedTime = nonGoaliePlayers.reduce((sum, p) => sum + getPlayedTime(p), 0);
  return playedTime / nonGoaliePlayers.length;
}

export function getStatus(player, fairShare) {
  if (player.id === state.activeGoalieId) return 's-goalie';
  if (fairShare === Infinity) return 's-green';
  const played = getPlayedTime(player);
  if (played < fairShare * 0.75) return 's-red';
  if (played > fairShare * 1.25) return 's-yellow';
  return 's-green';
}

// Returns true when a bench player cannot accumulate enough play time to meet the minimum floor.
// Does not fire during halftime (clock stopped at end of H1) so the coach isn't alarmed mid-break.
function isMinPlayAtRisk(player) {
  if (!state.minPlayMinutes || player.onField) return false;
  if (!state.isRunning && state.currentHalf === 1) return false; // halftime break
  const remainingSecs = (state.halfMinutes * 60 * 2) - state.totalElapsed;
  const neededSecs = (state.minPlayMinutes * 60) - getPlayedTime(player);
  return neededSecs > remainingSecs;
}


export function commitPositionTime(player) {
  if (player.position && player.positionStart !== null) {
    const secs = state.totalElapsed - player.positionStart;
    if (secs > 0) {
      player.positionTime[player.position] = (player.positionTime[player.position] || 0) + secs;
    }
  }
  player.positionStart = null;
}

export function startPositionTimer(player) {
  player.positionStart = player.position ? state.totalElapsed : null;
}

export function setBenchSort(mode) {
  state.benchSort = mode;
  document.getElementById('sort-name-btn').classList.toggle('active', mode === 'name');
  document.getElementById('sort-time-btn').classList.toggle('active', mode === 'time');
  document.getElementById('sort-priority-btn').classList.toggle('active', mode === 'priority');
  renderGame();
}

export function renderGame() {
  const fairShare = computeFairShare();
  const STATUS_PRI = { 's-red': 0, 's-green': 1, 's-yellow': 2, 's-goalie': 3 };
  const bench = state.players.filter(p => !p.onField && !p.leftEarly).sort((a, b) => {
    if (state.benchSort === 'time') {
      const ta = getPlayedTime(b) - getPlayedTime(a);
      return ta !== 0 ? ta : a.name.localeCompare(b.name);
    }
    if (state.benchSort === 'priority') {
      const pa = STATUS_PRI[getStatus(a, fairShare)] ?? 1;
      const pb = STATUS_PRI[getStatus(b, fairShare)] ?? 1;
      if (pa !== pb) return pa - pb;
      const ta = getPlayedTime(a);
      const tb = getPlayedTime(b);
      return ta !== tb ? ta - tb : a.name.localeCompare(b.name);
    }
    return a.name.localeCompare(b.name);
  });

  document.getElementById('field-count').textContent = `(${state.players.filter(p => p.onField).length})`;
  document.getElementById('bench-count').textContent = bench.length ? `(${bench.length})` : '';

  renderField(fairShare);
  renderGrid('bench-grid', bench, 'bench', fairShare);

  // Sub Now button
  const subNowWrap = document.getElementById('sub-now-wrap');
  const subNowBtn  = document.getElementById('sub-now-btn');
  subNowWrap.style.display = state.subPlans.length > 0 ? 'block' : 'none';
  subNowBtn.textContent = `Sub Now (${state.subPlans.length})`;

  // Hint text
  const hint   = document.getElementById('sub-hint');
  const status = document.getElementById('sub-status');
  const pick   = state.subPick;
  if (pick?.zone === 'bench') {
    const p = state.players.find(pl => pl.id === pick.id);
    hint.textContent   = p ? `${p.name} picked \u2014 tap a field spot` : '';
    hint.className     = 'sub-hint active';
    status.textContent = '\u2193 tap a field spot';
  } else if (pick?.zone === 'field') {
    hint.textContent   = `${pick.pos} picked \u2014 tap a bench player`;
    hint.className     = 'sub-hint active';
    status.textContent = '\u2192 tap a bench player';
  } else {
    hint.textContent   = bench.length ? 'Tap a bench player and a field spot to pair them' : '';
    hint.className     = 'sub-hint';
    status.textContent = '';
  }

  updateGoalBtn();
}

let fieldPointerDrag = null;
let suppressFieldClickUntil = 0;

export function handleFieldSlotPointerDown(e) {
  if (e.button !== undefined && e.button !== 0) return;
  if (e.target.closest('.pos-bench-btn')) return;

  const slot = e.target.closest('.pos-slot');
  if (!slot || !slot.dataset.playerId || state.subPick?.zone === 'bench') return;
  const player = state.players.find(p => p.id === parseInt(slot.dataset.playerId, 10));
  if (!player) return;

  fieldPointerDrag = {
    playerId: player.id,
    sourceSlot: slot,
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    dragging: false,
    overSlot: null,
    preview: null
  };
  slot.setPointerCapture?.(e.pointerId);
}

export function handleFieldSlotPointerMove(e) {
  if (!fieldPointerDrag) return;
  if (e.pointerId !== undefined && e.pointerId !== fieldPointerDrag.pointerId) return;

  const dx = Math.abs(e.clientX - fieldPointerDrag.startX);
  const dy = Math.abs(e.clientY - fieldPointerDrag.startY);
  if (!fieldPointerDrag.dragging && Math.max(dx, dy) < 8) return;

  e.preventDefault();
  fieldPointerDrag.dragging = true;
  fieldPointerDrag.sourceSlot.classList.add('dragging');
  if (!fieldPointerDrag.preview) {
    const player = state.players.find(p => p.id === fieldPointerDrag.playerId);
    if (player) fieldPointerDrag.preview = createFieldDragPreview(player, player.position);
  }
  moveFieldDragPreview(fieldPointerDrag.preview, e.clientX, e.clientY);

  const overSlot = findNearestSlot(e.clientX, e.clientY, '#field-positions');
  if (fieldPointerDrag.overSlot && fieldPointerDrag.overSlot !== overSlot) {
    fieldPointerDrag.overSlot.classList.remove('drag-over');
  }

  fieldPointerDrag.overSlot = overSlot || null;
  if (fieldPointerDrag.overSlot) fieldPointerDrag.overSlot.classList.add('drag-over');
}

export function handleFieldSlotPointerUp(e) {
  if (!fieldPointerDrag) return;
  if (e.pointerId !== undefined && e.pointerId !== fieldPointerDrag.pointerId) return;

  const drag = fieldPointerDrag;
  fieldPointerDrag = null;

  drag.sourceSlot.classList.remove('dragging');
  drag.sourceSlot.releasePointerCapture?.(drag.pointerId);
  if (drag.overSlot) drag.overSlot.classList.remove('drag-over');
  removeFieldDragPreview(drag.preview);

  if (!drag.dragging) return;
  e.preventDefault();
  suppressFieldClickUntil = Date.now() + 350;

  if (drag.overSlot) {
    moveFieldPlayerToPosition(drag.playerId, drag.overSlot.dataset.position);
  }
}

export function renderField(fairShare) {
  const container     = document.getElementById('field-positions');
  container.innerHTML = '';

  // Render position slots
  POSITION_ORDER.forEach(pos => {
    const coords = POSITIONS[pos];
    const player = state.players.find(p => p.onField && p.position === pos);
    const status = player ? getStatus(player, fairShare) : '';
    const pick        = state.subPick;
    const isPicked    = pick?.zone === 'field' && pick.pos === pos;
    const benchPicked = pick?.zone === 'bench';

    const slot = document.createElement('div');
    slot.style.left = coords.x + '%';
    slot.style.top  = coords.y + '%';
    slot.dataset.position = pos;

    // Planned incoming player for this position
    const plan           = state.subPlans.find(pl => pl.pos === pos);
    const incomingPlayer = plan ? state.players.find(p => p.id === plan.inId) : null;
    const incomingHtml   = incomingPlayer
      ? `<div class="pos-incoming">&#8593; ${escHtml(incomingPlayer.name)}</div>`
      : '';
    const planClass      = plan ? ' planned-out' : '';

    slot.onclick = e => {
      if (e.target.closest('.pos-bench-btn')) return;
      pickForSub('field', pos);
    };

    if (player) {
      slot.className = `pos-slot slot-filled ${status}${isPicked ? ' selected' : ''}${planClass}${benchPicked ? ' slot-target' : ''}`;
      slot.dataset.playerId = String(player.id);

      const [avatarBg, avatarContent] = avatarParts(player.id, player.name);
      slot.innerHTML = `
        <div class="pos-label">${pos}</div>
        <div class="pos-avatar" style="${avatarBg}">${avatarContent}</div>
        <div class="pos-name">${escHtml(player.name)}</div>
        <div class="pos-time">${fmt(getPlayedTime(player))}</div>
        ${incomingHtml}
        <button class="pos-bench-btn" title="Move to bench">\u2193 bench</button>
      `;
    } else {
      const emptyClass = (isPicked || benchPicked) ? ' slot-sel-empty' : '';
      slot.className = 'pos-slot slot-empty' + emptyClass + planClass;
      slot.innerHTML = `
        <div class="pos-label">${pos}</div>
        <div class="pos-empty-label">empty</div>
        ${incomingHtml}
      `;
    }

    container.appendChild(slot);
  });

}

export function renderGrid(gridId, list, zone, fairShare) {
  const grid = document.getElementById(gridId);
  grid.innerHTML = '';
  list.forEach(player => {
    const status   = getStatus(player, fairShare);
    const time     = getPlayedTime(player);
    const pick      = state.subPick;
    const isPicked  = pick?.zone === 'bench' && pick.id === player.id;
    const isTarget  = pick?.zone === 'field';

    const plan      = state.subPlans.find(pl => pl.inId === player.id);
    const planClass = isPicked ? ' planning-active' : (plan ? ' has-plan' : '');

    let sublabel = '';
    if (plan) {
      const outPlayer = state.players.find(p => p.onField && p.position === plan.pos);
      sublabel = `\u2192 ${escHtml(plan.pos)}${outPlayer ? ` \u00B7 ${escHtml(outPlayer.name)} out` : ''}`;
    } else if (isPicked) {
      sublabel = 'tap a field spot...';
    }

    const atRisk = isMinPlayAtRisk(player);
    const card = document.createElement('div');
    card.className = `player-card ${status}${planClass}${isTarget ? ' sub-target' : ''}${atRisk ? ' at-risk' : ''}`;
    card.dataset.playerId = String(player.id);
    card.onclick = e => {
      if (e.target.closest('.btn-remove-player')) return;
      pickForSub(zone, player.id);
    };
    const [avatarBg, avatarContent] = avatarParts(player.id, player.name);
    const benchStreakHtml = player.benchSince != null
      ? `<div class="bench-streak">${atRisk ? '&#9888; ' : ''}&#9203; ${fmt(state.totalElapsed - player.benchSince)}</div>`
      : '';
    card.innerHTML = `
      <div class="p-avatar" style="${avatarBg}">${avatarContent}</div>
      <div class="p-info">
        <div class="p-name">${escHtml(player.name)}</div>
        <div class="p-time">${fmt(time)}</div>
        ${benchStreakHtml}
        <div class="p-sublabel">${sublabel}</div>
      </div>
      <button class="btn-remove-player" title="Remove from game">&#10005;</button>
    `;

    grid.appendChild(card);
  });
}

// ------------------------------------------------------------
//  REMOVE PLAYER FROM GAME
// ------------------------------------------------------------
let removePlayerId = null;

export function promptRemovePlayer(id) {
  const player = state.players.find(p => p.id === id);
  if (!player) return;
  removePlayerId = id;
  document.getElementById('remove-player-body').textContent =
    `Remove ${player.name} from today's game? Their bench time will no longer affect the sub schedule.`;
  openModal('remove-player-modal');
}

export function confirmRemovePlayer() {
  const p = state.players.find(p => p.id === removePlayerId);
  const removedPos = p && p.onField ? p.position : null;
  if (p) {
    if (p.onField) {
      commitPositionTime(p);
      if (p.subInAt !== null) {
        p.totalPlayed += state.totalElapsed - p.subInAt;
        p.subInAt = null;
      }
      p.onField    = false;
      p.position   = null;
      p.benchSince = state.totalElapsed;
    }
    p.leftEarly = true;
  }
  state.subPlans = state.subPlans.filter(
    pl => pl.inId !== removePlayerId && (!removedPos || pl.pos !== removedPos)
  );
  if (state.activeGoalieId === removePlayerId) state.activeGoalieId = null;
  state.subPick = null;
  removePlayerId = null;
  closeRemovePlayerModal();
  renderGame();
  saveActiveGame();
}

export function closeRemovePlayerModal() {
  closeModal('remove-player-modal');
}

// ------------------------------------------------------------
//  SUBSTITUTION
// ------------------------------------------------------------
// One rule for both tap orders: pick one side, then tap the other side to pair.
export function pickForSub(zone, key) {
  const pick = state.subPick;
  if (!pick || pick.zone === zone) {
    const same = pick && (zone === 'bench' ? pick.id === key : pick.pos === key);
    state.subPick = same ? null : (zone === 'bench' ? { zone, id: key } : { zone, pos: key });
    renderGame();
    return;
  }
  const inId = zone === 'bench' ? key : pick.id;
  const pos  = zone === 'field' ? key : pick.pos;
  state.subPick = null;
  addSubPair(inId, pos);
}

// Queue a pair for Sub Now. One pair per bench player and per position; conflicts are replaced.
export function addSubPair(inId, pos) {
  const inn = state.players.find(p => p.id === inId);
  if (inn && !inn.onField && !inn.leftEarly && Object.prototype.hasOwnProperty.call(POSITIONS, pos)) {
    state.subPlans = state.subPlans.filter(pl => pl.inId !== inId && pl.pos !== pos);
    state.subPlans.push({ inId, pos });
  }
  renderGame();
  saveActiveGame();
}

export function removeSubPair(pos) {
  state.subPlans = state.subPlans.filter(pl => pl.pos !== pos);
  renderGame();
  saveActiveGame();
}

// Execute all planned subs at once
export function executeAllPlans() {
  state.subPlans.forEach(({ inId, pos }) => {
    const inn = state.players.find(p => p.id === inId);
    const out = state.players.find(p => p.onField && p.position === pos);
    if (!inn || inn.onField) return; // skip if incoming is already on field

    if (out) {
      commitPositionTime(out);
      if (out.subInAt !== null) {
        out.totalPlayed += state.totalElapsed - out.subInAt;
      }
      out.onField    = false;
      out.subInAt    = null;
      out.position   = null;
      out.benchSince = state.totalElapsed;
    }

    inn.onField    = true;
    inn.subInAt    = state.totalElapsed;
    inn.position   = pos;
    inn.benchSince = null;
    startPositionTimer(inn);
    if (pos === 'GK') setActiveGoalie(inId);
  });
  state.subPlans = [];
  state.subPick  = null;
  renderGame();
  saveActiveGame();
}

export function moveFieldPlayerToBench(id) {
  const player = state.players.find(p => p.id === id);
  if (!player || !player.onField) return;
  const vacatedPos = player.position;
  commitPositionTime(player);
  if (player.subInAt !== null) {
    player.totalPlayed += state.totalElapsed - player.subInAt;
  }
  player.onField    = false;
  player.subInAt    = null;
  player.position   = null;
  player.benchSince = state.totalElapsed;
  state.subPlans = state.subPlans.filter(pl => pl.inId !== id && pl.pos !== vacatedPos);
  state.subPick = null;
  if (state.activeGoalieId === id) state.activeGoalieId = null;
  renderGame();
  saveActiveGame();
}

export function moveFieldPlayerToPosition(fromId, targetPos) {
  const from = state.players.find(p => p.id === fromId);
  if (!from || !from.onField || !targetPos || from.position === targetPos) return;

  const fromPos = from.position;
  const target = state.players.find(p => p.onField && p.position === targetPos);

  commitPositionTime(from);
  if (target) commitPositionTime(target);

  from.position = targetPos;
  startPositionTimer(from);

  if (target) {
    target.position = fromPos;
    startPositionTimer(target);
  }

  if (targetPos === 'GK') {
    setActiveGoalie(from.id);
  } else if (fromPos === 'GK') {
    if (target) setActiveGoalie(target.id);
    else state.activeGoalieId = null;
  }

  const affectedPositions = new Set([fromPos, targetPos].filter(Boolean));
  state.subPlans = state.subPlans.filter(pl => !affectedPositions.has(pl.pos));

  state.subPick = null;
  saveActiveGame();
  renderGame();
}

export function setActiveGoalie(id) {
  state.activeGoalieId = id;
  if (state.currentHalf === 1) state.goalie1Id = id;
  else state.goalie2Id = id;
}

// ------------------------------------------------------------
//  LATE ARRIVAL
// ------------------------------------------------------------
export function openLateModal() {
  const inGameIds = new Set(state.players.map(p => p.id));
  const available = state.roster.filter(p => !inGameIds.has(p.id));

  const list = document.getElementById('late-player-list');
  list.innerHTML = '';
  if (available.length === 0) {
    list.innerHTML = '<p style="color:#607d8b;text-align:center;margin:0;">Everyone on the roster is already in the game.</p>';
  } else {
    available.forEach(p => {
      const div = document.createElement('div');
      div.className = 'lineup-player';
      div.style.marginBottom = '6px';
      div.innerHTML = `${avatarHtml(p.id, p.name, 30)} ${escHtml(p.name)}
        <span style="font-size:0.8rem;color:var(--text-muted);">\u2192 bench</span>`;
      div.addEventListener('click', () => confirmLateArrival(p.id));
      list.appendChild(div);
    });
  }

  openModal('late-modal');
}

export function closeLateModal() {
  closeModal('late-modal');
}

export function confirmLateArrival(rosterId) {
  const rosterPlayer = state.roster.find(p => p.id === rosterId);
  if (!rosterPlayer) return;
  if (state.players.find(p => p.id === rosterId)) { closeLateModal(); return; }
  state.players.push({
    id:            rosterPlayer.id,
    name:          rosterPlayer.name,
    onField:       false,
    totalPlayed:   0,
    subInAt:       null,
    h1Snapshot:    state.currentHalf === 2 ? 0 : null,
    position:      null,
    positionTime:  {},
    positionStart: null,
    benchSince:    state.totalElapsed,
  });
  closeLateModal();
  renderGame();
  saveActiveGame();
}

// ------------------------------------------------------------
//  HALF TIME / END GAME
// ------------------------------------------------------------
export function handleHalfEnd() {
  pauseGame();

  const title     = document.getElementById('half-modal-title');
  const body      = document.getElementById('half-modal-body');
  const confirmBtn = document.getElementById('half-confirm-btn');

  if (state.currentHalf === 1) {
    title.textContent = 'Half Time';
    const sorted  = [...state.players].sort((a, b) => getPlayedTime(b) - getPlayedTime(a));
    const maxTime = sorted.length ? getPlayedTime(sorted[0]) : 1;
    const rows = sorted.map(p => {
      const t   = getPlayedTime(p);
      const pct = maxTime > 0 ? Math.round((t / maxTime) * 100) : 0;
      const [avatarBg, avatarContent] = avatarParts(p.id, p.name);
      return `<tr>
        <td style="padding:5px 6px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:26px;height:26px;border-radius:50%;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;color:#fff;${avatarBg}">${avatarContent}</div>
            <span style="font-size:0.85rem;font-weight:600;color:var(--text-card-name);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px;">${escHtml(p.name)}</span>
          </div>
        </td>
        <td style="padding:5px 6px;text-align:right;white-space:nowrap;font-size:0.85rem;color:var(--text-card-time);font-variant-numeric:tabular-nums;">${fmt(t)}</td>
        <td style="padding:5px 6px;width:70px;">
          <div class="time-bar"><div class="time-bar-fill" style="width:${pct}%;"></div></div>
        </td>
      </tr>`;
    }).join('');
    body.innerHTML = `<div style="max-height:220px;overflow-y:auto;border-radius:8px;border:1px solid var(--border);"><table style="width:100%;border-collapse:collapse;">${rows}</table></div>`;
    confirmBtn.textContent        = 'Start 2nd Half \u2192';
    confirmBtn.className          = 'btn btn-green';
    state.halfActionIsEnd               = false;
    document.getElementById('half-end-early-btn').style.display = 'block';

    const usePlanBtn = document.getElementById('half-use-plan-btn');
    if (usePlanBtn) {
      const hasHalf2Plan = !!(state.gamePlan && state.gamePlan.half2);
      usePlanBtn.style.display = hasHalf2Plan ? 'block' : 'none';
    }
    document.getElementById('half-edit-lineup-btn').style.display = 'block';
  } else {
    title.textContent = 'End Game?';
    body.innerHTML    = '<p style="color:var(--text-modal-p);font-size:0.92rem;line-height:1.5;margin:0;">This will stop all timers and show the final summary.</p>';
    confirmBtn.textContent = 'End Game';
    confirmBtn.className   = 'btn btn-red';
    state.halfActionIsEnd        = true;
    document.getElementById('half-end-early-btn').style.display = 'none';
    const usePlanBtn = document.getElementById('half-use-plan-btn');
    if (usePlanBtn) usePlanBtn.style.display = 'none';
    document.getElementById('half-edit-lineup-btn').style.display = 'none';
  }

  openModal('half-modal');
}

export function confirmHalfAction() {
  if (state.halfActionIsEnd) {
    endGame();
  } else {
    startSecondHalf(false);
  }
}

// Applies the pre-planned Half 2 lineup instead of the normal goalie-continuity
// behavior. Only reachable from the halftime modal when a Half 2 plan exists.
export function useHalf2Plan() {
  startSecondHalf(true);
}

export function closeHalfModal() {
  closeModal('half-modal');
}

// Halftime lineup editor: the modal hands off to the lineup screen, which
// either comes back here (cancel) or starts the 2nd half with its lineup.
export function editHalf2Lineup() {
  closeModal('half-modal');
  openHalftimeLineup();
}

export function returnToHalftime() {
  showScreen('game-screen');
  openModal('half-modal');
}

export function startSecondHalfWithLineup(lineup) {
  state.gamePlan = state.gamePlan || {};
  state.gamePlan.half2 = lineup;
  showScreen('game-screen');
  startSecondHalf(true);
}

export function startSecondHalf(usePlannedLineup = false) {
  closeModal('half-modal');

  // Commit all 1st half position times before any position changes
  state.players.filter(p => p.onField).forEach(p => commitPositionTime(p));

  state.players.forEach(p => {
    if (p.onField && p.subInAt !== null) {
      p.totalPlayed += state.totalElapsed - p.subInAt;
    }
    p.h1Snapshot    = p.totalPlayed;
    const wasOnField = p.onField;
    p.onField       = false;
    p.subInAt       = null;
    p.position      = null;
    p.positionStart = null;
    // Only reset streak for players coming off the field; bench players keep their running streak
    if (wasOnField) p.benchSince = state.totalElapsed;
  });

  const half2Plan = usePlannedLineup && state.gamePlan ? state.gamePlan.half2 : null;

  if (half2Plan) {
    // Full pre-planned lineup: bring each planned player onto their planned
    // position. Anyone in the plan who isn't in today's game (no-show, left
    // early) is simply skipped and stays off the field.
    Object.entries(half2Plan).forEach(([pos, playerId]) => {
      const p = state.players.find(pl => pl.id === playerId && !pl.leftEarly);
      if (!p) return;
      p.onField    = true;
      p.subInAt    = state.totalElapsed;
      p.position   = pos;
      p.benchSince = null;
    });
    const planGoalie = state.players.find(p => p.onField && p.position === 'GK');
    state.activeGoalieId = planGoalie ? planGoalie.id : null;
    if (planGoalie) state.goalie2Id = planGoalie.id;
  } else {
    // Default: continue with whoever was the 2nd-half goalie pick; everyone
    // else stays benched until the coach subs them in live.
    const secondHalfGoalieId = state.goalie2Id || state.goalie1Id;
    const secondHalfGoalie = state.players.find(p => p.id === secondHalfGoalieId);
    if (secondHalfGoalie) {
      secondHalfGoalie.onField    = true;
      secondHalfGoalie.subInAt    = state.totalElapsed;
      secondHalfGoalie.position   = 'GK';
      secondHalfGoalie.benchSince = null;
    }
    state.activeGoalieId = secondHalfGoalie ? secondHalfGoalie.id : null;
  }

  // Start 2nd half position timers after all position changes are settled
  state.players.filter(p => p.onField).forEach(p => startPositionTimer(p));

  state.currentHalf      = 2;
  state.halfClock        = HALF_DURATION();
  state.halfActionIsEnd  = true;
  state.subPlans         = [];
  state.subPick          = null;

  syncGamePhaseUi();
  document.getElementById('pause-btn').textContent  = '\u25B6 START';
  document.getElementById('pause-btn').style.background = '#e65100';

  renderClock();
  renderGame();
  saveActiveGame();
}

// ------------------------------------------------------------
//  SCORE / GOALS
// ------------------------------------------------------------
export function renderScore() {
  document.getElementById('score-us').textContent   = state.scoreUs;
  document.getElementById('score-them').textContent = state.scoreThem;
  const undoBtn = document.getElementById('undo-goal-btn');
  if (undoBtn) undoBtn.style.display = state.goals.length ? '' : 'none';
}

export function undoLastGoal() {
  if (!state.goals.length || state.gameFinalized) return;
  const last = state.goals.pop();
  if (last.team === 'us') state.scoreUs = Math.max(0, state.scoreUs - 1);
  else state.scoreThem = Math.max(0, state.scoreThem - 1);
  renderScore();
  saveActiveGame();
}

export function updateGoalBtn() {
  const btn = document.getElementById('goal-btn');
  if (btn) btn.disabled = !state.isRunning;
}

export function openGoalModal() {
  document.getElementById('goal-scorer-section').style.display = 'none';
  document.getElementById('goal-them-section').style.display   = 'none';
  document.getElementById('goal-them-preview').textContent     = state.scoreThem;
  document.getElementById('goal-us-btn').textContent   = state.teamName;
  document.getElementById('goal-them-btn').textContent = state.opponentName || 'Opponent';
  openModal('goal-modal');
}

export function closeGoalModal() {
  closeModal('goal-modal');
}

export function recordGoal(team) {
  if (team === 'us') {
    // Build scorer list from on-field + bench players
    const list = document.getElementById('goal-scorer-list');
    list.innerHTML = '';
    const allPlayers = [...state.players].sort((a, b) => a.name.localeCompare(b.name));
    allPlayers.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-gray';
      btn.style.cssText = 'width:100%;margin-bottom:6px;text-align:left;';
      btn.textContent = p.name;
      btn.addEventListener('click', () => confirmGoal(p.name, p.id));
      list.appendChild(btn);
    });
    document.getElementById('goal-scorer-section').style.display = 'block';
    document.getElementById('goal-them-section').style.display   = 'none';
  } else {
    document.getElementById('goal-them-preview').textContent = state.scoreThem + 1;
    document.getElementById('goal-scorer-section').style.display = 'none';
    document.getElementById('goal-them-section').style.display   = 'block';
  }
}

export function adjustTheirScore(delta) {
  const preview = document.getElementById('goal-them-preview');
  const current = parseInt(preview.textContent, 10);
  if (isNaN(current)) return;
  preview.textContent = Math.max(0, current + delta);
}

export function confirmTheirScore() {
  const newScore = parseInt(document.getElementById('goal-them-preview').textContent, 10);
  if (isNaN(newScore)) return;
  const delta    = newScore - state.scoreThem;
  state.scoreThem = newScore;
  if (delta > 0) {
    for (let i = 0; i < delta; i++) state.goals.push({ scorer: null, half: state.currentHalf, team: 'them' });
  } else if (delta < 0) {
    let toRemove = -delta;
    for (let i = state.goals.length - 1; i >= 0 && toRemove > 0; i--) {
      if (state.goals[i].team === 'them') { state.goals.splice(i, 1); toRemove--; }
    }
  }
  renderScore();
  closeGoalModal();
  saveActiveGame();
}

export function confirmGoal(scorerName, scorerId = null) {
  state.scoreUs++;
  state.goals.push({ scorer: scorerName, scorerId, half: state.currentHalf, team: 'us' });
  renderScore();
  closeGoalModal();
  saveActiveGame();
}

export function endGame() {
  closeModal('half-modal');
  pauseGame();
  state.gameFinalized = true;

  state.players.forEach(p => {
    if (p.onField && p.subInAt !== null) {
      commitPositionTime(p);
      p.totalPlayed += state.totalElapsed - p.subInAt;
      p.subInAt = null;
    }
  });

  // Build game record, append to history, save
  const gameRecord = buildGameRecord();
  state.gameHistory.push(gameRecord);
  saveGameHistory();
  clearActiveGame();

  openModal('download-prompt-modal');
  const yesBtn = document.getElementById('download-prompt-yes-btn');
  const noBtn  = document.getElementById('download-prompt-no-btn');
  function onYes() { exportProfile(false, true); dismiss(); }
  function onNo()  { dismiss(); }
  let dismissed = false;
  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    yesBtn.removeEventListener('click', onYes);
    noBtn.removeEventListener('click', onNo);
    closeModal('download-prompt-modal');
    showSummary();
    state.players = [];
    state.gameFinalized = false;
  }
  yesBtn.addEventListener('click', onYes);
  noBtn.addEventListener('click', onNo);
}

export function isFieldClickSuppressed() {
  return Date.now() < suppressFieldClickUntil;
}
