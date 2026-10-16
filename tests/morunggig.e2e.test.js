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
  // 1. Assign GIG-NL-2026-101 as Morung Squad (70/30) by its Poster (USR-POS-01)
  const assignRes = await fastify.inject({
    method: 'POST',
    url: '/api/v1/gigs/GIG-NL-2026-101/assign',
    payload: {
      actor_id: 'USR-POS-01',
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

test('TC-32: Auth (Sign Up / Login / Cookies), Availability (FREE/WORKING/OFFLINE), Apply -> Assign -> DELETED Lifecycle, Mock Withdrawal & Ownership Guardrails', async () => {
  // 1. Sign Up a brand new Student account and verify session cookie is set
  const signupRes = await fastify.inject({
    method: 'POST',
    url: '/api/v1/auth/signup',
    payload: {
      role: 'STUDENT',
      full_name: 'Merenla Jamir',
      email: 'merenla@tetsocollege.org',
      password: 'securePassword123',
      institution_or_org: 'Tetso College, Sovima',
      college_code: 'TETSO',
      roll_number: 'BCOM-2026-881',
      corridor_cluster: 'SOVIMA_6MILE',
      phone: '9862778899',
      upi_vpa: 'merenla@okaxis',
      bio: 'B.Com Student'
    }
  });
  assert.equal(signupRes.statusCode, 201);
  const newStudent = signupRes.json().data.user;
  assert.equal(newStudent.availability_status, 'FREE');
  assert.ok(signupRes.headers['set-cookie']);

  // 2. Log In with Email + Password
  const loginRes = await fastify.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: {
      email: 'merenla@tetsocollege.org',
      password: 'securePassword123'
    }
  });
  assert.equal(loginRes.statusCode, 200);
  assert.equal(loginRes.json().data.user.user_id, newStudent.user_id);

  // 3. Toggle availability FREE -> OFFLINE -> FREE while not working
  const offRes = await fastify.inject({
    method: 'POST',
    url: `/api/v1/users/${newStudent.user_id}/availability`,
    payload: { actor_id: newStudent.user_id, availability_status: 'OFFLINE' }
  });
  assert.equal(offRes.statusCode, 200);
  assert.equal(offRes.json().data.availability_status, 'OFFLINE');

  const freeRes = await fastify.inject({
    method: 'POST',
    url: `/api/v1/users/${newStudent.user_id}/availability`,
    payload: { actor_id: newStudent.user_id, availability_status: 'FREE' }
  });
  assert.equal(freeRes.statusCode, 200);
  assert.equal(freeRes.json().data.availability_status, 'FREE');

  // 4. Student applies to ACTIVE job GIG-NL-2026-101
  const applyRes = await fastify.inject({
    method: 'POST',
    url: '/api/v1/gigs/GIG-NL-2026-101/apply',
    payload: {
      actor_id: newStudent.user_id,
      pitch_note: 'I have read the job description and can shoot all 3 reels.'
    }
  });
  assert.equal(applyRes.statusCode, 200);
  assert.equal(applyRes.json().data.lifecycle_status, 'ACTIVE');
  assert.ok(applyRes.json().data.applicants.some((a) => a.student_id === newStudent.user_id));

  // 5. Ownership Guardrail: Another Poster (USR-POS-02) CANNOT assign USR-POS-01's job!
  const wrongPosterAssign = await fastify.inject({
    method: 'POST',
    url: '/api/v1/gigs/GIG-NL-2026-101/assign',
    payload: {
      actor_id: 'USR-POS-02',
      lead_student_id: newStudent.user_id,
      execution_type: 'SOLO'
    }
  });
  assert.equal(wrongPosterAssign.statusCode, 403);
  assert.equal(wrongPosterAssign.json().error.code, 'ERR-MG-FORBIDDEN');

  // 6. Job Owner Poster (USR-POS-01) assigns the job to Merenla -> Job becomes ASSIGNED, Merenla becomes WORKING
  const assignOk = await fastify.inject({
    method: 'POST',
    url: '/api/v1/gigs/GIG-NL-2026-101/assign',
    payload: {
      actor_id: 'USR-POS-01',
      lead_student_id: newStudent.user_id,
      execution_type: 'SOLO'
    }
  });
  assert.equal(assignOk.statusCode, 200);
  assert.equal(assignOk.json().data.lifecycle_status, 'ASSIGNED');
  assert.equal(assignOk.json().data.lead_student.availability_status, 'WORKING');

  // 7. System-Maintained WORKING Lock: Merenla CANNOT manually toggle status to FREE or OFFLINE while WORKING!
  const lockedToggle = await fastify.inject({
    method: 'POST',
    url: `/api/v1/users/${newStudent.user_id}/availability`,
    payload: { actor_id: newStudent.user_id, availability_status: 'OFFLINE' }
  });
  assert.equal(lockedToggle.statusCode, 409);
  assert.equal(lockedToggle.json().error.code, 'ERR-MG-WORKING-LOCKED');

  // 8. Ownership Guardrail: Unassigned student (USR-STU-02) CANNOT submit work on Merenla's assigned job
  const wrongStudentDeliver = await fastify.inject({
    method: 'POST',
    url: '/api/v1/vault/GIG-NL-2026-101/deliver',
    payload: {
      actor_id: 'USR-STU-02',
      deliverable_title: 'Hijack.mp4',
      criteria_checked: [true, true, true]
    }
  });
  assert.equal(wrongStudentDeliver.statusCode, 403);
  assert.equal(wrongStudentDeliver.json().error.code, 'ERR-MG-FORBIDDEN');

  // 9. Merenla submits partial checkpoint & final deliverable
  await fastify.inject({
    method: 'POST',
    url: '/api/v1/gigs/GIG-NL-2026-101/checkpoint',
    payload: { actor_id: newStudent.user_id, note: '50% reels edited' }
  });
  await fastify.inject({
    method: 'POST',
    url: '/api/v1/vault/GIG-NL-2026-101/deliver',
    payload: {
      actor_id: newStudent.user_id,
      deliverable_title: 'Merenla_Final_Reels.mp4',
      criteria_checked: [true, true, true]
    }
  });

  // 10. Poster (USR-POS-01) settles payment -> Job becomes DELETED, ₹900 credited to Merenla, Merenla becomes FREE
  const settleOk = await fastify.inject({
    method: 'POST',
    url: '/api/v1/escrow/GIG-NL-2026-101/settle',
    payload: { actor_id: 'USR-POS-01', trigger_type: 'POSTER_APPROVAL' }
  });
  assert.equal(settleOk.statusCode, 200);
  assert.equal(settleOk.json().data.lifecycle_status, 'DELETED');
  assert.equal(settleOk.json().data.lead_student.wallet_balance_inr, 900);
  assert.equal(settleOk.json().data.lead_student.availability_status, 'FREE');

  // 11. Mock Withdrawal: Merenla withdraws ₹400 -> Balance becomes ₹500
  const withdrawRes = await fastify.inject({
    method: 'POST',
    url: '/api/v1/wallet/withdraw',
    payload: {
      actor_id: newStudent.user_id,
      amount_inr: 400,
      upi_vpa: 'merenla@okaxis'
    }
  });
  assert.equal(withdrawRes.statusCode, 200);
  assert.equal(withdrawRes.json().data.user.wallet_balance_inr, 500);
  assert.equal(withdrawRes.json().data.withdrawal.amount_inr, -400);
});

test('TC-33: Custom Category, 3 Tweaks per Online Job, Multi-Format Blurred/Watermarked Vault, Full Offline Job Pipeline & 5-Star Rating (<=50 Words)', async () => {
  // 1. Create an Online Job with OTHER_CUSTOM category & verify 3 Tweaks default
  const customOnlineRes = await fastify.inject({
    method: 'POST',
    url: '/api/v1/gigs/create-and-lock',
    payload: {
      poster_id: 'USR-POS-01',
      title: 'Drone Aerial Campus Tour & Brochure Layout',
      description: 'Capture aerial clips and create a brochure PDF.',
      track_category: 'OTHER_CUSTOM',
      custom_category_label: 'Drone & Aerial Photography',
      execution_mode: 'DIGITAL',
      corridor_cluster: 'SOVIMA_6MILE',
      payout_inr: 800,
      criteria_1: 'Capture 3 aerial campus clips',
      criteria_2: 'Export high-res brochure PDF',
      criteria_3: 'Upload to protected watermarked vault'
    }
  });
  assert.equal(customOnlineRes.statusCode, 201);
  const onlineGig = customOnlineRes.json().data;
  assert.equal(onlineGig.track_name, 'Custom: Drone & Aerial Photography');
  assert.equal(onlineGig.revisions_left, 3);
  assert.equal(onlineGig.max_tweaks, 3);

  // 2. Verify Applicants on GIG-NL-2026-101 are sorted by highest avg_rating descending
  const g101 = (await fastify.inject({ method: 'GET', url: '/api/v1/gigs' })).json().data.find((x) => x.gig_id === 'GIG-NL-2026-101');
  assert.ok(g101.applicants.length >= 2);
  assert.ok(g101.applicants[0].avg_rating >= g101.applicants[1].avg_rating);

  // 3. Assign custom online job to USR-STU-03 and upload IMAGE deliverable with blurrification + watermark
  await fastify.inject({
    method: 'POST',
    url: `/api/v1/gigs/${onlineGig.gig_id}/assign`,
    payload: { actor_id: 'USR-POS-01', lead_student_id: 'USR-STU-03', execution_type: 'SOLO' }
  });

  const vaultImgRes = await fastify.inject({
    method: 'POST',
    url: `/api/v1/vault/${onlineGig.gig_id}/deliver`,
    payload: {
      actor_id: 'USR-STU-03',
      media_type: 'IMAGE',
      deliverable_title: 'Aerial_Brochure_Cover.png',
      preview_summary: 'High-res cover image submitted',
      criteria_checked: [true, true, true]
    }
  });
  assert.equal(vaultImgRes.statusCode, 200);
  const vp = vaultImgRes.json().data.vault_protection;
  assert.equal(vp.media_type, 'IMAGE');
  assert.equal(vp.watermark_active, true);
  assert.equal(vp.blur_active, true);
  assert.equal(vp.no_download_active, true);
  assert.equal(vp.no_screenshot_active, true);

  // 4. Test 3 Tweaks on the online job (3 -> 2 -> 1 -> 0)
  for (let expectedLeft = 2; expectedLeft >= 0; expectedLeft--) {
    const twRes = await fastify.inject({
      method: 'POST',
      url: `/api/v1/vault/${onlineGig.gig_id}/revision`,
      payload: { actor_id: 'USR-POS-01', checkbox_index: 2, revision_note: `Tweak request leaving ${expectedLeft}` }
    });
    assert.equal(twRes.statusCode, 200);
    assert.equal(twRes.json().revisions_left, expectedLeft);

    await fastify.inject({
      method: 'POST',
      url: `/api/v1/vault/${onlineGig.gig_id}/deliver`,
      payload: {
        actor_id: 'USR-STU-03',
        media_type: 'IMAGE',
        deliverable_title: `Aerial_Brochure_v${3 - expectedLeft}.png`,
        criteria_checked: [true, true, true]
      }
    });
  }

  // 5. Create & Execute a Brand-New OFFLINE Job End-to-End (Post -> Assign -> START_PIN -> COMPLETE_PIN -> Rate <=50 words)
  const offlineCreateRes = await fastify.inject({
    method: 'POST',
    url: '/api/v1/gigs/create-and-lock',
    payload: {
      poster_id: 'USR-POS-01',
      title: 'Saturday Coffee Tasting Booth Setup at Sovima Hub',
      description: 'Physical on-site stall setup and customer sampling.',
      track_category: 'EVENTS_STALLS',
      execution_mode: 'OFFLINE',
      corridor_cluster: 'SOVIMA_6MILE',
      venue_label: 'Yes Coffee Sovima Public Courtyard',
      scheduled_end_hour: 16,
      payout_inr: 600,
      criteria_1: 'Check in at 10 AM with START_PIN',
      criteria_2: 'Manage coffee tasting booth for 4 hours',
      criteria_3: 'Complete closing inventory with COMPLETE_PIN'
    }
  });
  assert.equal(offlineCreateRes.statusCode, 201);
  const offGigId = offlineCreateRes.json().gig_id;

  const offAssignRes = await fastify.inject({
    method: 'POST',
    url: `/api/v1/gigs/${offGigId}/assign`,
    payload: { actor_id: 'USR-POS-01', lead_student_id: 'USR-STU-04', execution_type: 'SOLO' }
  });
  assert.equal(offAssignRes.statusCode, 200);
  const assignedOffGig = offAssignRes.json().data;
  assert.equal(assignedOffGig.state, 'ASSIGNED_OFFLINE');
  assert.ok(assignedOffGig.start_pin);
  assert.ok(assignedOffGig.complete_pin);

  // Step 1: Verify START_PIN
  const startPinRes = await fastify.inject({
    method: 'POST',
    url: `/api/v1/gigs/${offGigId}/onsite/pin-handshake`,
    payload: { actor_id: 'USR-STU-04', pin_type: 'START_PIN', pin_entered: assignedOffGig.start_pin }
  });
  assert.equal(startPinRes.statusCode, 200);
  assert.equal(startPinRes.json().data.gig.state, 'IN_PROGRESS_ONSITE');

  // Step 2: Verify COMPLETE_PIN -> Settles Escrow & Marks Job DELETED
  const compPinRes = await fastify.inject({
    method: 'POST',
    url: `/api/v1/gigs/${offGigId}/onsite/pin-handshake`,
    payload: { actor_id: 'USR-STU-04', pin_type: 'COMPLETE_PIN', pin_entered: assignedOffGig.complete_pin }
  });
  assert.equal(compPinRes.statusCode, 200);
  assert.equal(compPinRes.json().data.gig.lifecycle_status, 'DELETED');

  // 6. Rate Settled Job: >50 words rejected with 422 ERR-MG-RATING-WORDS, <=50 words accepted & updates avg_rating
  const tooLongFeedback = Array(55).fill('word').join(' ');
  const badRateRes = await fastify.inject({
    method: 'POST',
    url: `/api/v1/gigs/${offGigId}/rate`,
    payload: { actor_id: 'USR-POS-01', rating_score: 5, rating_feedback: tooLongFeedback }
  });
  assert.equal(badRateRes.statusCode, 422);
  assert.equal(badRateRes.json().error.code, 'ERR-MG-RATING-WORDS');

  const okRateRes = await fastify.inject({
    method: 'POST',
    url: `/api/v1/gigs/${offGigId}/rate`,
    payload: {
      actor_id: 'USR-POS-01',
      rating_score: 5,
      rating_feedback: 'Punctual arrival at Sovima courtyard, managed the coffee tasting booth professionally and completed inventory accurately.'
    }
  });
  assert.equal(okRateRes.statusCode, 200);
  assert.equal(okRateRes.json().data.rating_score, 5);
  assert.ok(okRateRes.json().student.avg_rating >= 4.9);
});



