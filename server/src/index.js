import { createApp } from './app.js';
import connectDB, { disconnectDB } from './config/db.js';
import config from './config/env.js';
import ensureOwnerAccount from './services/bootstrap.js';
import { syncAllIndexes } from './models/syncIndexes.js';

async function start() {
  try {
    await connectDB();
    console.log(`[db] Connected to MongoDB (${config.env})`);

    // Best-effort: reconcile indexes so stale indexes from older schema
    // versions never block valid writes. Never prevent startup on failure.
    try {
      await syncAllIndexes();
    } catch (err) {
      console.warn('[db] Index sync skipped:', err.message);
    }

    await ensureOwnerAccount();

    const app = createApp();
    // Bind explicitly to all interfaces and use the platform-provided PORT
    // (Render/Railway/etc.). Never hardcode the production port.
    const server = app.listen(config.port, '0.0.0.0', () => {
      console.log(`[server] QuickLink API listening on 0.0.0.0:${config.port} (${config.env})`);
    });

    // Keep timeouts slightly above typical proxy idle timeouts.
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;

    const shutdown = (signal) => {
      console.log(`[server] ${signal} received — shutting down gracefully`);
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
