import { HttpError } from '../errors.js';

export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(new HttpError(400, result.error.issues.map((issue) => issue.message).join('; ')));
    }
    if (source === 'body') {
      req.body = result.data;
    } else {
      req.validated = { ...req.validated, [source]: result.data };
    }
    return next();
  };
}
