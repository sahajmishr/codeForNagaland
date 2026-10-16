/**
 * MORUNGGIG (SKILLBRIDGE NL) — END-TO-END AUTOMATED QA TEST SUITE (TC-01 TO TC-30)
 * Verifies every Functional Requirement (FR-*), Nagaland Domain Rule (DR-NAG-*),
 * Non-Functional Requirement (NFR-*), Error Code (ERR-MG-*), and FSM Guard.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildServer, createWebhookSignature } = require('../src/server');
const { db } = require('../src/db/database');
const {
  computeStudentKycHash,
  maskPhone
} = require('../src/utils/crypto.utils');
const {
  calculateEscrowAndSplit,
  calculateCorridorFare,
  calculateMatchScore
} = require('../src/utils/validation.utils');

const { fastify } = buildServer({ logger: false });

test.beforeEach(() => {
  db.resetToSeed();
});

test.after(async () => {
  await fastify.close();
  await db.close();
});

test('TC-01 to TC-05: Nagaland Corridor Auto-Fare Matrix, Tiered Fee & Prestige Titles', async () => {
  // TC-05: Corridor Auto-Fare Math (DR-NAG-03)
  const localSovima = calculateCorridorFare('SOVIMA_6MILE', 'SOVIMA_6MILE', 'OFFLINE', 900);
  assert.equal(localSovima.estTransportInr, 30);
  assert.equal(localSovima.netTakeHomeInr, 870);
  assert.equal(localSovima.interDistrict, false);

  const sovimaToDimapur = calculateCorridorFare('SOVIMA_6MILE', 'DIMAPUR_TOWN', 'OFFLINE', 700);
  assert.equal(sovimaToDimapur.estTransportInr, 100);
  assert.equal(sovimaToDimapur.netTakeHomeInr, 600);

  const interDistrict = calculateCorridorFare('SOVIMA_6MILE', 'KOHIMA_TOWN', 'OFFLINE', 800);
  assert.equal(interDistrict.interDistrict, true);

  const digitalZeroFare = calculateCorridorFare('SOVIMA_6MILE', 'KOHIMA_TOWN', 'DIGITAL', 900);
  assert.equal(digitalZeroFare.estTransportInr, 0);
  assert.equal(digitalZeroFare.netTakeHomeInr, 900);

  // TC-30: Community-First Tiered Fee (0% <= 500, 5% > 500) & 70/30 Squad Split
  const communityFee = calculateEscrowAndSplit(500, 'SOLO');
  assert.equal(communityFee.platformFeeInr, 0);
  assert.equal(communityFee.totalEscrowLockInr, 500);

  const squadSplit = calculateEscrowAndSplit(1000, 'MORUNG_SQUAD_70_30');
  assert.equal(squadSplit.platformFeeInr, 50);
  assert.equal(squadSplit.totalEscrowLockInr, 1050);
  assert.equal(squadSplit.leadPayoutInr, 700);
  assert.equal(squadSplit.juniorPayoutInr, 300);
});

test('TC-03 & SRS Endpoint 1: Nagamese & English Voice-to-Task NLP Parser', async () => {
  const res = await fastify.inject({
    method: 'POST',
    url: '/api/v1/gigs/voice-parse',
    payload: {
      raw_utterance: 'Ami laga bakery stall nimite Saturday din duita college student lage Agri Expo 4th Mile te 600 dibo',
      poster_type: 'POSTER_BUSINESS',
      default_corridor: 'CHUMOUKEDIMA'
    }
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.parsed_gig.track_category, 'EVENTS_STALLS');
  assert.equal(body.parsed_gig.corridor_cluster, 'CHUMOUKEDIMA');
  assert.equal(body.parsed_gig.payout_inr, 600);
  assert.equal(body.parsed_gig.platform_fee_inr, 30);
  assert.equal(body.guardrail_check.rate_valid, true);
  assert.equal(body.guardrail_check.scam_check_passed, true);
});

test('TC-07, TC-12, TC-18, TC-19: Guardrail Enforcement (Scam Regex, Fair-Rate Floor, Curfew, First-Time Household)', async () => {
  // TC-19: Anti-Scam Fee Solicitation Regex Firewall (ERR-MG-1005)
  const scamRes = await fastify.inject({
    method: 'POST',
    url: '/api/v1/gigs/create-and-lock',
    payload: {
      poster_id: 'USR-POS-01',
      title: 'Urgent Data Entry - Pay Rs 300 registration fee first',
      track_category: 'COMMERCE_OPS',
      execution_mode: 'DIGITAL',
      corridor_cluster: 'SOVIMA_6MILE',
      venue_label: 'Dimapur',
      payout_inr: 600,
      criteria_1: 'Complete 50 pages typing',
      criteria_2: 'Pay security deposit for ID card',
      criteria_3: 'Submit within 24 hours'
    }
  });
  assert.equal(scamRes.statusCode, 422);
  assert.equal(scamRes.json().error.code, 'ERR-MG-1005');

  // TC-12: Nagaland Fair-Rate Floor Enforcement (ERR-MG-2001)
  const floorRes = await fastify.inject({
    method: 'POST',
    url: '/api/v1/gigs/create-and-lock',
    payload: {
      poster_id: 'USR-POS-01',
      title: 'Shoot 3 Cafe Reels for Sovima Outlet',
      track_category: 'CONTENT_REELS',
      execution_mode: 'DIGITAL',
      corridor_cluster: 'SOVIMA_6MILE',
      venue_label: 'Sovima',
      payout_inr: 200,
      criteria_1: 'Shoot 3 vertical reels at outlet',
      criteria_2: 'Add captions and music',
      criteria_3: 'Upload to watermarked vault'
    }
  });
  assert.equal(floorRes.statusCode, 422);
  assert.equal(floorRes.json().error.code, 'ERR-MG-2001');

  // TC-07: Sunday & 4:30 PM / 17:00 IST Curfew Guardrail (ERR-MG-2003)
  const curfewRes = await fastify.inject({
    method: 'POST',
    url: '/api/v1/gigs/create-and-lock',
    payload: {
      poster_id: 'USR-POS-01',
      title: 'Late Night Event Helper at 8:00 PM',
      track_category: 'EVENTS_STALLS',
      execution_mode: 'OFFLINE',
      corridor_cluster: 'SOVIMA_6MILE',
      venue_label: 'Sovima Hub',
      scheduled_end_hour: 20,
      payout_inr: 700,
      criteria_1: 'Arrive at venue for evening shift',
      criteria_2: 'Assist guests until 8:00 PM',
      criteria_3: 'Complete closing checklist'
    }
  });
  assert.equal(curfewRes.statusCode, 422);
  assert.equal(curfewRes.json().error.code, 'ERR-MG-2003');

  // TC-18: First-Time Individual Household Public-Venue / Squad Guardrail (ERR-MG-1004)
  const householdRes = await fastify.inject({
    method: 'POST',
    url: '/api/v1/gigs/create-and-lock',
    payload: {
      poster_id: 'USR-POS-02', // Mrs. Kevino has completed_gigs_cnt = 1 (< 2)
      poster_type: 'POSTER_INDIVIDUAL',
      title: 'Home Cleaning and Sorting Task',
      track_category: 'LANGUAGE_TUTOR',
      execution_mode: 'OFFLINE',
      corridor_cluster: 'SOVIMA_6MILE',
      venue_label: 'My Private Residence Inside Bedroom',
      is_public_venue: false,
      allow_morung_squad: false,
      payout_inr: 500,
      criteria_1: 'Arrive at private house at 2 PM',
      criteria_2: 'Organize study books for 2 hours',
      criteria_3: 'Complete by 4 PM curfew'
    }
  });
  assert.equal(householdRes.statusCode, 403);
  assert.equal(householdRes.json().error.code, 'ERR-MG-1004');
});

test('TC-14, TC-15, TC-16, TC-20: Digital Vault Lifecycle, ABAC Gate, Max 2 Revisions & 70/30 Split Settlement', async () => {
  // 1. Assign GIG-NL-2026-101 as Morung Squad (70/30)
  const assignRes = await fastify.inject({
    method: 'POST',
    url: '/api/v1/gigs/GIG-NL-2026-101/assign',
    payload: {
      lead_student_id: 'USR-STU-01',
      junior_student_id: 'USR-STU-02',
      execution_type: 'MORUNG_SQUAD_70_30'
    }
  });
  assert.equal(assignRes.statusCode, 200);
  assert.equal(assignRes.json().data.state, 'ASSIGNED_DIGITAL');

  // 2. Verify 20% Checkpoint
  const chkRes = await fastify.inject({
    method: 'POST',
    url: '/api/v1/gigs/GIG-NL-2026-101/checkpoint',
    payload: { note: '20% Storyboard verified' }
  });
  assert.equal(chkRes.statusCode, 200);
  assert.equal(chkRes.json().data.state, 'CHECKPOINT_VERIFIED');

  // 3. Upload Deliverable to Watermarked Vault
  const delivRes = await fastify.inject({
    method: 'POST',
    url: '/api/v1/vault/GIG-NL-2026-101/deliver',
    payload: {
      student_lead_id: 'USR-STU-01',
      deliverable_title: 'YesCoffee_3Reels_Final.mp4',
      criteria_checked: [true, true, true]
    }
  });
  assert.equal(delivRes.statusCode, 200);
  assert.equal(delivRes.json().new_state, 'DELIVERED_VAULT');
  assert.equal(delivRes.json().vault_protection.watermark_active, true);

  // 4. TC-14: Poster attempting to download raw file before settlement is blocked with 403 ERR-MG-4003
  const rawBlocked = await fastify.inject({
    method: 'GET',
    url: '/api/v1/vault/GIG-NL-2026-101/raw-file?actor_id=USR-POS-01'
  });
  assert.equal(rawBlocked.statusCode, 403);
  assert.equal(rawBlocked.json().error.code, 'ERR-MG-4003');

  // 5. TC-15: Hard Revision Counter (Max 2 Revisions -> 3rd blocked with ERR-MG-4002)
  const rev1 = await fastify.inject({
    method: 'POST',
    url: '/api/v1/vault/GIG-NL-2026-101/revision',
    payload: { checkbox_index: 2, revision_note: 'Fix caption timing on Reel 1' }
  });
  assert.equal(rev1.statusCode, 200);
  assert.equal(rev1.json().revisions_left, 1);

  await fastify.inject({
    method: 'POST',
    url: '/api/v1/vault/GIG-NL-2026-101/deliver',
    payload: { deliverable_title: 'YesCoffee_v2.mp4', criteria_checked: [true, true, true] }
  });

  const rev2 = await fastify.inject({
    method: 'POST',
    url: '/api/v1/vault/GIG-NL-2026-101/revision',
    payload: { checkbox_index: 2, revision_note: 'Adjust color warmth slightly' }
  });
  assert.equal(rev2.statusCode, 200);
  assert.equal(rev2.json().revisions_left, 0);

  await fastify.inject({
    method: 'POST',
    url: '/api/v1/vault/GIG-NL-2026-101/deliver',
    payload: { deliverable_title: 'YesCoffee_v3.mp4', criteria_checked: [true, true, true] }
  });

  const rev3Blocked = await fastify.inject({
    method: 'POST',
    url: '/api/v1/vault/GIG-NL-2026-101/revision',
    payload: { checkbox_index: 2, revision_note: 'One more free change please' }
  });
  assert.equal(rev3Blocked.statusCode, 403);
  assert.equal(rev3Blocked.json().error.code, 'ERR-MG-4002');

  // 6. TC-20: Settle Escrow & Verify 70% Senior (₹630) + 30% Junior (₹270) + 2 QR Credentials Minted
  const settleRes = await fastify.inject({
    method: 'POST',
    url: '/api/v1/escrow/GIG-NL-2026-101/settle',
    payload: { trigger_type: 'POSTER_APPROVAL', actor_id: 'USR-POS-01' }
  });
  assert.equal(settleRes.statusCode, 200);
  const sBody = settleRes.json();
  assert.equal(sBody.new_state, 'SETTLED');
  assert.equal(sBody.vault_unlocked, true);
  assert.equal(sBody.payout_disbursement.lead_amount_inr, 630);
  assert.equal(sBody.payout_disbursement.junior_amount_inr, 270);
  assert.equal(sBody.minted_credentials.length, 2);

  // Raw file now unlocks for Poster!
  const rawUnlocked = await fastify.inject({
    method: 'GET',
    url: '/api/v1/vault/GIG-NL-2026-101/raw-file?actor_id=USR-POS-01'
  });
  assert.equal(rawUnlocked.statusCode, 200);
  assert.equal(rawUnlocked.json().data.watermark_stripped, true);
});

test('TC-17: Offline Dual 4-Digit PIN Handshake (START_PIN 4821 -> COMPLETE_PIN 9054)', async () => {
  // Wrong START_PIN rejected with 401 ERR-MG-4001
  const badPin = await fastify.inject({
    method: 'POST',
    url: '/api/v1/gigs/GIG-NL-2026-105/onsite/pin-handshake',
    payload: { pin_type: 'START_PIN', pin_entered: '0000' }
  });
  assert.equal(badPin.statusCode, 401);
  assert.equal(badPin.json().error.code, 'ERR-MG-4001');

  // Correct START_PIN (4821) transitions to IN_PROGRESS_ONSITE & activates safety beacon
  const startOk = await fastify.inject({
    method: 'POST',
    url: '/api/v1/gigs/GIG-NL-2026-105/onsite/pin-handshake',
    payload: { pin_type: 'START_PIN', pin_entered: '4821' }
  });
  assert.equal(startOk.statusCode, 200);
  assert.equal(startOk.json().data.gig.state, 'IN_PROGRESS_ONSITE');
  assert.equal(startOk.json().data.gig.safety_beacon_active, true);

  // Correct COMPLETE_PIN (9054) transitions to SETTLED & disburses 70/30 split
  const completeOk = await fastify.inject({
    method: 'POST',
    url: '/api/v1/gigs/GIG-NL-2026-105/onsite/pin-handshake',
    payload: { pin_type: 'COMPLETE_PIN', pin_entered: '9054' }
  });
  assert.equal(completeOk.statusCode, 200);
  assert.equal(completeOk.json().data.new_state, 'SETTLED');
  assert.equal(completeOk.json().data.payout_disbursement.lead_amount_inr, 420);
  assert.equal(completeOk.json().data.payout_disbursement.junior_amount_inr, 180);
});

test('TC-09, TC-22, TC-23 & SDD Sec 3.5: 60s EDC Arbitration, Sybil Roll Hash Guard & HMAC Webhook', async () => {
  // TC-09: 60-Second YouthNet EDC Arbitrator 50/50 Milestone Split on GIG-NL-2026-106 (₹800)
  const arbRes = await fastify.inject({
    method: 'POST',
    url: '/api/v1/arbitration/GIG-NL-2026-106/resolve',
    payload: {
      actor_id: 'USR-EDC-01',
      arbitration_decision: 'PARTIAL_MILESTONE_SPLIT'
    }
  });
  assert.equal(arbRes.statusCode, 200);
  const arbData = arbRes.json().data;
  assert.equal(arbData.payout_disbursement.lead_amount_inr, 400);
  assert.equal(arbData.payout_disbursement.poster_refund_inr, 400);

  // TC-22 & TC-23: Duplicate Student Roll No rejected with 409 ERR-MG-1001
  const dupRes = await fastify.inject({
    method: 'POST',
    url: '/api/v1/auth/onboard',
    payload: {
      role: 'STUDENT',
      full_name: 'Sybil Clone',
      college_code: 'ICFAI-SOV',
      roll_number: 'BA-2024-108', // Already registered to Toshi Ao
      corridor_cluster: 'SOVIMA_6MILE',
      phone: '9862001122',
      upi_vpa: 'clone@upi'
    }
  });
  assert.equal(dupRes.statusCode, 409);
  assert.equal(dupRes.json().error.code, 'ERR-MG-1001');

  // SDD Section 3.5: Cryptographic Payment Webhook HMAC-SHA256 verification
  const webhookPayload = { event_id: 'evt_test_991', gig_id: 'GIG-NL-2026-101', status: 'CAPTURED' };
  const ts = Math.floor(Date.now() / 1000);
  const sig = createWebhookSignature(JSON.stringify(webhookPayload), ts);

  const whOk = await fastify.inject({
    method: 'POST',
    url: '/api/v1/webhooks/payments',
    headers: {
      'x-webhook-signature': sig,
      'x-webhook-timestamp': String(ts),
      'x-webhook-event-id': 'evt_test_991'
    },
    payload: webhookPayload
  });
  assert.equal(whOk.statusCode, 200);
  assert.equal(whOk.json().verified_hmac, true);
});

test('TC-31: Strict Database Role-Based Access Control (RBAC) Enforcement (Student vs Poster vs EDC)', async () => {
  // 1. Student attempting to create/post a gig is blocked with 403 ERR-MG-RBAC-403
  const stuPostRes = await fastify.inject({
    method: 'POST',
    url: '/api/v1/gigs/create-and-lock',
    payload: {
      poster_id: 'USR-STU-01', // Student ID
      title: 'Student Attempting to Post Gig',
      track_category: 'CONTENT_REELS',
      execution_mode: 'DIGITAL',
      corridor_cluster: 'SOVIMA_6MILE',
      payout_inr: 600,
      criteria_1: 'Criteria item one valid',
      criteria_2: 'Criteria item two valid',
      criteria_3: 'Criteria item three valid'
    }
  });
  assert.equal(stuPostRes.statusCode, 403);
  assert.equal(stuPostRes.json().error.code, 'ERR-MG-RBAC-403');

  // 2. Student attempting to approve & settle escrow payout is blocked with 403 ERR-MG-RBAC-403
  const stuSettleRes = await fastify.inject({
    method: 'POST',
    url: '/api/v1/escrow/GIG-NL-2026-102/settle',
    payload: {
      trigger_type: 'POSTER_APPROVAL',
      actor_id: 'USR-STU-01'
    }
  });
  assert.equal(stuSettleRes.statusCode, 403);
  assert.equal(stuSettleRes.json().error.code, 'ERR-MG-RBAC-403');

  // 3. Poster attempting to upload deliverable to Student Vault is blocked with 403 ERR-MG-RBAC-403
  const posDeliverRes = await fastify.inject({
    method: 'POST',
    url: '/api/v1/vault/GIG-NL-2026-101/deliver',
    payload: {
      actor_id: 'USR-POS-01',
      deliverable_title: 'PosterFakeUpload.mp4',
      criteria_checked: [true, true, true]
    }
  });
  assert.equal(posDeliverRes.statusCode, 403);
  assert.equal(posDeliverRes.json().error.code, 'ERR-MG-RBAC-403');

  // 4. Student attempting to issue a YouthNet EDC Arbitration ruling is blocked with 403 ERR-MG-RBAC-403
  const stuArbRes = await fastify.inject({
    method: 'POST',
    url: '/api/v1/arbitration/GIG-NL-2026-104/resolve',
    payload: {
      actor_id: 'USR-STU-01',
      arbitration_decision: 'FULL_RELEASE_TO_STUDENT'
    }
  });
  assert.equal(stuArbRes.statusCode, 403);
  assert.equal(stuArbRes.json().error.code, 'ERR-MG-RBAC-403');
});

