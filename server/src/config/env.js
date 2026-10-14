import dotenv from 'dotenv';

dotenv.config();

const toBool = (v) => String(v).toLowerCase() === 'true';

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/quicklink',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-insecure-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:5174')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  owner: {
    name: process.env.OWNER_NAME || 'QuickLink Owner',
    email: (process.env.OWNER_EMAIL || 'owner@quicklink.local').toLowerCase(),
    password: process.env.OWNER_PASSWORD || 'ChangeMe123!',
  },
  isProd: (process.env.NODE_ENV || 'development') === 'production',
  isTest: (process.env.NODE_ENV || 'development') === 'test',
  trustProxy: toBool(process.env.TRUST_PROXY),
};

if (config.isProd && config.jwtSecret === 'dev-only-insecure-secret') {
  // Fail fast in production when the JWT secret was not configured.
  throw new Error('JWT_SECRET must be set in production');
}

// In development any localhost / 127.0.0.1 port is allowed, so Vite falling back
// to another port (5174, 5175, …) never breaks CORS. Configure CORS_ORIGIN for
// deployed environments.
export function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (config.corsOrigin.includes('*')) return true;
  if (config.corsOrigin.includes(origin)) return true;
  if (!config.isProd && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)) {
    return true;
  }
  return false;
}

export default config;
