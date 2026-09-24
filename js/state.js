export const state = {
  roster: [],
  players: [],
  totalElapsed: 0,
  halfClock: 0,
  currentHalf: 1,
  isRunning: false,
  timerBase: null,
  subPick: null,
  subPlans: [],
  benchSort: 'name',
  nextId: 1,
  halfActionIsEnd: false,
  halfMinutes: 25,
  minPlayMinutes: 0,
  goalie1Id: null,
  goalie2Id: null,
  activeGoalieId: null,
  gkPickerPhase: 1,
  goaliePickerSkipped: false,
  teamName: 'My Team',
  opponentName: '',
  gameDate: '',
  scoreUs: 0,
  scoreThem: 0,
  goals: [],
  gameHistory: [],
  seasonSortKey: 'seconds',
  seasonSortDir: 'desc',
  selectedLineupSlot: null,
  selectedLineupPlayer: null,
  lineupDraft: [],
  savedChecked: new Set(),
  playerPhotos: {},
  gameFinalized: false,
  gamePlan: null,
  isPrePlanning: false,
  prePlanHalf: null,
  isHalftimeEdit: false
};

export const POSITIONS = {
  LF: { x: 22, y: 8 }, CF: { x: 50, y: 8 }, RF: { x: 78, y: 8 },
  LM: { x: 16, y: 35 }, CM: { x: 50, y: 35 }, RM: { x: 84, y: 35 },
  LD: { x: 30, y: 62 }, RD: { x: 70, y: 62 },
  GK: { x: 50, y: 87 }
};

export const POSITION_ORDER = ['LF', 'CF', 'RF', 'LM', 'CM', 'RM', 'LD', 'RD', 'GK'];

export const FIELD_SVG = `<svg class="field-lines" viewBox="0 50 100 50" preserveAspectRatio="none">
  <path d="M3 50 H97 V99.2 H3 Z" fill="none" stroke="#5b965b" stroke-width="8" stroke-linejoin="miter" vector-effect="non-scaling-stroke"/>
  <circle cx="50" cy="50" r="11" fill="none" stroke="#5b965b" stroke-width="8" vector-effect="non-scaling-stroke"/>
  <circle cx="50" cy="50" r="1.2" fill="#5b965b"/>
  <path d="M26 99.2 V86 H74 V99.2" fill="none" stroke="#5b965b" stroke-width="8" stroke-linecap="butt" vector-effect="non-scaling-stroke"/>
  <path d="M37 99.2 V92 H63 V99.2" fill="none" stroke="#5b965b" stroke-width="8" stroke-linecap="butt" vector-effect="non-scaling-stroke"/>
  <text x="50" y="54" text-anchor="middle" font-size="2.8" fill="rgba(255,255,255,0.18)" font-family="sans-serif" font-weight="bold" letter-spacing="0.5">MIDFIELD</text>
</svg>`;
