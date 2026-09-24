import express, { type Express, type Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { settings } from '../config/env';
import { errorResponder, unmatchedRouteHandler } from './middleware/error';

/**
 * Builds the Express application.
 *
 * Kept free of side effects (no port binding, no migrations) so tests can
 * construct an app without starting a server — see http/server.ts for boot.
 * The API router is passed in so core never imports a feature module.
 */
export function buildApp(apiRoutes: Router): Express {
  const app = express();

  // Behind nginx/Render: trust one proxy hop so req.ip and `secure` reflect the
  // original request rather than the proxy's connection.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      origin: settings.http.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );
  // The limit is generous because teachers paste whole question sets as JSON.
  app.use(express.json({ limit: settings.http.jsonBodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: settings.http.jsonBodyLimit }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  app.use('/api', apiRoutes);
  app.use('/uploads', express.static(settings.uploads.dir));

  // Order matters: unmatched route first, then the single error responder.
  app.use(unmatchedRouteHandler);
  app.use(errorResponder);

  return app;
}
