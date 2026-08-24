import { execSync } from 'child_process';

async function verifyRollupNativeBinding() {
  try {
    const rollup = await import('rollup');
    if (rollup && rollup.VERSION) {
      console.log(`[build] Rollup native binary verified successfully (v${rollup.VERSION}).`);
      return;
    }
  } catch (err) {
    console.warn('[build] Rollup native binary missing in current environment. Installing platform package...');
    try {
      execSync('npm install --no-save @rollup/rollup-linux-x64-gnu@4.62.5', { stdio: 'inherit' });
      console.log('[build] @rollup/rollup-linux-x64-gnu installed successfully.');
    } catch (installErr) {
      console.error('[build] Could not install @rollup/rollup-linux-x64-gnu:', installErr?.message);
    }
  }
}

verifyRollupNativeBinding();
