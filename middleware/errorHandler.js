/**
 * A centralized error handling middleware for Express.
 * This function catches errors passed by `next(error)` and sends a
 * standardized JSON response.
 *
 * @param {Error} err - The error object.
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 * @param {Function} next - The next middleware function.
 */
const errorHandler = (err, req, res, next) => {
    // Log the error for debugging purposes. In a production environment,
    // you would use a more robust logging library like Winston or Pino.
    // eslint-disable-next-line no-console
    console.error(err);

    // Default to 500 Internal Server Error if a status code is not set on the error
    let statusCode = err.statusCode || 500;
    let message = err.message || "An unexpected error occurred on the server.";

    // Customize error messages for specific error types to provide more context
    // while avoiding leaking sensitive details.

    if (err.name === "UnauthorizedError") {
        // Error from express-jwt or similar libraries
        statusCode = 401;
        message = "Invalid or missing token.";
    }

    if (err.name === "JsonWebTokenError") {
        statusCode = 401;
        message = "The provided token is malformed or invalid.";
    }

    if (err.name === "TokenExpiredError") {
        statusCode = 401;
        message = "The provided token has expired. Please log in again.";
    }

    if (err.name === "CastError") {
        // Mongoose-specific error for invalid ObjectId
        statusCode = 400;
        message = `Invalid resource identifier: ${err.value}`;
    }

    if (err.code === "EBADCSRFTOKEN") {
        // csurf-specific error
        statusCode = 403;
        message = "Invalid CSRF token. Request blocked.";
    }

    // In a production environment, you might want to send a more generic message
    // for 500-level errors to avoid leaking implementation details.
    if (process.env.NODE_ENV === "production" && statusCode === 500) {
        message = "Internal Server Error";
    }

    res.status(statusCode).json({
        status: "error",
        statusCode: statusCode,
        message: message,
        // Optionally include the stack trace in development mode
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
};

module.exports = errorHandler;