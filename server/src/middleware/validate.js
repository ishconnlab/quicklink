import ApiError from '../utils/ApiError.js';
import { formatZodError } from '../utils/validators.js';

// Validate req[source] against a zod schema and replace it with the parsed value.
export const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    return next(ApiError.badRequest('Validation failed', formatZodError(result.error)));
  }
  req[source] = result.data;
  next();
};

export default validate;
