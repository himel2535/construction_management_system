const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = '/Users/monwarhossanhimel/.gemini/antigravity-ide/brain/ecc7b25e-dfd4-4414-9504-fff2f528b059';

const themes = [
  {
    name: 'royal-blue',
    colors: {
      '--brand-900': '#1e3a8a',
      '--brand-800': '#1e40af',
      '--brand-700': '#1d4ed8',
      '--brand-600': '#2563eb',
      '--brand-500': '#3b82f6', // The active tab color
      '--brand-400': '#60a5fa',
    }
  },
  {
    name: 'midnight-slate',
    colors: {
      '--brand-900': '#0f172a',
      '--brand-800': '#1e293b',
      '--brand-700': '#334155',
      '--brand-600': '#475569',
      '--brand-500': '#0f172a', // Active tab is dark slate
      '--brand-400': '#94a3b8',
    }
  },
  {
    name: 'emerald-teal',
    colors: {
      '--brand-900': '#134e4a',
      '--brand-800': '#115e59',
      '--brand-700': '#0f766e',
      '--brand-600': '#0d9488',
      '--brand-500': '#14b8a6', // Active tab
      '--brand-400': '#2dd4bf',
    }
  }
];

(async () => {
  console.log("Launching browser...");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.setViewportSize({ width: 1440, height: 900 });
  console.log("Navigating to suppliers page...");
  await page.goto('http://localhost:3000/suppliers', { waitUntil: 'networkidle' });
  
  // Ensure the page is fully loaded and tabs are visible
  await page.waitForTimeout(2000);

  for (const theme of themes) {
    console.log(`Injecting theme: ${theme.name}...`);
    await page.evaluate((colors) => {
      for (const [key, value] of Object.entries(colors)) {
        document.documentElement.style.setProperty(key, value);
      }
    }, theme.colors);
    
    // Wait for repaint
    await page.waitForTimeout(500);
    
    const outputPath = path.join(OUTPUT_DIR, `theme_${theme.name}.png`);
    await page.screenshot({ path: outputPath });
    console.log(`Saved screenshot to ${outputPath}`);
  }

  await browser.close();
  console.log("Done!");
})();
