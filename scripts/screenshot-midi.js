const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:8000', { waitUntil: 'networkidle2', timeout: 10000 });
  await page.evaluate(() => {
    const tabs = document.querySelectorAll('.tab-btn');
    for (const t of tabs) { if (t.dataset.tab === 'midi') t.click(); }
  });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: 'screenshot.png', fullPage: false });
  await browser.close();
  console.log('Done');
})();
