import ApiError from '../utils/ApiError.js';
import config from '../config/env.js';

export const notFound = (req, _res, next) => {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
};

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, _req, res, _next) => {
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Internal server error';
  let details = err.details || null;

  // Express/body-parser attach an HTTP status to malformed and oversized
  // request bodies. Preserve those client errors instead of reporting 500.
  if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Request body contains invalid JSON';
    details = null;
  } else if (err.type === 'entity.too.large') {
    statusCode = 413;
    message = 'Request body is too large';
    details = null;
  } else if (err.name === 'MulterError') {
    statusCode = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'Uploaded file exceeds the configured size limit' : 'The uploaded file request is invalid';
    details = null;
  }

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

  if (res.headersSent) {
    return res.destroy(err);
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
