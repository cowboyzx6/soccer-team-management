import { FIELD_SVG, state } from './state.js';
import {
  checkForActiveGame,
  exportProfile,
  importGameReview,
  importLeagueCsv,
  importProfile,
  initEventListeners as initPersistenceListeners,
  loadGameHistory,
  loadGamePlan,
  loadRoster,
  loadSettings,
  saveActiveGame,
  saveSettings
} from './persistence.js';
import {
  addRosterPlayer,
  changeHalfMinutes,
  changeMinPlayMinutes,
  checkAllPlayers,
  closeRemoveRosterModal,
  closeRenameModal,
  confirmRemoveRosterPlayer,
  confirmRename,
  initEventListeners as initRosterListeners,
  loadPhotos,
  renderGameDayCheckboxes,
  renderRoster,
  renderTeamSetupRoster,
  updatePlanAheadStatus,
  updateStartBtn
} from './roster.js';
import {
  backupBeforeNewSeason,
  closeClearDataModal,
  closeNewSeasonModal,
  closeOverflowMenu,
  confirmClearData,
  confirmStartNewSeason,
  executeClearData,
  executeStartNewSeason,
  goBackFromTeamSetup,
  goToSetup,
  goToTeamSetup,
  openAboutModal,
  setSeasonSort,
  showGameReviewFromRecord,
  showSeasonSummary,
  toggleOverflowMenu
} from './summary.js';
import {
  cancelGoalieSpin,
  clearGamePlan,
  confirmGkFromSpin,
  confirmGoalies,
  goBackFromLineup,
  goToLineup,
  goToPlanAhead,
  handleLaunchClick,
  handleLineupPointerDown,
  handleLineupPointerMove,
  handleLineupPointerUp,
  nextGoaliePick,
  openGkSpin,
  skipGkPicker,
  spinAgain,
  spinWheel,
  stopWheel
} from './lineup.js';
import {
  adjustTheirScore,
  closeGoalModal,
  closeHalfModal,
  closeLateModal,
  closeRemovePlayerModal,
  confirmGoal,
  confirmHalfAction,
  confirmRemovePlayer,
  confirmTheirScore,
  editHalf2Lineup,
  endGame,
  executeAllPlans,
  handleFieldSlotPointerDown,
  handleFieldSlotPointerMove,
  handleFieldSlotPointerUp,
  handleHalfEnd,
  isFieldClickSuppressed,
  moveFieldPlayerToBench,
  openGoalModal,
  openLateModal,
  pauseGame,
  promptRemovePlayer,
  recordGoal,
  renderClock,
  renderGame,
  renderScore,
  returnToHalftime,
  setBenchSort,
  startSecondHalfWithLineup,
  syncGamePhaseUi,
  togglePause,
  undoLastGoal,
  updateGoalBtn,
  useHalf2Plan
} from './game.js';
import { applyTheme, closeModal, toggleTheme } from './utils.js';

function onTeamNameInput() {
  const val = document.getElementById('team-name-input').value.trim();
  document.getElementById('app-title-name').textContent = val || 'My Team';
  updateStartBtn();
}


document.addEventListener('click', e => {
  const menu = document.getElementById('overflow-menu');
  if (!menu || menu.style.display === 'none') return;
  if (!menu.contains(e.target) && !document.getElementById('overflow-menu-btn').contains(e.target)) {
    closeOverflowMenu();
  }
});

document.addEventListener('photo:updated', () => renderRoster());

document.addEventListener('game:resumed', () => {
  syncGamePhaseUi();
  renderClock();
  renderScore();
  renderGame();
  updateGoalBtn();
  pauseGame();
});

document.addEventListener('game:started', () => {
  renderScore();
  renderClock();
  renderGame();
});

document.addEventListener('league-csv:imported', () => {
  renderTeamSetupRoster();
  renderGameDayCheckboxes();
});

document.addEventListener('profile:imported', e => {
  renderRoster(!!e.detail?.restoredPlan);
  updateStartBtn();
});

document.addEventListener('gameplan:saved', updatePlanAheadStatus);

document.addEventListener('game-review:loaded', e => {
  showGameReviewFromRecord(e.detail.gameRecord, e.detail.teamName);
});

document.getElementById('lineup-field-diagram').insertAdjacentHTML('afterbegin', FIELD_SVG);
document.getElementById('game-field-diagram').insertAdjacentHTML('afterbegin', FIELD_SVG);
applyTheme(localStorage.getItem('theme') || 'dark');
initPersistenceListeners();
initRosterListeners();
loadPhotos();
loadSettings();
loadGameHistory();
loadRoster();
loadGamePlan();
renderTeamSetupRoster();
renderGameDayCheckboxes(!!state.gamePlan);
updatePlanAheadStatus();
checkForActiveGame();

window.addEventListener('beforeunload', () => {
  if (state.players.length > 0 && !state.gameFinalized) saveActiveGame();
});

document.getElementById('theme-btn').addEventListener('click', toggleTheme);
document.getElementById('overflow-menu-btn').addEventListener('click', toggleOverflowMenu);
document.getElementById('review-game-btn').addEventListener('click', () => {
  importGameReview();
  closeOverflowMenu();
});
document.getElementById('review-season-btn').addEventListener('click', () => {
  showSeasonSummary();
  closeOverflowMenu();
});
document.getElementById('team-settings-btn').addEventListener('click', () => {
  goToTeamSetup();
  closeOverflowMenu();
});
document.getElementById('about-btn').addEventListener('click', () => {
  openAboutModal();
  closeOverflowMenu();
});
document.getElementById('setup-empty-btn').addEventListener('click', goToTeamSetup);
document.getElementById('game-date-input').addEventListener('input', e => {
  state.gameDate = e.target.value;
});
document.getElementById('opponent-input').addEventListener('input', updateStartBtn);
document.getElementById('check-all-btn').addEventListener('click', checkAllPlayers);
document.getElementById('half-minus-btn').addEventListener('click', () => changeHalfMinutes(-1));
document.getElementById('half-plus-btn').addEventListener('click', () => changeHalfMinutes(1));
document.getElementById('min-play-minus-btn').addEventListener('click', () => changeMinPlayMinutes(-5));
document.getElementById('min-play-plus-btn').addEventListener('click', () => changeMinPlayMinutes(5));
document.getElementById('start-btn').addEventListener('click', goToLineup);
document.getElementById('plan-ahead-btn').addEventListener('click', goToPlanAhead);
document.getElementById('plan-ahead-clear-btn').addEventListener('click', () => {
  if (confirm('Clear the planned lineups for both halves?')) clearGamePlan();
});
document.getElementById('team-setup-back-btn').addEventListener('click', goBackFromTeamSetup);
document.getElementById('import-csv-btn').addEventListener('click', importLeagueCsv);
document.getElementById('restore-backup-btn').addEventListener('click', importProfile);
document.getElementById('backup-team-btn').addEventListener('click', () => exportProfile());
document.getElementById('team-name-input').addEventListener('input', onTeamNameInput);
document.getElementById('team-name-input').addEventListener('blur', saveSettings);
document.getElementById('add-player-btn').addEventListener('click', addRosterPlayer);
document.getElementById('new-season-btn').addEventListener('click', confirmStartNewSeason);
document.getElementById('new-season-backup-btn').addEventListener('click', backupBeforeNewSeason);
document.getElementById('new-season-confirm-btn').addEventListener('click', executeStartNewSeason);
document.getElementById('new-season-cancel-btn').addEventListener('click', closeNewSeasonModal);
document.getElementById('clear-data-btn').addEventListener('click', confirmClearData);
document.getElementById('clear-confirm-btn').addEventListener('click', executeClearData);
document.getElementById('clear-cancel-btn').addEventListener('click', closeClearDataModal);
document.getElementById('about-close-btn').addEventListener('click', () => closeModal('about-modal'));
document.getElementById('lineup-back-btn').addEventListener('click', goBackFromLineup);
document.getElementById('launch-btn').addEventListener('click', handleLaunchClick);
document.getElementById('goal-btn').addEventListener('click', openGoalModal);
document.getElementById('undo-goal-btn').addEventListener('click', undoLastGoal);
document.getElementById('pause-btn').addEventListener('click', togglePause);
document.getElementById('action-btn').addEventListener('click', handleHalfEnd);
document.getElementById('sort-name-btn').addEventListener('click', () => setBenchSort('name'));
document.getElementById('sort-time-btn').addEventListener('click', () => setBenchSort('time'));
document.getElementById('sort-priority-btn').addEventListener('click', () => setBenchSort('priority'));
document.getElementById('late-arrival-btn').addEventListener('click', openLateModal);
document.getElementById('sub-now-btn').addEventListener('click', executeAllPlans);
document.getElementById('summary-export-btn').addEventListener('click', () => exportProfile(false, true));
document.getElementById('summary-home-btn').addEventListener('click', goToSetup);
document.getElementById('season-back-btn').addEventListener('click', goToSetup);
document.getElementById('season-sort-player').addEventListener('click', () => setSeasonSort('name'));
document.getElementById('season-sort-gp').addEventListener('click', () => setSeasonSort('games'));
document.getElementById('season-sort-goals').addEventListener('click', () => setSeasonSort('goals'));
document.getElementById('season-sort-time').addEventListener('click', () => setSeasonSort('seconds'));
document.getElementById('wheel-spin-btn').addEventListener('click', spinWheel);
document.getElementById('wheel-stop-btn').addEventListener('click', stopWheel);
document.getElementById('wheel-next-btn').addEventListener('click', nextGoaliePick);
document.getElementById('goalie-confirm-btn').addEventListener('click', confirmGoalies);
document.getElementById('gk-assign-btn').addEventListener('click', confirmGkFromSpin);
document.getElementById('wheel-spin-again-btn').addEventListener('click', spinAgain);
document.getElementById('wheel-cancel-btn').addEventListener('click', cancelGoalieSpin);
document.getElementById('remove-roster-confirm-btn').addEventListener('click', confirmRemoveRosterPlayer);
document.getElementById('remove-roster-cancel-btn').addEventListener('click', closeRemoveRosterModal);
document.getElementById('rename-confirm-btn').addEventListener('click', confirmRename);
document.getElementById('rename-cancel-btn').addEventListener('click', closeRenameModal);
document.getElementById('gk-picker-spin-btn').addEventListener('click', openGkSpin);
document.getElementById('gk-picker-skip-btn').addEventListener('click', skipGkPicker);
document.getElementById('late-cancel-btn').addEventListener('click', closeLateModal);
document.getElementById('remove-player-confirm-btn').addEventListener('click', confirmRemovePlayer);
document.getElementById('remove-player-cancel-btn').addEventListener('click', closeRemovePlayerModal);
document.getElementById('goal-us-btn').addEventListener('click', () => recordGoal('us'));
document.getElementById('goal-them-btn').addEventListener('click', () => recordGoal('them'));
document.getElementById('goal-no-scorer-btn').addEventListener('click', () => confirmGoal(null));
document.getElementById('their-score-minus-btn').addEventListener('click', () => adjustTheirScore(-1));
document.getElementById('their-score-plus-btn').addEventListener('click', () => adjustTheirScore(1));
document.getElementById('their-score-confirm-btn').addEventListener('click', confirmTheirScore);
document.getElementById('goal-cancel-btn').addEventListener('click', closeGoalModal);
document.getElementById('half-confirm-btn').addEventListener('click', confirmHalfAction);
document.getElementById('half-cancel-btn').addEventListener('click', closeHalfModal);
document.getElementById('half-end-early-btn').addEventListener('click', endGame);
document.getElementById('half-use-plan-btn').addEventListener('click', useHalf2Plan);
document.getElementById('half-edit-lineup-btn').addEventListener('click', editHalf2Lineup);
document.addEventListener('halftime-lineup:start', e => startSecondHalfWithLineup(e.detail.lineup));
document.addEventListener('halftime-lineup:cancel', returnToHalftime);

document.getElementById('field-positions').addEventListener('click', e => {
  if (isFieldClickSuppressed()) {
    e.stopImmediatePropagation();
    e.preventDefault();
    return;
  }
  const benchBtn = e.target.closest('.pos-bench-btn');
  if (benchBtn) {
    moveFieldPlayerToBench(parseInt(benchBtn.closest('[data-player-id]').dataset.playerId));
  }
}, true);

document.getElementById('field-positions').addEventListener('pointerdown', handleFieldSlotPointerDown);
window.addEventListener('pointermove', handleFieldSlotPointerMove, { passive: false });
window.addEventListener('pointerup', handleFieldSlotPointerUp);
window.addEventListener('pointercancel', handleFieldSlotPointerUp);

document.getElementById('lineup-screen').addEventListener('pointerdown', handleLineupPointerDown);
window.addEventListener('pointermove', handleLineupPointerMove, { passive: false });
window.addEventListener('pointerup', handleLineupPointerUp);
window.addEventListener('pointercancel', handleLineupPointerUp);

document.getElementById('bench-grid').addEventListener('click', e => {
  const removeBtn = e.target.closest('.btn-remove-player');
  if (removeBtn) {
    promptRemovePlayer(parseInt(removeBtn.closest('[data-player-id]').dataset.playerId));
  }
});

const isLocalPreview = ['localhost', '127.0.0.1'].includes(window.location.hostname);
if ('serviceWorker' in navigator && isLocalPreview) {
  navigator.serviceWorker.getRegistrations?.().then(registrations => {
    registrations.forEach(registration => registration.unregister());
  }).catch(() => {});
}

if ('serviceWorker' in navigator && !window.__STM_DISABLE_SW__ && !isLocalPreview) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
