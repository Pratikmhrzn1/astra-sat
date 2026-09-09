import { startServer } from './http/server';

startServer().catch((err) => {
  console.error('[boot] Failed to start server:', err);
  process.exit(1);
});
