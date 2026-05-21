/**
 * Reusable Express middleware for validating request body, params, or query fields.
 * Schema format:
 * {
 *   body/params/query: {
 *     fieldName: {
 *       required: boolean,
 *       type: 'string' | 'number' | 'array' | 'boolean',
 *       enum: Array<any>
 *     }
 *   }
 * }
 */
function validate(schema) {
  return (req, res, next) => {
    for (const [location, fields] of Object.entries(schema)) {
      let data;
      if (location === 'body') data = req.body;
      else if (location === 'params') data = req.params;
      else if (location === 'query') data = req.query;
      else continue;

      if (!data && Object.keys(fields).length > 0) {
        return res.status(400).json({ error: `Request ${location} is missing` });
      }

      for (const [field, rules] of Object.entries(fields)) {
        const val = data[field];

        // 1. Required Check
        if (rules.required && (val === undefined || val === null || (typeof val === 'string' && val.trim() === ''))) {
          return res.status(400).json({ error: `Field '${field}' in ${location} is required.` });
        }

        // 2. Type Check (if present)
        if (val !== undefined && val !== null && val !== '') {
          if (rules.type === 'number') {
            const num = Number(val);
            if (isNaN(num)) {
              return res.status(400).json({ error: `Field '${field}' in ${location} must be a valid number.` });
            }
          } else if (rules.type === 'array' && !Array.isArray(val)) {
            return res.status(400).json({ error: `Field '${field}' in ${location} must be an array.` });
          } else if (rules.type === 'boolean') {
            const isBool = val === true || val === false || val === 'true' || val === 'false' || val === 1 || val === 0 || val === '1' || val === '0';
            if (!isBool) {
              return res.status(400).json({ error: `Field '${field}' in ${location} must be a boolean.` });
            }
          }
          
          // 3. Enum Check
          if (rules.enum && !rules.enum.includes(val)) {
            return res.status(400).json({ error: `Field '${field}' in ${location} must be one of: ${rules.enum.join(', ')}.` });
          }
        }
      }
    }
    next();
  };
}

/**
 * Standard Express try/catch wrapper for synchronous and asynchronous route handlers.
 * Ensures all unexpected runtime errors are gracefully passed to the global error middleware.
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    try {
      fn(req, res, next);
    } catch (err) {
      next(err);
    }
  };
}

module.exports = {
  validate,
  asyncHandler
};
