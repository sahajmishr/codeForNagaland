/**
 * MORUNGGIG — SIMPLE, CLEAN, ROLE-ISOLATED FRONTEND CONTROLLER
 * Strictly separates Student Portal, Poster Portal, and EDC Arbitrator Portal
 * using database-verified RBAC (`STUDENT` vs `POSTER_*` vs `EDC_ARBITRATOR`).
 */

const MEMORY_STORAGE = {};

function safeGet(key, fallback = '') {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const v = window.localStorage.getItem(key);
      return v !== null ? v : (MEMORY_STORAGE[key] || fallback);
    }
  } catch {}
  return MEMORY_STORAGE[key] || fallback;
}

function safeSet(key, val) {
  MEMORY_STORAGE[key] = String(val);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, String(val));
    }
  } catch {}
}

const state = {
  config: null,
  users: [],
  gigs: [],
  telemetry: null,
  currentUser: null,
  activeTab: 'student-find',
  studentCorridor: 'SOVIMA_6MILE',
  accessToken: safeGet('MG_ACCESS_TOKEN', '')
};

const $ = (id) => document.getElementById(id);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function showToast(code, message) {
  const box = $('toastContainer');
  if (!box) return;
  $('toastCode').textContent = code;
  $('toastMessage').textContent = message;
  box.classList.remove('hidden');
  clearTimeout(window.__mgToastTimer);
  window.__mgToastTimer = setTimeout(() => box.classList.add('hidden'), 4200);
}

async function apiRequest(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.accessToken) headers.Authorization = `Bearer ${state.accessToken}`;
  if (state.currentUser && state.currentUser.user_id) {
    headers['X-Morung-Actor-Id'] = state.currentUser.user_id;
  }

  let bodyObj = options.body || undefined;
  if (bodyObj && typeof bodyObj === 'object' && state.currentUser && !bodyObj.actor_id) {
    bodyObj = { ...bodyObj, actor_id: state.currentUser.user_id };
  }

  const isSandbox =
    typeof window !== 'undefined' &&
    (!window.location || window.location.origin === 'null' || window.location.protocol === 'file:');

  if (isSandbox && typeof window.handleOfflineSandboxApiRequest === 'function') {
    return window.handleOfflineSandboxApiRequest(path, { ...options, body: bodyObj });
  }

  try {
    const res = await fetch(path, {
      method: options.method || 'GET',
      headers,
      body: bodyObj ? JSON.stringify(bodyObj) : undefined
    });
    const json = await res.json();
    if (!res.ok || json.success === false) {
      throw json.error || { code: 'ERR-MG-3001', detail: 'Action blocked by role authorization.' };
    }
    return json;
  } catch (err) {
    if (err && err.code && String(err.code).startsWith('ERR-MG-')) throw err;
    if (typeof window.handleOfflineSandboxApiRequest === 'function') {
      return window.handleOfflineSandboxApiRequest(path, { ...options, body: bodyObj });
    }
    throw err;
  }
}

function getRoleGroup(user) {
  if (!user) return 'STUDENT';
  if (user.role === 'STUDENT') return 'STUDENT';
  if (user.role === 'EDC_ARBITRATOR') return 'EDC';
  return 'POSTER';
}

async function loadData(keepCurrentUser = true) {
  const viewerId = state.currentUser ? state.currentUser.user_id : 'USR-STU-01';
  const res = await apiRequest(`/api/v1/bootstrap?student_corridor=${encodeURIComponent(state.studentCorridor)}&viewer_id=${encodeURIComponent(viewerId)}`);
  const d = res.data;
  state.config = d.config;
  state.users = d.users;
  state.gigs = d.gigs;
  state.telemetry = d.telemetry;

  if (!keepCurrentUser || !state.currentUser) {
    state.currentUser = state.users.find((u) => u.user_id === 'USR-STU-01') || state.users[0];
  } else {
    const updated = state.users.find((u) => u.user_id === state.currentUser.user_id);
    if (updated) state.currentUser = updated;
  }

  ensureAllowedTabForRole();
  renderPortal();
}

function ensureAllowedTabForRole() {
  const group = getRoleGroup(state.currentUser);
  const allowed = {
    STUDENT: ['student-find', 'student-work', 'student-wallet'],
    POSTER: ['poster-post', 'poster-jobs', 'poster-settle'],
    EDC: ['edc-disputes', 'edc-ledger']
  }[group];
  if (!allowed.includes(state.activeTab)) {
    state.activeTab = allowed[0];
  }
}

/**
 * Switch between Student Portal, Poster Portal, and EDC Arbitrator Portal
 * by authenticating as the corresponding database role account
 */
window.switchRolePortal = async function (targetGroup) {
  const defaultUserByGroup = {
    STUDENT: 'USR-STU-01',
    POSTER: 'USR-POS-01',
    EDC: 'USR-EDC-01'
  };
  const targetUserId = defaultUserByGroup[targetGroup] || 'USR-STU-01';
  await switchDatabaseUser(targetUserId);
};

async function switchDatabaseUser(userId) {
  try {
    const res = await apiRequest('/api/v1/auth/switch-role', {
      method: 'POST',
      body: { user_id: userId }
    });
    state.accessToken = res.data.access_token;
    safeSet('MG_ACCESS_TOKEN', state.accessToken);
    state.currentUser = res.data.user;
    if ($('accountSelectDropdown')) $('accountSelectDropdown').value = state.currentUser.user_id;
    ensureAllowedTabForRole();
    await loadData(true);
  } catch (err) {
    showToast('AUTH-ERR', 'Failed to switch account');
  }
}

window.switchTab = function (tabId) {
  state.activeTab = tabId;
  ensureAllowedTabForRole();
  renderPortal();
};

function renderPortal() {
  const u = state.currentUser;
  if (!u) return;
  const group = getRoleGroup(u);

  // 1. Update Top Role Switcher Buttons
  $('portalBtnStudent').classList.toggle('active', group === 'STUDENT');
  $('portalBtnPoster').classList.toggle('active', group === 'POSTER');
  $('portalBtnEdc').classList.toggle('active', group === 'EDC');

  const roleLabel = group === 'STUDENT' ? 'Student' : group === 'POSTER' ? 'Poster / Client' : 'EDC Arbitrator';
  $('activeUserTag').textContent = `${u.full_name} (${roleLabel})`;

  // 2. Render Role Header & Sub-Navigation
  renderSubnavAndHeader(group, u);

  // 3. Hide all sections and show ONLY the active section for this role
  $$('.portal-section').forEach((s) => s.classList.add('hidden'));
  const activeSec = $(`sec-${state.activeTab}`);
  if (activeSec) activeSec.classList.remove('hidden');

  // 4. Render ONLY the active section
  if (group === 'STUDENT') {
    if (state.activeTab === 'student-find') renderStudentFind();
    if (state.activeTab === 'student-work') renderStudentWork();
    if (state.activeTab === 'student-wallet') renderStudentWallet();
  } else if (group === 'POSTER') {
    if (state.activeTab === 'poster-post') renderPosterPost();
    if (state.activeTab === 'poster-jobs') renderPosterJobs();
    if (state.activeTab === 'poster-settle') renderPosterSettle();
  } else {
    if (state.activeTab === 'edc-disputes') renderEdcDisputes();
    if (state.activeTab === 'edc-ledger') renderEdcLedger();
  }
}

function renderSubnavAndHeader(group, u) {
  const eyebrow = $('portalEyebrow');
  const title = $('portalTitle');
  const sub = $('portalSub');
  const stat = $('portalQuickStat');
  const subnav = $('roleSubnav');

  if (group === 'STUDENT') {
    eyebrow.textContent = 'STUDENT PORTAL • CAN BROWSE, ACCEPT & SUBMIT WORK ONLY';
    title.textContent = `Welcome, ${u.full_name}`;
    sub.textContent = 'Students can accept open gigs and upload deliverables, but cannot post or settle jobs.';
    stat.innerHTML = `<div class="tag tag-sage mono" style="font-size:13px; padding:6px 12px;">Wallet Balance: ₹${Number(u.wallet_balance_inr).toLocaleString('en-IN')}</div>`;

    const openCnt = state.gigs.filter((g) => g.state === 'ESCROW_LOCKED').length;
    const myWorkCnt = state.gigs.filter(
      (g) => !['ESCROW_LOCKED', 'SETTLED', 'AUTO_RELEASED', 'REFUNDED'].includes(g.state)
    ).length;

    const tabs = [
      { id: 'student-find', label: 'Find Jobs', count: openCnt },
      { id: 'student-work', label: 'My Active Work & Submit', count: myWorkCnt },
      { id: 'student-wallet', label: 'Wallet & Skill Passport', count: null }
    ];
    subnav.innerHTML = tabs
      .map(
        (t) => `
        <button type="button" class="subnav-btn ${state.activeTab === t.id ? 'active' : ''}" onclick="window.switchTab('${t.id}')">
          <span>${t.label}</span>
          ${t.count !== null ? `<span class="subnav-count">${t.count}</span>` : ''}
        </button>
      `
      )
      .join('');
  } else if (group === 'POSTER') {
    eyebrow.textContent = 'POSTER / CLIENT PORTAL • CAN POST JOBS, HIRE & SETTLE ESCROW ONLY';
    title.textContent = `${u.full_name} — Client Dashboard`;
    sub.textContent = 'Posters create scoped jobs, assign matched students, and approve deliverables to release escrow.';
    stat.innerHTML = `<div class="tag tag-slate mono" style="font-size:13px; padding:6px 12px;">Verified Client • ${u.institution_or_org}</div>`;

    const openOrAssignedCnt = state.gigs.filter((g) => !['SETTLED', 'AUTO_RELEASED', 'REFUNDED'].includes(g.state)).length;
    const reviewCnt = state.gigs.filter((g) => g.state === 'DELIVERED_VAULT' || g.state === 'IN_PROGRESS_ONSITE').length;

    const tabs = [
      { id: 'poster-post', label: '+ Post a New Job', count: null },
      { id: 'poster-jobs', label: 'My Jobs & Hire Students', count: openOrAssignedCnt },
      { id: 'poster-settle', label: 'Approve & Settle Payments', count: reviewCnt }
    ];
    subnav.innerHTML = tabs
      .map(
        (t) => `
        <button type="button" class="subnav-btn ${state.activeTab === t.id ? 'active' : ''}" onclick="window.switchTab('${t.id}')">
          <span>${t.label}</span>
          ${t.count !== null ? `<span class="subnav-count">${t.count}</span>` : ''}
        </button>
      `
      )
      .join('');
  } else {
    eyebrow.textContent = 'YOUTHNET EDC ARBITRATOR PORTAL • DISPUTE RESOLUTION & AUDIT';
    title.textContent = 'YouthNet Nagaland EDC Console';
    sub.textContent = 'Review disputed deliverables against the 3 locked checkboxes and issue binding escrow splits.';
    stat.innerHTML = `<div class="tag tag-ochre mono" style="font-size:13px; padding:6px 12px;">60-Second SLA Arbitrator</div>`;

    const dispCnt = state.gigs.filter((g) => g.state === 'DISPUTED_EDC').length;
    const tabs = [
      { id: 'edc-disputes', label: 'Disputed Jobs', count: dispCnt },
      { id: 'edc-ledger', label: 'Escrow Audit Ledger', count: null }
    ];
    subnav.innerHTML = tabs
      .map(
        (t) => `
        <button type="button" class="subnav-btn ${state.activeTab === t.id ? 'active' : ''}" onclick="window.switchTab('${t.id}')">
          <span>${t.label}</span>
          ${t.count !== null ? `<span class="subnav-count">${t.count}</span>` : ''}
        </button>
      `
      )
      .join('');
  }
}

/* ==========================================================================
   1. STUDENT PORTAL RENDERERS (CAN ONLY ACCEPT & SUBMIT WORK)
   ========================================================================== */

function renderStudentFind() {
  const grid = $('studentFindGrid');
  if (!grid) return;

  const q = ($('studentSearchInput') ? $('studentSearchInput').value : '').trim().toLowerCase();
  const openGigs = state.gigs.filter((g) => {
    if (g.state !== 'ESCROW_LOCKED') return false;
    if (q && !`${g.title} ${g.corridor_label} ${g.track_name}`.toLowerCase().includes(q)) return false;
    return true;
  });

  if (openGigs.length === 0) {
    grid.innerHTML = `<div class="card"><p style="color:var(--text-secondary);">No open jobs matching your search right now.</p></div>`;
    return;
  }

  grid.innerHTML = openGigs
    .map((g) => {
      const fc = g.fare_calculator || { est_transport_inr: 0, net_take_home_inr: g.payout_inr };
      return `
        <div class="job-card">
          <div>
            <div class="job-card-header">
              <div>
                <span class="tag">${g.track_name}</span>
                <h3 class="job-title" style="margin-top:8px;">${g.title}</h3>
                <div class="job-meta">${g.poster ? g.poster.full_name : 'Verified Client'} • ${g.corridor_label}</div>
              </div>
              <div class="job-price">
                <div class="job-price-amount">₹${fc.net_take_home_inr}</div>
                <div class="job-price-note">${fc.est_transport_inr > 0 ? `Net (-₹${fc.est_transport_inr} auto)` : 'Net Payout'}</div>
              </div>
            </div>

            <ul class="checklist" style="margin-top:14px;">
              <li><span class="checklist-dot">1.</span> <span>${g.criteria_1}</span></li>
              <li><span class="checklist-dot">2.</span> <span>${g.criteria_2}</span></li>
              <li><span class="checklist-dot">3.</span> <span>${g.criteria_3}</span></li>
            </ul>
          </div>

          <div style="display:flex; gap:8px;">
            <button type="button" class="btn btn-primary btn-sm" style="flex:1;" onclick="window.studentAcceptJob('${g.gig_id}', 'SOLO')">
              Accept Solo (₹${g.payout_inr})
            </button>
            ${
              g.allow_morung_squad
                ? `<button type="button" class="btn btn-sage btn-sm" style="flex:1;" onclick="window.studentAcceptJob('${g.gig_id}', 'MORUNG_SQUAD_70_30')">
                    Accept 70/30 Squad
                  </button>`
                : ''
            }
          </div>
        </div>
      `;
    })
    .join('');
}

function renderStudentWork() {
  const list = $('studentWorkList');
  if (!list) return;

  const activeGigs = state.gigs.filter((g) =>
    ['ASSIGNED_DIGITAL', 'CHECKPOINT_VERIFIED', 'ASSIGNED_OFFLINE', 'IN_PROGRESS_ONSITE', 'DELIVERED_VAULT'].includes(g.state)
  );

  if (activeGigs.length === 0) {
    list.innerHTML = `<div class="card"><p style="color:var(--text-secondary);">You have no active jobs in progress. Go to <strong>Find Jobs</strong> to accept one.</p></div>`;
    return;
  }

  list.innerHTML = activeGigs
    .map((g) => {
      const canSubmitDigital = g.execution_mode === 'DIGITAL' && (g.state === 'ASSIGNED_DIGITAL' || g.state === 'CHECKPOINT_VERIFIED');
      const canCheckInOffline = g.execution_mode === 'OFFLINE' && g.state === 'ASSIGNED_OFFLINE';
      const isSubmittedWaiting = g.state === 'DELIVERED_VAULT' || g.state === 'IN_PROGRESS_ONSITE';

      return `
        <div class="card">
          <div class="job-card-header" style="margin-bottom:12px;">
            <div>
              <div style="display:flex; gap:6px; align-items:center; margin-bottom:6px;">
                <span class="tag mono">${g.gig_id}</span>
                <span class="tag tag-sage">${g.state.replace(/_/g, ' ')}</span>
              </div>
              <h3 class="job-title">${g.title}</h3>
              <div class="job-meta">Client: ${g.poster ? g.poster.full_name : 'Client'} • Payout Locked: ₹${g.payout_inr}</div>
            </div>
          </div>

          <ul class="checklist" style="margin-bottom:14px;">
            <li><span class="checklist-dot">☑</span> <span>${g.criteria_1}</span></li>
            <li><span class="checklist-dot">☑</span> <span>${g.criteria_2}</span></li>
            <li><span class="checklist-dot">☑</span> <span>${g.criteria_3}</span></li>
          </ul>

          ${
            canSubmitDigital
              ? `<div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                  <input type="text" id="stuDeliverInput_${g.gig_id}" class="input" style="flex:1;" value="${g.gig_id}_Final_Submission.mp4" placeholder="Deliverable filename or link..." />
                  <button type="button" class="btn btn-primary" onclick="window.studentSubmitWork('${g.gig_id}')">
                    Submit Work to Vault
                  </button>
                </div>`
              : ''
          }

          ${
            canCheckInOffline
              ? `<div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                  <input type="text" id="stuStartPin_${g.gig_id}" class="input mono" style="max-width:160px;" value="${g.start_pin || '4821'}" placeholder="4-Digit START_PIN" />
                  <button type="button" class="btn btn-primary" onclick="window.studentCheckInPin('${g.gig_id}')">
                    Verify Arrival START_PIN
                  </button>
                </div>`
              : ''
          }

          ${
            isSubmittedWaiting
              ? `<div style="background:var(--sage-bg); color:var(--sage-text); border:1px solid var(--sage-border); padding:12px 14px; border-radius:var(--radius-sm); font-size:13px;">
                  <strong>✓ Work Submitted</strong> — Waiting for the Client/Poster to review and settle your ₹${g.payout_inr} payment (Protected by 36h Auto-Release).
                </div>`
              : ''
          }
        </div>
      `;
    })
    .join('');
}

function renderStudentWallet() {
  const grid = $('studentWalletList');
  if (!grid || !state.telemetry) return;

  const creds = state.telemetry.credentials || [];
  grid.innerHTML = creds
    .map(
      (c) => `
      <div class="job-card">
        <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
          <div>
            <span class="tag mono">${c.credential_id}</span>
            <h3 class="job-title" style="margin-top:6px;">${c.portfolio_title}</h3>
            <div class="job-meta">${c.student_name} • ${c.institution}</div>
            <div style="margin-top:8px;">
              <span class="tag tag-sage">Earned ₹${c.payout_earned_inr}</span>
            </div>
          </div>
          <div>${c.qr_svg || ''}</div>
        </div>
      </div>
    `
    )
    .join('');
}

/* ==========================================================================
   2. POSTER / CLIENT PORTAL RENDERERS (CAN ONLY POST, HIRE & SETTLE)
   ========================================================================== */

function renderPosterPost() {
  const row = $('posterPresetRow');
  if (row && state.config && !row.dataset.ready) {
    row.dataset.ready = 'true';
    row.innerHTML = state.config.ONE_TAP_TASK_PRESETS.slice(0, 4)
      .map(
        (p) => `
        <button type="button" class="preset-chip" onclick="window.fillPosterPreset('${p.presetId}')">
          ${p.label} (₹${p.payoutInr})
        </button>
      `
      )
      .join('');
  }
  updatePosterFeePreview();
}

function updatePosterFeePreview() {
  const payout = Number($('postPayout') ? $('postPayout').value : 900);
  const fee = payout <= 500 ? 0 : Math.round(payout * 0.05);
  const total = payout + fee;
  if ($('postFeeBadge')) {
    $('postFeeBadge').textContent = fee === 0 ? '≤₹500: ₹0 Escrow Fee' : `Escrow Fee: ₹${fee} (5%)`;
  }
  if ($('postSubmitBtn')) {
    $('postSubmitBtn').textContent = `Post Job & Lock ₹${total} UPI Escrow`;
  }
}

function renderPosterJobs() {
  const list = $('posterJobsList');
  if (!list) return;

  const myJobs = state.gigs.filter((g) => !['SETTLED', 'AUTO_RELEASED', 'REFUNDED'].includes(g.state));

  list.innerHTML = myJobs
    .map((g) => {
      const isOpen = g.state === 'ESCROW_LOCKED';
      const candidates = g.top_candidates || [];

      return `
        <div class="card">
          <div class="job-card-header" style="margin-bottom:14px;">
            <div>
              <div style="display:flex; gap:6px; align-items:center; margin-bottom:4px;">
                <span class="tag mono">${g.gig_id}</span>
                <span class="tag tag-slate">${g.state.replace(/_/g, ' ')}</span>
              </div>
              <h3 class="job-title">${g.title}</h3>
              <div class="job-meta">${g.corridor_label} • Escrow Locked: ₹${g.payout_inr}</div>
            </div>
          </div>

          ${
            isOpen
              ? `<div style="font-size:12.5px; font-weight:600; color:var(--text-secondary); margin-bottom:10px;">
                  Top Matched Students — Click to Hire:
                </div>
                <div class="form-grid-3">
                  ${candidates
                    .map(
                      (c) => `
                      <div style="background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); padding:12px; display:flex; flex-direction:column; justify-content:space-between; gap:10px;">
                        <div>
                          <div style="font-weight:650; font-size:13px;">${c.full_name}</div>
                          <div style="font-size:11.5px; color:var(--text-secondary);">${c.institution}</div>
                          <div style="font-size:11.5px; color:var(--sage-text); margin-top:4px;">Match Score: ${c.composite_match_score}%</div>
                        </div>
                        <button type="button" class="btn btn-primary btn-sm" onclick="window.posterHireStudent('${g.gig_id}', '${c.student_id}')">
                          Hire Student
                        </button>
                      </div>
                    `
                    )
                    .join('')}
                </div>`
              : `<div style="font-size:13px; color:var(--text-secondary);">
                  Assigned Student: <strong>${g.lead_student ? g.lead_student.full_name : 'Assigned'}</strong>
                  ${g.execution_mode === 'OFFLINE' ? ` • Arrival PIN: <strong class="mono">${g.start_pin || '4821'}</strong>` : ''}
                </div>`
          }
        </div>
      `;
    })
    .join('');
}

function renderPosterSettle() {
  const list = $('posterSettleList');
  if (!list) return;

  const settleable = state.gigs.filter((g) =>
    ['DELIVERED_VAULT', 'IN_PROGRESS_ONSITE', 'SETTLED', 'AUTO_RELEASED'].includes(g.state)
  );

  if (settleable.length === 0) {
    list.innerHTML = `<div class="card"><p style="color:var(--text-secondary);">No jobs awaiting settlement right now.</p></div>`;
    return;
  }

  list.innerHTML = settleable
    .map((g) => {
      const isDone = g.state === 'SETTLED' || g.state === 'AUTO_RELEASED';
      const vp = g.vault_protection;

      return `
        <div class="card">
          <div class="job-card-header" style="margin-bottom:12px;">
            <div>
              <div style="display:flex; gap:6px; align-items:center; margin-bottom:4px;">
                <span class="tag mono">${g.gig_id}</span>
                <span class="tag ${isDone ? 'tag-sage' : 'tag-ochre'}">${isDone ? 'PAID & SETTLED' : 'AWAITING YOUR APPROVAL'}</span>
              </div>
              <h3 class="job-title">${g.title}</h3>
              <div class="job-meta">
                Submitted by: ${g.lead_student ? g.lead_student.full_name : 'Assigned Student'} •
                Deliverable: <strong>${vp ? vp.deliverable_title : 'On-Site Task'}</strong>
              </div>
            </div>
            <div class="job-price">
              <div class="job-price-amount">₹${g.payout_inr}</div>
              <div class="job-price-note">${isDone ? 'Released' : 'In Escrow'}</div>
            </div>
          </div>

          ${
            !isDone
              ? `<div style="background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); padding:14px; margin-bottom:14px; font-size:12.5px; color:var(--text-secondary);">
                  <strong>Watermarked Preview Active:</strong> Clean master file unlocks automatically when you approve & settle the ₹${g.payout_inr} escrow below.
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                  <button type="button" class="btn btn-primary" onclick="window.posterSettleJob('${g.gig_id}')">
                    Approve Work & Settle ₹${g.payout_inr} to Student
                  </button>
                  <button type="button" class="btn" onclick="window.posterAskRevision('${g.gig_id}')">
                    Request Revision (${g.revisions_left} left)
                  </button>
                  <button type="button" class="btn btn-clay" onclick="window.posterDisputeJob('${g.gig_id}')">
                    Escalate Dispute to EDC
                  </button>
                </div>`
              : `<div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-size:13px; color:var(--sage-text); font-weight:600;">✓ Payment settled & clean master file unlocked.</span>
                  <button type="button" class="btn btn-sm" onclick="window.posterDownloadMaster('${g.gig_id}')">⬇ Download Clean File</button>
                </div>`
          }
        </div>
      `;
    })
    .join('');
}

/* ==========================================================================
   3. EDC ARBITRATOR PORTAL RENDERERS (CAN ONLY RESOLVE DISPUTES)
   ========================================================================== */

function renderEdcDisputes() {
  const list = $('edcDisputesList');
  if (!list) return;

  const disputed = state.gigs.filter((g) => g.state === 'DISPUTED_EDC');
  if (disputed.length === 0) {
    list.innerHTML = `<div class="card"><p style="color:var(--text-secondary);">No disputed jobs in queue.</p></div>`;
    return;
  }

  list.innerHTML = disputed
    .map(
      (g) => `
      <div class="card">
        <div class="job-card-header" style="margin-bottom:12px;">
          <div>
            <span class="tag tag-clay">DISPUTED • CHECKBOX #${g.disputed_checkbox || 3}</span>
            <h3 class="job-title" style="margin-top:6px;">${g.title} (${g.gig_id})</h3>
            <div class="job-meta">Reason: "${g.dispute_reason || 'Dispute on acceptance criteria'}"</div>
          </div>
          <div class="job-price">
            <div class="job-price-amount">₹${g.payout_inr}</div>
            <div class="job-price-note">Frozen Escrow</div>
          </div>
        </div>

        <div class="form-grid-3" style="margin-top:14px;">
          <button type="button" class="btn btn-sage" onclick="window.edcRule('${g.gig_id}', 'FULL_RELEASE_TO_STUDENT')">
            100% Release to Student
          </button>
          <button type="button" class="btn" onclick="window.edcRule('${g.gig_id}', 'PARTIAL_MILESTONE_SPLIT')">
            50 / 50 Split
          </button>
          <button type="button" class="btn btn-clay" onclick="window.edcRule('${g.gig_id}', 'FULL_REFUND_TO_POSTER')">
            100% Refund to Poster
          </button>
        </div>
      </div>
    `
    )
    .join('');
}

function renderEdcLedger() {
  const list = $('edcLedgerList');
  if (!list || !state.telemetry) return;

  const logs = state.telemetry.audit_logs || [];
  list.innerHTML = `
    <div class="card">
      <h3 class="job-title" style="margin-bottom:12px;">Nodal UPI Escrow & State Audit Trail</h3>
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${logs
          .slice(0, 15)
          .map(
            (l) => `
            <div style="background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); padding:10px 12px; display:flex; justify-content:space-between; font-size:12.5px;">
              <span><strong>${l.gig_id}</strong>: ${l.from_state} → ${l.to_state} (${l.action_summary})</span>
              <span class="mono" style="color:var(--text-muted);">${l.actor_id}</span>
            </div>
          `
          )
          .join('')}
      </div>
    </div>
  `;
}

/* ==========================================================================
   ROLE-ENFORCED ACTIONS
   ========================================================================== */

window.studentAcceptJob = async function (gigId, executionType) {
  try {
    await apiRequest(`/api/v1/gigs/${encodeURIComponent(gigId)}/assign`, {
      method: 'POST',
      body: {
        lead_student_id: state.currentUser.user_id,
        junior_student_id: executionType === 'MORUNG_SQUAD_70_30' ? 'USR-STU-02' : null,
        execution_type: executionType
      }
    });
    showToast('JOB ACCEPTED', `Added ${gigId} to My Active Work.`);
    state.activeTab = 'student-work';
    await loadData(true);
  } catch (err) {
    showToast(err.code || 'ERR-MG-3001', err.detail || 'Could not accept job');
  }
};

window.studentSubmitWork = async function (gigId) {
  try {
    const input = $(`stuDeliverInput_${gigId}`);
    const title = input ? input.value : `${gigId}_Deliverable.mp4`;
    const gig = state.gigs.find((x) => x.gig_id === gigId);
    if (gig && gig.state === 'ASSIGNED_DIGITAL') {
      await apiRequest(`/api/v1/gigs/${encodeURIComponent(gigId)}/checkpoint`, {
        method: 'POST',
        body: { note: '20% Checkpoint verified', actor_id: state.currentUser.user_id }
      });
    }
    await apiRequest(`/api/v1/vault/${encodeURIComponent(gigId)}/deliver`, {
      method: 'POST',
      body: {
        actor_id: state.currentUser.user_id,
        student_lead_id: state.currentUser.user_id,
        deliverable_title: title,
        criteria_checked: [true, true, true]
      }
    });
    showToast('WORK SUBMITTED', 'Uploaded to Watermarked Vault. Client can now review and settle your payment.');
    await loadData(true);
  } catch (err) {
    showToast(err.code || 'ERR-MG-RBAC-403', err.detail || 'Submission failed');
  }
};

window.studentCheckInPin = async function (gigId) {
  try {
    const pin = $(`stuStartPin_${gigId}`) ? $(`stuStartPin_${gigId}`).value : '4821';
    await apiRequest(`/api/v1/gigs/${encodeURIComponent(gigId)}/onsite/pin-handshake`, {
      method: 'POST',
      body: { pin_type: 'START_PIN', pin_entered: pin, actor_id: state.currentUser.user_id }
    });
    showToast('ARRIVAL VERIFIED', 'START_PIN confirmed. Client can now settle payment upon completion.');
    await loadData(true);
  } catch (err) {
    showToast(err.code || 'ERR-MG-4001', err.detail || 'Invalid START_PIN');
  }
};

window.fillPosterPreset = function (presetId) {
  if (!state.config) return;
  const p = state.config.ONE_TAP_TASK_PRESETS.find((x) => x.presetId === presetId);
  if (!p) return;
  $('postTitle').value = p.title;
  $('postCategory').value = p.trackCategory;
  $('postCorridor').value = p.corridorCluster;
  $('postPayout').value = p.payoutInr;
  $('postCrit1').value = p.criteria[0];
  $('postCrit2').value = p.criteria[1];
  $('postCrit3').value = p.criteria[2];
  $('postAllowSquad').checked = Boolean(p.allowMorungSquad);
  updatePosterFeePreview();
};

window.posterHireStudent = async function (gigId, studentId) {
  try {
    await apiRequest(`/api/v1/gigs/${encodeURIComponent(gigId)}/assign`, {
      method: 'POST',
      body: { lead_student_id: studentId, execution_type: 'SOLO' }
    });
    showToast('STUDENT HIRED', `Assigned student to ${gigId}.`);
    await loadData(true);
  } catch (err) {
    showToast(err.code || 'ERR-MG-1004', err.detail || 'Could not assign student');
  }
};

window.posterSettleJob = async function (gigId) {
  try {
    const gig = state.gigs.find((x) => x.gig_id === gigId);
    if (gig && gig.state === 'IN_PROGRESS_ONSITE') {
      await apiRequest(`/api/v1/gigs/${encodeURIComponent(gigId)}/onsite/pin-handshake`, {
        method: 'POST',
        body: { pin_type: 'COMPLETE_PIN', pin_entered: gig.complete_pin || '9054', actor_id: state.currentUser.user_id }
      });
    } else {
      await apiRequest(`/api/v1/escrow/${encodeURIComponent(gigId)}/settle`, {
        method: 'POST',
        body: { trigger_type: 'POSTER_APPROVAL', actor_id: state.currentUser.user_id }
      });
    }
    showToast('PAYMENT SETTLED', `UPI Escrow released to student and clean master file unlocked.`);
    await loadData(true);
  } catch (err) {
    showToast(err.code || 'ERR-MG-RBAC-403', err.detail || 'Settlement failed');
  }
};

window.posterAskRevision = async function (gigId) {
  try {
    const res = await apiRequest(`/api/v1/vault/${encodeURIComponent(gigId)}/revision`, {
      method: 'POST',
      body: {
        checkbox_index: 2,
        revision_note: 'Please refine Deliverable #2 before final approval.',
        actor_id: state.currentUser.user_id
      }
    });
    showToast('REVISION REQUESTED', `Student notified (${res.revisions_left} free revisions left).`);
    await loadData(true);
  } catch (err) {
    showToast(err.code || 'ERR-MG-4002', err.detail || 'Revision blocked');
  }
};

window.posterDisputeJob = async function (gigId) {
  try {
    await apiRequest(`/api/v1/arbitration/${encodeURIComponent(gigId)}/dispute`, {
      method: 'POST',
      body: {
        checkbox_index: 3,
        reason: 'Deliverable incomplete on Checkbox #3',
        actor_id: state.currentUser.user_id
      }
    });
    showToast('DISPUTE ESCALATED', 'Sent to YouthNet EDC Arbitrator.');
    await loadData(true);
  } catch (err) {
    showToast(err.code || 'ERR-MG-3001', err.detail || 'Could not raise dispute');
  }
};

window.posterDownloadMaster = async function (gigId) {
  try {
    const res = await apiRequest(`/api/v1/vault/${encodeURIComponent(gigId)}/raw-file?actor_id=${encodeURIComponent(state.currentUser.user_id)}`);
    showToast('MASTER FILE DOWNLOADED', `Downloaded ${res.data.master_file.filename}`);
  } catch (err) {
    showToast(err.code || 'ERR-MG-4003', err.detail || 'File locked');
  }
};

window.edcRule = async function (gigId, decision) {
  try {
    await apiRequest(`/api/v1/arbitration/${encodeURIComponent(gigId)}/resolve`, {
      method: 'POST',
      body: { actor_id: state.currentUser.user_id, arbitration_decision: decision }
    });
    showToast('DISPUTE RESOLVED', `Executed binding ruling: ${decision}`);
    await loadData(true);
  } catch (err) {
    showToast(err.code || 'ERR-MG-RBAC-403', err.detail || 'Only EDC Arbitrator can resolve disputes');
  }
};

function init() {
  if ($('studentSearchInput')) {
    $('studentSearchInput').addEventListener('input', renderStudentFind);
  }
  if ($('studentCorridorSelect')) {
    $('studentCorridorSelect').addEventListener('change', async (e) => {
      state.studentCorridor = e.target.value;
      await loadData(true);
    });
  }
  if ($('postPayout')) {
    $('postPayout').addEventListener('input', updatePosterFeePreview);
  }

  const postForm = $('simplePostJobForm');
  if (postForm) {
    postForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const res = await apiRequest('/api/v1/gigs/create-and-lock', {
          method: 'POST',
          body: {
            poster_id: state.currentUser.user_id,
            poster_type: state.currentUser.role,
            title: $('postTitle').value,
            track_category: $('postCategory').value,
            execution_mode: 'DIGITAL',
            corridor_cluster: $('postCorridor').value,
            venue_label: 'Campus / Hub',
            payout_inr: Number($('postPayout').value),
            allow_morung_squad: $('postAllowSquad').checked,
            is_public_venue: true,
            criteria_1: $('postCrit1').value,
            criteria_2: $('postCrit2').value,
            criteria_3: $('postCrit3').value
          }
        });
        showToast('JOB POSTED & ESCROW LOCKED', `Created ${res.gig_id}. Now choose a student to hire.`);
        state.activeTab = 'poster-jobs';
        await loadData(true);
      } catch (err) {
        showToast(err.code || 'ERR-MG-2001', err.detail || 'Could not post job');
      }
    });
  }

  if ($('openAuthModalBtn')) {
    $('openAuthModalBtn').addEventListener('click', () => $('authModal').classList.remove('hidden'));
  }
  if ($('closeAuthModalBtn')) {
    $('closeAuthModalBtn').addEventListener('click', () => $('authModal').classList.add('hidden'));
  }
  if ($('confirmSwitchAccountBtn')) {
    $('confirmSwitchAccountBtn').addEventListener('click', async () => {
      const uid = $('accountSelectDropdown').value;
      $('authModal').classList.add('hidden');
      await switchDatabaseUser(uid);
    });
  }
  if ($('googleSignInBtn')) {
    $('googleSignInBtn').addEventListener('click', async () => {
      const res = await apiRequest('/api/v1/auth/google/url?role=STUDENT');
      if (res.data.configured && res.data.auth_url) {
        window.location.href = res.data.auth_url;
      } else {
        $('authModal').classList.add('hidden');
        await switchDatabaseUser('USR-STU-01');
        showToast('SIGNED IN', 'Signed in via Demo Account (Add GOOGLE_CLIENT_ID in .env for live Google redirect).');
      }
    });
  }

  loadData(false);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
