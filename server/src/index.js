import { createApp } from './app.js';
import connectDB from './config/db.js';
import config from './config/env.js';
import ensureOwnerAccount from './services/bootstrap.js';

async function start() {
  try {
    await connectDB();
    console.log(`[db] Connected to MongoDB (${config.env})`);

    await ensureOwnerAccount();

    const app = createApp();
    app.listen(config.port, () => {
      console.log(`[server] QuickLink API listening on http://localhost:${config.port}`);
    });
  } catch (err) {
    console.error('[server] Failed to start:', err.message);
    process.exit(1);
  }
}

start();
