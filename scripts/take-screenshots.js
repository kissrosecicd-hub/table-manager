const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:49721';
const DIR = path.join(__dirname, '..', 'screenshots');

if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function shot(name, page) {
  await page.screenshot({ path: path.join(DIR, name), fullPage: false });
  console.log(`  ✅ ${name}`);
}

(async () => {
  const browser = await chromium.launch();
  
  // 1. Top layout — light
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await wait(1000);
    // Click first table card
    await page.click('[data-testid="table-card"]');
    await wait(1000);
    await shot('top-layout-light.png', page);
    await page.close();
  }

  // 2. Top layout — dark
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await wait(500);
    await page.click('button[title*="Тёмная"]');
    await wait(800);
    await page.click('[data-testid="table-card"]');
    await wait(1000);
    await shot('top-layout-dark.png', page);
    await page.close();
  }

  // 3. Sidebar layout — light
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await wait(500);
    await page.click('button[title="Боковая панель"]');
    await wait(800);
    await shot('sidebar-layout-light.png', page);
    await page.close();
  }

  // 4. Sidebar layout — dark
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await wait(500);
    // Theme toggle — find by icon
    const themeBtn = page.locator('header button').last();
    await themeBtn.click();
    await wait(800);
    const sidebarBtn = page.locator('button[title="Боковая панель"]');
    if (await sidebarBtn.isVisible()) await sidebarBtn.click();
    await wait(800);
    await shot('sidebar-layout-dark.png', page);
    await page.close();
  }

  // 5. Sidebar search
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await wait(500);
    const sidebarBtn = page.locator('button[title="Боковая панель"]');
    if (await sidebarBtn.isVisible()) await sidebarBtn.click();
    await wait(800);
    await page.fill('aside input', 'Книги');
    await wait(500);
    await shot('sidebar-search.png', page);
    await page.close();
  }

  // 6. Table navigation (prev/next arrows in toolbar)
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await wait(500);
    await page.click('[data-testid="table-card"]');
    await wait(1000);
    await shot('table-navigation.png', page);
    await page.close();
  }

  // 7. Search & filter in table
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await wait(500);
    await page.click('[data-testid="table-card"]');
    await wait(1000);
    const search = page.locator('.flex.flex-wrap input[placeholder="Поиск..."]').first();
    if (await search.isVisible()) {
      await search.fill('Алексей');
      await wait(500);
    }
    await shot('search-filter.png', page);
    await page.close();
  }

  // 8. Inline edit
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await wait(500);
    await page.click('[data-testid="table-card"]');
    await wait(1000);
    const firstCell = page.locator('table tbody tr td').nth(1);
    if (await firstCell.isVisible()) {
      await firstCell.dblclick();
      await wait(500);
    }
    await shot('inline-edit.png', page);
    await page.close();
  }

  // 9. Collapsed sections (T toggle hides tables)
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await wait(500);
    await page.click('button[title*="Таблицы (T)"]');
    await wait(500);
    await shot('collapsed-tables.png', page);
    await page.close();
  }

  // 10. Command palette (Ctrl+K)
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await wait(500);
    await page.keyboard.press('Control+k');
    await wait(500);
    await shot('command-palette.png', page);
    await page.close();
  }

  // 11. Create record modal
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await wait(500);
    await page.click('[data-testid="table-card"]');
    await wait(1000);
    // Try to find create button
    const btn = page.locator('button').filter({ hasText: /новая запись|создать/i }).first();
    try { if (await btn.isVisible()) { await btn.click(); await wait(500); } } catch {}
    await shot('modal-create.png', page);
    await page.close();
  }

  await browser.close();
  console.log('\n✅ All screenshots saved!');
})();
