import dotenv from 'dotenv';

dotenv.config();

const toBool = (v) => String(v).toLowerCase() === 'true';

// Render (and several other PaaS providers) export RENDER=true at runtime.
// Infer production when NODE_ENV is not set explicitly, so production-only
// behaviour (CORS, error masking) is correct even if the dashboard omits it.
const ON_RENDER = process.env.RENDER === 'true' || Boolean(process.env.RENDER_EXTERNAL_URL);
const explicitNodeEnv = process.env.NODE_ENV;
const env = explicitNodeEnv || (ON_RENDER ? 'production' : 'development');
const isProd = env === 'production';
const isTest = env === 'test';

const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:5174'];
// Known deployed frontend origins. Always allowed in production so the API
// keeps working even if CORS_ORIGIN is unset; CORS_ORIGIN can additionally add
// custom domains.
const PROD_ORIGINS = ['https://quicklink-zeta.vercel.app'];

const configuredOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const corsOrigin = isProd
  ? Array.from(new Set([...configuredOrigins, ...PROD_ORIGINS]))
  : configuredOrigins.length
    ? configuredOrigins
    : DEV_ORIGINS;

export const config = {
  env,
  port: parseInt(process.env.PORT || '4000', 10),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/quicklink',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-insecure-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  corsOrigin,
  owner: {
    name: process.env.OWNER_NAME || 'QuickLink Owner',
    email: (process.env.OWNER_EMAIL || 'owner@quicklink.local').toLowerCase(),
    password: process.env.OWNER_PASSWORD || 'ChangeMe123!',
  },
  isProd,
  isTest,
  // Behind a reverse proxy (Render) unless explicitly disabled.
  trustProxy: toBool(process.env.TRUST_PROXY) || ON_RENDER,
};

if (config.jwtSecret === 'dev-only-insecure-secret' && config.isProd) {
  // Fail fast only when production was requested explicitly. When production is
  // merely inferred (Render without NODE_ENV) we warn instead of crashing the
  // running service, so a missing secret never causes a deploy restart loop.
  if (explicitNodeEnv === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }
  // eslint-disable-next-line no-console
  console.warn(
    '[config] JWT_SECRET is not set — using an insecure default. Set JWT_SECRET in the environment.'
  );
}

// In development any localhost / 127.0.0.1 port is allowed, so Vite falling back
// to another port (5174, 5175, …) never breaks CORS. In production only the
// configured and known frontend origins are allowed.
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
