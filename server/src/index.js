import { createApp } from './app.js';
import connectDB, { disconnectDB } from './config/db.js';
import config from './config/env.js';
import ensureOwnerAccount from './services/bootstrap.js';
import { syncAllIndexes } from './models/syncIndexes.js';
import { createServer } from 'node:http';
import { initializeClassRealtime } from './services/classRealtime.js';
import { validateCloudinaryConfig } from './services/cloudinary.js';

async function start() {
  try {
    validateCloudinaryConfig();
    const app = createApp();
    app.locals.startupReady = false;
    const server = createServer(app);
    initializeClassRealtime(server);
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;

    // Start answering liveness probes before database setup and index work.
    await new Promise((resolve, reject) => {
      const onError = (error) => reject(error);
      server.once('error', onError);
      server.listen(config.port, '0.0.0.0', () => {
        server.off('error', onError);
        console.log(`[server] QuickLink API listening on 0.0.0.0:${config.port} (${config.env})`);
        resolve();
      });
    });

    const shutdown = (signal) => {
      console.log(`[server] ${signal} received â€” shutting down gracefully`);
      server.close(async () => {
        try {
          await disconnectDB();
        } catch {
          /* ignore */
        }
        console.log('[server] Shutdown complete');
        process.exit(0);
      });
      // Force-exit if graceful shutdown stalls.
      setTimeout(() => process.exit(1), 10000).unref();
    };

    for (const signal of ['SIGTERM', 'SIGINT']) {
      process.on(signal, () => shutdown(signal));
    }

    await connectDB();
    console.log(`[db] Connected to MongoDB (${config.env})`);
    await ensureOwnerAccount();
    app.locals.startupReady = true;

    // Reconcile indexes after the API is ready; this is best-effort maintenance
    // and must not hold up Render's startup or health checks.
    syncAllIndexes().catch((err) => {
      console.warn('[db] Index sync skipped:', err.message);
    });
  } catch (err) {
    console.error('[server] Failed to start:', err.message);
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught exception:', err);
  process.exit(1);
});

start();
