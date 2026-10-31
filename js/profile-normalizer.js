const VALID_POSITIONS = new Set(['LF', 'CF', 'RF', 'LM', 'CM', 'RM', 'LD', 'RD', 'GK']);
const MAX_TEAM_NAME_LEN = 30;
const MAX_PLAYER_NAME_LEN = 30;
const MAX_HALF_MINUTES = 90;

function cleanText(value, maxLen) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLen);
}

function toNonNegativeInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

function toPlayerId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function normalizeHalfMinutes(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_HALF_MINUTES, Math.max(1, Math.round(n)));
}

function normalizePhoto(value) {
  if (typeof value !== 'string') return null;
  return /^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i.test(value) ? value : null;
}

function normalizePositionSeconds(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([pos]) => VALID_POSITIONS.has(pos))
      .map(([pos, seconds]) => [pos, toNonNegativeInt(seconds)])
      .filter(([, seconds]) => seconds > 0)
  );
}

function normalizeLineupMap(value, validPlayerIds = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const lineup = {};
  const assignedPlayerIds = new Set();
  Object.entries(value).forEach(([position, rawPlayerId]) => {
    const playerId = toPlayerId(rawPlayerId);
    if (!VALID_POSITIONS.has(position) || playerId === null) return;
    if (validPlayerIds && !validPlayerIds.has(playerId)) return;
    if (assignedPlayerIds.has(playerId)) return;
    lineup[position] = playerId;
    assignedPlayerIds.add(playerId);
  });

  return Object.keys(lineup).length ? lineup : null;
}

function normalizeSubRound(value, baseLineup, validPlayerIds) {
  if (!Array.isArray(value)) return null;
  const round = [];
  const seenIds = new Set();
  const seenPos = new Set();
  value.forEach(pair => {
    if (!pair || typeof pair !== 'object') return;
    const inId = toPlayerId(pair.inId);
    const pos = pair.pos;
    if (inId === null || !VALID_POSITIONS.has(pos)) return;
    if (validPlayerIds && !validPlayerIds.has(inId)) return;
    if (seenIds.has(inId) || seenPos.has(pos)) return;
    seenIds.add(inId);
    seenPos.add(pos);
    round.push({ inId, pos });
  });
  return round.length ? round : null;
}

export function normalizeSubRounds(value, baseLineup, validPlayerIds = null) {
  if (!baseLineup || !Array.isArray(value)) return [];
  return value
    .map(round => normalizeSubRound(round, baseLineup, validPlayerIds))
    .filter(Boolean);
}

function normalizePlannedLineups(value, validPlayerIds = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const half1 = normalizeLineupMap(value.half1, validPlayerIds);
  const half2 = normalizeLineupMap(value.half2, validPlayerIds);
  if (!half1 && !half2) return null;
  return {
    ...(half1 ? { half1 } : {}),
    ...(half2 ? { half2 } : {}),
  };
}

export function normalizeGamePlan(value, {
  validPlayerIds = null,
  defaultGameNumber = null,
} = {}) {
  const lineups = normalizePlannedLineups(value, validPlayerIds);
  if (!lineups) return null;
  const gameNumber = toPlayerId(value.gameNumber) ?? toPlayerId(defaultGameNumber);
  if (gameNumber === null) return null;
  const half1Subs = lineups.half1 ? normalizeSubRounds(value.half1Subs, lineups.half1, validPlayerIds) : [];
  const half2Subs = lineups.half2 ? normalizeSubRounds(value.half2Subs, lineups.half2, validPlayerIds) : [];
  const lineupPlayerIds = Object.values(lineups).flatMap(lineup => Object.values(lineup));
  const playerIds = Array.isArray(value.playerIds)
    ? value.playerIds.map(toPlayerId).filter(id => id !== null)
    : [];
  const uniquePlayerIds = [...new Set(playerIds)]
    .filter(id => !validPlayerIds || validPlayerIds.has(id));
  const plannedPlayerIds = [...new Set([...uniquePlayerIds, ...lineupPlayerIds])];
  const date = cleanText(value.date, 20);
  const opponent = cleanText(value.opponent, 30);

  return {
    gameNumber,
    ...(Number.isInteger(value.plannedThroughQuarter) && value.plannedThroughQuarter >= 1 && value.plannedThroughQuarter <= 4
      ? { plannedThroughQuarter: value.plannedThroughQuarter } : {}),
    ...(date ? { date } : {}),
    ...(opponent ? { opponent } : {}),
    playerIds: plannedPlayerIds,
    ...lineups,
    ...(half1Subs.length ? { half1Subs } : {}),
    ...(half2Subs.length ? { half2Subs } : {}),
  };
}

function normalizeGoal(goal) {
  if (!goal || typeof goal !== 'object') return null;
  const team = goal.team === 'them' ? 'them' : goal.team === 'us' ? 'us' : null;
  if (!team) return null;

  const normalized = {
    scorer: team === 'us' ? cleanText(goal.scorer || '', MAX_PLAYER_NAME_LEN) || null : null,
    half: goal.half === 2 ? 2 : 1,
    team,
  };

  const scorerId = toPlayerId(goal.scorerId);
  if (scorerId !== null) normalized.scorerId = scorerId;

  return normalized;
}

function normalizeGameRecord(game) {
  if (!game || typeof game !== 'object') return null;

  const playerStats = Array.isArray(game.playerStats)
    ? game.playerStats.map(ps => {
        if (!ps || typeof ps !== 'object') return null;
        const id = toPlayerId(ps.id);
        const name = cleanText(ps.name, MAX_PLAYER_NAME_LEN);
        if (id === null || !name) return null;

        const secondsPlayed = toNonNegativeInt(ps.secondsPlayed ?? (Number(ps.minutesPlayed) * 60));
        const firstHalfSeconds = toNonNegativeInt(ps.firstHalfSeconds, secondsPlayed);
        const secondHalfSeconds = toNonNegativeInt(ps.secondHalfSeconds, Math.max(0, secondsPlayed - firstHalfSeconds));
        const positionSeconds = normalizePositionSeconds(ps.positionSeconds);

        return {
          id,
          name,
          minutesPlayed: Math.round(secondsPlayed / 60 * 10) / 10,
          secondsPlayed,
          firstHalfSeconds,
          secondHalfSeconds,
          positionSeconds,
          positionMinutes: Object.fromEntries(
            Object.entries(positionSeconds).map(([pos, seconds]) => [pos, Math.round(seconds / 60 * 10) / 10])
          ),
        };
      }).filter(Boolean)
    : [];

  const normalized = {
    date: cleanText(game.date, 20),
    opponent: cleanText(game.opponent, 30),
    ourScore: toNonNegativeInt(game.ourScore),
    theirScore: toNonNegativeInt(game.theirScore),
    goals: Array.isArray(game.goals) ? game.goals.map(normalizeGoal).filter(Boolean) : [],
    playerStats,
  };
  const plannedLineups = normalizePlannedLineups(game.plannedLineups);
  if (plannedLineups) normalized.plannedLineups = plannedLineups;
  return normalized;
}

export function normalizeProfile(profile, {
  defaultHalfMinutes = 25,
  defaultTeamName = 'My Team',
  requireRoster = false,
  requireGames = false,
} = {}) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new Error('Profile must be an object.');
  }
  if (requireRoster && !Array.isArray(profile.roster)) {
    throw new Error('Profile is missing a roster.');
  }
  if (requireGames && !Array.isArray(profile.games)) {
    throw new Error('Profile is missing game records.');
  }

  const roster = Array.isArray(profile.roster)
    ? profile.roster.map(p => {
        if (!p || typeof p !== 'object') return null;
        const id = toPlayerId(p.id);
        const name = cleanText(p.name, MAX_PLAYER_NAME_LEN);
        if (id === null || !name) return null;
        return { id, name, photo: normalizePhoto(p.photo) };
      }).filter(Boolean)
    : null;

  if (requireRoster && (!roster || roster.length === 0)) {
    throw new Error('Profile does not contain any valid roster players.');
  }

  const seenRosterIds = new Set();
  const uniqueRoster = roster
    ? roster.filter(p => {
        if (seenRosterIds.has(p.id)) return false;
        seenRosterIds.add(p.id);
        return true;
      })
    : null;

  const games = Array.isArray(profile.games)
    ? profile.games.map(normalizeGameRecord).filter(Boolean)
    : [];

  const validPlayerIds = uniqueRoster ? new Set(uniqueRoster.map(p => p.id)) : null;
  const gamePlan = normalizeGamePlan(profile.gamePlan, { validPlayerIds });
  const seenPlanNumbers = new Set();
  const queuedPlans = (Array.isArray(profile.queuedPlans) ? profile.queuedPlans : [])
    .map(plan => normalizeGamePlan(plan, { validPlayerIds }))
    .filter(plan => {
      if (!plan || seenPlanNumbers.has(plan.gameNumber)) return false;
      seenPlanNumbers.add(plan.gameNumber);
      return true;
    })
    .slice(0, 10);

  if (requireGames && games.length === 0) {
    throw new Error('Profile does not contain any valid game records.');
  }

  return {
    teamName: cleanText(profile.teamName, MAX_TEAM_NAME_LEN) || defaultTeamName,
    halfMinutes: normalizeHalfMinutes(profile.halfMinutes, defaultHalfMinutes),
    roster: uniqueRoster,
    games,
    gamePlan,
    queuedPlans,
  };
}
