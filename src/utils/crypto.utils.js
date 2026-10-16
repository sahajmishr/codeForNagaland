/**
 * MORUNGGIG (SKILLBRIDGE NL) — CRYPTOGRAPHIC, ZERO-RAW-PII & JWT UTILITIES
 * Implements FR-IAM-01, FR-IAM-02, NFR-SEC-01..04, SDD Section 3.2 & 3.5
 */

const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'mg_nl_2026_stateless_jwt_secret_key_994821048';
const WEBHOOK_SECRET = process.env.WEBHOOK_HMAC_SECRET || 'mg_nl_2026_razorpay_nodal_webhook_hmac_secret';

/**
 * FR-IAM-01: Salted SHA-256 Student Identity Verification
 * Formula: SHA256(UPPER(college_code) + ":" + TRIM(roll_number) + ":MG_SALT_2026")
 */
function computeStudentKycHash(collegeCode, rollNumber) {
  const normalizedCollege = String(collegeCode || '').trim().toUpperCase();
  const normalizedRoll = String(rollNumber || '').trim().toUpperCase();
  const canonical = `${normalizedCollege}:${normalizedRoll}:MG_SALT_2026`;
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Generic SHA-256 hex digest
 */
function computeSha256(input) {
  return crypto.createHash('sha256').update(String(input || ''), 'utf8').digest('hex');
}

/**
 * Salted Password Hash & Verification for Persistent User Accounts
 */
function hashPassword(rawPassword) {
  return computeSha256(`MG_PWD_SALT_2026:${String(rawPassword || '')}`);
}

function verifyPassword(rawPassword, storedHash) {
  if (!storedHash) return false;
  const computed = hashPassword(rawPassword);
  return computed === storedHash;
}

/**
 * FR-IAM-02: Masked Contact Relay prior to Active Contract
 * Masks middle digits -> +91-8794-XX-4912
 */
function maskPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  const ten = digits.length >= 10 ? digits.slice(-10) : digits.padEnd(10, '0');
  return `+91-${ten.slice(0, 4)}-XX-${ten.slice(6, 10)}`;
}

/**
 * NFR-SEC-03: Cryptographic 4-Digit PIN generator via CSPRNG
 */
function generatePin4() {
  return String(crypto.randomInt(1000, 10000));
}

/**
 * Generate distinct START_PIN and COMPLETE_PIN
 */
function generateDualPins() {
  const startPin = generatePin4();
  let completePin = generatePin4();
  while (completePin === startPin) {
    completePin = generatePin4();
  }
  return { startPin, completePin };
}

/**
 * Stateless JWT Signer (HS256, SDD Section 3.2.1)
 */
function signJwt(payload, ttlSeconds = 900) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + ttlSeconds
  };
  const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const b64Payload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const data = `${b64Header}.${b64Payload}`;
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  return `${data}.${signature}`;
}

/**
 * Stateless JWT Verifier (HS256)
 */
function verifyJwt(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [b64Header, b64Payload, signature] = parts;
  const data = `${b64Header}.${b64Payload}`;
  const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(b64Payload, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return { expired: true, payload };
    }
    return { expired: false, payload };
  } catch {
    return null;
  }
}

/**
 * SDD Section 3.5: Cryptographic Payment Webhook HMAC-SHA256 + 300s Replay Protection
 */
function createWebhookSignature(rawBody, timestamp, secret = WEBHOOK_SECRET) {
  const payloadToSign = `${timestamp}.${typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody)}`;
  const digest = crypto.createHmac('sha256', secret).update(payloadToSign).digest('hex');
  return `sha256=${digest}`;
}

function verifyWebhookHmac(rawBody, signatureHeader, timestampHeader, secret = WEBHOOK_SECRET) {
  if (!signatureHeader || !timestampHeader) return { valid: false, reason: 'MISSING_HEADERS' };
  const ts = Number(timestampHeader);
  const nowSec = Math.floor(Date.now() / 1000);
  if (Number.isNaN(ts) || Math.abs(nowSec - ts) > 300) {
    return { valid: false, reason: 'REPLAY_WINDOW_EXCEEDED' };
  }
  const expected = createWebhookSignature(rawBody, ts, secret);
  const a = Buffer.from(String(signatureHeader));
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: 'HMAC_MISMATCH' };
  }
  return { valid: true };
}

/**
 * FR-PAS-01 & CON-01: Deterministic Inline SVG QR Matrix Generator
 * Encodes credential verification hash into a crisp 21x21 QR-style matrix SVG
 */
function generateQrSvg(dataString, size = 120) {
  const hash = computeSha256(dataString);
  const grid = 21;
  const cells = Array.from({ length: grid }, () => Array(grid).fill(false));

  const drawFinder = (r0, c0) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        cells[r0 + r][c0 + c] = isBorder || isInner;
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, grid - 7);
  drawFinder(grid - 7, 0);

  // Timing patterns
  for (let i = 8; i < grid - 8; i++) {
    cells[6][i] = i % 2 === 0;
    cells[i][6] = i % 2 === 0;
  }

  let bitIdx = 0;
  for (let r = 0; r < grid; r++) {
    for (let c = 0; c < grid; c++) {
      const inTopLeft = r < 8 && c < 8;
      const inTopRight = r < 8 && c >= grid - 8;
      const inBottomLeft = r >= grid - 8 && c < 8;
      if (inTopLeft || inTopRight || inBottomLeft || r === 6 || c === 6) continue;
      const hexByte = parseInt(hash.slice((bitIdx * 2) % 60, ((bitIdx * 2) % 60) + 2), 16);
      cells[r][c] = ((hexByte >> (bitIdx % 8)) & 1) === 1;
      bitIdx++;
    }
  }

  const cellSize = (size - 16) / grid;
  let rects = '';
  for (let r = 0; r < grid; r++) {
    for (let c = 0; c < grid; c++) {
      if (cells[r][c]) {
        const x = (8 + c * cellSize).toFixed(2);
        const y = (8 + r * cellSize).toFixed(2);
        const w = (cellSize + 0.15).toFixed(2);
        rects += `<rect x="${x}" y="${y}" width="${w}" height="${w}" fill="#18181B" rx="0.5"/>`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Verification QR Code"><rect width="${size}" height="${size}" rx="8" fill="#FAF9F5" stroke="#E4E2DD" stroke-width="1"/>${rects}</svg>`;
}

module.exports = {
  computeStudentKycHash,
  computeSha256,
  hashPassword,
  verifyPassword,
  maskPhone,
  generatePin4,
  generateDualPins,
  signJwt,
  verifyJwt,
  createWebhookSignature,
  verifyWebhookHmac,
  generateQrSvg
};
