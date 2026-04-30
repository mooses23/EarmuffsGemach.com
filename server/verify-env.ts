/**
 * Environment Variable Verification CLI.
 *
 * Thin wrapper around `collectStartupCheckMessages` from
 * `server/startup-checks.ts` so the boot-time checker is the single source
 * of truth for which env vars are required / warning / notice. Run with:
 *
 *   npm run verify-env
 *
 * Exits with code 1 when there are any errors (missing required vars in the
 * current NODE_ENV) and 0 otherwise. Warnings and notices are printed but
 * never fail the process.
 */

import { collectStartupCheckMessages } from './startup-checks.js';

const { errors, warnings, notices } = collectStartupCheckMessages();

console.log(`Verifying environment variables (NODE_ENV=${process.env.NODE_ENV ?? 'unset'})...\n`);

if (errors.length > 0) {
  console.log('ERRORS (required vars missing — deploy will fail):');
  for (const e of errors) console.log(`  - ${e}`);
  console.log('');
}

if (warnings.length > 0) {
  console.log('WARNINGS (features will be degraded or disabled):');
  for (const w of warnings) console.log(`  - ${w}`);
  console.log('');
}

if (notices.length > 0) {
  console.log('NOTICES (defaults / fallbacks in use):');
  for (const n of notices) console.log(`  - ${n}`);
  console.log('');
}

console.log('='.repeat(60));
if (errors.length > 0) {
  console.log(`FAILED: ${errors.length} required variable(s) missing.`);
  console.log('Set these in the deployment environment before deploying.');
  process.exit(1);
}

if (warnings.length > 0) {
  console.log(`OK with ${warnings.length} warning(s). The app will start but some features will be limited.`);
} else {
  console.log('All environment variables are configured correctly.');
}
process.exit(0);
