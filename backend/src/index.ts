import { apiRouter } from './api.router';
import { startServer } from './core/http/server';
import { runStartupJobs } from './jobs';

// Composition root: the only file that wires core infrastructure to the modules.
startServer({ apiRouter, startupJobs: runStartupJobs }).catch((err) => {
  console.error('[boot] Failed to start server:', err);
  process.exit(1);
});
