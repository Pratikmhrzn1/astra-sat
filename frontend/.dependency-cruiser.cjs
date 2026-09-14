/**
 * Import boundaries for the frontend. Run `npm run depcruise`.
 *
 * Rules are tightened as the architecture migration lands (see
 * frontend/README.md): cycles fail now; layer rules are added per step.
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
      name: 'no-orphans',
      severity: 'warn',
      comment: 'A module nothing imports is dead code or a missing route.',
      from: { orphan: true, pathNot: ['\\.d\\.ts$', '(^|/)main\\.tsx$'] },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { extensions: ['.ts', '.tsx', '.js'] },
  },
};
