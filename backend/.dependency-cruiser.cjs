/**
 * Import boundaries for the backend. Run `npm run depcruise`.
 *
 * Rules are tightened as the architecture migration lands (see
 * backend/README.md): cycles fail now; layer rules are added per step.
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Import cycles make module order fragile and hide real coupling.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'core-is-infrastructure',
      severity: 'error',
      comment: 'core/ (config, db, http, lib, errors) must not know about features. Wire modules in src/index.ts.',
      from: { path: '^src/core/' },
      to: { path: '^src/(modules|jobs|api\\.router)' },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'A module nothing imports is dead code or a missing route.',
      from: { orphan: true, pathNot: ['\\.d\\.ts$', '(^|/)index\\.ts$', 'db/seed\\.ts$'] },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
  },
};
