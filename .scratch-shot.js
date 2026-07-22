const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  for (const scheme of ['dark', 'light']) {
    const context = await browser.newContext({ viewport: { width: 1400, height: 1100 }, colorScheme: scheme });
    const page = await context.newPage();
    await page.goto('http://localhost:3000/face-off', { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('text=Which hackathon wins?', { timeout: 30000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `/private/tmp/claude-501/-Users-nirekshetty-haethon/9f42d2bf-98cc-40e5-893c-b2fc0fce27d0/scratchpad/faceoff-${scheme}.png`, fullPage: true });
    await context.close();
  }
  await browser.close();
})();
