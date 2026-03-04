export function errorHandler(err, req, res, next) {
  console.error(err.stack);
  const status = err.statusCode || 500;
  const response = { error: err.message || 'Internal Server Error' };
  if (process.env.NODE_ENV === 'development') {
    response.details = err.stack;
  }
  res.status(status).json(response);
}
