import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

test('the local server serves only web assets with correct HTTP semantics', { timeout: 10000 }, async () => {
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)), env: { ...process.env, HOST: '127.0.0.1', PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server startup timed out')), 5000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
    });
    const home = await fetch(url);
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-type'), /text\/html/);
    assert.match(await home.text(), /Echo Dispatch/);
    const script = await fetch(`${url}/src/app.js`);
    assert.match(script.headers.get('content-type'), /text\/javascript/);
    assert.equal(script.headers.get('x-content-type-options'), 'nosniff');
    const head = await fetch(`${url}/style.css`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.ok(Number(head.headers.get('content-length')) > 0);
    assert.equal(await head.text(), '');
    for (const path of ['/package.json', '/README.md', '/.git/config', '/%2e%2e/server.mjs', '/test/engine.test.js']) {
      assert.equal((await fetch(url + path)).status, 404, path);
    }
    assert.equal((await fetch(url, { method: 'POST', body: 'ignored' })).status, 405);
  } finally {
    if (child.exitCode === null) { const stopped = once(child, 'exit'); child.kill(); await stopped; }
  }
});
