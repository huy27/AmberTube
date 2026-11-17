// Runs every E2E suite against a running app (npm run build && npm run preview).
// Requires Playwright: npm i -D playwright && npx playwright install chromium
const { execFileSync } = require('child_process');
const path = require('path');
require('./fixtures.cjs');
const suites = ['player-queue-persistence', 'sleep-timer', 'voice-lyrics-visualizer', 'moods-youtube-shortcuts-focus-history', 'focus-mode', 'car-search-reco-autoplay'];
let failed = 0;
for (const s of suites) {
  console.log(`\n=== ${s}`);
  try {
    execFileSync(process.execPath, [path.join(__dirname, `${s}.cjs`)], { stdio: 'inherit' });
  } catch {
    failed++;
  }
}
process.exit(failed ? 1 : 0);
