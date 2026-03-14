#!/usr/bin/env node
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:8000', { waitUntil: 'networkidle2', timeout: 10000 });
  await page.evaluate(() => {
    const tabs = document.querySelectorAll('.tab-btn');
    for (const t of tabs) { if (t.dataset.tab === 'ccmonitor') t.click(); }
  });
  await new Promise(r => setTimeout(r, 500));
  await page.evaluate(() => {
    const btn = document.getElementById('ccm-comet-toggle');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1500));
  console.log('ERRORS:', JSON.stringify(errors, null, 2));
  await page.screenshot({ path: 'screenshot.png', fullPage: true });
  await browser.close();
})();
