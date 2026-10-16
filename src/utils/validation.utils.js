/**
 * MORUNGGIG (SKILLBRIDGE NL) — DETERMINISTIC VALIDATION, NLP & MATH ENGINE
 * Implements SRS Section 3.2, 3.3, 3.6, 3.7 & SDD Section 3.3
 */

const { NAGALAND_CONFIG } = require('../config/nagaland.constants');

// FR-IAM-05: Prohibited fee solicitation pattern
const SCAM_REGEX = /(registration\s*fee|security\s*deposit|training\s*fee|pay\s*first|id\s*card\s*charge|entry\s*fee|processing\s*fee)/i;

// Private residence keywords for FR-IAM-04 guardrail check
const PRIVATE_VENUE_REGEX = /(private\s*home|private\s*house|my\s*flat|bedroom|inside\s*house|private\s*room|isolated\s*residence|personal\s*apartment)/i;

/**
 * NFR-SEC-05: Strip HTML/script tags and normalize whitespace
 */
function stripHtmlAndNormalize(val) {
  if (typeof val !== 'string') return '';
  return val
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*>?/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if any string contains fee-solicitation scam phrases (FR-IAM-05)
 */
function containsScamSolicitation(...texts) {
  return texts.some((t) => SCAM_REGEX.test(String(t || '')));
}

/**
 * Section 3.6.2 & FR-ESC-02: Community-First Tiered Fee & Morung Squad 70/30 Split
 * - For P <= 500: platform_fee_inr = 0 (0%)
 * - For P > 500: platform_fee_inr = ROUND(0.05 * P) (5% paid by poster; 0% deducted from student)
 * - Solo: Lead = P, Junior = 0
 * - Morung Squad: Lead = ROUND(0.70 * P), Junior = P - Lead (30%)
 * - 50/50 EDC Arbitration: PosterRefund = ROUND(0.50 * P), StudentPool = P - PosterRefund
 */
function calculateEscrowAndSplit(payoutInr, executionType = 'SOLO', arbitrationMode = null) {
  const P = Math.round(Number(payoutInr) || 0);
  const platformFeeInr = P <= 500 ? 0 : Math.round(P * 0.05);
  const totalEscrowLockInr = P + platformFeeInr;

  const isSquad = executionType === 'MORUNG_SQUAD_70_30' || executionType === 'MORUNG_SQUAD' || executionType === true;

  if (arbitrationMode === 'FULL_REFUND_TO_POSTER') {
    return {
      payoutInr: P,
      platformFeeInr,
      totalEscrowLockInr,
      leadPayoutInr: 0,
      juniorPayoutInr: 0,
      posterRefundInr: P
    };
  }

  if (arbitrationMode === 'PARTIAL_MILESTONE_SPLIT') {
    const posterRefundInr = Math.round(0.50 * P);
    const studentPool = P - posterRefundInr;
    const leadPayoutInr = isSquad ? Math.round(0.70 * studentPool) : studentPool;
    const juniorPayoutInr = isSquad ? studentPool - leadPayoutInr : 0;
    return {
      payoutInr: P,
      platformFeeInr,
      totalEscrowLockInr,
      leadPayoutInr,
      juniorPayoutInr,
      posterRefundInr
    };
  }

  const leadPayoutInr = isSquad ? Math.round(0.70 * P) : P;
  const juniorPayoutInr = isSquad ? P - leadPayoutInr : 0;

  return {
    payoutInr: P,
    platformFeeInr,
    totalEscrowLockInr,
    leadPayoutInr,
    juniorPayoutInr,
    posterRefundInr: 0
  };
}

/**
 * FR-MAT-01 & DR-NAG-03: Corridor Auto-Fare & Net-Take-Home Pay Calculator
 */
function calculateCorridorFare(studentCorridor, gigCorridor, executionMode = 'OFFLINE', payoutInr = 500) {
  const P = Number(payoutInr) || 0;
  if (executionMode === 'DIGITAL') {
    return {
      estTransportInr: 0,
      netTakeHomeInr: P,
      interDistrict: false,
      routeNote: 'Digital Remote Execution (₹0 Auto Fare)'
    };
  }

  const row = NAGALAND_CONFIG.CORRIDOR_FARE_MATRIX[studentCorridor] || NAGALAND_CONFIG.CORRIDOR_FARE_MATRIX.SOVIMA_6MILE;
  const fare = row ? row[gigCorridor] : 50;

  if (fare === null || typeof fare === 'undefined') {
    // Inter-district offline gig between Dimapur/Chumoukedima belt and Kohima belt
    return {
      estTransportInr: 240,
      netTakeHomeInr: Math.max(0, P - 240),
      interDistrict: true,
      routeNote: '⚠️ Inter-District Offline Gig (74 km via NH-29) — Switch to Digital or Local Cluster'
    };
  }

  return {
    estTransportInr: fare,
    netTakeHomeInr: P - fare,
    interDistrict: false,
    routeNote: `Est. Shared Auto Round-Trip (${studentCorridor.replace('_', '/')} ↔ ${gigCorridor.replace('_', '/')}): -₹${fare}`
  };
}

/**
 * Section 3.6.1 & FR-MAT-03: Deterministic Zero-Resume Top-3 Candidate Ranking Formula
 * M(s, g) = 35 * I_slot(s, g) + 30 * I_track(s, g) + 20 * (TrustScore(s)/100) + 15 * (1 - EstFare(C_s, C_g)/Payout(g))
 */
function calculateMatchScore(student, gig) {
  let freeSlots = [];
  let skills = [];
  try {
    freeSlots = typeof student.free_slots_json === 'string' ? JSON.parse(student.free_slots_json) : (student.free_slots_json || []);
  } catch {
    freeSlots = [];
  }
  try {
    skills = typeof student.skills_json === 'string' ? JSON.parse(student.skills_json) : (student.skills_json || []);
  } catch {
    skills = [];
  }

  const iSlot = freeSlots.includes(gig.required_slot) || gig.required_slot === 'ANYTIME_DIGITAL' ? 1.0 : 0.3;
  const iTrack = skills.includes(gig.track_category) ? 1.0 : 0.5;
  const trustScore = Math.min(100, Math.max(0, Number(student.trust_score) || 95.0));

  const fareInfo = calculateCorridorFare(
    student.corridor_cluster || 'SOVIMA_6MILE',
    gig.corridor_cluster || 'SOVIMA_6MILE',
    gig.execution_mode || 'OFFLINE',
    gig.payout_inr || 500
  );

  const fareRatio = Math.min(1, Math.max(0, fareInfo.estTransportInr / Math.max(300, Number(gig.payout_inr) || 500)));
  const rawScore = 35 * iSlot + 30 * iTrack + 20 * (trustScore / 100) + 15 * (1 - fareRatio);

  return {
    score: Number(rawScore.toFixed(1)),
    slotMatched: iSlot === 1.0,
    trackMatched: iTrack === 1.0,
    estTransportInr: fareInfo.estTransportInr,
    netTakeHomeInr: fareInfo.netTakeHomeInr,
    interDistrict: fareInfo.interDistrict
  };
}

/**
 * FR-GIG-02: Nagamese & English Voice-to-Task Natural Language Parser
 */
function parseNagameseOrEnglishUtterance(rawUtterance, posterType = 'POSTER_BUSINESS', defaultCorridor = 'SOVIMA_6MILE') {
  const cleanText = stripHtmlAndNormalize(rawUtterance || '');
  const lower = cleanText.toLowerCase();

  const scamCheckPassed = !containsScamSolicitation(cleanText);

  // Extract payout amount (look for numbers >= 100 or after ₹ / rs / paying / dibo)
  let payoutInr = 600;
  const numberMatches = cleanText.match(/\b(\d{3,5})\b/g);
  if (numberMatches && numberMatches.length > 0) {
    // Pick the number that isn't a time/class number like 10 or 4
    const candidateNums = numberMatches.map(Number).filter((n) => n >= 100 && n <= 25000);
    if (candidateNums.length > 0) {
      payoutInr = candidateNums[candidateNums.length - 1];
    }
  }

  // Detect Corridor Cluster
  let corridorCluster = defaultCorridor || 'SOVIMA_6MILE';
  let venueLabel = 'Verified Campus / Commercial Hub, Sovima';
  if (/(agri\s*expo|4th\s*mile|chumou|chumukedima|patkai|ikishe|nit)/i.test(lower)) {
    corridorCluster = 'CHUMOUKEDIMA';
    venueLabel = 'Agri Expo, 4th Mile, Chümoukedima';
  } else if (/(kohima|boc|razhu|high\s*school)/i.test(lower)) {
    corridorCluster = 'KOHIMA_TOWN';
    venueLabel = 'BOC / Razhu Point Commercial Hub, Kohima';
  } else if (/(jotsoma|meriema|ksc|science\s*college)/i.test(lower)) {
    corridorCluster = 'JOTSOMA_MERIEMA';
    venueLabel = 'Jotsoma / Meriema Academic Hub, Kohima';
  } else if (/(dimapur|hk\s*market|hong\s*kong|circular\s*road|city\s*tower)/i.test(lower)) {
    corridorCluster = 'DIMAPUR_TOWN';
    venueLabel = 'Circular Road / HK Market Commercial Hub, Dimapur';
  } else if (/(sovima|6th\s*mile|icfai|tetso)/i.test(lower)) {
    corridorCluster = 'SOVIMA_6MILE';
    venueLabel = '6th Mile / Sovima Commercial Hub';
  }

  // Detect Track, Mode, Title, and Checkboxes
  let trackCategory = 'EVENTS_STALLS';
  let executionMode = 'OFFLINE';
  let title = 'Bakery Stall Operations & Customer Crew at Agri Expo';
  let durationLabel = 'Saturday Shift (10:00 AM - 04:00 PM)';
  let requiredSlot = 'SATURDAY_ALL_DAY';
  let languageTag = 'Nagamese Creole';
  let requiresNda = false;
  let criteria1 = 'Arrive at venue by 10:00 AM and verify 4-digit START_PIN';
  let criteria2 = 'Assist with customer orders, UPI billing tally, and product display';
  let criteria3 = 'Complete handover tally by 04:00 PM (before sunset curfew) and verify COMPLETE_PIN';

  if (/(reel|video|shoot|instagram|photo|camera|cafe\s*reel)/i.test(lower)) {
    trackCategory = 'CONTENT_REELS';
    executionMode = 'DIGITAL';
    title = 'Shoot & Edit 3 Vertical Brand Reels';
    durationLabel = '48 Hours Turnaround (3–5 hrs work)';
    requiredSlot = 'WEEKDAY_AFTER_3PM';
    languageTag = 'English / Nagamese';
    criteria1 = '3 vertical 9:16 videos (30-45 sec each) shot with clean framing and lighting';
    criteria2 = 'Edited with synced audio, readable captions, and brand tag overlay';
    criteria3 = 'Uploaded to MorungGig Watermarked Vault within 48 hours for review';
  } else if (/(stock|excel|inventory|dukan|billing|tally|audit|shop\s*count)/i.test(lower)) {
    trackCategory = 'COMMERCE_OPS';
    executionMode = 'DIGITAL';
    title = 'Retail Store Inventory Count & Excel Ledger Reconciliation';
    durationLabel = 'Saturday Shift (3–4 Hours)';
    requiredSlot = /saturday/i.test(lower) ? 'SATURDAY_ALL_DAY' : 'WEEKDAY_AFTER_3PM';
    languageTag = 'English / Nagamese';
    requiresNda = true;
    criteria1 = 'Count physical shop stock SKUs and enter into standardized Excel sheet';
    criteria2 = 'Reconcile unit prices, quantities, and flag low-stock items accurately';
    criteria3 = 'Upload completed .xlsx workbook to Watermarked Vault by 04:00 PM';
  } else if (/(tutor|tuition|nbse|maths|science|class\s*10|class\s*12|teach)/i.test(lower)) {
    trackCategory = 'LANGUAGE_TUTOR';
    executionMode = 'OFFLINE';
    title = 'NBSE Class 10 Mathematics & Science Exam Prep Mentorship';
    durationLabel = 'Weekday Afternoon (03:00 PM - 04:30 PM)';
    requiredSlot = 'WEEKDAY_AFTER_3PM';
    languageTag = 'English / Nagamese';
    venueLabel = '6th Mile / Campus Public Study Hub';
    criteria1 = 'Check in at public study hub at 03:00 PM using 4-digit START_PIN';
    criteria2 = 'Complete 90-minute guided problem solving on core NBSE syllabus chapters';
    criteria3 = 'Review student practice sheet by 04:30 PM and verify COMPLETE_PIN';
  } else if (/(translate|translation|tenyidie|ao|sumi|lotha|konyak|typing|transcribe)/i.test(lower)) {
    trackCategory = 'LANGUAGE_TUTOR';
    executionMode = 'DIGITAL';
    title = 'Indigenous Naga Dialect Transcription & English Translation';
    durationLabel = '48 Hours Flexible Digital';
    requiredSlot = 'ANYTIME_DIGITAL';
    languageTag = 'Tenyidie (Angami)';
    criteria1 = 'Transcribe source audio/document accurately with complete dialect fidelity';
    criteria2 = 'Provide clean parallel English translation in formatted document';
    criteria3 = 'Submit final bilingual file to Watermarked Vault';
  } else if (/(canva|website|poster|catalog|google\s*maps|design|tech)/i.test(lower)) {
    trackCategory = 'DIGITAL_TECH';
    executionMode = 'DIGITAL';
    title = 'Digital Product Catalog Design & Google Maps Storefront Setup';
    durationLabel = '24 Hours Turnaround';
    requiredSlot = 'ANYTIME_DIGITAL';
    languageTag = 'English / Nagamese';
    criteria1 = 'Create high-resolution digital product catalog in Canva with clear pricing';
    criteria2 = 'Verify business hours, location pin, and photos for digital storefront';
    criteria3 = 'Upload master PDF & asset bundle to Watermarked Vault';
  }

  // Detect squad intent ("duita", "two", "2", "squad", "pair")
  const allowMorungSquad = /(duita|two|2\s*student|squad|pair)/i.test(lower) ? true : true;

  // Curfew check: detect if utterance asks for late night (e.g. 7 PM, 8 PM, 9 PM, night)
  const curfewCompliant = !/(7\s*pm|8\s*pm|9\s*pm|10\s*pm|late\s*night|midnight)/i.test(lower);

  const trackSpec = NAGALAND_CONFIG.TRACKS[trackCategory] || NAGALAND_CONFIG.TRACKS.EVENTS_STALLS;
  const rateValid = payoutInr >= trackSpec.minFloorInr && payoutInr >= 300;
  const { platformFeeInr } = calculateEscrowAndSplit(payoutInr, allowMorungSquad ? 'MORUNG_SQUAD_70_30' : 'SOLO');

  return {
    parsed_gig: {
      title,
      portfolio_title: trackSpec.portfolioTitle,
      track_category: trackCategory,
      execution_mode: executionMode,
      corridor_cluster: corridorCluster,
      venue_label: venueLabel,
      payout_inr: payoutInr,
      platform_fee_inr: platformFeeInr,
      duration_label: durationLabel,
      required_slot: requiredSlot,
      language_tag: languageTag,
      requires_nda: requiresNda,
      allow_morung_squad: allowMorungSquad,
      criteria_1: criteria1,
      criteria_2: criteria2,
      criteria_3: criteria3
    },
    guardrail_check: {
      rate_valid: rateValid,
      min_floor_inr: trackSpec.minFloorInr,
      scam_check_passed: scamCheckPassed,
      curfew_compliant: curfewCompliant
    }
  };
}

/**
 * Full deterministic validation of Gig Creation input against all SRS/SDD rules
 */
function validateGigCreationInput(rawInput, posterUser) {
  const title = stripHtmlAndNormalize(rawInput.title || '');
  const venueLabel = stripHtmlAndNormalize(rawInput.venue_label || '');
  const criteria1 = stripHtmlAndNormalize(rawInput.criteria_1 || '');
  const criteria2 = stripHtmlAndNormalize(rawInput.criteria_2 || '');
  const criteria3 = stripHtmlAndNormalize(rawInput.criteria_3 || '');
  const trackCategory = rawInput.track_category || 'CONTENT_REELS';
  const executionMode = rawInput.execution_mode || 'DIGITAL';
  const corridorCluster = rawInput.corridor_cluster || 'SOVIMA_6MILE';
  const payoutInr = Math.round(Number(rawInput.payout_inr) || 0);
  const allowMorungSquad = rawInput.allow_morung_squad !== undefined ? Boolean(rawInput.allow_morung_squad) : true;
  const posterType = rawInput.poster_type || (posterUser && posterUser.role === 'POSTER_INDIVIDUAL' ? 'POSTER_INDIVIDUAL' : 'POSTER_BUSINESS');
  const isPublicVenue = rawInput.is_public_venue !== undefined
    ? Boolean(rawInput.is_public_venue)
    : !PRIVATE_VENUE_REGEX.test(venueLabel);
  const scheduledDay = String(rawInput.scheduled_day || 'SATURDAY').toUpperCase();
  const scheduledEndHour = Number(rawInput.scheduled_end_hour !== undefined ? rawInput.scheduled_end_hour : 16);
  const isChurchEvent = Boolean(rawInput.is_church_event);

  // 1. FR-IAM-05: Anti-Scam Regex Firewall
  if (containsScamSolicitation(title, venueLabel, criteria1, criteria2, criteria3)) {
    return { valid: false, error: NAGALAND_CONFIG.ERRORS['ERR-MG-1005'] };
  }

  // 2. FR-GIG-03 & DR-NAG-02: Fair-Rate Floor Enforcement
  const trackSpec = NAGALAND_CONFIG.TRACKS[trackCategory];
  if (!trackSpec) {
    return {
      valid: false,
      error: { code: 'ERR-MG-2001', status: 422, title: 'Invalid Track Category', detail: 'Selected track category is not valid.' }
    };
  }
  if (payoutInr < 300 || payoutInr < trackSpec.minFloorInr) {
    return {
      valid: false,
      error: {
        ...NAGALAND_CONFIG.ERRORS['ERR-MG-2001'],
        detail: `Fair-Rate Guardrail: Minimum student payout for ${trackSpec.shortName} in Nagaland is ₹${trackSpec.minFloorInr} (entered ₹${payoutInr}).`
      }
    };
  }

  // 3. FR-GIG-04: Mandatory 3-Checkbox Immutable Scope Lock
  if (criteria1.length < 6 || criteria2.length < 6 || criteria3.length < 6 || title.length < 5) {
    return { valid: false, error: NAGALAND_CONFIG.ERRORS['ERR-MG-2002'] };
  }

  // 4. FR-GIG-05 & DR-NAG-04: Sunday & Daylight Curfew Schedule Validator (Offline gigs)
  if (executionMode === 'OFFLINE') {
    const lateInTitleOrDuration = /(7:00\s*pm|8:00\s*pm|9:00\s*pm|19:00|20:00|21:00|late\s*night)/i.test(
      `${title} ${rawInput.duration_label || ''}`
    );
    if (scheduledEndHour > 17 || lateInTitleOrDuration || (scheduledDay === 'SUNDAY' && !isChurchEvent)) {
      return { valid: false, error: NAGALAND_CONFIG.ERRORS['ERR-MG-2003'] };
    }
  }

  // 5. FR-IAM-04 & DR-NAG-06: First-Time Individual Poster Public-Venue & Squad Safety Guardrail
  const completedCnt = posterUser ? Number(posterUser.completed_gigs_cnt || 0) : 0;
  if (posterType === 'POSTER_INDIVIDUAL' && completedCnt < 2 && executionMode === 'OFFLINE') {
    if (!isPublicVenue && !allowMorungSquad) {
      return { valid: false, error: NAGALAND_CONFIG.ERRORS['ERR-MG-1004'] };
    }
  }

  const { platformFeeInr, totalEscrowLockInr } = calculateEscrowAndSplit(payoutInr, allowMorungSquad ? 'MORUNG_SQUAD_70_30' : 'SOLO');

  return {
    valid: true,
    sanitized: {
      title,
      portfolio_title: rawInput.portfolio_title ? stripHtmlAndNormalize(rawInput.portfolio_title) : trackSpec.portfolioTitle,
      poster_type: posterType,
      track_category: trackCategory,
      execution_mode: executionMode,
      corridor_cluster: corridorCluster,
      venue_label: venueLabel || 'Verified Campus / Commercial Hub',
      is_public_venue: isPublicVenue,
      is_church_event: isChurchEvent,
      scheduled_day: scheduledDay,
      scheduled_end_hour: scheduledEndHour,
      payout_inr: payoutInr,
      platform_fee_inr: platformFeeInr,
      total_escrow_lock_inr: totalEscrowLockInr,
      duration_label: stripHtmlAndNormalize(rawInput.duration_label || trackSpec.typicalDuration),
      required_slot: rawInput.required_slot || 'WEEKDAY_AFTER_3PM',
      language_tag: rawInput.language_tag || 'English / Nagamese',
      requires_nda: Boolean(rawInput.requires_nda || trackCategory === 'COMMERCE_OPS'),
      criteria_1: criteria1,
      criteria_2: criteria2,
      criteria_3: criteria3,
      allow_morung_squad: allowMorungSquad
    }
  };
}

module.exports = {
  SCAM_REGEX,
  stripHtmlAndNormalize,
  containsScamSolicitation,
  calculateEscrowAndSplit,
  calculateCorridorFare,
  calculateMatchScore,
  parseNagameseOrEnglishUtterance,
  validateGigCreationInput
};
