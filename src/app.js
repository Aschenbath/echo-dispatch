import { LEVELS } from './levels.js';
import { SYMBOLS, parseLevel, createState, step, record, undo, removeLastEcho, openChannels, keyOf, totalMoves, rating } from './engine.js';
import { readProgress, writeProgress } from './progress.js';

const $ = id => document.getElementById(id);
const levels = LEVELS.map(parseLevel);
let storage;
try { storage = window.localStorage; } catch { storage = null; }
let progress = readProgress(storage, levels.map(level => level.id));
let index = 0, level = levels[0], state = createState(level), sound = false, audio;
const cell = 44, pad = 12;
const position = p => ({ x: pad + p.x * cell + cell / 2, y: pad + p.y * cell + cell / 2 });
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function tone(kind) {
  if (!sound) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') void audio.resume().catch(() => {});
    const notes = kind === 'win' ? [392, 494, 587] : kind === 'rewind' ? [440, 330, 220] : kind === 'blocked' ? [110] : [kind === 'pickup' ? 660 : 270];
    notes.forEach((frequency, i) => {
      const osc = audio.createOscillator(), gain = audio.createGain(), at = audio.currentTime + i * .08;
      osc.type = 'sine'; osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(.045, at + .01); gain.gain.exponentialRampToValueAtTime(.0001, at + .17);
      osc.connect(gain); gain.connect(audio.destination); osc.start(at); osc.stop(at + .2);
    });
  } catch { /* Sound is optional; the puzzle never depends on an audio device. */ }
}

function animate(name) {
  const board = $('board-container');
  board.classList.remove('rewinding', 'bump');
  void board.offsetWidth;
  board.classList.add(name);
}

function mapMarkup() {
  const result = [`<title id="map-title">${escapeHTML(level.title)}的调度地图</title><desc id="map-description"></desc>`];
  result.push('<defs><pattern id="wall-hatch" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M0 9L9 0" stroke="#49684f" stroke-width=".6" opacity=".3"/></pattern></defs>');
  level.map.forEach((row, y) => [...row].forEach((tile, x) => {
    const left = pad + x * cell, top = pad + y * cell, cx = left + cell / 2, cy = top + cell / 2;
    result.push(`<rect x="${left + 1}" y="${top + 1}" width="${cell - 2}" height="${cell - 2}" rx="4" class="${tile === '#' ? 'map-wall' : 'map-floor'}"/>`);
    if (tile === '#') {
      result.push(`<rect x="${left + 5}" y="${top + 5}" width="${cell - 10}" height="${cell - 10}" rx="2" fill="url(#wall-hatch)"/>`);
      if ((x + y) % 3 === 0) result.push(`<path d="M${cx - 3} ${cy}h6m-3-3v6" class="map-wall-detail"/>`);
    }
    if (tile === 'S') result.push(`<circle cx="${cx}" cy="${cy}" r="15" class="map-start"/>`);
    if ('abc'.includes(tile)) result.push(`<circle data-plate="${tile.toUpperCase()}" cx="${cx}" cy="${cy}" r="14" class="map-plate"/><text x="${cx}" y="${cy + 5}" text-anchor="middle" class="map-plate-label">${tile.toUpperCase()}</text>`);
    if ('ABC'.includes(tile)) result.push(`<g data-gate="${tile}" class="map-gate"><rect class="gate-bg" x="${left + 5}" y="${top + 5}" width="${cell - 10}" height="${cell - 10}" rx="3"/><path class="gate-line" d="M${cx - 9} ${top + 11}v22m9-22v22m9-22v22"/><rect class="gate-bg" x="${cx - 6}" y="${cy - 7}" width="12" height="14" rx="2"/><text x="${cx}" y="${cy + 4}" text-anchor="middle" class="gate-label">${tile}</text></g>`);
    if (tile === '*') result.push(`<path data-star="${x},${y}" class="map-star" d="M${cx} ${cy - 12}l3.8 8.2 8.2 3.8-8.2 3.8L${cx} ${cy + 12}l-3.8-8.2-8.2-3.8 8.2-3.8z"/>`);
    if (tile === 'E') result.push(`<g class="map-exit"><circle cx="${cx}" cy="${cy}" r="16"/><text x="${cx}" y="${cy + 8}" text-anchor="middle">↗</text></g>`);
  }));
  result.push('<g id="trails"></g><g id="actors"></g>');
  return result.join('');
}

function actorMarkup(id, className, label, p) {
  const { x, y } = position(p);
  return `<g id="${id}" class="actor ${className}" style="transform:translate(${x}px,${y}px)"><ellipse class="actor-shadow" cy="13" rx="13" ry="5"/><rect class="actor-body" x="-12" y="-13" width="24" height="26" rx="9"/>${label ? `<text class="actor-label" y="4">${label}</text>` : '<circle class="actor-eye" cx="-4" cy="-2" r="1.6"/><circle class="actor-eye" cx="4" cy="-2" r="1.6"/><path d="M-3 5h6" stroke="#7d402c" stroke-width="1.4" stroke-linecap="round"/>'}</g>`;
}

function resetActors() {
  $('actors').innerHTML = state.echoes.map((p, i) => actorMarkup(`echo-${i}`, `ghost ${i === 1 ? 'second' : ''}`, i + 1, p)).join('') + actorMarkup('player', 'player', '', state.player);
}

function updateMap() {
  const open = openChannels(level, state);
  document.querySelectorAll('[data-gate]').forEach(el => el.classList.toggle('is-open', open.has(el.dataset.gate)));
  document.querySelectorAll('[data-plate]').forEach(el => el.classList.toggle('is-on', open.has(el.dataset.plate)));
  document.querySelectorAll('[data-star]').forEach(el => el.classList.toggle('collected', state.collected.includes(el.dataset.star)));
  [state.player, ...state.echoes].forEach((p, i) => {
    const { x, y } = position(p);
    const overlap = i && keyOf(p) === keyOf(state.player) ? i * 6 : 0;
    $(i ? `echo-${i - 1}` : 'player').style.transform = `translate(${x + overlap}px,${y - overlap}px)`;
  });
  const desc = `你在第 ${state.player.y + 1} 行第 ${state.player.x + 1} 列。第 ${state.tick} 拍。已收集 ${state.collected.length} / ${level.stars.length} 枚信号。${open.size ? [...open].join('、') + ' 门已打开。' : '所有门关闭。'}${state.echoes.map((p, i) => `回声 ${i + 1} 在第 ${p.y + 1} 行第 ${p.x + 1} 列。`).join('')}`;
  $('map-description').textContent = desc;
}

function updateTracks() {
  const tapes = [...state.tapes, state.commands];
  $('tracks').innerHTML = tapes.map((tape, i) => {
    const current = i === tapes.length - 1;
    const beats = tape.map((action, at) => `<span class="beat ${!current && at < state.tick ? 'played' : ''} ${at === state.tick - 1 ? 'playhead' : ''}" title="第 ${at + 1} 拍：${action === 'W' ? '等待' : SYMBOLS[action]}">${SYMBOLS[action]}</span>`).join('');
    return `<div class="track ${current ? 'current' : ''}"><span class="track-label">${current ? '此 刻' : `回声 ${i + 1}`}</span><div class="track-steps" aria-label="${current ? '当前' : `回声 ${i + 1}`}行动序列">${beats || '<span class="empty-track">等待你的第一步 · · ·</span>'}</div><span class="track-length">${String(tape.length).padStart(2, '0')}</span></div>`;
  }).join('');
  document.querySelectorAll('.track-steps').forEach((track, i) => {
    const head = track.querySelector('.playhead');
    if (i === tapes.length - 1) track.scrollLeft = track.scrollWidth;
    else if (head) track.scrollLeft = Math.max(0, head.offsetLeft - track.offsetLeft - track.clientWidth / 2);
  });
  $('remove-echo').hidden = state.tapes.length === 0 || state.won;
  $('tape-help').textContent = state.tapes.length ? '回声播完后，会留在最后一格继续值班。' : '走到开关后，把这段行动录下来。';
}

function updateNavigation() {
  $('level-buttons').innerHTML = levels.map((item, at) => `<button class="level-button ${at === index ? 'active' : ''} ${progress[item.id] ? 'completed' : ''}" data-level="${at}" aria-current="${at === index ? 'step' : 'false'}" aria-label="线路 ${at + 1}，${escapeHTML(item.title)}${progress[item.id] ? '，已完成' : ''}"><span class="level-index">${String(at + 1).padStart(2, '0')} —</span><span class="level-name">${escapeHTML(item.title)}</span><span class="completion">${progress[item.id] ? '✓' : '○'}</span></button>`).join('');
  $('progress-label').textContent = `已接通 ${Object.keys(progress).length} / ${levels.length}`;
}

function render(message, warning = false) {
  updateMap(); updateTracks();
  $('beat-label').textContent = `节拍 ${String(state.tick).padStart(2, '0')} / ${level.maxSteps}`;
  $('signal-count').textContent = `${state.collected.length} / ${level.stars.length}`;
  $('echo-count').textContent = `${state.tapes.length} / ${level.maxEchoes}`;
  $('record-button').disabled = state.won || !state.tick || state.tapes.length >= level.maxEchoes;
  $('undo-button').disabled = !state.tick;
  document.querySelectorAll('[data-action]').forEach(button => { button.disabled = state.won || state.tick >= level.maxSteps; });
  const exhausted = !state.won && state.tick >= level.maxSteps;
  $('status').textContent = message ?? (exhausted ? '本段录音已满。可以录成回声、撤销一步，或本关重来。' : state.tick ? `第 ${state.tick} 拍 · ${state.tapes.length ? '所有回声已同步。' : '走到开关后，试试录成回声。'}` : '从橙色的你开始。方向键或右侧按键都可以。');
  $('status').classList.toggle('warning', warning || exhausted);
  $('par-note').textContent = `本关三星目标：总行动 ≤ ${level.par} 拍${progress[level.id] ? ` · 最佳 ${progress[level.id].moves} 拍` : ''}`;
}

function loadLevel(next) {
  index = Math.max(0, Math.min(levels.length - 1, next)); level = levels[index]; state = createState(level);
  $('line-number').textContent = String(index + 1).padStart(2, '0');
  $('level-subtitle').textContent = level.subtitle; $('level-title').textContent = level.title;
  $('level-story').textContent = level.story; $('lesson').textContent = level.lesson; $('hint-text').textContent = level.hint;
  $('hint').open = false; $('win-panel').hidden = true;
  $('board').setAttribute('viewBox', `0 0 ${level.width * cell + pad * 2} ${level.height * cell + pad * 2}`);
  $('board').innerHTML = mapMarkup(); resetActors(); updateNavigation(); render();
  $('board-container').classList.remove('entrance'); void $('board-container').offsetWidth; $('board-container').classList.add('entrance');
}

function finish() {
  const moves = totalMoves(state), stars = rating(level, state), old = progress[level.id];
  if (!old || moves < old.moves) progress[level.id] = { moves, rating: stars };
  const stored = writeProgress(storage, progress);
  updateNavigation();
  const complete = Object.keys(progress).length === levels.length;
  $('win-title').textContent = complete ? '所有线路，都有人回应。' : '收到了。谢谢你们。';
  $('win-detail').textContent = `${state.tapes.length} 段回声 · 总行动 ${moves} 拍${stored ? ' · 成绩已保存在本机' : ' · 浏览器未允许保存成绩'}`;
  $('win-rating').textContent = '✦'.repeat(stars) + '✧'.repeat(3 - stars);
  $('win-rating').setAttribute('aria-label', `${stars} 星，最高三星`);
  $('next-button').innerHTML = index < levels.length - 1 ? '下一条线路 <span>→</span>' : '回到第一条线路 <span>↺</span>';
  $('win-panel').hidden = false; $('next-button').focus({ preventScroll: true }); tone('win');
}

function act(action) {
  const previous = state; state = step(level, state, action);
  if (state === previous) return;
  const picked = state.collected.length > previous.collected.length;
  const onExit = keyOf(state.player) === keyOf(level.exit);
  render(state.won ? '信号已全部送达。线路接通！' : state.blocked ? '这一步被挡住了，时间仍前进了一拍。按 Z 可以一起退回。' : picked ? '收到一枚信号碎片。带它去接收站。' : onExit ? '还有信号碎片留在地图里。收齐后再来接通。' : undefined, state.blocked);
  if (state.blocked) animate('bump');
  if (state.won) finish(); else tone(picked ? 'pickup' : state.blocked ? 'blocked' : 'move');
}

function recordEcho() {
  const result = record(level, state);
  if (result.error) { render(result.error, true); return; }
  state = result.state; resetActors(); $('win-panel').hidden = true;
  render(`回声 ${state.tapes.length} 已录好。你每走一步，它就重放一步。`); animate('rewinding'); tone('rewind');
}

function undoBeat() {
  state = undo(level, state); $('win-panel').hidden = true; render('所有人一起退回上一拍。'); tone('move');
}

function refocusMap() { if (!state.won) $('board-container').focus({ preventScroll: true }); }
document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => { act(button.dataset.action); refocusMap(); }));
$('record-button').addEventListener('click', () => { recordEcho(); refocusMap(); });
$('undo-button').addEventListener('click', () => { undoBeat(); refocusMap(); });
$('remove-echo').addEventListener('click', () => {
  state = removeLastEcho(level, state); resetActors(); render('已撤下最后一段回声，剩余轨道从起点重新开始。'); animate('rewinding'); refocusMap();
});
$('reset-button').addEventListener('click', () => state.tick || state.tapes.length ? $('reset-dialog').showModal() : render('已经在起点，可以开始新的一段行动。'));
$('confirm-reset').addEventListener('click', () => { $('reset-dialog').close(); loadLevel(index); $('board-container').focus({ preventScroll: true }); });
$('next-button').addEventListener('click', () => { loadLevel((index + 1) % levels.length); $('board-container').focus({ preventScroll: true }); if (innerWidth <= 780) $('board-container').scrollIntoView({ block: 'start' }); });
$('review-button').addEventListener('click', () => { $('win-panel').hidden = true; $('board-container').focus({ preventScroll: true }); });
$('level-buttons').addEventListener('click', event => {
  const button = event.target.closest('[data-level]');
  if (button && Number(button.dataset.level) !== index) { loadLevel(Number(button.dataset.level)); $('board-container').focus({ preventScroll: true }); if (innerWidth <= 780) $('board-container').scrollIntoView({ block: 'start' }); }
});
$('help-button').addEventListener('click', () => $('help-dialog').showModal());
$('settings-button').addEventListener('click', () => $('settings-dialog').showModal());
document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
$('sound-setting').addEventListener('change', event => { sound = event.target.checked; tone('move'); });
$('motion-setting').addEventListener('change', event => document.body.classList.toggle('reduced-motion', event.target.checked));

document.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || document.querySelector('dialog[open]') || event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
  const key = event.key.toLowerCase();
  if ((key === ' ' || key === 'enter') && event.target.closest('button,summary,a')) return;
  const mapping = { arrowup: 'U', w: 'U', arrowdown: 'D', s: 'D', arrowleft: 'L', a: 'L', arrowright: 'R', d: 'R', ' ': 'W', '.': 'W' };
  if (mapping[key]) { event.preventDefault(); act(mapping[key]); }
  else if (key === 'r') { event.preventDefault(); recordEcho(); }
  else if (key === 'z') { event.preventDefault(); undoBeat(); }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && audio?.state === 'running') void audio.suspend().catch(() => {});
});

loadLevel(0);
// No animation timer advances the game: a deliberate input is the only clock.
