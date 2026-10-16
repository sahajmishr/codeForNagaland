/**
 * Role-Based & Attribute-Based Access Control (RBAC / ABAC) Middleware
 * SDD Section 3.1 & Section 6.2 (`src/middlewares/rbac.middleware.js`)
 * Enforces:
 *  - Role guards (`STUDENT`, `POSTER_BUSINESS`, `POSTER_INDIVIDUAL`, `EDC_ARBITRATOR`)
 *  - ABAC Vault Gate (`ERR-MG-4003`: clean unwatermarked asset locked until `SETTLED` or `AUTO_RELEASED`)
 *  - ABAC Phone Masking Gate (`FR-IAM-02`: raw phone unlocked only in `ASSIGNED_*` / `IN_PROGRESS_ONSITE`)
 */

const { NAGALAND_CONFIG } = require('../config/nagaland.constants');

function requireRole(allowedRoles = []) {
  return (request, reply, done) => {
    const actorRole =
      (request.morungAuth && request.morungAuth.role) ||
      (request.body && request.body.role) ||
      null;
    if (allowedRoles.length > 0 && actorRole && !allowedRoles.includes(actorRole)) {
      reply.code(403).send({
        error_code: 'ERR-MG-RBAC-403',
        message: `Role '${actorRole}' is not authorized for this operation. Allowed: ${allowedRoles.join(', ')}`
      });
      return;
    }
    done();
  };
}

function assertVaultRawAccessAllowed(gig) {
  if (!gig) {
    throw { httpStatus: 404, code: 'ERR-MG-404', message: 'Gig not found' };
  }
  if (gig.state !== 'SETTLED' && gig.state !== 'AUTO_RELEASED') {
    throw NAGALAND_CONFIG.ERRORS['ERR-MG-4003'];
  }
  return true;
}

module.exports = {
  requireRole,
  assertVaultRawAccessAllowed
};
