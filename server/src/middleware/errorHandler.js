import ApiError from '../utils/ApiError.js';
import config from '../config/env.js';

export const notFound = (req, _res, next) => {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
};

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, _req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let details = err.details || null;

  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation failed';
    details = Object.values(err.errors).map((e) => ({
      path: e.path,
      message: e.message,
    }));
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid value for ${err.path}`;
  } else if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {}).join(', ');
    message = `Duplicate value for ${field || 'field'}`;
    details = err.keyValue || null;
  }

  if (statusCode >= 500) {
    // Log server errors for diagnosis, never leak internals to the client in prod.
    console.error('[error]', err);
    if (config.isProd) message = 'Internal server error';
  }

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      details,
    },
  });
};

export default errorHandler;
