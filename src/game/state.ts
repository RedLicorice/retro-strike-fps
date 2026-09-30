/* ------------------------------ D7. GAME / MATCH FLOW ------------------------------ */
export const gameState = {
  state: 'menu',

  mode: 'ffa',

  ff: false,

  isAuthority: true,

  seed: '--------',

  actors: [],

  monsters: [],

  grenades: [],

  fires: [],

  sun: null,

  shadow: null,

  score: [0, 0],

  limit: 25,

  timeLeft: 300,

  wave: 0, waveQueue: 0,

  waveT: 0,

  waveActive: false,

  betweenT: 0,

  infiniteAmmo: false,

  elapsed: 0,

  killLimit: 25,

  local: null,

  matchStats: null,

  ended: false,

  countT: 0,

  started: false
};
