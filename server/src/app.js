import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import mongoose from 'mongoose';
import config, { isAllowedOrigin } from './config/env.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import schoolRoutes from './routes/schoolRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import studentRoutes from './routes/studentRoutes.js';
import admissionPackRoutes from './routes/admissionPackRoutes.js';
import admissionApplicationRoutes from './routes/admissionApplicationRoutes.js';
import admissionChecklistRoutes from './routes/admissionChecklistRoutes.js';
import guardianRoutes from './routes/guardianRoutes.js';
import onboardingRoutes from './routes/onboardingRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import parentRoutes from './routes/parentRoutes.js';

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

  // Liveness probe: the process is up and serving HTTP. Deliberately does NOT
  // depend on the database so a DB outage never causes an infinite restart loop.
  const isDbReady = () => mongoose.connection.readyState === 1;
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  // Readiness probe: distinguishes DB readiness from process liveness.
  app.get('/health/ready', (_req, res) => {
    const ready = isDbReady();
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not-ready',
      db: ready ? 'up' : 'down',
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/schools', schoolRoutes);
  app.use('/api/students', studentRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/admission-packs', admissionPackRoutes);
  app.use('/api/admissions', admissionApplicationRoutes);
  app.use('/api/admission-checklist', admissionChecklistRoutes);
  app.use('/api/guardians', guardianRoutes);
  app.use('/api/onboarding', onboardingRoutes);
  app.use('/api/conversations', messageRoutes);
  app.use('/api/parent', parentRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export default createApp;
