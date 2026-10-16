/**
 * Builds the 100% self-contained `/home/user/MorungGig_Interactive_Prototype.html`
 * with inline CSS, inline SVG QR generator, pure-JS SHA-256, and automatic fallback
 * between the live Fastify `/api/v1/*` server and in-browser deterministic execution
 * (satisfying CON-01 & NFR-MAINT-02 for sandbox="allow-scripts" viewers).
 */

const fs = require('fs');
const path = require('path');
const { NAGALAND_CONFIG } = require('../src/config/nagaland.constants');
const { buildInitialSeedState } = require('../src/db/seed.data');

const cssContent = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');
const htmlTemplate = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const appJsContent = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const validationContent = fs.readFileSync(path.join(__dirname, '../src/utils/validation.utils.js'), 'utf8')
  .replace("const { NAGALAND_CONFIG } = require('../config/nagaland.constants');", 'const NAGALAND_CONFIG = window.__MG_CONFIG_SEED__;')
  .replace(/module\.exports\s*=\s*\{[\s\S]*?\};/, '');

const initialSeed = buildInitialSeedState();

const inlineFallbackScript = `
// ============================================================================
// IN-BROWSER DETERMINISTIC ENGINE FALLBACK (CON-01 & NFR-MAINT-02)
// Activates automatically when viewed inside a zero-network sandbox="allow-scripts" iframe
// ============================================================================
window.__MG_CONFIG_SEED__ = ${JSON.stringify(NAGALAND_CONFIG)};
window.__MG_INITIAL_DB_SEED__ = ${JSON.stringify(initialSeed)};

function pureSha256Hex(ascii) {
  function rightRotate(value, amount) { return (value >>> amount) | (value << (32 - amount)); }
  var mathPow = Math.pow, maxWord = mathPow(2, 32), lengthProperty = 'length', i, j, result = '';
  var words = [], asciiBitLength = ascii[lengthProperty] * 8;
  var hash = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  var k = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];
  ascii += '\\x80';
  while (ascii[lengthProperty] % 64 - 56) ascii += '\\x00';
  for (i = 0; i < ascii[lengthProperty]; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) j = 63;
    words[i >> 2] |= j << ((3 - i) % 4) * 8;
  }
  words[words[lengthProperty]] = ((asciiBitLength / maxWord) | 0);
  words[words[lengthProperty]] = (asciiBitLength);
  for (j = 0; j < words[lengthProperty];) {
    var w = words.slice(j, j += 16);
    var oldHash = hash.slice(0);
    for (i = 0; i < 64; i++) {
      var w15 = w[i - 15], w2 = w[i - 2];
      var a = hash[0], e = hash[4];
      var temp1 = hash[7]
        + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
        + ((e & hash[5]) ^ ((~e) & hash[6]))
        + k[i]
        + (w[i] = (i < 16) ? w[i] : (
            w[i - 16]
            + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
            + w[i - 7]
            + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
          ) | 0
        );
      var temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
        + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
      hash.pop();
    }
    for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
  }
  for (i = 0; i < 8; i++) {
    for (j = 3; j + 1; j--) {
      var b = (hash[i] >> (j * 8)) & 255;
      result += ((b < 16) ? 0 : '') + b.toString(16);
    }
  }
  return result;
}

function browserMaskPhone(phone) {
  const digits = String(phone || '').replace(/\\D/g, '');
  const ten = digits.length >= 10 ? digits.slice(-10) : digits.padEnd(10, '0');
  return '+91-' + ten.slice(0, 4) + '-XX-' + ten.slice(6, 10);
}

function browserStudentKycHash(collegeCode, rollNumber) {
  const c = String(collegeCode || '').trim().toUpperCase();
  const r = String(rollNumber || '').trim().toUpperCase();
  return pureSha256Hex(c + ':' + r + ':MG_SALT_2026');
}

function browserQrSvg(dataString, size = 116) {
  const hash = pureSha256Hex(String(dataString));
  const grid = 21;
  const cells = Array.from({ length: grid }, () => Array(grid).fill(false));
  const drawFinder = (r0, c0) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        cells[r0 + r][c0 + c] = (r === 0 || r === 6 || c === 0 || c === 6) || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
      }
    }
  };
  drawFinder(0, 0); drawFinder(0, grid - 7); drawFinder(grid - 7, 0);
  for (let i = 8; i < grid - 8; i++) { cells[6][i] = i % 2 === 0; cells[i][6] = i % 2 === 0; }
  let bitIdx = 0;
  for (let r = 0; r < grid; r++) {
    for (let c = 0; c < grid; c++) {
      if ((r < 8 && c < 8) || (r < 8 && c >= grid - 8) || (r >= grid - 8 && c < 8) || r === 6 || c === 6) continue;
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
        rects += '<rect x="' + (8 + c * cellSize).toFixed(2) + '" y="' + (8 + r * cellSize).toFixed(2) + '" width="' + (cellSize + 0.15).toFixed(2) + '" height="' + (cellSize + 0.15).toFixed(2) + '" fill="#18181B" rx="0.5"/>';
      }
    }
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '"><rect width="' + size + '" height="' + size + '" rx="8" fill="#FAF9F5" stroke="#E4E2DD" stroke-width="1"/>' + rects + '</svg>';
}

${validationContent}

(function initBrowserSandboxController() {
  let localDb = null;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem('MG_SANDBOX_DB_V1');
      if (saved) localDb = JSON.parse(saved);
    }
  } catch {}
  if (!localDb || !Array.isArray(localDb.gigs)) {
    localDb = JSON.parse(JSON.stringify(window.__MG_INITIAL_DB_SEED__));
  }
  const saveDb = () => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('MG_SANDBOX_DB_V1', JSON.stringify(localDb));
      }
    } catch {}
  };

  const appendLog = (gig_id, actor_id, from_state, to_state, action_summary, utr_or_hash) => {
    localDb.audit_logs.unshift({
      log_id: localDb.audit_logs.length + 1,
      gig_id, actor_id, from_state, to_state, action_summary,
      utr_or_hash: utr_or_hash || null,
      logged_at: new Date().toISOString()
    });
  };

  const enqueueNotif = (recipient_id, gig_id, title, message) => {
    localDb.notifications_outbox.unshift({
      notification_id: 'NOTIF-' + Date.now(),
      recipient_id, gig_id, channel: 'WHATSAPP_INAPP',
      title, message,
      whatsapp_uri: 'https://wa.me/918794284912?text=' + encodeURIComponent(message),
      is_read: false,
      created_at: new Date().toISOString()
    });
  };

  const getStuAvailability = (u) => {
    if (u.role !== 'STUDENT') return 'ACTIVE';
    const hasAssigned = localDb.gigs.some(
      (g) =>
        (g.assigned_lead_id === u.user_id || g.assigned_junior_id === u.user_id) &&
        !['SETTLED', 'AUTO_RELEASED', 'REFUNDED', 'ESCROW_LOCKED'].includes(g.state) &&
        g.lifecycle_status !== 'DELETED'
    );
    if (hasAssigned) return 'WORKING';
    return u.availability_status === 'OFFLINE' ? 'OFFLINE' : 'FREE';
  };

  const getGigLifecycle = (g) => {
    if (['SETTLED', 'AUTO_RELEASED', 'REFUNDED'].includes(g.state) || g.lifecycle_status === 'DELETED') return 'DELETED';
    if (g.assigned_lead_id || ['ASSIGNED_DIGITAL', 'ASSIGNED_OFFLINE', 'CHECKPOINT_VERIFIED', 'IN_PROGRESS_ONSITE', 'DELIVERED_VAULT', 'DISPUTED_EDC'].includes(g.state)) return 'ASSIGNED';
    return 'ACTIVE';
  };

  const sanitizeUser = (u) => ({
    ...u,
    visible_phone: u.contact_phone || u.masked_phone,
    trust_score: Number(u.trust_score),
    avg_rating: Number(u.avg_rating ?? 5.0),
    ratings_count: Number(u.ratings_count ?? 1),
    reviews: JSON.parse(u.reviews_json || '[]'),
    proficiencies: JSON.parse(u.proficiencies_json || '[]'),
    completed_gigs_cnt: Number(u.completed_gigs_cnt),
    wallet_balance_inr: Number(u.wallet_balance_inr),
    availability_status: getStuAvailability(u),
    bio: u.bio || '',
    wallet_transactions: JSON.parse(u.wallet_transactions_json || '[]'),
    free_slots: JSON.parse(u.free_slots_json || '[]'),
    skills: JSON.parse(u.skills_json || '[]')
  });

  const getTop3 = (gig) => {
    return localDb.users
      .filter((u) => u.role === 'STUDENT' && !u.exam_freeze_active)
      .map((stu) => {
        const m = calculateMatchScore(stu, gig);
        return {
          student_id: stu.user_id,
          full_name: stu.full_name,
          institution: stu.institution_or_org,
          stream: stu.stream_or_sector,
          corridor_cluster: stu.corridor_cluster,
          trust_score: Number(stu.trust_score),
          completed_gigs_cnt: Number(stu.completed_gigs_cnt),
          kyc_id_hash_preview: stu.kyc_id_hash.slice(0, 12) + '...',
          masked_phone: stu.masked_phone,
          composite_match_score: m.score,
          slot_matched: m.slotMatched,
          track_matched: m.trackMatched,
          est_transport_inr: m.estTransportInr,
          net_take_home_inr: m.netTakeHomeInr
        };
      })
      .sort((a, b) => b.composite_match_score - a.composite_match_score)
      .slice(0, 3);
  };

  const enrichGig = (gig, studentCorridor = 'SOVIMA_6MILE') => {
    const cfg = window.__MG_CONFIG_SEED__;
    const poster = localDb.users.find((u) => u.user_id === gig.poster_id);
    const lead = gig.assigned_lead_id ? localDb.users.find((u) => u.user_id === gig.assigned_lead_id) : null;
    const junior = gig.assigned_junior_id ? localDb.users.find((u) => u.user_id === gig.assigned_junior_id) : null;
    const standby = gig.standby_buddy_id ? localDb.users.find((u) => u.user_id === gig.standby_buddy_id) : null;
    const escrow = localDb.escrow_ledger.find((e) => e.gig_id === gig.gig_id) || null;
    const trackSpec = cfg.TRACKS[gig.track_category] || cfg.TRACKS.CONTENT_REELS;
    const corridorSpec = cfg.CORRIDORS[gig.corridor_cluster] || cfg.CORRIDORS.SOVIMA_6MILE;
    const fc = calculateCorridorFare(studentCorridor, gig.corridor_cluster, gig.execution_mode, gig.payout_inr);
    const splitCalc = calculateEscrowAndSplit(gig.payout_inr, 'MORUNG_SQUAD_70_30');
    const vp = gig.vault_payload_json ? JSON.parse(gig.vault_payload_json) : null;
    const isUnlocked = gig.state === 'SETTLED' || gig.state === 'AUTO_RELEASED';

    const rawApplicants = JSON.parse(gig.applicants_json || '[]');
    const enrichedApplicants = rawApplicants
      .map((app) => {
        const stu = localDb.users.find((u) => u.user_id === app.student_id);
        const sStu = stu ? sanitizeUser(stu) : null;
        return {
          ...app,
          availability_status: stu ? getStuAvailability(stu) : 'FREE',
          completed_gigs_cnt: sStu ? sStu.completed_gigs_cnt : 0,
          avg_rating: sStu ? sStu.avg_rating : 5.0,
          proficiencies: sStu ? sStu.proficiencies : [],
          reviews: sStu ? sStu.reviews : []
        };
      })
      .sort((a, b) => b.avg_rating - a.avg_rating || b.completed_gigs_cnt - a.completed_gigs_cnt);

    return {
      ...gig,
      description: gig.description || (gig.title + ' — ' + gig.criteria_1),
      custom_category_label: gig.custom_category_label || '',
      lifecycle_status: getGigLifecycle(gig),
      applicants: enrichedApplicants,
      payout_inr: Number(gig.payout_inr),
      platform_fee_inr: Number(gig.platform_fee_inr),
      revisions_left: Number(gig.revisions_left ?? 3),
      max_tweaks: Number(gig.max_tweaks ?? 3),
      revision_notes: JSON.parse(gig.revision_notes_json || '[]'),
      track_name: gig.custom_category_label ? ('Custom: ' + gig.custom_category_label) : trackSpec.shortName,
      edc_pillar: trackSpec.edcPillar,
      corridor_label: corridorSpec.label,
      safety_dispatch: cfg.SAFETY_DISPATCH_UNITS[gig.corridor_cluster] || cfg.SAFETY_DISPATCH_UNITS.SOVIMA_6MILE,
      poster: poster ? sanitizeUser(poster) : null,
      lead_student: lead ? sanitizeUser(lead) : null,
      junior_student: junior ? sanitizeUser(junior) : null,
      standby_student: standby ? sanitizeUser(standby) : null,
      escrow_receipt: escrow,
      fare_calculator: {
        student_corridor: studentCorridor,
        gross_payout_inr: Number(gig.payout_inr),
        est_transport_inr: fc.estTransportInr,
        net_take_home_inr: fc.netTakeHomeInr,
        inter_district: fc.interDistrict,
        route_note: fc.routeNote
      },
      squad_breakdown: { senior_70_inr: splitCalc.leadPayoutInr, junior_30_inr: splitCalc.juniorPayoutInr },
      vault_protection: vp ? { ...vp, watermark_active: !isUnlocked, raw_download_unlocked: isUnlocked } : null,
      top_candidates: getTop3(gig)
    };
  };

  window.handleOfflineSandboxApiRequest = async function(rawPath, options = {}) {
    const cfg = window.__MG_CONFIG_SEED__;
    const urlObj = new URL(rawPath, 'http://localhost');
    const pathname = urlObj.pathname;
    const body = options.body || {};

    if (pathname === '/api/v1/bootstrap') {
      const sc = urlObj.searchParams.get('student_corridor') || 'SOVIMA_6MILE';
      const creds = localDb.skill_credentials.map((c) => ({ ...c, qr_svg: browserQrSvg(c.credential_id, 116) }));
      const activeLocked = localDb.escrow_ledger.filter((e) => e.status === 'LOCKED').reduce((s, e) => s + Number(e.locked_payout_inr), 0);
      const stuEarnings = localDb.users.filter((u) => u.role === 'STUDENT').reduce((s, u) => s + Number(u.wallet_balance_inr), 0);
      return {
        success: true,
        data: {
          config: cfg,
          connection: { dbMode: 'SANDBOX_IN_MEMORY_ACID_LEDGER', neonConnected: false, googleOAuthConfigured: false },
          users: localDb.users.map(sanitizeUser),
          gigs: localDb.gigs.map((g) => enrichGig(g, sc)),
          notifications: localDb.notifications_outbox,
          telemetry: {
            header_pills: {
              escrow_locked_inr: activeLocked,
              active_gigs_count: localDb.gigs.filter((g) => !['SETTLED', 'AUTO_RELEASED', 'REFUNDED'].includes(g.state)).length,
              student_earnings_minted_inr: stuEarnings,
              credentials_minted_count: creds.length
            },
            edc_impact: {
              total_student_earnings_inr: stuEarnings,
              non_tech_participation_pct: 86,
              morung_squad_mentorships: 132,
              avg_settlement_time_hours: 4.2,
              disputes_pending_count: localDb.gigs.filter((g) => g.state === 'DISPUTED_EDC').length,
              college_breakdown: [
                { college: 'ICFAI University Nagaland, Sovima', studentsVerified: 142, squadsCompleted: 29, earningsInr: 68400 },
                { college: 'Kohima Science College (Autonomous), Jotsoma', studentsVerified: 118, squadsCompleted: 21, earningsInr: 54200 },
                { college: 'Tetso College, Sovima / 6th Mile', studentsVerified: 109, squadsCompleted: 24, earningsInr: 49800 },
                { college: 'Dimapur Govt. College (DGC)', studentsVerified: 96, squadsCompleted: 19, earningsInr: 41600 },
                { college: 'Nagaland University, Meriema Campus', studentsVerified: 84, squadsCompleted: 16, earningsInr: 38900 }
              ],
              survey_evidence: cfg.SURVEY_EVIDENCE
            },
            credentials: creds,
            audit_logs: localDb.audit_logs
          }
        }
      };
    }

    if (pathname === '/api/v1/system/config') {
      return {
        success: true,
        data: {
          connection: { dbMode: 'LOCAL_PERSISTENT_ACID_STORE', neonConnected: Boolean(body.databaseUrl), googleOAuthConfigured: Boolean(body.googleClientId) }
        }
      };
    }

    if (pathname === '/api/v1/system/reset') {
      localDb = JSON.parse(JSON.stringify(window.__MG_INITIAL_DB_SEED__));
      saveDb();
      return { success: true, data: {} };
    }

    if (pathname === '/api/v1/auth/me') {
      const savedUid = safeGet('MG_SANDBOX_UID', '');
      if (!savedUid) return { success: true, data: { authenticated: false, user: null } };
      const u = localDb.users.find((x) => x.user_id === savedUid);
      return { success: true, data: { authenticated: Boolean(u), user: u ? sanitizeUser(u) : null } };
    }

    if (pathname === '/api/v1/auth/login') {
      const email = String(body.email || '').trim().toLowerCase();
      const u = localDb.users.find((x) => String(x.email || '').toLowerCase() === email);
      if (!u) throw { code: 'ERR-MG-AUTH-401', status: 401, detail: 'No account found with that email.' };
      safeSet('MG_SANDBOX_UID', u.user_id);
      return { success: true, data: { access_token: 'sandbox_jwt_' + u.user_id, user: sanitizeUser(u) } };
    }

    if (pathname === '/api/v1/auth/logout') {
      safeRemove('MG_SANDBOX_UID');
      return { success: true, data: { logged_out: true } };
    }

    if (pathname === '/api/v1/auth/switch-role') {
      const u = localDb.users.find((x) => x.user_id === body.user_id) || localDb.users[0];
      safeSet('MG_SANDBOX_UID', u.user_id);
      return { success: true, data: { access_token: 'sandbox_jwt_' + u.user_id, user: sanitizeUser(u) } };
    }

    if (pathname === '/api/v1/auth/google/url') {
      return { success: true, data: { configured: false } };
    }

    if (pathname === '/api/v1/auth/google/verify') {
      const u = localDb.users[0];
      return { success: true, data: { access_token: 'sandbox_ggl_jwt', user: sanitizeUser(u) } };
    }

    if (pathname === '/api/v1/auth/otp/send') {
      const otp = '4829';
      enqueueNotif('USR-STU-01', null, 'MorungGig Login OTP: ' + otp, '[MorungGig Auth] Your 4-digit OTP is ' + otp);
      return { success: true, data: { masked_phone: browserMaskPhone(body.phone), demo_otp_preview: otp, user_matched: 'Toshi Ao' } };
    }

    if (pathname === '/api/v1/auth/otp/verify') {
      const u = localDb.users[0];
      return { success: true, data: { access_token: 'sandbox_otp_jwt', user: sanitizeUser(u) } };
    }

    if (pathname === '/api/v1/auth/onboard' || pathname === '/api/v1/auth/signup') {
      const role = body.role || 'STUDENT';
      const kycHash = role === 'STUDENT'
        ? browserStudentKycHash(body.college_code, body.roll_number)
        : pureSha256Hex(role + ':' + (body.org_or_aadhaar_last4 || body.roll_number || Date.now()) + ':MG_SALT_2026');
      if (localDb.users.some((u) => u.kyc_id_hash === kycHash)) {
        throw cfg.ERRORS['ERR-MG-1001'];
      }
      const masked = browserMaskPhone(body.phone);
      const newUser = {
        user_id: 'USR-NEW-' + String(Date.now()).slice(-3),
        role,
        email: String(body.email || '').trim().toLowerCase(),
        full_name: stripHtmlAndNormalize(body.full_name || 'Verified User'),
        institution_or_org: body.institution_or_org || 'ICFAI University Sovima',
        stream_or_sector: 'Verified Onboarding',
        corridor_cluster: body.corridor_cluster || 'SOVIMA_6MILE',
        kyc_id_hash: kycHash,
        upi_vpa: body.upi_vpa || 'user@okaxis',
        masked_phone: masked,
        contact_phone: '+91-' + String(body.phone || '8794001122').replace(/\\D/g, '').slice(-10),
        trust_score: 98.0,
        completed_gigs_cnt: 0,
        wallet_balance_inr: 0,
        availability_status: role === 'STUDENT' ? 'FREE' : 'ACTIVE',
        bio: body.bio || '',
        wallet_transactions_json: '[]',
        exam_freeze_active: false,
        nda_accepted: true,
        free_slots_json: JSON.stringify(['WEEKDAY_AFTER_3PM', 'SATURDAY_ALL_DAY', 'ANYTIME_DIGITAL']),
        skills_json: JSON.stringify(['COMMERCE_OPS', 'CONTENT_REELS', 'EVENTS_STALLS', 'LANGUAGE_TUTOR'])
      };
      localDb.users.push(newUser);
      safeSet('MG_SANDBOX_UID', newUser.user_id);
      saveDb();
      return {
        success: true,
        data: {
          access_token: 'sandbox_onb_jwt',
          user: sanitizeUser(newUser),
          zero_raw_pii_proof: { salted_sha256_hash: kycHash, masked_phone_stored: masked }
        }
      };
    }

    if (pathname === '/api/v1/users/me/availability') {
      const uid = body.actor_id || safeGet('MG_SANDBOX_UID', '');
      const u = localDb.users.find((x) => x.user_id === uid);
      if (!u) throw { code: 'ERR-MG-404', status: 404, detail: 'User not found' };
      if (getStuAvailability(u) === 'WORKING') {
        throw { code: 'ERR-MG-WORKING-LOCKED', status: 409, detail: 'Status is WORKING on an active assigned job.' };
      }
      u.availability_status = body.availability_status === 'OFFLINE' ? 'OFFLINE' : 'FREE';
      saveDb();
      return { success: true, data: { user: sanitizeUser(u) } };
    }

    if (pathname === '/api/v1/users/me/profile') {
      const uid = body.actor_id || safeGet('MG_SANDBOX_UID', '');
      const u = localDb.users.find((x) => x.user_id === uid);
      if (!u) throw { code: 'ERR-MG-404', status: 404, detail: 'User not found' };
      if (body.full_name) u.full_name = body.full_name;
      if (body.institution_or_org) u.institution_or_org = body.institution_or_org;
      if (body.corridor_cluster) u.corridor_cluster = body.corridor_cluster;
      if (body.upi_vpa) u.upi_vpa = body.upi_vpa;
      if (body.bio !== undefined) u.bio = body.bio;
      saveDb();
      return { success: true, data: { user: sanitizeUser(u) } };
    }

    if (pathname === '/api/v1/wallet/withdraw') {
      const uid = body.actor_id || safeGet('MG_SANDBOX_UID', '');
      const u = localDb.users.find((x) => x.user_id === uid);
      if (!u) throw { code: 'ERR-MG-404', status: 404, detail: 'User not found' };
      const amt = Number(body.amount_inr || 0);
      if (amt <= 0 || amt > Number(u.wallet_balance_inr)) {
        throw { code: 'ERR-MG-WD-402', status: 400, detail: 'Insufficient balance' };
      }
      u.wallet_balance_inr = Number(u.wallet_balance_inr) - amt;
      const txs = JSON.parse(u.wallet_transactions_json || '[]');
      const tx = {
        tx_id: 'WD-UPI-' + String(Date.now()).slice(-6),
        type: 'WITHDRAWAL',
        amount_inr: -amt,
        note: 'Mock Withdrawal to UPI (' + (body.upi_vpa || u.upi_vpa) + ')',
        timestamp: new Date().toISOString()
      };
      txs.unshift(tx);
      u.wallet_transactions_json = JSON.stringify(txs);
      saveDb();
      return { success: true, data: { withdrawal: tx, user: sanitizeUser(u) } };
    }

    const applyMatch = pathname.match(/^\\/api\\/v1\\/gigs\\/([^/]+)\\/apply$/);
    if (applyMatch) {
      const gig = localDb.gigs.find((g) => g.gig_id === decodeURIComponent(applyMatch[1]));
      const uid = body.actor_id || safeGet('MG_SANDBOX_UID', '');
      const stu = localDb.users.find((x) => x.user_id === uid);
      const apps = JSON.parse(gig.applicants_json || '[]');
      if (!apps.some((a) => a.student_id === stu.user_id)) {
        apps.push({
          student_id: stu.user_id,
          full_name: stu.full_name,
          institution: stu.institution_or_org,
          pitch_note: body.pitch_note || 'Ready to start immediately.',
          applied_at: new Date().toISOString()
        });
        gig.applicants_json = JSON.stringify(apps);
        saveDb();
      }
      return { success: true, data: enrichGig(gig) };
    }

    const quitMatch = pathname.match(/^\\/api\\/v1\\/gigs\\/([^/]+)\\/quit$/);
    if (quitMatch) {
      const gig = localDb.gigs.find((g) => g.gig_id === decodeURIComponent(quitMatch[1]));
      const prev = gig.assigned_lead_id;
      gig.assigned_lead_id = null;
      gig.assigned_junior_id = null;
      gig.state = 'ESCROW_LOCKED';
      gig.lifecycle_status = 'ACTIVE';
      const stu = localDb.users.find((x) => x.user_id === prev);
      if (stu) stu.availability_status = 'FREE';
      saveDb();
      return { success: true, data: enrichGig(gig) };
    }

    const freezeMatch = pathname.match(/^\\/api\\/v1\\/users\\/([^/]+)\\/exam-freeze$/);
    if (freezeMatch) {
      const u = localDb.users.find((x) => x.user_id === decodeURIComponent(freezeMatch[1])) || localDb.users[0];
      u.exam_freeze_active = Boolean(body.exam_freeze_active);
      saveDb();
      return { success: true, data: { user_id: u.user_id, exam_freeze_active: u.exam_freeze_active, trust_score_preserved: u.trust_score } };
    }

    const ndaMatch = pathname.match(/^\\/api\\/v1\\/users\\/([^/]+)\\/nda-pledge$/);
    if (ndaMatch) {
      appendLog(body.gig_id || 'GIG-NL', decodeURIComponent(ndaMatch[1]), 'NDA_GATE', 'NDA_SIGNED', 'Signed 1-Tap Business Ledger NDA (DR-NAG-14)', 'NDA-HASH');
      saveDb();
      return { success: true, data: { nda_accepted: true } };
    }

    if (pathname === '/api/v1/gigs/voice-parse') {
      return { success: true, ...parseNagameseOrEnglishUtterance(body.raw_utterance, body.poster_type, body.default_corridor) };
    }

    if (pathname === '/api/v1/gigs' && (!options.method || options.method === 'GET')) {
      const sc = urlObj.searchParams.get('student_corridor') || 'SOVIMA_6MILE';
      const slot = urlObj.searchParams.get('slot');
      const track = urlObj.searchParams.get('track');
      const q = (urlObj.searchParams.get('q') || '').toLowerCase();
      const filtered = localDb.gigs.filter((g) => {
        if (slot && slot !== 'ALL' && g.required_slot !== slot && g.required_slot !== 'ANYTIME_DIGITAL') return false;
        if (track && track !== 'ALL' && g.track_category !== track) return false;
        if (q && !((g.title + ' ' + g.venue_label + ' ' + g.corridor_cluster + ' ' + g.language_tag).toLowerCase().includes(q))) return false;
        return true;
      });
      return { success: true, data: filtered.map((g) => enrichGig(g, sc)) };
    }

    if (pathname === '/api/v1/gigs/create-and-lock' || (pathname === '/api/v1/gigs' && options.method === 'POST')) {
      const posterUser = localDb.users.find((u) => u.user_id === (body.poster_id || body.actor_id || 'USR-POS-01'));
      if (!posterUser || !['POSTER_BUSINESS', 'POSTER_INDIVIDUAL'].includes(posterUser.role)) {
        throw { code: 'ERR-MG-RBAC-403', status: 403, detail: 'Only Business or Individual Posters can create and post gigs.' };
      }
      const val = validateGigCreationInput(body, posterUser);
      if (!val.valid) throw val.error;
      const s = val.sanitized;
      const gigId = 'GIG-NL-2026-' + (100 + localDb.gigs.length + 1);
      const utr = 'UPI-' + String(Date.now()).slice(-8);
      const newGig = {
        gig_id: gigId, poster_id: posterUser.user_id, ...s,
        state: 'ESCROW_LOCKED', execution_type: s.allow_morung_squad ? 'MORUNG_SQUAD_70_30' : 'SOLO',
        revisions_left: 2, revision_notes_json: '[]', created_at: new Date().toISOString()
      };
      localDb.gigs.unshift(newGig);
      localDb.escrow_ledger.unshift({
        escrow_id: 'ESC-' + Date.now(), gig_id: gigId, utr_reference: utr,
        locked_payout_inr: s.payout_inr, platform_fee_inr: s.platform_fee_inr,
        lead_payout_inr: s.payout_inr, junior_payout_inr: 0, poster_refund_inr: 0, status: 'LOCKED'
      });
      appendLog(gigId, posterUser.user_id, 'DRAFT', 'ESCROW_LOCKED', 'Locked Nodal UPI Escrow & 3 Checkboxes', utr);
      saveDb();
      return {
        success: true, gig_id: gigId, state: 'ESCROW_LOCKED',
        escrow_receipt: { utr_reference: utr, total_debited_inr: s.total_escrow_lock_inr },
        data: enrichGig(newGig)
      };
    }

    const assignMatch = pathname.match(/^\\/api\\/v1\\/gigs\\/([^/]+)\\/assign$/);
    if (assignMatch) {
      const gig = localDb.gigs.find((g) => g.gig_id === decodeURIComponent(assignMatch[1]));
      if (!gig || gig.state !== 'ESCROW_LOCKED') throw cfg.ERRORS['ERR-MG-3001'];
      gig.assigned_lead_id = body.lead_student_id || 'USR-STU-02';
      gig.assigned_junior_id = body.execution_type === 'MORUNG_SQUAD_70_30' ? 'USR-STU-03' : null;
      gig.standby_buddy_id = 'USR-STU-03';
      gig.execution_type = body.execution_type || 'SOLO';
      gig.lifecycle_status = 'ASSIGNED';
      const stu = localDb.users.find((u) => u.user_id === gig.assigned_lead_id);
      if (stu) stu.availability_status = 'WORKING';
      if (gig.execution_mode === 'OFFLINE') {
        gig.start_pin = '4821'; gig.complete_pin = '9054'; gig.state = 'ASSIGNED_OFFLINE';
      } else {
        gig.state = 'ASSIGNED_DIGITAL';
      }
      appendLog(gig.gig_id, gig.assigned_lead_id, 'ESCROW_LOCKED', gig.state, 'Assigned contract (' + gig.execution_type + ')', gig.gig_id);
      saveDb();
      return { success: true, data: enrichGig(gig) };
    }

    const chkMatch = pathname.match(/^\\/api\\/v1\\/gigs\\/([^/]+)\\/checkpoint$/);
    if (chkMatch) {
      const gig = localDb.gigs.find((g) => g.gig_id === decodeURIComponent(chkMatch[1]));
      gig.state = 'CHECKPOINT_VERIFIED'; gig.checkpoint_note = body.note;
      appendLog(gig.gig_id, 'USR-STU-01', 'ASSIGNED_DIGITAL', 'CHECKPOINT_VERIFIED', '20% Early Checkpoint Verified', 'CHK-20');
      saveDb();
      return { success: true, data: enrichGig(gig) };
    }

    const handMatch = pathname.match(/^\\/api\\/v1\\/gigs\\/([^/]+)\\/handover$/);
    if (handMatch) {
      const gig = localDb.gigs.find((g) => g.gig_id === decodeURIComponent(handMatch[1]));
      const prev = gig.assigned_lead_id;
      gig.assigned_lead_id = gig.standby_buddy_id || 'USR-STU-03';
      gig.standby_buddy_id = prev;
      appendLog(gig.gig_id, prev || 'USR-STU-01', gig.state, gig.state, 'Emergency Handover to Standby Buddy ' + gig.assigned_lead_id, 'HANDOVER');
      saveDb();
      return { success: true, data: { previous_lead_id: prev, new_lead_id: gig.assigned_lead_id, gig: enrichGig(gig) } };
    }

    const delivMatch = pathname.match(/^\\/api\\/v1\\/vault\\/([^/]+)\\/deliver$/);
    if (delivMatch) {
      const gig = localDb.gigs.find((g) => g.gig_id === decodeURIComponent(delivMatch[1]));
      if (!Array.isArray(body.criteria_checked) || !body.criteria_checked.every(Boolean)) throw cfg.ERRORS['ERR-MG-2002'];
      gig.state = 'DELIVERED_VAULT';
      gig.auto_release_at = new Date(Date.now() + 36 * 3600 * 1000).toISOString();
      const sha = pureSha256Hex(gig.gig_id + Date.now());
      gig.vault_payload_json = JSON.stringify({
        deliverable_title: body.deliverable_title || (gig.gig_id + '_Master.mp4'),
        media_type: body.media_type || 'DOCUMENT',
        preview_summary: body.preview_summary || 'Completed deliverable fulfilling all 3 criteria',
        file_data_uri: body.file_data_uri || null,
        file_sha256: sha,
        criteria_checked: [true, true, true],
        tabular_rows: [
          { row: 1, item: 'SKU-NL-001 • Verified Entry Row 1', cost: '₹180', price: '₹320', margin: '43.7%', status: 'VERIFIED' },
          { row: 2, item: 'SKU-NL-002 • Verified Entry Row 2', cost: '₹95', price: '₹190', margin: '50.0%', status: 'VERIFIED' }
        ]
      });
      appendLog(gig.gig_id, 'USR-STU-01', 'CHECKPOINT_VERIFIED', 'DELIVERED_VAULT', 'Uploaded to Watermarked Vault; 36h Timer started', sha);
      saveDb();
      return { success: true, new_state: 'DELIVERED_VAULT', data: enrichGig(gig) };
    }

    const rawMatch = pathname.match(/^\\/api\\/v1\\/vault\\/([^/]+)\\/raw-file$/);
    if (rawMatch) {
      const gig = localDb.gigs.find((g) => g.gig_id === decodeURIComponent(rawMatch[1]));
      if (gig.state !== 'SETTLED' && gig.state !== 'AUTO_RELEASED') throw cfg.ERRORS['ERR-MG-4003'];
      return { success: true, data: { master_file: { filename: gig.gig_id + '_Clean_Master.mp4', sha256_verified: pureSha256Hex(gig.gig_id) } } };
    }

    const revMatch = pathname.match(/^\\/api\\/v1\\/vault\\/([^/]+)\\/revision$/);
    if (revMatch) {
      const gig = localDb.gigs.find((g) => g.gig_id === decodeURIComponent(revMatch[1]));
      if (gig.revisions_left <= 0) throw cfg.ERRORS['ERR-MG-4002'];
      gig.revisions_left -= 1; gig.state = 'CHECKPOINT_VERIFIED';
      const rNotes = JSON.parse(gig.revision_notes_json || '[]');
      rNotes.push({ checkbox: body.checkbox_index || 2, note: body.revision_note || 'Tweak requested', at: new Date().toISOString() });
      gig.revision_notes_json = JSON.stringify(rNotes);
      appendLog(gig.gig_id, gig.poster_id, 'DELIVERED_VAULT', 'CHECKPOINT_VERIFIED', 'Tweak requested (' + gig.revisions_left + ' left)', 'REV');
      saveDb();
      return { success: true, revisions_left: gig.revisions_left, data: enrichGig(gig) };
    }

    const rateMatch = pathname.match(/^\\/api\\/v1\\/gigs\\/([^/]+)\\/rate$/);
    if (rateMatch) {
      const gig = localDb.gigs.find((g) => g.gig_id === decodeURIComponent(rateMatch[1]));
      const score = Math.round(Number(body.rating_score || 5));
      const feedback = String(body.rating_feedback || 'Completed all deliverables accurately.');
      gig.rating_score = score;
      gig.rating_feedback = feedback;
      gig.rated_at = new Date().toISOString();
      const stu = localDb.users.find((u) => u.user_id === gig.assigned_lead_id);
      if (stu) {
        const revs = JSON.parse(stu.reviews_json || '[]').filter((r) => r.gig_id !== gig.gig_id);
        revs.unshift({
          gig_id: gig.gig_id,
          gig_title: gig.title,
          poster_name: 'Verified Poster',
          rating_score: score,
          feedback_text: feedback,
          rated_at: gig.rated_at
        });
        stu.reviews_json = JSON.stringify(revs);
        stu.ratings_count = revs.length;
        stu.avg_rating = Number((revs.reduce((s, r) => s + Number(r.rating_score), 0) / revs.length).toFixed(2));
      }
      saveDb();
      return { success: true, data: enrichGig(gig) };
    }

    const topupMatch = pathname.match(/^\\/api\\/v1\\/gigs\\/([^/]+)\\/topup-revision$/);
    if (topupMatch) {
      const gig = localDb.gigs.find((g) => g.gig_id === decodeURIComponent(topupMatch[1]));
      gig.payout_inr = Number(gig.payout_inr) + 150;
      gig.revisions_left = Number(gig.revisions_left) + 1;
      appendLog(gig.gig_id, gig.poster_id, gig.state, gig.state, 'Locked +₹150 Extra-Scope Top-Up (+1 Revision)', 'TOPUP-150');
      saveDb();
      return { success: true, data: enrichGig(gig) };
    }

    const dispMatch = pathname.match(/^\\/api\\/v1\\/arbitration\\/([^/]+)\\/dispute$/);
    if (dispMatch) {
      const gig = localDb.gigs.find((g) => g.gig_id === decodeURIComponent(dispMatch[1]));
      gig.state = 'DISPUTED_EDC';
      gig.disputed_checkbox = body.checkbox_index || 3;
      gig.dispute_reason = body.reason || 'Dispute on acceptance checkbox';
      gig.auto_release_at = null;
      appendLog(gig.gig_id, gig.poster_id, 'DELIVERED_VAULT', 'DISPUTED_EDC', 'Routed to 60s YouthNet EDC Arbitrator; 36h Timer Frozen', 'EDC-DISP');
      saveDb();
      return { success: true, data: enrichGig(gig) };
    }

    const pinMatch = pathname.match(/^\\/api\\/v1\\/gigs\\/([^/]+)\\/onsite\\/pin-handshake$/);
    if (pinMatch) {
      const gig = localDb.gigs.find((g) => g.gig_id === decodeURIComponent(pinMatch[1]));
      if (body.pin_type === 'START_PIN') {
        if (String(body.pin_entered) !== String(gig.start_pin)) throw cfg.ERRORS['ERR-MG-4001'];
        gig.state = 'IN_PROGRESS_ONSITE'; gig.safety_beacon_active = true;
        appendLog(gig.gig_id, 'USR-STU-01', 'ASSIGNED_OFFLINE', 'IN_PROGRESS_ONSITE', 'Verified START_PIN (' + body.pin_entered + ')', 'PIN-START');
        saveDb();
        return { success: true, data: { gig: enrichGig(gig) } };
      } else {
        if (String(body.pin_entered) !== String(gig.complete_pin)) throw cfg.ERRORS['ERR-MG-4001'];
        gig.state = 'SETTLED';
        const split = calculateEscrowAndSplit(gig.payout_inr, gig.execution_type);
        appendLog(gig.gig_id, 'USR-STU-01', 'IN_PROGRESS_ONSITE', 'SETTLED', 'Verified COMPLETE_PIN (' + body.pin_entered + ') & Settled Escrow', 'PIN-DONE');
        saveDb();
        return {
          success: true,
          data: {
            new_state: 'SETTLED',
            payout_disbursement: {
              execution_type: gig.execution_type,
              lead_amount_inr: split.leadPayoutInr,
              junior_amount_inr: split.juniorPayoutInr,
              settlement_utr: 'UTR-PIN-' + String(Date.now()).slice(-6)
            },
            gig: enrichGig(gig)
          }
        };
      }
    }

    const sosMatch = pathname.match(/^\\/api\\/v1\\/gigs\\/([^/]+)\\/safety-sos$/);
    if (sosMatch) {
      const gig = localDb.gigs.find((g) => g.gig_id === decodeURIComponent(sosMatch[1])) || localDb.gigs[0];
      const unit = cfg.SAFETY_DISPATCH_UNITS[gig.corridor_cluster] || cfg.SAFETY_DISPATCH_UNITS.SOVIMA_6MILE;
      return {
        success: true,
        data: {
          alert_id: 'SOS-NL-' + String(Date.now()).slice(-5),
          dispatched_to_union: unit.union,
          union_helpline: unit.helpline,
          hostel_warden_desk: unit.wardenDesk,
          venue_label: gig.venue_label
        }
      };
    }

    const settleMatch = pathname.match(/^\\/api\\/v1\\/escrow\\/([^/]+)\\/settle$/);
    if (settleMatch) {
      const gig = localDb.gigs.find((g) => g.gig_id === decodeURIComponent(settleMatch[1]));
      gig.state = body.trigger_type === 'AUTO_RELEASE_36H' ? 'AUTO_RELEASED' : 'SETTLED';
      gig.lifecycle_status = 'DELETED';
      const split = calculateEscrowAndSplit(gig.payout_inr, gig.execution_type);
      const stu1 = localDb.users.find((u) => u.user_id === (gig.assigned_lead_id || 'USR-STU-01'));
      const stu2 = gig.assigned_junior_id ? localDb.users.find((u) => u.user_id === gig.assigned_junior_id) : null;
      if (stu1) {
        stu1.wallet_balance_inr = Number(stu1.wallet_balance_inr) + split.leadPayoutInr;
        const txs = JSON.parse(stu1.wallet_transactions_json || '[]');
        txs.unshift({
          tx_id: 'TX-' + String(Date.now()).slice(-6),
          type: 'GIG_SETTLEMENT_CREDIT',
          amount_inr: split.leadPayoutInr,
          note: 'Settled Job (' + gig.gig_id + '): ' + gig.title,
          timestamp: new Date().toISOString()
        });
        stu1.wallet_transactions_json = JSON.stringify(txs);
        stu1.availability_status = getStuAvailability(stu1);
      }
      if (stu2) {
        stu2.wallet_balance_inr = Number(stu2.wallet_balance_inr) + split.juniorPayoutInr;
        stu2.availability_status = getStuAvailability(stu2);
      }

      const credId = 'MG-CRED-2026-' + (9000 + localDb.skill_credentials.length + 1);
      localDb.skill_credentials.unshift({
        credential_id: credId, gig_id: gig.gig_id, student_id: stu1 ? stu1.user_id : 'USR-STU-01',
        student_name: stu1 ? stu1.full_name : 'Toshi Ao',
        institution: stu1 ? stu1.institution_or_org : 'ICFAI University Nagaland, Sovima',
        role_badge: gig.execution_type === 'MORUNG_SQUAD_70_30' ? 'Morung Squad Senior Lead (70%)' : 'Solo Specialist (100%)',
        portfolio_title: gig.portfolio_title, skill_pillar: 'YouthNet EDC Verified Pillar',
        client_org: 'Verified Nagaland Partner', payout_earned_inr: split.leadPayoutInr,
        qr_verification_hash: pureSha256Hex(credId), issued_at: new Date().toISOString()
      });
      appendLog(gig.gig_id, 'USR-POS-01', 'DELIVERED_VAULT', gig.state, 'Settled Nodal UPI Escrow & Minted ' + credId, 'UTR-SETTLED');
      saveDb();
      return {
        success: true, new_state: gig.state, vault_unlocked: true,
        payout_disbursement: {
          execution_type: gig.execution_type,
          lead_amount_inr: split.leadPayoutInr,
          junior_amount_inr: split.juniorPayoutInr,
          settlement_utr: 'UTR-SPLIT-' + String(Date.now()).slice(-6)
        },
        minted_credentials: [credId],
        data: enrichGig(gig)
      };
    }

    const arbResolveMatch = pathname.match(/^\\/api\\/v1\\/arbitration\\/([^/]+)\\/resolve$/);
    if (arbResolveMatch) {
      const gig = localDb.gigs.find((g) => g.gig_id === decodeURIComponent(arbResolveMatch[1]));
      const split = calculateEscrowAndSplit(gig.payout_inr, gig.execution_type, body.arbitration_decision);
      gig.state = body.arbitration_decision === 'FULL_REFUND_TO_POSTER' ? 'REFUNDED' : 'SETTLED';
      appendLog(gig.gig_id, 'USR-EDC-01', 'DISPUTED_EDC', gig.state, '60s EDC Checklist Ruling: ' + body.arbitration_decision, 'EDC-RULING');
      saveDb();
      return {
        success: true,
        data: {
          payout_disbursement: {
            lead_amount_inr: split.leadPayoutInr,
            junior_amount_inr: split.juniorPayoutInr,
            poster_refund_inr: split.posterRefundInr
          }
        }
      };
    }

    const credVerifyMatch = pathname.match(/^\\/api\\/v1\\/credentials\\/verify\\/([^/]+)$/);
    if (credVerifyMatch) {
      const cred = localDb.skill_credentials.find((c) => c.credential_id === decodeURIComponent(credVerifyMatch[1])) || localDb.skill_credentials[0];
      return {
        success: true,
        data: {
          ...cred,
          backing_escrow_utr: 'UTR-SPLIT-88492000',
          qr_svg: browserQrSvg(cred.credential_id, 140)
        }
      };
    }

    return { success: true, data: {} };
  };
})();
`;

const standaloneHtml = htmlTemplate
  .replace('<link rel="stylesheet" href="/styles.css" />', () => `<style>\n${cssContent}\n</style>`)
  .replace('<script src="/app.js"></script>', () => `<script>\n${inlineFallbackScript}\n${appJsContent}\n</script>`);

fs.writeFileSync('/home/user/MorungGig_Interactive_Prototype.html', standaloneHtml, 'utf8');
console.log('Generated /home/user/MorungGig_Interactive_Prototype.html successfully.');
