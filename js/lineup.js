import { POSITIONS, POSITION_ORDER, state } from './state.js';
import { avatarHtml, avatarParts, checkedPlayers, renderGameDayCheckboxes } from './roster.js';
import { closeModal, escHtml, openModal, showScreen } from './utils.js';
import { saveGamePlan } from './persistence.js';

const WHEEL_ITEM_H = 60;
const WHEEL_REPS = 50;
const LINEUP_SLOT_DROP_RADIUS_PX = 84;

function setLineupGoalieId(pos, playerId) {
  if (pos !== 'GK') return;
  if (state.gkPickerPhase === 1) state.goalie1Id = playerId;
  else state.goalie2Id = playerId;
}

let lineupPointerDrag = null;
let suppressLineupClickUntil = 0;
let wheelPlayers = [];
let wheelOffset = 0;
let wheelAnimId = null;
let wheelSpinning = false;
let wheelSpeed = 0;
let currentGoaliePick = 1;
let gkSpinMode = false;
let gkSpinWinner = null;
let gkSpinPhase = 1;


const halfDuration = () => state.halfMinutes * 60;

export function goToLineup() {
  const present = checkedPlayers();
  if (present.length < 1) return;

  state.teamName = document.getElementById('team-name-input').value.trim() || 'My Team';
  state.opponentName = document.getElementById('opponent-input').value.trim();
  state.gameDate = document.getElementById('game-date-input').value || new Date().toISOString().slice(0, 10);
  state.scoreUs = 0;
  state.scoreThem = 0;
  state.goals = [];
  state.goalie1Id = null;
  state.goalie2Id = null;
  state.activeGoalieId = null;
  state.goaliePickerSkipped = false;
  state.isPrePlanning = false;
  state.prePlanHalf = null;

  document.getElementById('lineup-header-title').textContent = `${state.teamName} \u2014 Starting Lineup`;
  document.getElementById('lineup-back-btn').textContent = '\u2190 Back';

  state.savedChecked = new Set(present.map(p => p.id));

  state.lineupDraft = [...present].sort((a, b) => a.name.localeCompare(b.name)).map(p => ({
    id: p.id,
    name: p.name,
    onField: false,
    position: null,
  }));

  // Seed from a saved advance plan for Half 1 when one exists for these players,
  // so the live starting lineup starts pre-filled but stays fully editable.
  if (state.gamePlan && state.gamePlan.half1) {
    Object.entries(state.gamePlan.half1).forEach(([pos, playerId]) => {
      const p = state.lineupDraft.find(dp => dp.id === playerId);
      if (p) { p.position = pos; p.onField = true; }
    });
  }

  state.selectedLineupSlot = null;
  state.selectedLineupPlayer = null;
  showGkPicker();
}

// ------------------------------------------------------------
//  PLAN AHEAD (pre-plan Half 1 + Half 2 lineups before the game)
// ------------------------------------------------------------
export function goToPlanAhead() {
  const present = checkedPlayers();
  if (present.length < 1) return;

  state.teamName = document.getElementById('team-name-input').value.trim() || 'My Team';
  state.opponentName = document.getElementById('opponent-input').value.trim();
  state.gameDate = document.getElementById('game-date-input').value || new Date().toISOString().slice(0, 10);

  state.savedChecked = new Set(present.map(p => p.id));
  state.isPrePlanning = true;
  state.prePlanHalf = 1;

  state.lineupDraft = [...present].sort((a, b) => a.name.localeCompare(b.name)).map(p => ({
    id: p.id,
    name: p.name,
    onField: false,
    position: null,
  }));

  // Editing an existing plan for the same roster pre-fills Half 1 from it.
  if (state.gamePlan && state.gamePlan.half1) {
    Object.entries(state.gamePlan.half1).forEach(([pos, playerId]) => {
      const p = state.lineupDraft.find(dp => dp.id === playerId);
      if (p) { p.position = pos; p.onField = true; }
    });
  }

  state.selectedLineupSlot = null;
  state.selectedLineupPlayer = null;
  document.getElementById('lineup-header-title').textContent = `${state.teamName} \u2014 Plan Half 1 Lineup`;
  document.getElementById('lineup-back-btn').textContent = '\u2190 Back';
  showScreen('lineup-screen');
  renderLineup();
}

function buildPositionMapFromDraft() {
  const map = {};
  state.lineupDraft.forEach(p => { if (p.position) map[p.position] = p.id; });
  return map;
}

// Called by the lineup screen's main button while pre-planning. Saves the
// current half's positions and either advances to Half 2 or finishes the plan.
export function advancePrePlan() {
  const posMap = buildPositionMapFromDraft();
  state.gamePlan = state.gamePlan || {};

  if (state.prePlanHalf === 1) {
    state.gamePlan.half1 = posMap;

    state.lineupDraft.forEach(p => { p.position = null; p.onField = false; });
    // Editing an existing plan pre-fills Half 2 from what was saved before.
    if (state.gamePlan.half2) {
      Object.entries(state.gamePlan.half2).forEach(([pos, playerId]) => {
        const p = state.lineupDraft.find(dp => dp.id === playerId);
        if (p) { p.position = pos; p.onField = true; }
      });
    }

    state.prePlanHalf = 2;
    state.selectedLineupSlot = null;
    state.selectedLineupPlayer = null;
    document.getElementById('lineup-header-title').textContent = `${state.teamName} \u2014 Plan Half 2 Lineup`;
    document.getElementById('lineup-back-btn').textContent = '\u2190 Back to Half 1';
    saveGamePlan();
    renderLineup();
  } else {
    state.gamePlan.half2 = posMap;
    state.isPrePlanning = false;
    state.prePlanHalf = null;
    state.selectedLineupSlot = null;
    state.selectedLineupPlayer = null;
    saveGamePlan();
    showScreen('setup-screen');
    renderGameDayCheckboxes(true);
    document.dispatchEvent(new CustomEvent('gameplan:saved'));
  }
}

// ------------------------------------------------------------
//  HALFTIME EDIT (adjust the 2nd half lineup during the break)
// ------------------------------------------------------------
// Opens the lineup screen for the 2nd half while the game is at halftime.
// Seeds from the saved Half 2 plan when there is one; otherwise from the
// 1st half field positions with the 2nd half goalie moved into GK.
export function openHalftimeLineup() {
  state.isHalftimeEdit = true;
  state.gkPickerPhase = 2;

  state.lineupDraft = state.players
    .filter(p => !p.leftEarly)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(p => ({ id: p.id, name: p.name, onField: false, position: null }));

  const plan = state.gamePlan && state.gamePlan.half2;
  if (plan) {
    Object.entries(plan).forEach(([pos, playerId]) => {
      const p = state.lineupDraft.find(dp => dp.id === playerId);
      if (p) { p.position = pos; p.onField = true; }
    });
  } else {
    state.players.filter(p => p.onField && p.position).forEach(live => {
      const p = state.lineupDraft.find(dp => dp.id === live.id);
      if (p) { p.position = live.position; p.onField = true; }
    });
    const goalie = state.lineupDraft.find(p => p.id === (state.goalie2Id || state.goalie1Id));
    if (goalie && goalie.position !== 'GK') {
      const oldGk = state.lineupDraft.find(p => p.position === 'GK');
      if (oldGk) { oldGk.position = null; oldGk.onField = false; }
      goalie.position = 'GK';
      goalie.onField = true;
    }
  }

  state.selectedLineupSlot = null;
  state.selectedLineupPlayer = null;
  document.getElementById('lineup-header-title').textContent = `${state.teamName} — 2nd Half Lineup`;
  document.getElementById('lineup-back-btn').textContent = '← Back to Halftime';
  showScreen('lineup-screen');
  renderLineup();
}

function finishHalftimeLineup(start) {
  const lineup = start ? buildPositionMapFromDraft() : null;
  state.isHalftimeEdit = false;
  state.selectedLineupSlot = null;
  state.selectedLineupPlayer = null;
  document.dispatchEvent(new CustomEvent(start ? 'halftime-lineup:start' : 'halftime-lineup:cancel', {
    detail: { lineup }
  }));
}

// Routes the lineup screen's single launch button to the right flow.
export function handleLaunchClick() {
  if (state.isHalftimeEdit) finishHalftimeLineup(true);
  else if (state.isPrePlanning) advancePrePlan();
  else launchGame();
}

export function clearGamePlan() {
  state.gamePlan = null;
  saveGamePlan();
  document.dispatchEvent(new CustomEvent('gameplan:saved'));
}

export function showGkPicker(phase = 1) {
  state.gkPickerPhase = phase;
  const isSecondHalf = state.gkPickerPhase === 2;
  const firstHalfGoalie = state.lineupDraft.find(p => p.id === state.goalie1Id);

  document.getElementById('gk-picker-title').textContent =
    isSecondHalf ? '\uD83E\uDDE4 Pick 2nd Half Goalie' : '\uD83E\uDDE4 Pick 1st Half Goalie';
  document.getElementById('gk-picker-subtitle').textContent = isSecondHalf
    ? `1st half: ${firstHalfGoalie ? firstHalfGoalie.name : 'Selected goalie'}. Tap a player or spin for the 2nd half.`
    : 'Tap a player to assign them to GK for the 1st half.';
  const pickerPlayers = isSecondHalf
    ? state.lineupDraft.filter(p => p.id !== state.goalie1Id)
    : state.lineupDraft;

  document.getElementById('gk-picker-spin-btn').style.display =
    isSecondHalf && pickerPlayers.length === 0 ? 'none' : 'block';
  document.getElementById('gk-picker-spin-btn').textContent = isSecondHalf
    ? '\uD83C\uDFB2 Spin to Pick 2nd Half Goalie'
    : '\uD83C\uDFB2 Spin to Pick 1st Half Goalie';
  document.getElementById('gk-picker-skip-btn').textContent = isSecondHalf
    ? 'Use 1st Half Goalie for 2nd Half'
    : 'Skip \u2014 Assign Later';

  const list = document.getElementById('gk-picker-list');
  list.innerHTML = '';

  pickerPlayers.forEach(p => {
    const alreadyGk = hasBeenGoalieThisSeason(p.id, p.name);
    const btn = document.createElement('button');
    btn.className = 'btn btn-gray';
    btn.style.cssText = `width:100%;margin-bottom:8px;text-align:left;font-size:1rem;display:flex;align-items:center;gap:12px;padding:10px 14px;${alreadyGk ? 'opacity:0.45;' : ''}`;
    btn.innerHTML = `${avatarHtml(p.id, p.name, 36)}<span>${escHtml(p.name)}${alreadyGk ? ' <small style="opacity:0.8;font-size:0.75em;">(played GK)</small>' : ''}</span>`;
    btn.onclick = () => pickGk(p.id);
    list.appendChild(btn);
  });
  openModal('gk-picker-modal');
}

export function pickGk(playerId) {
  state.goaliePickerSkipped = false;
  if (state.gkPickerPhase === 1) {
    state.goalie1Id = playerId;
    state.goalie2Id = null;
    state.lineupDraft.forEach(p => {
      if (p.id === playerId) {
        p.onField = true;
        p.position = 'GK';
      } else if (p.position === 'GK') {
        p.position = null;
      }
    });
    showGkPicker(2);
    return;
  }

  state.goalie2Id = playerId;
  closeModal('gk-picker-modal');
  showScreen('lineup-screen');
  renderLineup();
}

export function skipGkPicker() {
  if (state.gkPickerPhase === 2) state.goalie2Id = state.goalie1Id;
  else state.goaliePickerSkipped = true;
  closeModal('gk-picker-modal');
  showScreen('lineup-screen');
  renderLineup();
}

export function goBackFromLineup() {
  if (state.isHalftimeEdit) {
    finishHalftimeLineup(false);
    return;
  }
  if (state.isPrePlanning && state.prePlanHalf === 2) {
    goBackToPrePlanHalf1();
    return;
  }
  state.selectedLineupSlot = null;
  state.selectedLineupPlayer = null;
  state.isPrePlanning = false;
  state.prePlanHalf = null;
  showScreen('setup-screen');
  renderGameDayCheckboxes(true);
}

// While pre-planning, steps back from the Half 2 draft to the Half 1 draft so
// the coach can adjust it. The in-progress Half 2 draft is saved to the game
// plan first so nothing is lost, and advancePrePlan() restores it again if
// the coach moves forward past Half 1 a second time.
export function goBackToPrePlanHalf1() {
  state.gamePlan = state.gamePlan || {};
  state.gamePlan.half2 = buildPositionMapFromDraft();
  saveGamePlan();

  state.lineupDraft.forEach(p => { p.position = null; p.onField = false; });
  if (state.gamePlan.half1) {
    Object.entries(state.gamePlan.half1).forEach(([pos, playerId]) => {
      const p = state.lineupDraft.find(dp => dp.id === playerId);
      if (p) { p.position = pos; p.onField = true; }
    });
  }

  state.prePlanHalf = 1;
  state.selectedLineupSlot = null;
  state.selectedLineupPlayer = null;
  document.getElementById('lineup-header-title').textContent = `${state.teamName} \u2014 Plan Half 1 Lineup`;
  document.getElementById('lineup-back-btn').textContent = '\u2190 Back';
  renderLineup();
}

export function renderLineup() {
  renderLineupField();
  renderLineupPlayers();
  updateLineupLaunchBtn();
}

export function handleLineupPointerDown(e) {
  if (e.button !== undefined && e.button !== 0) return;

  const item = e.target.closest('.pos-slot, .lineup-player');
  if (!item) return;

  const playerId = parseInt(item.dataset.playerId, 10);
  const player = state.lineupDraft.find(p => p.id === playerId);
  if (!player) return;

  lineupPointerDrag = {
    playerId,
    sourceItem: item,
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    startPosition: player.position,
    dragging: false,
    overSlot: null,
    overBench: false,
    preview: null
  };
  item.setPointerCapture?.(e.pointerId);
}

export function handleLineupPointerMove(e) {
  if (!lineupPointerDrag) return;
  if (e.pointerId !== undefined && e.pointerId !== lineupPointerDrag.pointerId) return;

  const dx = Math.abs(e.clientX - lineupPointerDrag.startX);
  const dy = Math.abs(e.clientY - lineupPointerDrag.startY);
  if (!lineupPointerDrag.dragging && Math.max(dx, dy) < 8) return;

  e.preventDefault();
  lineupPointerDrag.dragging = true;
  lineupPointerDrag.sourceItem.classList.add('dragging');
  if (!lineupPointerDrag.preview) {
    const player = state.lineupDraft.find(p => p.id === lineupPointerDrag.playerId);
    if (player) lineupPointerDrag.preview = createFieldDragPreview(player, player.position);
  }
  moveFieldDragPreview(lineupPointerDrag.preview, e.clientX, e.clientY);

  const overSlot = findNearestSlot(e.clientX, e.clientY, '#lineup-field-positions', LINEUP_SLOT_DROP_RADIUS_PX);
  if (lineupPointerDrag.overSlot && lineupPointerDrag.overSlot !== overSlot) {
    lineupPointerDrag.overSlot.classList.remove('drag-over');
  }

  lineupPointerDrag.overSlot = overSlot || null;
  if (lineupPointerDrag.overSlot) lineupPointerDrag.overSlot.classList.add('drag-over');

  const benchList = document.getElementById('lineup-unassigned-list');
  const overBench = !overSlot && !!document.elementFromPoint(e.clientX, e.clientY)?.closest('.lineup-players-panel');
  lineupPointerDrag.overBench = overBench;
  benchList?.classList.toggle('drag-over', overBench && !!lineupPointerDrag.startPosition);
}

export function handleLineupPointerUp(e) {
  if (!lineupPointerDrag) return;
  if (e.pointerId !== undefined && e.pointerId !== lineupPointerDrag.pointerId) return;

  const drag = lineupPointerDrag;
  lineupPointerDrag = null;

  drag.sourceItem.classList.remove('dragging');
  drag.sourceItem.releasePointerCapture?.(drag.pointerId);
  if (drag.overSlot) drag.overSlot.classList.remove('drag-over');
  document.getElementById('lineup-unassigned-list')?.classList.remove('drag-over');
  removeFieldDragPreview(drag.preview);

  if (!drag.dragging) return;
  e.preventDefault();
  suppressLineupClickUntil = Date.now() + 350;

  if (drag.overSlot) {
    moveLineupPlayerToPosition(drag.playerId, drag.overSlot.dataset.position);
  } else if (drag.overBench && drag.startPosition) {
    moveLineupPlayerToBench(drag.playerId);
  }
}

// Drag-and-drop counterpart to tapping a field player then tapping away:
// sends a player who currently has a field position back to the bench.
function moveLineupPlayerToBench(playerId) {
  const player = state.lineupDraft.find(p => p.id === playerId);
  if (!player || !player.position) return;

  if (player.position === 'GK') setLineupGoalieId('GK', null);

  player.position = null;
  player.onField = false;
  state.selectedLineupSlot = null;
  state.selectedLineupPlayer = null;
  renderLineup();
}

function moveLineupPlayerToPosition(playerId, targetPos) {
  const player = state.lineupDraft.find(p => p.id === playerId);
  if (!player || !targetPos || player.position === targetPos) return;

  const fromPos = player.position;
  const target = state.lineupDraft.find(p => p.position === targetPos && p.id !== playerId);

  if (target) {
    target.position = fromPos || null;
    target.onField = !!fromPos;
  }

  setLineupGoalieId(targetPos, player.id);
  if (fromPos === 'GK') setLineupGoalieId('GK', null);

  player.position = targetPos;
  player.onField = true;
  state.selectedLineupSlot = null;
  state.selectedLineupPlayer = null;
  renderLineup();
}

export function renderLineupField() {
  const container = document.getElementById('lineup-field-positions');
  container.innerHTML = '';

  POSITION_ORDER.forEach(pos => {
    const coords = POSITIONS[pos];
    const assigned = state.lineupDraft.find(p => p.position === pos);

    const slot = document.createElement('div');
    const slotClass = assigned ? 'slot-filled'
      : state.selectedLineupSlot === pos ? 'slot-sel-empty'
      : state.selectedLineupPlayer !== null ? 'slot-sel-empty'
      : 'slot-empty';
    slot.className = 'pos-slot ' + slotClass;
    slot.style.left = coords.x + '%';
    slot.style.top = coords.y + '%';
    slot.dataset.position = pos;
    slot.onclick = () => lineupSlotTap(pos);

    if (assigned) {
      slot.dataset.playerId = String(assigned.id);
      const [avatarBg, avatarContent] = avatarParts(assigned.id, assigned.name);
      slot.innerHTML = `
        <div class="pos-label">${pos}</div>
        <div class="pos-avatar" style="${avatarBg}">${avatarContent}</div>
        <div class="pos-name">${escHtml(assigned.name)}</div>
      `;
    } else {
      slot.innerHTML = `
        <div class="pos-label">${pos}</div>
        <div class="pos-empty-label">empty</div>
      `;
    }

    container.appendChild(slot);
  });
}

// While pre-planning, tells whether `playerId` already has a saved spot in
// the half currently NOT being edited, so the bench card can flag it (e.g.
// editing Half 2 while she's slotted at CF for Half 1).
function otherHalfAssignment(playerId) {
  if (!state.isPrePlanning || !state.gamePlan) return null;
  const otherHalf = state.prePlanHalf === 1 ? 2 : 1;
  const map = state.gamePlan[`half${otherHalf}`];
  if (!map) return null;
  const entry = Object.entries(map).find(([, id]) => id === playerId);
  return entry ? { half: otherHalf, position: entry[0] } : null;
}

function renderLineupPlayers() {
  const list = document.getElementById('lineup-unassigned-list');
  const unassigned = state.lineupDraft.filter(p => !p.position);
  const hint = document.getElementById('lineup-hint');

  if (state.selectedLineupSlot) {
    hint.textContent = `Slot ${state.selectedLineupSlot} selected \u2014 tap a player to assign them.`;
    hint.className = 'lineup-hint active';
  } else if (state.selectedLineupPlayer) {
    const p = state.lineupDraft.find(dp => dp.id === state.selectedLineupPlayer);
    hint.textContent = `${p ? p.name : 'Player'} selected \u2014 tap a position slot to place them.`;
    hint.className = 'lineup-hint active';
  } else {
    hint.textContent = 'Tap a position or a player to start assigning.';
    hint.className = 'lineup-hint';
  }

  if (!unassigned.length) {
    list.innerHTML = '<div class="lineup-empty">All players assigned!</div>';
    return;
  }

  list.innerHTML = '';
  unassigned.forEach(p => {
    const item = document.createElement('div');
    item.className = 'lineup-player' + (p.id === state.selectedLineupPlayer ? ' selected' : '');
    item.dataset.playerId = String(p.id);
    const otherHalf = otherHalfAssignment(p.id);
    const badge = otherHalf
      ? `<span class="lineup-half-badge">H${otherHalf.half} \u00b7 ${otherHalf.position}</span>`
      : '';
    item.innerHTML = `${badge}${avatarHtml(p.id, p.name, 44)}<span class="lineup-player-name">${escHtml(p.name)}</span>`;
    item.onclick = () => lineupPlayerTap(p.id);
    list.appendChild(item);
  });
}

export function lineupSlotTap(pos) {
  if (Date.now() < suppressLineupClickUntil) return;

  const assigned = state.lineupDraft.find(p => p.position === pos);

  if (assigned) {
    assigned.position = null;
    assigned.onField = false;
    setLineupGoalieId(pos, null);
    state.selectedLineupSlot = null;
    state.selectedLineupPlayer = null;
  } else if (state.selectedLineupPlayer !== null) {
    const player = state.lineupDraft.find(p => p.id === state.selectedLineupPlayer);
    if (player) {
      player.position = pos;
      player.onField = true;
      setLineupGoalieId(pos, player.id);
    }
    state.selectedLineupPlayer = null;
    state.selectedLineupSlot = null;
  } else if (state.selectedLineupSlot === pos) {
    state.selectedLineupSlot = null;
  } else {
    state.selectedLineupSlot = pos;
  }
  renderLineup();
}

export function lineupPlayerTap(id) {
  if (Date.now() < suppressLineupClickUntil) return;

  if (state.selectedLineupSlot !== null) {
    const player = state.lineupDraft.find(p => p.id === id);
    if (player) {
      player.position = state.selectedLineupSlot;
      player.onField = true;
      setLineupGoalieId(state.selectedLineupSlot, player.id);
    }
    state.selectedLineupSlot = null;
    state.selectedLineupPlayer = null;
  } else if (state.selectedLineupPlayer === id) {
    state.selectedLineupPlayer = null;
  } else {
    state.selectedLineupPlayer = id;
    state.selectedLineupSlot = null;
  }
  renderLineup();
}

export function updateLineupLaunchBtn() {
  const btn = document.getElementById('launch-btn');
  const posCount = state.lineupDraft.filter(p => p.position).length;
  const ready = posCount >= 1;
  btn.disabled = !ready;
  if (!ready) {
    btn.textContent = 'Assign at least 1 player';
  } else if (state.isHalftimeEdit) {
    btn.textContent = 'Start 2nd Half →';
  } else if (state.isPrePlanning) {
    btn.textContent = state.prePlanHalf === 1 ? 'Save Half 1 \u2192 Plan Half 2' : 'Save Plan \u2713';
  } else {
    btn.textContent = 'Start Game \u2192';
  }
}

export function launchGame() {
  const fieldPlayers = state.lineupDraft.filter(p => p.onField);
  if (fieldPlayers.length < 1) return;

  const gkPlayer = state.lineupDraft.find(p => p.position === 'GK');
  if (gkPlayer) {
    const hasSecondHalfGoalie = state.goalie1Id === gkPlayer.id
      && state.goalie2Id
      && state.lineupDraft.some(p => p.id === state.goalie2Id);

    state.goalie1Id = gkPlayer.id;

    if (hasSecondHalfGoalie) {
      startGameDirect();
      return;
    }

    if (state.goaliePickerSkipped) {
      state.goalie2Id = state.goalie1Id;
      startGameDirect();
      return;
    }

    state.goalie2Id = null;
    currentGoaliePick = 2;
    gkSpinMode = false;
    gkSpinWinner = null;
    wheelPlayers = seasonFreshGoalieCandidates(
      state.lineupDraft.filter(p => p.onField),
      [state.goalie1Id]
    );
    if (!wheelPlayers.length) {
      alert('No other players are eligible for the goalie spinner this season.');
      showGkPicker(2);
      return;
    }
    resetWheelUI('2nd Half Goalie', `1st half: ${gkPlayer.name} \u00B7 Spin to pick 2nd half goalie`);
    document.getElementById('goalie-confirm-btn').textContent = 'Use 1st Half Goalie \u2192';
    document.getElementById('goalie-confirm-btn').style.display = 'block';
    buildWheel();
    openModal('goalie-modal');
  } else if (state.goaliePickerSkipped) {
    state.goalie1Id = null;
    state.goalie2Id = null;
    state.activeGoalieId = null;
    startGameDirect();
  } else {
    openGoaliePicker();
  }
}

function hasBeenGoalieThisSeason(playerId, playerName) {
  return state.gameHistory.some(game =>
    (game.playerStats || []).some(ps => {
      const idMatch = String(ps.id) === String(playerId);
      const nameMatch = playerName && ps.name === playerName;
      return (idMatch || nameMatch) && (ps.positionSeconds || {}).GK > 0;
    })
  );
}

function seasonFreshGoalieCandidates(sourcePlayers, excludedIds = []) {
  const excluded = new Set(excludedIds.map(id => String(id)));
  return sourcePlayers
    .filter(p => !excluded.has(String(p.id)) && !hasBeenGoalieThisSeason(p.id, p.name))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function resetWheelUI(title = '1st Half Goalie', subtitle = 'Spin the wheel to pick!') {
  document.getElementById('goalie-wheel-title').textContent = title;
  document.getElementById('goalie-wheel-subtitle').textContent = subtitle;
  document.getElementById('wheel-spin-btn').style.display = 'block';
  document.getElementById('wheel-stop-btn').style.display = 'none';
  document.getElementById('wheel-next-btn').style.display = 'none';
  document.getElementById('goalie-confirm-btn').textContent = 'Start Game \u2192';
  document.getElementById('goalie-confirm-btn').style.display = 'none';
  document.getElementById('gk-assign-btn').style.display = 'none';
  document.getElementById('wheel-spin-again-btn').style.display = 'none';
  document.getElementById('wheel-cancel-btn').style.display = 'none';
}

function openGoaliePicker() {
  state.goalie1Id = null;
  state.goalie2Id = null;
  currentGoaliePick = 1;
  gkSpinMode = false;
  gkSpinWinner = null;
  wheelPlayers = seasonFreshGoalieCandidates(state.lineupDraft.filter(p => p.onField));
  if (!wheelPlayers.length) {
    alert('Everyone in this lineup has already played goalie this season. Please pick manually.');
    showGkPicker(1);
    return;
  }

  resetWheelUI();
  buildWheel();
  openModal('goalie-modal');
}

export function openGkSpin() {
  closeModal('gk-picker-modal');
  gkSpinMode = true;
  gkSpinWinner = null;

  if (state.gkPickerPhase === 2 && state.goalie1Id) {
    const firstHalfGoalie = state.lineupDraft.find(p => p.id === state.goalie1Id);
    gkSpinPhase = 2;
    state.goalie2Id = null;
    wheelPlayers = seasonFreshGoalieCandidates(state.lineupDraft, [state.goalie1Id]);

    if (!wheelPlayers.length) {
      alert('No other players are eligible for the goalie spinner this season.');
      showGkPicker(2);
      return;
    }

    resetWheelUI(
      '2nd Half Goalie',
      `1st half: ${firstHalfGoalie ? firstHalfGoalie.name : 'Selected goalie'} \u00B7 Spin to pick 2nd half goalie`
    );
  } else {
    gkSpinPhase = 1;
    state.goalie1Id = null;
    state.goalie2Id = null;
    wheelPlayers = seasonFreshGoalieCandidates(state.lineupDraft);
    if (!wheelPlayers.length) {
      alert('Everyone in this lineup has already played goalie this season.');
      showGkPicker(1);
      return;
    }
    resetWheelUI();
  }

  buildWheel();
  openModal('goalie-modal');
  requestAnimationFrame(spinWheel);
}

export function confirmGkFromSpin() {
  const winner = gkSpinWinner;
  if (!winner) return;

  if (gkSpinPhase === 1) {
    state.goalie1Id = winner.id;
    state.lineupDraft.forEach(p => {
      if (p.id === winner.id) { p.onField = true; p.position = 'GK'; }
    });

    closeModal('goalie-modal');
    gkSpinMode = false;
    showGkPicker(2);
  } else {
    state.goalie2Id = winner.id;
    closeModal('goalie-modal');
    gkSpinMode = false;
    showScreen('lineup-screen');
    renderLineup();
  }
}

function buildWheel() {
  const track = document.getElementById('wheel-track');
  track.style.transition = 'none';

  const items = [];
  for (let i = 0; i < WHEEL_REPS; i++) {
    wheelPlayers.forEach(p => items.push(p));
  }

  track.innerHTML = items.map(p => `
    <div class="wheel-item">
      ${avatarHtml(p.id, p.name, 32)}
      <span>${escHtml(p.name)}</span>
    </div>
  `).join('');

  const startIdx = Math.floor(WHEEL_REPS / 2) * wheelPlayers.length;
  wheelOffset = WHEEL_ITEM_H - startIdx * WHEEL_ITEM_H;
  track.style.transform = `translateY(${wheelOffset}px)`;
}

export function spinWheel() {
  if (wheelSpinning) return;
  wheelSpinning = true;
  wheelSpeed = -22;

  document.getElementById('wheel-spin-btn').style.display = 'none';
  document.getElementById('wheel-stop-btn').style.display = 'block';

  const track = document.getElementById('wheel-track');

  function frame() {
    if (!wheelSpinning) return;
    wheelOffset += wheelSpeed;
    track.style.transform = `translateY(${wheelOffset}px)`;
    wheelAnimId = requestAnimationFrame(frame);
  }
  wheelAnimId = requestAnimationFrame(frame);
}

export function stopWheel() {
  wheelSpinning = false;
  cancelAnimationFrame(wheelAnimId);

  document.getElementById('wheel-stop-btn').style.display = 'none';

  const nearestIdx = Math.round((WHEEL_ITEM_H - wheelOffset) / WHEEL_ITEM_H);
  const snapOffset = WHEEL_ITEM_H - nearestIdx * WHEEL_ITEM_H;

  const track = document.getElementById('wheel-track');
  track.style.transition = 'transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
  track.style.transform = `translateY(${snapOffset}px)`;
  wheelOffset = snapOffset;

  const playerIdx = ((nearestIdx % wheelPlayers.length) + wheelPlayers.length) % wheelPlayers.length;
  const winner = wheelPlayers[playerIdx];

  if (!gkSpinMode) {
    if (currentGoaliePick === 1) state.goalie1Id = winner.id;
    else state.goalie2Id = winner.id;
  }

  setTimeout(() => {
    track.style.transition = 'none';
    showWheelResult(winner);
  }, 400);
}

function showWheelResult(winner) {
  if (gkSpinMode) {
    gkSpinWinner = winner;
    const assignBtn = document.getElementById('gk-assign-btn');
    assignBtn.textContent = gkSpinPhase === 1 ? '\u2705 Assign as 1st Half Goalie \u2192' : '\u2705 Set Lineup \u2192';
    assignBtn.style.display = 'block';
  } else {
    if (currentGoaliePick === 1) {
      document.getElementById('wheel-next-btn').style.display = 'block';
    } else {
      document.getElementById('goalie-confirm-btn').style.display = 'block';
    }
  }

  document.getElementById('wheel-spin-again-btn').style.display = 'block';
  document.getElementById('wheel-cancel-btn').style.display = 'block';
}

export function nextGoaliePick() {
  closeModal('goalie-modal');
  showGkPicker(2);
}

export function spinAgain() {
  gkSpinWinner = null;
  if (!gkSpinMode) {
    if (currentGoaliePick === 1) state.goalie1Id = null;
    else state.goalie2Id = null;
  }
  const title = gkSpinMode
    ? (gkSpinPhase === 1 ? '1st Half Goalie' : '2nd Half Goalie')
    : (currentGoaliePick === 1 ? '1st Half Goalie' : '2nd Half Goalie');
  resetWheelUI(title, 'Spin the wheel to pick!');
  buildWheel();
}

export function cancelGoalieSpin() {
  state.selectedLineupPlayer = null;
  state.selectedLineupSlot = null;
  closeModal('goalie-modal');
  if (gkSpinMode) {
    gkSpinMode = false;
    showScreen('lineup-screen');
    renderLineup();
  }
}

export function confirmGoalies() {
  if (currentGoaliePick === 2 && state.goalie1Id && !state.goalie2Id) {
    state.goalie2Id = state.goalie1Id;
  }
  closeModal('goalie-modal');
  startGameDirect();
}

function startGameDirect() {
  state.players = state.lineupDraft.map(p => ({
    id: p.id,
    name: p.name,
    onField: p.onField,
    totalPlayed: 0,
    subInAt: p.onField ? 0 : null,
    h1Snapshot: null,
    position: p.position || null,
    positionTime: {},
    positionStart: (p.onField && p.position) ? 0 : null,
    benchSince: p.onField ? null : 0,
  }));

  initGame();
}

function initGame() {
  state.totalElapsed = 0;
  state.halfClock = halfDuration();
  state.currentHalf = 1;
  state.isRunning = false;
  state.gameFinalized = false;
  state.selectedId = null;
  state.subPlans = [];
  state.planningBenchId = null;
  state.planningPosition = null;
  state.selectedLineupSlot = null;
  state.halfActionIsEnd = false;
  state.activeGoalieId = state.goalie1Id;
  state.benchSort = 'name';
  document.getElementById('sort-name-btn').classList.add('active');
  document.getElementById('sort-time-btn').classList.remove('active');
  document.getElementById('sort-priority-btn').classList.remove('active');

  document.getElementById('half-pill').textContent = 'HALF 1';
  document.getElementById('action-btn').textContent = 'HALF';
  document.getElementById('pause-btn').textContent = '\u25B6 START';
  document.getElementById('pause-btn').style.background = '#e65100';
  document.getElementById('pause-btn').style.display = '';

  document.getElementById('score-us-label').textContent = state.teamName || 'My Team';
  document.getElementById('score-them-label').textContent = state.opponentName || 'Opponent';
  showScreen('game-screen');
  document.dispatchEvent(new CustomEvent('game:started'));
}

export function createFieldDragPreview(player, position) {
  const [avatarBg, avatarContent] = avatarParts(player.id, player.name);
  const preview = document.createElement('div');
  preview.className = 'field-drag-preview';
  preview.innerHTML = `
    <div class="pos-label">${position || ''}</div>
    <div class="pos-avatar" style="${avatarBg}">${avatarContent}</div>
    <div class="pos-name">${escHtml(player.name)}</div>
  `;
  document.body.appendChild(preview);
  return preview;
}

export function moveFieldDragPreview(preview, x, y) {
  if (!preview) return;
  preview.style.left = x + 'px';
  preview.style.top = y + 'px';
}

export function findNearestSlot(x, y, containerSelector, snapPx = 56) {
  const hit = document.elementFromPoint(x, y)?.closest('.pos-slot');
  if (hit?.dataset.position && hit.closest(containerSelector)) return hit;

  let nearest = null;
  let minDist = snapPx;
  document.querySelectorAll(`${containerSelector} .pos-slot[data-position]`).forEach(slot => {
    const r = slot.getBoundingClientRect();
    const dist = Math.hypot(x - (r.left + r.right) / 2, y - (r.top + r.bottom) / 2);
    if (dist < minDist) { minDist = dist; nearest = slot; }
  });
  return nearest;
}

export function removeFieldDragPreview(preview) {
  if (preview) preview.remove();
}
