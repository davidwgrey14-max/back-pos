/**
 * Async error handler middleware
 * Wraps async functions to automatically catch errors and pass them to Express error handler
 */

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;