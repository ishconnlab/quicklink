import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import config, { isAllowedOrigin } from './config/env.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import schoolRoutes from './routes/schoolRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import reportRoutes from './routes/reportRoutes.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', config.trustProxy ? 1 : false);

  app.use(helmet());
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use(
    cors({
      origin(origin, callback) {
        // Disallowed origins get no CORS headers (the browser blocks them);
        // we avoid throwing so the request does not become a 500.
        return callback(null, isAllowedOrigin(origin));
      },
      credentials: true,
    })
  );

  if (!config.isTest) {
    app.use(morgan(config.isProd ? 'combined' : 'dev'));
  }

  app.get('/api/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok', time: new Date().toISOString() } });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/schools', schoolRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/reports', reportRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export default createApp;
