/**
 * JWT & Session Authentication Middleware
 * SDD Section 3.1 & Section 6.1 (`src/middlewares/auth.middleware.js`)
 */

const { verifyJwt } = require('../utils/crypto.utils');

function extractAuthenticatedActor(request) {
  const authHeader = request.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const verified = verifyJwt(token);
    if (verified.valid && verified.payload) {
      return {
        authenticated: true,
        user_id: verified.payload.sub,
        role: verified.payload.role,
        corridor: verified.payload.corridor
      };
    }
  }
  return {
    authenticated: false,
    user_id: request.headers['x-morung-actor-id'] || null,
    role: request.headers['x-morung-role'] || null
  };
}

function authPreHandler(request, reply, done) {
  request.morungAuth = extractAuthenticatedActor(request);
  done();
}

module.exports = {
  extractAuthenticatedActor,
  authPreHandler
};
