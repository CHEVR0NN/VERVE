// middleware/errorHandler.js
// Global error handler — logs technical detail server-side, returns a
// user-friendly message to the client.

const FRIENDLY_BY_STATUS = {
  400: 'Something in the request didn\'t look right. Please review and try again.',
  401: 'Please sign in to continue.',
  403: 'You don\'t have permission to do that.',
  404: 'We couldn\'t find what you were looking for.',
  409: 'That action conflicts with the current state. Please refresh and try again.',
  422: 'Some required information is missing or invalid. Please check the form.',
  429: 'Too many requests. Please wait a moment and try again.',
};

const FRIENDLY_DEFAULT = 'Something went wrong on our end. Please try again in a moment.';

const errorHandler = (err, req, res, next) => {
  const axiosStatus  = err.response?.status;
  const axiosMessage = err.response?.data?.message || err.response?.data;
  const statusCode   = err.statusCode || axiosStatus || 500;
  const technical    = (typeof axiosMessage === 'string' ? axiosMessage : null)
                    || err.message
                    || 'Internal server error';

  const requestId = req.id || '-';
  console.error(`[ERROR] ${requestId} ${statusCode} — ${technical}`, err.stack);
  if (axiosStatus) {
    console.error(`[GHL Response] ${requestId} status=${axiosStatus}`, JSON.stringify(err.response?.data));
  }

  // Pass through messages that controllers set explicitly (they're already
  // written for end-users). Otherwise return a generic friendly message —
  // never expose raw upstream/axios/stack content to the client.
  const isControllerMessage = err.isUserFriendly === true;
  const message = isControllerMessage
    ? technical
    : (FRIENDLY_BY_STATUS[statusCode] || FRIENDLY_DEFAULT);

  res.status(statusCode).json({
    success: false,
    message,
    request_id: requestId,
  });
};

module.exports = { errorHandler };
