// Individual screenshot script — run one at a time
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:49721';
const DIR = path.join(__dirname, '..', 'screenshots');
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

const name = process.argv[2];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE);
  await page.waitForLoadState('networkidle');
  await wait(5000); // Wait for client-side data fetch

  switch (name) {
    case 'top-light':
      await page.click('[data-testid="table-card"]');
      await wait(1000);
      break;

    case 'top-dark':
      await page.click('[data-testid="table-card"]');
      await wait(1000);
      await page.keyboard.press('ArrowDown'); // focus theme area
      // Find and click theme toggle
      const btns = await page.locator('header button').all();
      for (const b of btns) {
        const title = await b.getAttribute('title').catch(() => '');
        if (title && title.includes('Тёмная')) { await b.click(); break; }
      }
      await wait(800);
      break;

    case 'sidebar-light':
      const sb = page.locator('button[title="Боковая панель"]');
      if (await sb.isVisible()) await sb.click();
      await wait(800);
      break;

    case 'sidebar-dark':
      await page.locator('button[title="Боковая панель"]').click().catch(() => {});
      await wait(800);
      const tbtns = await page.locator('header button').all();
      for (const b of tbtns) {
        const t = await b.getAttribute('title').catch(() => '');
        if (t && t.includes('Тёмная')) { await b.click(); break; }
      }
      await wait(800);
      break;

    case 'sidebar-search':
      await page.locator('button[title="Боковая панель"]').click().catch(() => {});
      await wait(800);
      await page.fill('aside input', 'Книги');
      await wait(500);
      break;

    case 'navigation':
      await page.click('[data-testid="table-card"]');
      await wait(1000);
      break;

    case 'search':
      await page.click('[data-testid="table-card"]');
      await wait(1000);
      const si = page.locator('.flex.flex-wrap input').first();
      if (await si.isVisible()) { await si.fill('Алексей'); await wait(500); }
      break;

    case 'edit':
      await page.click('[data-testid="table-card"]');
      await wait(1000);
      const cell = page.locator('table tbody tr td').nth(1);
      if (await cell.isVisible()) { await cell.dblclick(); await wait(500); }
      break;

    case 'collapsed':
      await page.click('button[title*="Таблицы (T)"]');
      await wait(500);
      break;

    case 'palette':
      await page.keyboard.press('Control+k');
      await wait(500);
      break;

    case 'modal':
      await page.click('[data-testid="table-card"]');
      await wait(1000);
      const cb = page.locator('button').filter({ hasText: /новая запись|создать/i }).first();
      try { if (await cb.isVisible()) { await cb.click(); await wait(500); } } catch {}
      break;
  }

  const files = {
    'top-light': 'top-layout-light.png',
    'top-dark': 'top-layout-dark.png',
    'sidebar-light': 'sidebar-layout-light.png',
    'sidebar-dark': 'sidebar-layout-dark.png',
    'sidebar-search': 'sidebar-search.png',
    'navigation': 'table-navigation.png',
    'search': 'search-filter.png',
    'edit': 'inline-edit.png',
    'collapsed': 'collapsed-tables.png',
    'palette': 'command-palette.png',
    'modal': 'modal-create.png',
  };

  await page.screenshot({ path: path.join(DIR, files[name]), fullPage: false });
  console.log(`✅ ${files[name]}`);
  await browser.close();
})();
