const { chromium } = require('playwright');
(async () => {
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto('http://localhost:49721');
await page.waitForTimeout(2000);
await page.locator('text=Gmail.com').first().click();
await page.waitForTimeout(3000);

const info = await page.evaluate(() => {
  const ths = document.querySelectorAll('table thead th');
  const td = document.querySelector('table tbody td:nth-child(2)');
  const td2 = document.querySelector('table tbody td:nth-child(3)');
  return {
    th1BoxShadow: ths[1] ? getComputedStyle(ths[1]).boxShadow : 'nf',
    th1BorderRight: ths[1] ? getComputedStyle(ths[1]).borderRight : 'nf',
    tdBoxShadow: td ? getComputedStyle(td).boxShadow : 'nf',
    tdBorderRight: td ? getComputedStyle(td).borderRight : 'nf',
    td2BoxShadow: td2 ? getComputedStyle(td2).boxShadow : 'nf',
    td2BorderRight: td2 ? getComputedStyle(td2).borderRight : 'nf',
  };
});
console.log(JSON.stringify(info, null, 2));

await page.screenshot({ path: '/tmp/table-screenshot.png', fullPage: true });
console.log('Screenshot saved');
await browser.close();
})();
