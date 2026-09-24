import { apiRoutes } from './api.router';
import { bootServer } from './core/http/server';
import { executeStartupJobs } from './jobs';

// Composition root: the only file that wires core infrastructure to the modules.
bootServer({ apiRoutes, startupJobs: executeStartupJobs }).catch((err) => {
  console.error('[boot] Failed to start server:', err);
  process.exit(1);
});
