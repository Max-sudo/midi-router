#!/usr/bin/env node
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:8000', { waitUntil: 'networkidle2', timeout: 10000 });
  // Click ccmonitor tab
  await page.evaluate(() => {
    const tabs = document.querySelectorAll('.tab-btn');
    for (const t of tabs) { if (t.dataset.tab === 'ccmonitor') t.click(); }
  });
  await new Promise(r => setTimeout(r, 500));
  // Expand the cosmic comet
  await page.evaluate(() => {
    const btn = document.getElementById('ccm-comet-toggle');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: 'screenshot.png', fullPage: true });
  await browser.close();
  console.log('Screenshot saved: screenshot.png');
})();
