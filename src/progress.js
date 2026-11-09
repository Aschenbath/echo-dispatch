const KEY = 'echo-dispatch-progress-v1';

export function readProgress(storage, ids) {
  try {
    const parsed = JSON.parse(storage.getItem(KEY));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(ids.filter(id => {
      const item = parsed[id];
      return item && Number.isInteger(item.moves) && item.moves > 0 && item.moves <= 512 && Number.isInteger(item.rating) && item.rating >= 1 && item.rating <= 3;
    }).map(id => [id, { moves: parsed[id].moves, rating: parsed[id].rating }]));
  } catch { return {}; }
}

export function writeProgress(storage, progress) {
  try { storage.setItem(KEY, JSON.stringify(progress)); return true; }
  catch { return false; }
}
