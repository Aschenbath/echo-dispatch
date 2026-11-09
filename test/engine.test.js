import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../src/levels.js';
import { parseLevel, createState, step, replay, record, undo, removeLastEcho, keyOf, rating, totalMoves } from '../src/engine.js';
import { readProgress, writeProgress } from '../src/progress.js';

for (const definition of LEVELS) {
  test(`${definition.id}: the designed solution really completes the level`, () => {
    const level = parseLevel(definition);
    let state = createState(level);
    for (const [index, route] of definition.solution.entries()) {
      state = replay(level, state.tapes, route);
      assert.equal(state.blocked, false);
      if (index < definition.solution.length - 1) {
        const recorded = record(level, state);
        assert.equal(recorded.error, null);
        state = recorded.state;
      }
    }
    assert.equal(state.won, true);
    assert.equal(state.collected.length, level.stars.length);
    assert.equal(totalMoves(state), level.par);
    assert.equal(rating(level, state), 3);
    assert.equal(step(level, state, 'L'), state, 'winning state is frozen');
  });

  test(`${definition.id}: no route can bypass the echo mechanic`, () => {
    const level = parseLevel(definition);
    const queue = [createState(level)], seen = new Set();
    for (let i = 0; i < queue.length; i++) {
      const state = queue[i];
      assert.equal(state.won, false, 'a single actor must not solve the map');
      for (const action of ['U', 'D', 'L', 'R']) {
        const next = step(level, state, action);
        const key = `${keyOf(next.player)}:${[...next.collected].sort().join(';')}`;
        if (!seen.has(key)) { seen.add(key); queue.push(next); }
      }
    }
  });
}

test('a newly held switch opens a gate on the next beat, for every actor', () => {
  const level = parseLevel(LEVELS[0]);
  let state = replay(level, [['R', 'R', 'U']], ['R', 'R']);
  state = step(level, state, 'R');
  assert.equal(keyOf(state.player), '3,2');
  assert.equal(state.blocked, true);
  assert.equal(keyOf(state.echoes[0]), '3,1');
  assert.equal(keyOf(step(level, state, 'R').player), '4,2');
});

test('departing switch uses the shared beginning-of-beat state', () => {
  const level = parseLevel(LEVELS[0]);
  const state = replay(level, [['R', 'R', 'U', 'D']], ['R', 'R', 'W']);
  const next = step(level, state, 'R');
  assert.equal(keyOf(next.player), '4,2');
  assert.equal(keyOf(next.echoes[0]), '3,2');
  assert.equal(keyOf(step(level, next, 'R').player), '5,2', 'a closing door allows the actor to leave');
});

test('echoes obey gates and park after the end of their recording', () => {
  const level = parseLevel(LEVELS[0]);
  const state = replay(level, [['R', 'R', 'R']], ['W', 'W', 'W', 'W', 'W']);
  assert.equal(keyOf(state.echoes[0]), '3,2');
  assert.equal(state.collected.length, 0);
});

test('recording rewinds pickups; echoes cannot collect them', () => {
  const level = parseLevel(LEVELS[1]);
  const state = step(level, createState(level), 'U');
  assert.equal(state.collected.length, 1);
  const rewind = record(level, state).state;
  assert.equal(rewind.collected.length, 0);
  const next = step(level, rewind, 'W');
  assert.equal(keyOf(next.echoes[0]), '1,1');
  assert.equal(next.collected.length, 0);
  assert.equal(state.collected.length, 1, 'older state is immutable');
});

test('undo restores every actor, pickup and beat, including after winning', () => {
  const level = parseLevel(LEVELS[0]);
  const before = replay(level, [LEVELS[0].solution[0]], LEVELS[0].solution[1].slice(0, -1));
  const after = step(level, before, 'R');
  assert.equal(after.won, true);
  assert.deepEqual(undo(level, after), before);
});

test('recording limits and removing the newest track are predictable', () => {
  const level = parseLevel(LEVELS[0]);
  assert.ok(record(level, createState(level)).error);
  let state = record(level, step(level, createState(level), 'R')).state;
  state = step(level, state, 'D');
  assert.ok(record(level, state).error);
  assert.deepEqual(removeLastEcho(level, state), createState(level));
  const full = replay(level, [], Array(level.maxSteps).fill('W'));
  assert.equal(step(level, full, 'R'), full);
  assert.equal(record(level, full).error, null);
  assert.equal(undo(level, full).tick, level.maxSteps - 1);
});

test('malformed maps, commands and tapes cannot enter the engine', () => {
  assert.throws(() => parseLevel({ ...LEVELS[0], map: ['###', '#SS#', '###'] }));
  assert.throws(() => parseLevel({ ...LEVELS[0], map: ['#####', '#SAE#', '#####'] }));
  const level = parseLevel(LEVELS[0]);
  assert.throws(() => createState(level, [['NO']]));
  assert.throws(() => createState(level, [['R'], ['U']]));
  assert.throws(() => createState(level, [[]]));
  assert.throws(() => step(level, createState(level), 'toString'));
  assert.throws(() => replay(level, [], Array(129).fill('W')));
});

test('deterministic action sequences never leave the walkable map or mutate their input', () => {
  let seed = 7919;
  const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  for (const definition of LEVELS) {
    const level = parseLevel(definition);
    let state = createState(level);
    for (let i = 0; i < 700; i++) {
      const before = JSON.stringify(state);
      const previous = state;
      const choice = random(10);
      if (choice < 5) state = step(level, state, ['U', 'D', 'L', 'R', 'W'][choice]);
      else if (choice === 5) state = record(level, state).state;
      else if (choice === 6) state = undo(level, state);
      else if (choice === 7) state = removeLastEcho(level, state);
      else state = createState(level);
      assert.equal(JSON.stringify(previous), before);
      for (const actor of [state.player, ...state.echoes]) assert.ok(level.map[actor.y]?.[actor.x] && level.map[actor.y][actor.x] !== '#');
      assert.equal(new Set(state.collected).size, state.collected.length);
      assert.ok(state.collected.every(item => level.stars.includes(item)));
      assert.ok(state.tick <= level.maxSteps);
      assert.deepEqual(replay(level, state.tapes, state.commands), state);
    }
  }
});

test('corrupt or unavailable browser storage cannot break the game', () => {
  const ids = LEVELS.map(level => level.id);
  assert.deepEqual(readProgress({ getItem: () => '{broken' }, ids), {});
  assert.deepEqual(readProgress({ getItem: () => JSON.stringify({ [ids[0]]: { moves: 10, rating: 3 }, junk: { moves: 3, rating: 3 }, [ids[1]]: { moves: -1, rating: 4 } }) }, ids), { [ids[0]]: { moves: 10, rating: 3 } });
  assert.equal(writeProgress({ setItem() { throw new Error('quota'); } }, {}), false);
});
