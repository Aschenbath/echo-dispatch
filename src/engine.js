export const ACTIONS = Object.freeze({ U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0], W: [0, 0] });
export const SYMBOLS = Object.freeze({ U: '↑', D: '↓', L: '←', R: '→', W: '·' });
export const keyOf = ({ x, y }) => `${x},${y}`;

export function parseLevel(definition) {
  const { map, maxSteps, maxEchoes } = definition;
  if (!Array.isArray(map) || map.length < 3 || !map.every(row => typeof row === 'string' && row.length === map[0].length && /^[#.SE*abcABC]+$/.test(row))) {
    throw new Error('Invalid rectangular level map');
  }
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 128 || !Number.isInteger(maxEchoes) || maxEchoes < 1 || maxEchoes > 3) {
    throw new Error('Invalid recording limits');
  }
  const starts = [], exits = [], stars = [], plates = [], gates = [];
  map.forEach((row, y) => [...row].forEach((tile, x) => {
    const cell = { x, y };
    if (tile === 'S') starts.push(cell);
    if (tile === 'E') exits.push(cell);
    if (tile === '*') stars.push(keyOf(cell));
    if ('abc'.includes(tile)) plates.push({ ...cell, channel: tile.toUpperCase() });
    if ('ABC'.includes(tile)) gates.push({ ...cell, channel: tile });
  }));
  if (starts.length !== 1 || exits.length !== 1) throw new Error('One start and exit are required');
  if (gates.some(gate => !plates.some(plate => plate.channel === gate.channel))) throw new Error('Gate without a matching switch');
  return { ...definition, width: map[0].length, height: map.length, start: starts[0], exit: exits[0], stars, plates, gates };
}

export function createState(level, tapes = []) {
  if (!Array.isArray(tapes) || tapes.length > level.maxEchoes || tapes.some(tape => !Array.isArray(tape) || tape.length < 1 || tape.length > level.maxSteps || tape.some(action => !Object.hasOwn(ACTIONS, action)))) {
    throw new Error('Invalid echo recording');
  }
  return {
    player: { ...level.start }, echoes: tapes.map(() => ({ ...level.start })),
    tapes: tapes.map(tape => [...tape]), commands: [], collected: [], tick: 0,
    won: false, blocked: false, lastAction: null,
  };
}

export function openChannels(level, state) {
  const occupied = new Set([state.player, ...state.echoes].map(keyOf));
  return new Set(level.plates.filter(plate => occupied.has(keyOf(plate))).map(plate => plate.channel));
}

function move(level, position, action, channels) {
  const [dx, dy] = ACTIONS[action];
  const next = { x: position.x + dx, y: position.y + dy };
  const tile = level.map[next.y]?.[next.x];
  if (!tile || tile === '#' || ('ABC'.includes(tile) && !channels.has(tile))) return { ...position };
  return next;
}

// All actors read the same beginning-of-beat gate state. There is no actor-order
// advantage. Actors may share a tile; a closing gate never prevents an exit.
export function step(level, state, action) {
  if (!Object.hasOwn(ACTIONS, action)) throw new Error('Unknown action');
  if (state.won || state.tick >= level.maxSteps) return state;
  const channels = openChannels(level, state);
  const player = move(level, state.player, action, channels);
  const echoes = state.echoes.map((position, index) => move(level, position, state.tapes[index][state.tick] ?? 'W', channels));
  const collected = [...state.collected];
  const position = keyOf(player);
  if (level.stars.includes(position) && !collected.includes(position)) collected.push(position);
  return {
    ...state, player, echoes, collected, commands: [...state.commands, action], tick: state.tick + 1,
    won: position === keyOf(level.exit) && collected.length === level.stars.length,
    blocked: action !== 'W' && position === keyOf(state.player), lastAction: action,
  };
}

export function replay(level, tapes, commands) {
  if (!Array.isArray(commands) || commands.length > level.maxSteps) throw new Error('Invalid playback');
  return commands.reduce((state, action) => step(level, state, action), createState(level, tapes));
}

export function undo(level, state) {
  return state.tick ? replay(level, state.tapes, state.commands.slice(0, -1)) : state;
}

export function record(level, state) {
  if (state.won) return { state, error: '本线路已接通。可以重试，或前往下一站。' };
  if (!state.commands.length) return { state, error: '先走几步，再把这段行动录成回声。' };
  if (state.tapes.length >= level.maxEchoes) return { state, error: '录音轨已满。先撤下最后一段回声，再录新的。' };
  return { state: createState(level, [...state.tapes, state.commands]), error: null };
}

export function removeLastEcho(level, state) {
  return state.tapes.length ? createState(level, state.tapes.slice(0, -1)) : state;
}

export function totalMoves(state) {
  return state.tapes.reduce((sum, tape) => sum + tape.length, 0) + state.tick;
}

export function rating(level, state) {
  if (!state.won) return 0;
  const moves = totalMoves(state);
  return moves <= level.par ? 3 : moves <= level.par + 8 ? 2 : 1;
}
