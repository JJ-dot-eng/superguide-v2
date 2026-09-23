// Runs every check: engine parity with the legacy results, then unit/integrity tests.
await import('./test-parity.mjs');
await import('./test-units.mjs');
