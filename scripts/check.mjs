// Runs every check: engine parity with the legacy results, then unit/integrity tests.
await import('./test-parity.mjs');
await import('./test-units.mjs');
await import('./test-personal.mjs');
await import('./test-i18n.mjs');
