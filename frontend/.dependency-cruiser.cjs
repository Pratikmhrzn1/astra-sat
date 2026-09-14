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
      name: 'shared-is-domain-free',
      severity: 'error',
      comment: 'shared/ (ui, api client, lib, hooks) knows nothing about the product. Inject what it needs (see configureSession).',
      from: { path: '^src/shared/' },
      to: { path: '^src/(app|features|entities)/' },
    },
    {
      name: 'entities-below-features',
      severity: 'error',
      comment: 'entities/ are primitives features build on; they never reach up into a feature or the app.',
      from: { path: '^src/entities/' },
      to: { path: '^src/(app|features)/' },
    },
    {
      name: 'features-below-app',
      severity: 'error',
      comment: 'app/ composes features; a feature never imports the app shell or router.',
      from: { path: '^src/features/' },
      to: { path: '^src/app/' },
    },
    {
      name: 'feature-public-api',
      severity: 'error',
      comment: 'Another feature is reached through its index.ts, so each feature decides what it exposes.',
      from: { path: '^src/features/([^/]+)/' },
      to: { path: '^src/features/[^/]+/', pathNot: ['^src/features/$1/', '^src/features/[^/]+/index\\.ts$'] },
    },
    {
      name: 'entity-public-api',
      severity: 'error',
      comment: 'An entity is reached through its index.ts.',
      from: { path: '^src/(features|app)/' },
      to: { path: '^src/entities/[^/]+/', pathNot: ['^src/entities/[^/]+/index\\.ts$'] },
    },
    {
      name: 'entity-to-entity-public-api',
      severity: 'error',
      comment: 'One entity reaches another through its index.ts.',
      from: { path: '^src/entities/([^/]+)/' },
      to: { path: '^src/entities/[^/]+/', pathNot: ['^src/entities/$1/', '^src/entities/[^/]+/index\\.ts$'] },
    },
    {
      name: 'app-uses-public-api',
      severity: 'error',
      comment: 'The app imports a feature through its index.ts, or a page module directly so the router can code-split it.',
      from: { path: '^src/(app/|main\\.tsx$)' },
      to: { path: '^src/features/[^/]+/', pathNot: ['^src/features/[^/]+/index\\.ts$', '^src/features/[^/]+/pages/'] },
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
