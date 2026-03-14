#!/usr/bin/env node
// Capture a screenshot of a URL using Puppeteer
// Usage: node scripts/screenshot.js [url] [output.png]

const puppeteer = require('puppeteer');

const url = process.argv[2] || 'http://localhost:8000';
const output = process.argv[3] || 'screenshot.png';

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 10000 });
  await page.screenshot({ path: output, fullPage: true });
  await browser.close();
  console.log(`Screenshot saved: ${output}`);
})();
