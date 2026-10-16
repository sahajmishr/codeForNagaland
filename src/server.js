/**
 * MORUNGGIG (SKILLBRIDGE NL) — STATELESS OMNI-CHANNEL FASTIFY SERVER
 * Implements SRS Section 3.1.3 & SDD Section 2, 3.2, 3.5, 3.6, 3.7
 */

require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const Fastify = require('fastify');
const fastifyCors = require('@fastify/cors');
const fastifyCookie = require('@fastify/cookie');
const fastifyStatic = require('@fastify/static');

const { db } = require('./db/database');
const { engine } = require('./services/morunggig.engine');
const { NAGALAND_CONFIG } = require('./config/nagaland.constants');
const {
  signJwt,
  verifyJwt,
  createWebhookSignature,
  verifyWebhookHmac,
  generateQrSvg
} = require('./utils/crypto.utils');
const { parseNagameseOrEnglishUtterance } = require('./utils/validation.utils');

function buildServer(options = {}) {
  // SDD Section 3.7.1: Structured JSON Logger with automatic PII redaction
  const fastify = Fastify({
    trustProxy: true,
    logger: options.logger !== undefined ? options.logger : {
      level: process.env.LOG_LEVEL || 'info',
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.roll_number',
          'req.body.aadhaar_last4',
          'req.body.upi_vpa',
          'req.body.start_pin',
          'req.body.complete_pin',
          'req.body.googleClientSecret',
          'req.body.databaseUrl'
        ],
        censor: '[REDACTED_ZERO_PII]'
      }
    }
  });

  let isShuttingDown = false;

  fastify.register(fastifyCors, {
    origin: true,
    credentials: true
  });

  fastify.register(fastifyCookie);

  fastify.register(fastifyStatic, {
    root: path.join(__dirname, '../public'),
    prefix: '/'
  });

  // Attach request_id & extract JWT user if present
  fastify.addHook('onRequest', async (req, reply) => {
    req.requestId = `req_${crypto.randomBytes(4).toString('hex')}`;
    reply.header('X-Request-Id', req.requestId);
    // Allow embedding inside Arena preview iframe cleanly
    reply.header('Access-Control-Allow-Origin', '*');

    let token = null;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.slice(7).trim();
    } else if (req.cookies && req.cookies.mg_access_token) {
      token = req.cookies.mg_access_token;
    }

    if (token) {
      const verified = verifyJwt(token);
      if (verified && !verified.expired && verified.payload) {
        req.user = verified.payload;
      }
    }
  });

  const sendError = (reply, errObj, reqId) => {
    const status = errObj.status || 400;
    return reply.code(status).send({
      success: false,
      error: {
        code: errObj.code || 'ERR-MG-3001',
        title: errObj.title || 'Request Error',
        detail: errObj.detail || 'An error occurred processing the request.',
        status
      },
      meta: {
        request_id: reqId,
        timestamp: new Date().toISOString()
      }
    });
  };

  // ==========================================================================
  // 1. HEALTH & OBSERVABILITY PROBES (SDD Section 3.7.2)
  // ==========================================================================
  fastify.get('/health/live', async () => ({
    status: 'UP',
    service: 'morunggig-skillbridge-nl-api',
    uptime_s: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  }));

  fastify.get('/api/v1/health', async () => ({
    status: 'UP',
    service: 'morunggig-skillbridge-nl-api',
    uptime_s: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  }));

  fastify.get('/health/ready', async (req, reply) => {
    if (isShuttingDown) {
      return reply.code(503).send({ status: 'SHUTTING_DOWN' });
    }
    return {
      status: 'READY',
      connection: db.getConnectionStatus(),
      worker_queues: engine.workerMetrics
    };
  });

  // ==========================================================================
  // 2. OPENAPI 3.1.0 SPECIFICATION (SDD Section 3.6)
  // ==========================================================================
  fastify.get('/api/v1/docs.json', async () => ({
    openapi: '3.1.0',
    info: {
      title: 'MorungGig (SkillBridge NL) Omni-Channel API',
      version: '1.0.0',
      description: 'Stateless REST API serving Website PWA and Mobile Apps for Nagaland Campus Micro-Apprenticeships & Nodal UPI Task Exchange.'
    },
    paths: {
      '/api/v1/bootstrap': { get: { summary: 'Load full application state, Nagaland config & telemetry' } },
      '/api/v1/gigs/voice-parse': { post: { summary: 'SRS Endpoint 1: Parse Nagamese/English Utterance into Structured Gig' } },
      '/api/v1/gigs/create-and-lock': { post: { summary: 'SRS Endpoint 2: Create Scoped Gig & Lock Nodal UPI Escrow' } },
      '/api/v1/gigs': { get: { summary: 'Search & Filter Gigs with Corridor Auto-Fare Calculator' }, post: { summary: 'Create Scoped Gig' } },
      '/api/v1/gigs/{gigId}/assign': { post: { summary: 'Assign Solo Specialist (100%) or Morung Squad (70/30) + Standby Buddy' } },
      '/api/v1/gigs/{gigId}/checkpoint': { post: { summary: 'Submit 20% Early Progress Checkpoint' } },
      '/api/v1/gigs/{gigId}/handover': { post: { summary: 'Trigger Emergency Auto-Handover to Standby Buddy' } },
      '/api/v1/vault/{gigId}/deliver': { post: { summary: 'SRS Endpoint 3: Submit Deliverable to Anti-Theft Watermarked Vault' } },
      '/api/v1/vault/{gigId}/raw-file': { get: { summary: 'ABAC-Protected Clean Original Master File Download' } },
      '/api/v1/vault/{gigId}/revision': { post: { summary: 'Request Checklist Revision (Hard Cap: Max 2 Revisions)' } },
      '/api/v1/gigs/{gigId}/onsite/pin-handshake': { post: { summary: 'Verify 4-Digit START_PIN or COMPLETE_PIN for Offline Gigs' } },
      '/api/v1/gigs/{gigId}/safety-sos': { post: { summary: 'Trigger 1-Tap ANCSU / Student Union Safety SOS Beacon' } },
      '/api/v1/escrow/{gigId}/settle': { post: { summary: 'SRS Endpoint 4: Approve Delivery / Complete PIN / 36h Auto-Release / EDC Settlement' } },
      '/api/v1/arbitration/{gigId}/dispute': { post: { summary: 'Escalate Unfulfilled Checkbox to 60s YouthNet EDC Arbitrator' } },
      '/api/v1/arbitration/{gigId}/resolve': { post: { summary: '60-Second YouthNet EDC Checklist Resolution (100/0, 50/50, 0/100)' } },
      '/api/v1/webhooks/payments': { post: { summary: 'HMAC-SHA256 Verified Payment Gateway Webhook' } }
    }
  }));

  // ==========================================================================
  // 3. BOOTSTRAP & SYSTEM CLOUD CONFIGURATION (NEON DB + GOOGLE OAUTH)
  // ==========================================================================
  fastify.get('/api/v1/bootstrap', async (req) => {
    const studentCorridor = req.query.student_corridor || 'SOVIMA_6MILE';
    const viewerId = req.query.viewer_id || (req.user ? req.user.sub : 'USR-STU-01');
    const telemetry = engine.getTelemetryAndImpact();

    return {
      success: true,
      data: {
        config: NAGALAND_CONFIG,
        connection: db.getConnectionStatus(),
        users: db.state.users.map((u) => engine.sanitizeUserForView(u, viewerId)),
        gigs: engine.listGigs({ student_corridor: studentCorridor, viewer_id: viewerId }),
        telemetry,
        notifications: db.state.notifications_outbox.slice(0, 30)
      },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() }
    };
  });

  fastify.post('/api/v1/system/config', async (req) => {
    const body = req.body || {};
    const updates = {};
    if (body.databaseUrl !== undefined) updates.databaseUrl = String(body.databaseUrl).trim();
    if (body.googleClientId !== undefined) updates.googleClientId = String(body.googleClientId).trim();
    if (body.googleClientSecret !== undefined) updates.googleClientSecret = String(body.googleClientSecret).trim();
    if (body.googleRedirectUri !== undefined) updates.googleRedirectUri = String(body.googleRedirectUri).trim();

    db.saveRuntimeConfig(updates);
    let pgResult = null;
    if (body.databaseUrl !== undefined) {
      pgResult = await db.initPostgres(updates.databaseUrl);
    }

    return {
      success: true,
      data: {
        connection: db.getConnectionStatus(),
        postgres_init: pgResult
      },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() }
    };
  });

  fastify.post('/api/v1/system/reset', async (req) => {
    db.resetToSeed();
    return {
      success: true,
      data: { message: 'All demo state reset to baseline Nagaland seed dataset.' },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() }
    };
  });

  // ==========================================================================
  // 4. IAM, GOOGLE OAUTH 2.0, OTP & ROLE SWITCHER (FR-IAM & SDD Section 3.2)
  // ==========================================================================
  fastify.post('/api/v1/auth/switch-role', async (req, reply) => {
    const { user_id } = req.body || {};
    const targetUser = db.state.users.find((u) => u.user_id === user_id) || db.state.users[0];
    const accessToken = signJwt({
      sub: targetUser.user_id,
      role: targetUser.role,
      corridor: targetUser.corridor_cluster,
      kyc_tier: 'INSTITUTION_VERIFIED'
    }, 900);

    reply.setCookie('mg_access_token', accessToken, { path: '/', httpOnly: false, maxAge: 900 });

    return {
      success: true,
      data: {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 900,
        user: engine.sanitizeUserForView(targetUser, targetUser.user_id)
      },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() }
    };
  });

  // Real Google OAuth 2.0 Authorization URL Generator
  fastify.get('/api/v1/auth/google/url', async (req) => {
    const clientId = db.runtimeConfig.googleClientId || process.env.GOOGLE_CLIENT_ID || '';
    const origin = req.headers.origin || `${req.protocol}://${req.headers.host}`;
    const redirectUri = db.runtimeConfig.googleRedirectUri || process.env.GOOGLE_REDIRECT_URI || `${origin}/api/v1/auth/google/callback`;
    const stateParam = Buffer.from(JSON.stringify({
      role: req.query.role || 'STUDENT',
      corridor: req.query.corridor || 'SOVIMA_6MILE',
      ts: Date.now()
    })).toString('base64url');

    if (!clientId) {
      return {
        success: true,
        data: {
          configured: false,
          redirect_uri_to_whitelist: redirectUri,
          message: 'Google OAuth Client ID not yet configured in .env or Cloud Config Modal. You can paste your GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET in Cloud Setup or use Instant Google Demo Sign-In.'
        }
      };
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account',
      state: stateParam
    });

    return {
      success: true,
      data: {
        configured: true,
        auth_url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
        redirect_uri: redirectUri
      }
    };
  });

  // Real Google OAuth 2.0 Callback Handler
  fastify.get('/api/v1/auth/google/callback', async (req, reply) => {
    const { code, state } = req.query || {};
    let stateObj = { role: 'STUDENT', corridor: 'SOVIMA_6MILE' };
    if (state) {
      try { stateObj = JSON.parse(Buffer.from(String(state), 'base64url').toString('utf8')); } catch { /* ignore */ }
    }

    const clientId = db.runtimeConfig.googleClientId || process.env.GOOGLE_CLIENT_ID;
    const clientSecret = db.runtimeConfig.googleClientSecret || process.env.GOOGLE_CLIENT_SECRET;
    const origin = `${req.protocol}://${req.headers.host}`;
    const redirectUri = db.runtimeConfig.googleRedirectUri || process.env.GOOGLE_REDIRECT_URI || `${origin}/api/v1/auth/google/callback`;

    if (!code || !clientId || !clientSecret) {
      return reply.redirect('/?oauth_error=missing_credentials_or_code');
    }

    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: String(code),
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        }).toString()
      });

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.access_token) {
        return reply.redirect(`/?oauth_error=${encodeURIComponent(tokenData.error_description || 'token_exchange_failed')}`);
      }

      const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });
      const profile = await profileRes.json();

      const user = await engine.findOrCreateGoogleUser({
        google_sub: profile.sub,
        email: profile.email,
        name: profile.name,
        role: stateObj.role || 'STUDENT',
        corridor_cluster: stateObj.corridor || 'SOVIMA_6MILE'
      });

      const jwtToken = signJwt({
        sub: user.user_id,
        role: user.role,
        corridor: user.corridor_cluster,
        kyc_tier: 'GOOGLE_OAUTH_VERIFIED'
      }, 3600);

      reply.setCookie('mg_access_token', jwtToken, { path: '/', httpOnly: false, maxAge: 3600 });
      return reply.redirect(`/?oauth_login=success&user_id=${encodeURIComponent(user.user_id)}`);
    } catch (err) {
      return reply.redirect(`/?oauth_error=${encodeURIComponent(err.message)}`);
    }
  });

  // Google OAuth Direct / Simulated Verification
  fastify.post('/api/v1/auth/google/verify', async (req, reply) => {
    const body = req.body || {};
    const user = await engine.findOrCreateGoogleUser({
      google_sub: body.google_sub || `ggl_${Date.now()}`,
      email: body.email || 'student.nagaland@gmail.com',
      name: body.name || 'merenla.jamir (Google Verified)',
      role: body.role || 'STUDENT',
      corridor_cluster: body.corridor_cluster || 'SOVIMA_6MILE'
    });

    const jwtToken = signJwt({
      sub: user.user_id,
      role: user.role,
      corridor: user.corridor_cluster,
      kyc_tier: 'GOOGLE_OAUTH_VERIFIED'
    }, 3600);

    reply.setCookie('mg_access_token', jwtToken, { path: '/', httpOnly: false, maxAge: 3600 });

    return {
      success: true,
      data: {
        access_token: jwtToken,
        user
      },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() }
    };
  });

  fastify.post('/api/v1/auth/otp/send', async (req) => {
    const res = engine.sendPhoneOtp((req.body || {}).phone);
    return {
      success: true,
      data: res,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() }
    };
  });

  fastify.post('/api/v1/auth/otp/verify', async (req, reply) => {
    const { phone, otp } = req.body || {};
    const res = engine.verifyPhoneOtp(phone, otp);
    if (!res.ok) return sendError(reply, res.error, req.requestId);

    const accessToken = signJwt({
      sub: res.user.user_id,
      role: res.user.role,
      corridor: res.user.corridor_cluster,
      kyc_tier: 'OTP_VERIFIED'
    }, 900);

    reply.setCookie('mg_access_token', accessToken, { path: '/', httpOnly: false, maxAge: 900 });
    return {
      success: true,
      data: {
        access_token: accessToken,
        user: res.user
      },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() }
    };
  });

  fastify.post('/api/v1/auth/onboard', async (req, reply) => {
    const res = await engine.onboardUser(req.body || {});
    if (!res.ok) return sendError(reply, res.error, req.requestId);

    const accessToken = signJwt({
      sub: res.user.user_id,
      role: res.user.role,
      corridor: res.user.corridor_cluster,
      kyc_tier: 'SHA256_KYC_VERIFIED'
    }, 900);

    return reply.code(201).send({
      success: true,
      data: {
        access_token: accessToken,
        user: res.user,
        zero_raw_pii_proof: res.zero_raw_pii_proof
      },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() }
    });
  });

  fastify.post('/api/v1/users/:userId/exam-freeze', async (req, reply) => {
    const { userId } = req.params;
    const { exam_freeze_active } = req.body || {};
    const res = await engine.toggleExamFreeze(userId, exam_freeze_active);
    if (!res.ok) return sendError(reply, res.error, req.requestId);
    return {
      success: true,
      data: res,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() }
    };
  });

  fastify.post('/api/v1/users/:userId/nda-pledge', async (req) => {
    const { userId } = req.params;
    const { gig_id } = req.body || {};
    const res = await engine.signNdaPledge(userId, gig_id);
    return {
      success: true,
      data: res,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() }
    };
  });

  // ==========================================================================
  // 5. GIG CREATION, NAGAMESE VOICE PARSER & FTS SEARCH (SRS Endpoints 1 & 2)
  // ==========================================================================
  fastify.post('/api/v1/gigs/voice-parse', async (req) => {
    const { raw_utterance, poster_type, default_corridor } = req.body || {};
    const parsed = parseNagameseOrEnglishUtterance(raw_utterance, poster_type, default_corridor);
    return {
      success: true,
      ...parsed,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() }
    };
  });

  fastify.get('/api/v1/gigs', async (req) => {
    const gigs = engine.listGigs(req.query || {});
    return {
      success: true,
      data: gigs,
      meta: { count: gigs.length, request_id: req.requestId, timestamp: new Date().toISOString() }
    };
  });

  const handleCreateGig = async (req, reply) => {
    const actorId = (req.body && req.body.poster_id) || (req.user && req.user.sub) || 'USR-POS-01';
    const res = await engine.createAndLockGig(req.body || {}, actorId);
    if (!res.ok) return sendError(reply, res.error, req.requestId);
    return reply.code(201).send({
      success: true,
      gig_id: res.gig_id,
      state: res.state,
      escrow_receipt: res.escrow_receipt,
      data: res.gig,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() }
    });
  };

  fastify.post('/api/v1/gigs/create-and-lock', handleCreateGig);
  fastify.post('/api/v1/gigs', handleCreateGig);

  // ==========================================================================
  // 6. MATCHING, MORUNG SQUAD (70/30), CHECKPOINT & STANDBY BUDDY HANDOVER
  // ==========================================================================
  fastify.post('/api/v1/gigs/:gigId/assign', async (req, reply) => {
    const res = await engine.assignOrClaimGig(req.params.gigId, req.body || {});
    if (!res.ok) return sendError(reply, res.error, req.requestId);
    return {
      success: true,
      data: res.gig,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() }
    };
  });

  fastify.post('/api/v1/gigs/:gigId/checkpoint', async (req, reply) => {
    const body = req.body || {};
    const actor_id = body.actor_id || (req.user && req.user.sub) || req.headers['x-morung-actor-id'];
    const res = await engine.submit20PercentCheckpoint(req.params.gigId, { ...body, actor_id });
    if (!res.ok) return sendError(reply, res.error, req.requestId);
    return {
      success: true,
      data: res.gig,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() }
    };
  });

  fastify.post('/api/v1/gigs/:gigId/handover', async (req, reply) => {
    const body = req.body || {};
    const actor_id = body.actor_id || (req.user && req.user.sub) || req.headers['x-morung-actor-id'];
    const res = await engine.triggerStandbyHandover(req.params.gigId, { ...body, actor_id });
    if (!res.ok) return sendError(reply, res.error, req.requestId);
    return {
      success: true,
      data: res,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() }
    };
  });

  // ==========================================================================
  // 7. WATERMARKED VAULT, REVISIONS, DUAL-PIN & SAFETY SOS (SRS Endpoint 3)
  // ==========================================================================
  const handleVaultDeliver = async (req, reply) => {
    const body = req.body || {};
    const actor_id = body.actor_id || body.student_lead_id || (req.user && req.user.sub) || req.headers['x-morung-actor-id'];
    const res = await engine.deliverToVault(req.params.gigId, { ...body, actor_id });
    if (!res.ok) return sendError(reply, res.error, req.requestId);
    return {
      success: true,
      gig_id: res.gig_id,
      new_state: res.new_state,
      vault_protection: res.vault_protection,
      auto_release_deadline_iso: res.auto_release_deadline_iso,
      revisions_remaining: res.revisions_remaining,
      data: res.gig,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() }
    };
  };

  fastify.post('/api/v1/vault/:gigId/deliver', handleVaultDeliver);
  fastify.post('/api/v1/gigs/:gigId/vault/deliver', handleVaultDeliver);

  fastify.get('/api/v1/vault/:gigId/raw-file', async (req, reply) => {
    const requesterId = req.query.actor_id || (req.user && req.user.sub) || req.headers['x-morung-actor-id'] || 'USR-POS-01';
    const requesterUser = db.state.users.find((u) => u.user_id === requesterId);
    const requesterRole = requesterUser ? requesterUser.role : (req.user && req.user.role) || 'POSTER_BUSINESS';
    const res = engine.getRawMasterFile(req.params.gigId, requesterId, requesterRole);
    if (!res.ok) return sendError(reply, res.error, req.requestId);
    return {
      success: true,
      data: res,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() }
    };
  });

  fastify.post('/api/v1/vault/:gigId/revision', async (req, reply) => {
    const body = req.body || {};
    const actor_id = body.actor_id || (req.user && req.user.sub) || req.headers['x-morung-actor-id'];
    const res = await engine.requestRevision(req.params.gigId, { ...body, actor_id });
    if (!res.ok) return sendError(reply, res.error, req.requestId);
    return {
      success: true,
      data: res.gig,
      revisions_left: res.revisions_left,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() }
    };
  });

  fastify.post('/api/v1/gigs/:gigId/topup-revision', async (req, reply) => {
    const body = req.body || {};
    const actor_id = body.actor_id || (req.user && req.user.sub) || req.headers['x-morung-actor-id'];
    const res = await engine.topUpExtraScopeRevision(req.params.gigId, { ...body, actor_id });
    if (!res.ok) return sendError(reply, res.error, req.requestId);
    return {
      success: true,
      data: res.gig,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() }
    };
  });

  fastify.post('/api/v1/gigs/:gigId/onsite/pin-handshake', async (req, reply) => {
    const body = req.body || {};
    const actor_id = body.actor_id || (req.user && req.user.sub) || req.headers['x-morung-actor-id'];
    const res = await engine.verifyOfflinePin(req.params.gigId, { ...body, actor_id });
    if (!res.ok) return sendError(reply, res.error, req.requestId);
    return {
      success: true,
      data: res,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() }
    };
  });

  fastify.post('/api/v1/gigs/:gigId/safety-sos', async (req) => {
    const body = req.body || {};
    const actor_id = body.actor_id || (req.user && req.user.sub) || req.headers['x-morung-actor-id'];
    const res = await engine.triggerSafetySos(req.params.gigId, { ...body, actor_id });
    return {
      success: true,
      data: res.sos_packet,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() }
    };
  });

  // ==========================================================================
  // 8. ESCROW SETTLEMENT, 36H AUTO-RELEASE, EDC ARBITRATION & HMAC WEBHOOKS
  // ==========================================================================
  fastify.post('/api/v1/escrow/:gigId/settle', async (req, reply) => {
    const body = req.body || {};
    const actor_id = body.actor_id || (req.user && req.user.sub) || req.headers['x-morung-actor-id'];
    const res = await engine.settleEscrow(req.params.gigId, { ...body, actor_id });
    if (!res.ok) return sendError(reply, res.error, req.requestId);
    return {
      success: true,
      gig_id: res.gig_id,
      new_state: res.new_state,
      vault_unlocked: res.vault_unlocked,
      payout_disbursement: res.payout_disbursement,
      minted_credentials: res.minted_credentials,
      data: res.gig,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() }
    };
  });

  fastify.post('/api/v1/arbitration/:gigId/dispute', async (req, reply) => {
    const body = req.body || {};
    const actor_id = body.actor_id || (req.user && req.user.sub) || req.headers['x-morung-actor-id'];
    const res = await engine.raiseDisputeToEdc(req.params.gigId, { ...body, actor_id });
    if (!res.ok) return sendError(reply, res.error, req.requestId);
    return {
      success: true,
      data: res.gig,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() }
    };
  });

  fastify.post('/api/v1/arbitration/:gigId/resolve', async (req, reply) => {
    const body = req.body || {};
    const actor_id = body.actor_id || (req.user && req.user.sub) || req.headers['x-morung-actor-id'] || 'USR-EDC-01';
    const res = await engine.settleEscrow(req.params.gigId, {
      trigger_type: 'EDC_ARBITRATION',
      actor_id,
      arbitration_decision: body.arbitration_decision || 'FULL_RELEASE_TO_STUDENT'
    });
    if (!res.ok) return sendError(reply, res.error, req.requestId);
    return {
      success: true,
      data: res,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() }
    };
  });

  // SDD Section 3.5: Cryptographic HMAC-SHA256 Payment Gateway Webhook
  fastify.post('/api/v1/webhooks/payments', async (req, reply) => {
    const sig = req.headers['x-webhook-signature'];
    const ts = req.headers['x-webhook-timestamp'];
    const eventId = req.headers['x-webhook-event-id'] || (req.body && req.body.event_id) || `evt_${Date.now()}`;
    const rawStr = JSON.stringify(req.body || {});

    const verification = verifyWebhookHmac(rawStr, sig, ts);
    if (!verification.valid) {
      return sendError(reply, {
        code: 'ERR-MG-4001',
        status: 401,
        title: 'Webhook HMAC Verification Failed',
        detail: `Payment webhook rejected: ${verification.reason}`
      }, req.requestId);
    }

    // Idempotency check
    db.state.processed_webhooks = db.state.processed_webhooks || [];
    if (db.state.processed_webhooks.includes(eventId)) {
      return {
        success: true,
        idempotent_noop: true,
        event_id: eventId,
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() }
      };
    }

    db.state.processed_webhooks.push(eventId);
    await db.commitMutation();

    return {
      success: true,
      idempotent_noop: false,
      event_id: eventId,
      verified_hmac: true,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() }
    };
  });

  // Public QR Skill Credential Verification Endpoint
  fastify.get('/api/v1/credentials/verify/:credentialId', async (req, reply) => {
    const cred = db.state.skill_credentials.find((c) => c.credential_id === req.params.credentialId);
    if (!cred) {
      return sendError(reply, {
        code: 'ERR-MG-3001',
        status: 404,
        title: 'Credential Not Found',
        detail: 'No matching Skill Credential found in the YouthNet EDC ledger.'
      }, req.requestId);
    }
    const escrow = db.state.escrow_ledger.find((e) => e.gig_id === cred.gig_id);
    return {
      success: true,
      data: {
        ...cred,
        verified_authentic: true,
        issuing_authority: 'YouthNet Nagaland EDC & MorungGig Nodal Ledger',
        backing_escrow_utr: escrow ? escrow.utr_reference : 'VERIFIED_NODAL_UTR',
        qr_svg: generateQrSvg(`${cred.credential_id}|${cred.student_id}|${cred.qr_verification_hash}`, 140)
      },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() }
    };
  });

  return { fastify, setShuttingDown: (val) => { isShuttingDown = val; } };
}

// Start server if executed directly
if (require.main === module) {
  const { fastify, setShuttingDown } = buildServer();
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';

  (async () => {
    try {
      await db.initPostgres();
      await fastify.listen({ port, host });
      fastify.log.info(`MorungGig (SkillBridge NL) Server listening on http://${host}:${port}`);
    } catch (err) {
      fastify.log.error(err);
      process.exit(1);
    }
  })();

  // SDD Section 3.7.3: 5-Step Deterministic Graceful Shutdown
  const gracefulShutdown = async (signal) => {
    fastify.log.info({ signal }, '1. Received shutdown signal. Marking readiness probe FALSE...');
    setShuttingDown(true);
    try {
      await fastify.close();
      fastify.log.info('2. All in-flight HTTP requests drained.');
      await db.close();
      fastify.log.info('3. Database connections closed cleanly. Exiting 0.');
      process.exit(0);
    } catch (err) {
      fastify.log.error(err, 'Error during graceful shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

module.exports = { buildServer, createWebhookSignature };
