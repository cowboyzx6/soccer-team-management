// @ts-check
import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__STM_DISABLE_SW__ = true;
  });

  page.on('pageerror', error => {
    throw error;
  });

  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('team setup opens and roster can be added', async ({ page }) => {
  await page.getByRole('button', { name: /Set Up My Team/i }).click();

  await expect(page.locator('#team-setup-screen')).toHaveClass(/active/);

  await page.locator('#team-name-input').fill('Oyster Blueberries');
  await page.locator('#new-player-input').fill('Avery');
  await page.locator('#add-player-btn').click();

  await expect(page.locator('#roster-list')).toContainText('Avery');
  await expect(page.locator('#app-title-name')).toHaveText('Oyster Blueberries');
});

test('attendance can reach lineup screen', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('soccerRoster', JSON.stringify([{ id: 1, name: 'Avery' }]));
    localStorage.setItem('soccerSettings', JSON.stringify({ teamName: 'Oyster Blueberries', halfMinutes: 25 }));
  });

  await page.reload();
  await page.locator('#opponent-input').fill('Blue Team');
  await page.locator('#tile-1').click();
  await page.locator('#start-btn').click();

  await expect(page.locator('#gk-picker-modal')).not.toHaveClass(/hidden/);
  await page.locator('#gk-picker-skip-btn').click();

  await expect(page.locator('#lineup-screen')).toHaveClass(/active/);
  await expect(page.locator('#lineup-header-title')).toContainText('Oyster Blueberries');
});

test('restore backup normalizes profile data and clears stale photos', async ({ page }, testInfo) => {
  const profilePath = testInfo.outputPath('restore-profile.json');
  await fs.writeFile(profilePath, JSON.stringify({
    teamName: ' Restored Team ',
    halfMinutes: '30',
    roster: [
      { id: '1', name: ' Avery ' },
      { id: '1', name: 'Duplicate Avery' },
      { id: 'bad', name: 'Invalid' },
    ],
    games: [{
      date: '2026-05-09',
      opponent: ' Blue Team ',
      ourScore: '2',
      theirScore: '1',
      goals: [{ team: 'us', scorer: 'Avery', scorerId: '1', half: 'bad' }],
      playerStats: [{
        id: '1',
        name: 'Avery',
        secondsPlayed: '600',
        firstHalfSeconds: '300',
        secondHalfSeconds: '300',
        positionSeconds: { GK: '120', BAD: '999' },
      }],
    }],
  }), 'utf8');

  await page.evaluate(() => {
    localStorage.setItem('playerPhotos', JSON.stringify({ 1: 'data:image/png;base64,OLDPHOTO' }));
    localStorage.setItem('soccerActiveGame', JSON.stringify({
      players: [{ id: 99, name: 'Stale Player' }],
      opponentName: 'Stale Team',
    }));
  });

  await page.setInputFiles('#import-file-input', profilePath);

  await expect(page.locator('#app-title-name')).toHaveText('Restored Team');
  await expect(page.locator('#half-minutes-display')).toHaveText('30 min');
  await expect(page.locator('#roster-list')).toContainText('Avery');
  await expect(page.locator('#roster-list')).not.toContainText('Duplicate Avery');

  const stored = await page.evaluate(() => ({
    roster: JSON.parse(localStorage.getItem('soccerRoster') || '[]'),
    settings: JSON.parse(localStorage.getItem('soccerSettings') || '{}'),
    history: JSON.parse(localStorage.getItem('soccerGameHistory') || '[]'),
    photos: localStorage.getItem('playerPhotos'),
    activeGame: localStorage.getItem('soccerActiveGame'),
  }));

  expect(stored.roster).toEqual([{ id: 1, name: 'Avery' }]);
  expect(stored.settings).toEqual({ teamName: 'Restored Team', halfMinutes: 30, minPlayMinutes: 0 });
  expect(stored.history[0].playerStats[0].positionSeconds).toEqual({ GK: 120 });
  expect(stored.history[0].goals[0].scorerId).toBe(1);
  expect(stored.photos).toBeNull();
  expect(stored.activeGame).toBeNull();
});

test('start new season clears roster history and photos but keeps settings', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('soccerRoster', JSON.stringify([{ id: 3, name: 'Avery' }]));
    localStorage.setItem('soccerSettings', JSON.stringify({
      teamName: 'Oyster Blueberries',
      halfMinutes: 30,
      minPlayMinutes: 15,
    }));
    localStorage.setItem('soccerGameHistory', JSON.stringify([{
      date: '2026-05-09',
      opponent: 'Blue Team',
      ourScore: 2,
      theirScore: 1,
      playerStats: [{ id: 3, name: 'Avery', secondsPlayed: 900 }],
    }]));
    localStorage.setItem('playerPhotos', JSON.stringify({ 3: 'data:image/png;base64,OLDPHOTO' }));
  });

  await page.reload();
  await expect(page.locator('#setup-screen')).toHaveClass(/active/);
  await page.locator('#overflow-menu-btn').click();
  await page.locator('#team-settings-btn').click();
  await page.evaluate(() => {
    localStorage.setItem('soccerActiveGame', JSON.stringify({
      players: [{ id: 3, name: 'Avery' }],
      opponentName: 'Paused Game',
    }));
  });
  await page.locator('#new-season-btn').click();
  await expect(page.locator('#new-season-modal')).not.toHaveClass(/hidden/);
  await page.getByRole('button', { name: /Start Fresh/i }).click();

  await expect(page.locator('#team-setup-screen')).toHaveClass(/active/);
  await expect(page.locator('#roster-list')).toContainText('No players yet');
  await expect(page.locator('#team-name-input')).toHaveValue('Oyster Blueberries');

  const stored = await page.evaluate(() => ({
    roster: JSON.parse(localStorage.getItem('soccerRoster') || '[]'),
    settings: JSON.parse(localStorage.getItem('soccerSettings') || '{}'),
    history: JSON.parse(localStorage.getItem('soccerGameHistory') || '[]'),
    photos: localStorage.getItem('playerPhotos'),
    activeGame: localStorage.getItem('soccerActiveGame'),
  }));

  expect(stored.roster).toEqual([]);
  expect(stored.settings).toEqual({
    teamName: 'Oyster Blueberries',
    halfMinutes: 30,
    minPlayMinutes: 15,
  });
  expect(stored.history).toEqual([]);
  expect(stored.photos).toBeNull();
  expect(stored.activeGame).toBeNull();
});

test('league CSV import skips duplicate names within the file', async ({ page }, testInfo) => {
  const csvPath = testInfo.outputPath('league-roster.csv');
  await fs.writeFile(csvPath, [
    'player_first_name,player_last_name',
    'Avery,Smith',
    'Avery,Smith',
    'Blair,Jones',
  ].join('\n'), 'utf8');

  page.on('dialog', dialog => dialog.accept());
  await page.setInputFiles('#csv-file-input', csvPath);

  await expect.poll(async () => {
    const roster = await page.evaluate(() => JSON.parse(localStorage.getItem('soccerRoster') || '[]'));
    return roster.map(p => p.name);
  }).toEqual(['Avery S.', 'Blair J.']);
});

test('review game import validates and renders normalized game data', async ({ page }, testInfo) => {
  const reviewPath = testInfo.outputPath('review-game.json');
  await fs.writeFile(reviewPath, JSON.stringify({
    teamName: 'Review Team',
    games: [{
      date: '2026-05-09',
      opponent: 'Blue Team',
      ourScore: '2',
      theirScore: '1',
      goals: [
        { team: 'us', scorer: 'Avery', scorerId: '1', half: 1 },
        { team: 'us', scorer: 'Blair', scorerId: '2', half: 1 },
        { team: 'us', scorer: 'Blair', scorerId: '2', half: 2 },
        { team: 'them', scorer: null, half: 2 },
      ],
      playerStats: [{
        id: '1',
        name: 'Avery',
        secondsPlayed: '600',
        firstHalfSeconds: '300',
        secondHalfSeconds: '300',
        positionSeconds: { GK: '120' },
      }],
    }],
  }), 'utf8');

  await page.setInputFiles('#review-file-input', reviewPath);

  await expect(page.locator('#summary-screen')).toHaveClass(/active/);
  await expect(page.locator('#summary-team-name')).toHaveText('Review Team');
  await expect(page.locator('#summary-vs-line')).toContainText('vs Blue Team');
  await expect(page.locator('#summary-vs-line')).toContainText('2');
  await expect(page.locator('#summary-vs-line')).toContainText('1');
  await expect(page.locator('#summary-body')).toContainText('Avery');
  await expect(page.locator('#summary-body')).toContainText('GK');
  await expect(page.locator('#summary-goals')).toContainText('Avery');
  await expect(page.locator('#summary-goals')).not.toContainText('Blue Team');
  await expect(page.locator('.summary-goal-item').first()).toContainText('Blair');
  await expect(page.locator('#summary-export-btn')).toBeHidden();
});

test('season review includes roster players with no recorded appearances', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('soccerRoster', JSON.stringify([
      { id: 1, name: 'Avery' },
      { id: 2, name: 'Blair' },
    ]));
    localStorage.setItem('soccerSettings', JSON.stringify({ teamName: 'Oyster Blueberries', halfMinutes: 25 }));
    localStorage.setItem('soccerGameHistory', JSON.stringify([{
      date: '2026-05-09',
      opponent: 'Blue Team',
      ourScore: 1,
      theirScore: 0,
      goals: [{ team: 'us', scorer: 'Avery', scorerId: 1, half: 1 }],
      playerStats: [{
        id: 1,
        name: 'Avery',
        secondsPlayed: 600,
        positionSeconds: { CF: 600 },
      }],
    }]));
  });

  await page.reload();
  await page.locator('#overflow-menu-btn').click();
  await page.locator('#review-season-btn').click();

  await expect(page.locator('#season-summary-screen')).toHaveClass(/active/);
  await expect(page.locator('#season-meta')).toHaveText('1 game · 2 players');
  await expect(page.locator('#season-body')).toContainText('Avery');
  await expect(page.locator('#season-body')).toContainText('Blair');
});

test('ended game does not save a stale active game on reload prompt', async ({ page }) => {
  const stored = await page.evaluate(async () => {
    const [{ state }, { endGame }] = await Promise.all([
      import('/js/state.js'),
      import('/js/game.js'),
    ]);

    state.teamName = 'Oyster Blueberries';
    state.opponentName = 'Blue Team';
    state.gameDate = '2026-05-09';
    state.scoreUs = 1;
    state.scoreThem = 0;
    state.goals = [{ team: 'us', scorer: 'Avery', scorerId: 1, half: 1 }];
    state.totalElapsed = 600;
    state.halfClock = 0;
    state.currentHalf = 2;
    state.players = [{
      id: 1,
      name: 'Avery',
      onField: false,
      totalPlayed: 600,
      subInAt: null,
      h1Snapshot: 300,
      position: null,
      positionTime: { CF: 600 },
      positionStart: null,
    }];

    endGame();
    window.dispatchEvent(new Event('beforeunload'));

    return {
      activeGame: localStorage.getItem('soccerActiveGame'),
      history: JSON.parse(localStorage.getItem('soccerGameHistory') || '[]'),
    };
  });

  expect(stored.activeGame).toBeNull();
  expect(stored.history).toHaveLength(1);
});

test('goal button disables when the game is paused', async ({ page }) => {
  const buttonState = await page.evaluate(async () => {
    const [{ state }, { resumeGame, pauseGame }] = await Promise.all([
      import('/js/state.js'),
      import('/js/game.js'),
    ]);

    state.halfClock = 1500;
    state.totalElapsed = 0;

    resumeGame();
    const runningDisabled = document.getElementById('goal-btn').disabled;
    pauseGame();
    const pausedDisabled = document.getElementById('goal-btn').disabled;

    return { runningDisabled, pausedDisabled };
  });

  expect(buttonState.runningDisabled).toBe(false);
  expect(buttonState.pausedDisabled).toBe(true);
});

test('halftime lineup can be edited before the 2nd half starts', async ({ page }) => {
  await page.evaluate(async () => {
    const [{ state }, { handleHalfEnd }] = await Promise.all([
      import('/js/state.js'),
      import('/js/game.js'),
    ]);

    const mk = (id, name, position) => ({
      id, name,
      onField: !!position,
      totalPlayed: 0,
      subInAt: position ? 0 : null,
      h1Snapshot: null,
      position: position || null,
      positionTime: {},
      positionStart: position ? 0 : null,
      benchSince: position ? null : 0,
    });

    state.teamName = 'Oyster Blueberries';
    state.halfMinutes = 25;
    state.totalElapsed = 1500;
    state.halfClock = 0;
    state.currentHalf = 1;
    state.players = [mk(1, 'Avery', 'GK'), mk(2, 'Blake', 'CF'), mk(3, 'Casey')];
    state.goalie1Id = 1;
    state.goalie2Id = 2;
    state.gamePlan = { half2: { GK: 2, CF: 1 } };
    handleHalfEnd();
  });

  await expect(page.locator('#half-edit-lineup-btn')).toBeVisible();

  // Back from the editor returns to the halftime modal without starting the half.
  await page.locator('#half-edit-lineup-btn').click();
  await expect(page.locator('#lineup-screen')).toHaveClass(/active/);
  await page.locator('#lineup-back-btn').click();
  await expect(page.locator('#game-screen')).toHaveClass(/active/);
  await expect(page.locator('#half-modal')).not.toHaveClass(/hidden/);

  // Edit: swap Casey in for Avery at CF, then start the half.
  await page.locator('#half-edit-lineup-btn').click();
  await expect(page.locator('#lineup-field-positions [data-position="GK"]')).toContainText('Blake');
  await expect(page.locator('#lineup-field-positions [data-position="CF"]')).toContainText('Avery');
  await page.locator('#lineup-field-positions [data-position="CF"]').click();
  await page.locator('#lineup-unassigned-list .lineup-player[data-player-id="3"]').click();
  await page.locator('#lineup-field-positions [data-position="CF"]').click();
  await expect(page.locator('#launch-btn')).toHaveText(/Start 2nd Half/);
  await page.locator('#launch-btn').click();

  await expect(page.locator('#game-screen')).toHaveClass(/active/);
  const result = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    return {
      half: state.currentHalf,
      onField: state.players.filter(p => p.onField).map(p => [p.id, p.position]).sort(),
      goalie2Id: state.goalie2Id,
      activeGoalieId: state.activeGoalieId,
      isRunning: state.isRunning,
    };
  });
  expect(result).toEqual({
    half: 2,
    onField: [[2, 'GK'], [3, 'CF']],
    goalie2Id: 2,
    activeGoalieId: 2,
    isRunning: false,
  });
});

// ---------- Live-game substitution helpers ----------
async function startLiveGame(page) {
  await page.evaluate(async () => {
    const [{ state }, { showScreen }, { renderGame }] = await Promise.all([
      import('/js/state.js'),
      import('/js/utils.js'),
      import('/js/game.js'),
    ]);
    const mk = (id, name, position) => ({
      id, name,
      onField: !!position,
      totalPlayed: 0,
      subInAt: position ? 0 : null,
      h1Snapshot: null,
      position: position || null,
      positionTime: {},
      positionStart: position ? 0 : null,
      benchSince: position ? null : 0,
    });
    state.teamName = 'Oyster Blueberries';
    state.opponentName = 'Blue Team';
    state.halfMinutes = 25;
    state.totalElapsed = 0;
    state.halfClock = 1500;
    state.currentHalf = 1;
    state.isRunning = false;
    state.players = [mk(1, 'Avery', 'GK'), mk(2, 'Blake', 'CF'), mk(3, 'Casey', 'LM'), mk(4, 'Devon'), mk(5, 'Emery')];
    state.goalie1Id = 1;
    state.goalie2Id = null;
    state.activeGoalieId = 1;
    state.subPlans = [];
    state.subPick = null;
    state.goals = [];
    state.scoreUs = 0;
    state.scoreThem = 0;
    showScreen('game-screen');
    renderGame();
  });
}

function readSubState(page) {
  return page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    return {
      plans: state.subPlans.map(pl => [pl.inId, pl.pos]).sort(),
      onField: state.players.filter(p => p.onField).map(p => [p.id, p.position]).sort(),
      activeGoalieId: state.activeGoalieId,
      subPick: state.subPick,
    };
  });
}

const fieldSlot = (page, pos) => page.locator(`#field-positions [data-position="${pos}"]`);
const benchCard = (page, id) => page.locator(`#bench-grid .player-card[data-player-id="${id}"]`);
const STARTING_FIELD = [[1, 'GK'], [2, 'CF'], [3, 'LM']];

test('sub pairs are the same in either tap order and wait for Sub Now', async ({ page }) => {
  await startLiveGame(page);

  await benchCard(page, 4).click();
  await fieldSlot(page, 'CF').click();
  await fieldSlot(page, 'LM').click();
  await benchCard(page, 5).click();

  const s = await readSubState(page);
  expect(s.plans).toEqual([[4, 'CF'], [5, 'LM']]);
  expect(s.onField).toEqual(STARTING_FIELD);
  expect(s.subPick).toBeNull();
  await expect(fieldSlot(page, 'CF')).toContainText('Devon');
});

test('empty-slot pairs wait for Sub Now and re-pairing replaces the old pair', async ({ page }) => {
  await startLiveGame(page);

  await benchCard(page, 4).click();
  await fieldSlot(page, 'RF').click();
  expect((await readSubState(page)).plans).toEqual([[4, 'RF']]);
  expect((await readSubState(page)).onField).toEqual(STARTING_FIELD);

  await benchCard(page, 4).click();
  await fieldSlot(page, 'CF').click();
  expect((await readSubState(page)).plans).toEqual([[4, 'CF']]);

  await benchCard(page, 5).click();
  await fieldSlot(page, 'CF').click();
  expect((await readSubState(page)).plans).toEqual([[5, 'CF']]);

  // Tapping a paired player picks it; it does not cancel the pair.
  await benchCard(page, 5).click();
  let s = await readSubState(page);
  expect(s.plans).toEqual([[5, 'CF']]);
  expect(s.subPick).toEqual({ zone: 'bench', id: 5 });
  await expect(benchCard(page, 5)).toHaveClass(/planning-active/);

  // Tapping it again clears the pick.
  await benchCard(page, 5).click();
  s = await readSubState(page);
  expect(s.subPick).toBeNull();
});

test('removing a paired player from the game drops their pair', async ({ page }) => {
  await startLiveGame(page);

  await benchCard(page, 4).click();
  await fieldSlot(page, 'CF').click();
  await benchCard(page, 4).locator('.btn-remove-player').click();
  await page.locator('#remove-player-confirm-btn').click();

  const s = await readSubState(page);
  expect(s.plans).toEqual([]);
  expect(s.subPick).toBeNull();
});

test('resuming an old saved game drops stale sub plans and picks', async ({ page }) => {
  await page.evaluate(() => {
    const mk = (id, name, position) => ({
      id, name, onField: !!position, totalPlayed: 0, subInAt: position ? 0 : null,
      h1Snapshot: null, position: position || null, positionTime: {},
      positionStart: position ? 0 : null, benchSince: position ? null : 0,
    });
    localStorage.setItem('soccerActiveGame', JSON.stringify({
      players: [mk(1, 'Avery', 'GK'), mk(2, 'Blake', 'CF'), mk(4, 'Devon')],
      totalElapsed: 60, halfClock: 1440, currentHalf: 1,
      goalie1Id: 1, activeGoalieId: 1, opponentName: 'Blue Team', halfMinutes: 25,
      subPlans: [{ inId: 4, pos: 'CF' }, { inId: 2, pos: 'LM' }, { inId: 4, pos: 'XX' }],
      planningBenchId: 4, planningPosition: 'LM', selectedId: 2,
    }));
  });
  page.on('dialog', d => d.accept());
  await page.reload();
  await expect(page.locator('#game-screen')).toHaveClass(/active/);

  const s = await readSubState(page);
  expect(s.plans).toEqual([[4, 'CF']]);
  expect(s.subPick).toBeNull();
});
