// Run in a dedicated local Playwright CLI session; never in a logged-in browser.
// playwright-cli -s=echo-dispatch run-code --filename=/absolute/path/to/this/file
async (page) => {
  const errors = [];
  const onError = error => errors.push(error.message);
  page.on('pageerror', onError);
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  try {
    await page.setViewportSize({ width: 1440, height: 1060 });
    await page.evaluate(() => localStorage.removeItem('echo-dispatch-progress-v1'));
    await page.reload();
    const definitions = await page.evaluate(async () => (await import('./src/levels.js')).LEVELS);
    const keys = { U: 'ArrowUp', D: 'ArrowDown', L: 'ArrowLeft', R: 'ArrowRight', W: 'Space' };
    for (const [index, level] of definitions.entries()) {
      await page.locator(`[data-level="${index}"]`).click();
      await page.locator('#board-container').focus();
      for (const [at, route] of level.solution.entries()) {
        for (const action of route) await page.keyboard.press(keys[action]);
        if (at < level.solution.length - 1) {
          await page.locator('#record-button').click();
          check((await page.locator('#beat-label').innerText()).includes('00'), `Level ${index + 1} failed to rewind`);
        }
      }
      check(await page.locator('#win-panel').isVisible(), `Level ${index + 1} did not finish through the UI`);
      check((await page.locator('#win-detail').innerText()).includes(`${level.par} 拍`), `Level ${index + 1} score mismatch`);
      check((await page.locator('#win-rating').innerText()) === '✦✦✦', 'Expected three stars');
      await page.locator('#review-button').click();
      await page.keyboard.press('z');
      check(await page.locator('#win-panel').isHidden(), 'Undo after victory must dismiss the result');
      await page.locator('#board-container').focus();
      await page.keyboard.press(keys[level.solution.at(-1).at(-1)]);
      check(await page.locator('#win-panel').isVisible(), 'The last move must restore victory');
    }
    await page.reload();
    check((await page.locator('#progress-label').innerText()).includes('6 / 6'), 'Completion must survive reload');
    await page.locator('#help-button').click();
    const beat = await page.locator('#beat-label').innerText();
    await page.keyboard.press('ArrowRight');
    check((await page.locator('#beat-label').innerText()) === beat, 'Dialog keyboard input changed the puzzle');
    await page.keyboard.press('Escape');
    await page.locator('#settings-button').click();
    await page.locator('#motion-setting').check();
    check(await page.locator('body').evaluate(body => body.classList.contains('reduced-motion')), 'Reduced motion setting failed');
    await page.keyboard.press('Escape');
    await page.locator('#board-container').focus();
    for (let i = 0; i < definitions[0].maxSteps + 2; i++) await page.keyboard.press('Space');
    check((await page.locator('#beat-label').innerText()).includes('24 / 24'), 'Recording capacity failed');
    check(await page.locator('[data-action="R"]').isDisabled(), 'Full recording must stop movement');
    await page.locator('#record-button').click();
    await page.locator('#remove-echo').click();
    check((await page.locator('#echo-count').innerText()) === '0 / 1', 'Removing an echo failed');
    await page.locator('[data-action="R"]').click();
    await page.locator('#reset-button').click();
    await page.locator('#confirm-reset').click();
    check((await page.locator('#beat-label').innerText()).includes('00'), 'Confirmed reset failed');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#board-container').scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, 0));
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile page overflows horizontally');
    const boardBox = await page.locator('#board-container').boundingBox();
    const controlBox = await page.locator('.control-panel').boundingBox();
    check(boardBox.y >= 0 && boardBox.y + boardBox.height <= controlBox.y, 'Mobile controls must leave the full board visible');
    for (const button of await page.locator('.dpad button').all()) {
      const box = await button.boundingBox();
      check(box.width >= 32 && box.height >= 32, 'Touch direction button is too small');
    }
    for (const [at, route] of definitions[0].solution.entries()) {
      for (const action of route) await page.locator(`[data-action="${action}"]`).click();
      if (at === 0) await page.locator('#record-button').click();
    }
    check(await page.locator('#win-panel').isVisible(), 'Touch controls did not complete the first level');
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Result overlay overflows on mobile');
    await page.reload();
    await page.locator('[data-level="5"]').click();
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Widest map overflows on mobile');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    check((await page.locator('#player').evaluate(el => getComputedStyle(el).transitionDuration)) === '0s', 'OS reduced-motion preference is ignored');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    check(errors.length === 0, `Browser errors: ${errors.join('; ')}`);
    return { passed: true, checks: ['six levels via keyboard', 'undo after victory', 'persisted scores', 'modal isolation', 'recording capacity', 'reset', 'touch completion', '390px board and controls visible together', 'widest map layout', 'reduced motion'], browserErrors: errors };
  } finally { page.off('pageerror', onError); }
}
