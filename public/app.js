/**
 * MORUNGGIG — PRODUCTION MULTI-USER FRONTEND CONTROLLER (V2)
 * Implements:
 *  1. Zero-Flash Session Restoration + Persistent Cookies/JWT (No 1s login screen flash on refresh)
 *  2. Real-Time SSE EventStream (`/api/v1/events/stream`) + Cross-Tab BroadcastChannel (Zero manual refresh needed)
 *  3. Multi-Format Vault Submission (Document / Image / Video / Archive) with Diagonal Watermark,
 *     Blurrification, No-Download, Right-Click Block & Anti-Screenshot Focus/PrintScreen Shield
 *  4. 3 Tweaks (Revisions) per Online Job with Tweak Feedback History
 *  5. Full Offline (On-Site) Job Creation & Dual 4-Digit PIN (`START_PIN` -> `COMPLETE_PIN`) + SOS Pipeline
 *  6. Custom Job Category ("Other — Specify Custom Category/Type")
 *  7. Post-Settlement 5-Star Rating & 50-Word Feedback + Rating-Sorted Applicants & Applicant Profile Modal
 */

const MEMORY_STORE = {};

function safeGet(key, fallback = '') {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const v = window.localStorage.getItem(key);
      return v !== null ? v : (MEMORY_STORE[key] || fallback);
    }
  } catch {}
  return MEMORY_STORE[key] || fallback;
}

function safeSet(key, val) {
  MEMORY_STORE[key] = String(val);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, String(val));
    }
  } catch {}
}

function safeRemove(key) {
  delete MEMORY_STORE[key];
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {}
}

function loadCachedUserSync() {
  try {
    const raw = safeGet('MG_CACHED_USER', '');
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

const state = {
  config: null,
  users: [],
  gigs: [],
  telemetry: null,
  currentUser: loadCachedUserSync(),
  accessToken: safeGet('MG_SESSION_TOKEN', ''),
  activeView: 'student-feed',
  posterFilter: 'ALL',
  studentCorridor: 'SOVIMA_6MILE',
  lastSyncVersion: 0,
  activeVaultGigId: null,
  pendingFileDataUriMap: {}
};

const $ = (id) => document.getElementById(id);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

let crossTabChannel = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    crossTabChannel = new BroadcastChannel('morunggig_realtime_bus');
  }
} catch {}

function notifyOtherTabs(eventName) {
  try {
    if (crossTabChannel) {
      crossTabChannel.postMessage({ event: eventName, timestamp: Date.now() });
    }
  } catch {}
}

function showToast(code, message) {
  const box = $('toastContainer');
  if (!box) return;
  $('toastCode').textContent = code;
  $('toastMessage').textContent = message;
  box.classList.remove('hidden');
  clearTimeout(window.__mgToastTimer);
  window.__mgToastTimer = setTimeout(() => box.classList.add('hidden'), 4500);
}

async function apiRequest(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.accessToken) {
    headers.Authorization = `Bearer ${state.accessToken}`;
  }
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
      credentials: 'same-origin',
      body: bodyObj ? JSON.stringify(bodyObj) : undefined
    });
    const json = await res.json();
    if (!res.ok || json.success === false) {
      throw json.error || { code: 'ERR-MG-400', detail: 'Request failed.' };
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

function isStudentRole(user) {
  return user && user.role === 'STUDENT';
}

function getAvailabilityBadgeHtml(status) {
  const s = String(status || 'FREE').toUpperCase();
  if (s === 'WORKING') return `<span class="tag tag-working">● WORKING</span>`;
  if (s === 'OFFLINE') return `<span class="tag tag-offline">○ OFFLINE</span>`;
  return `<span class="tag tag-free">● FREE</span>`;
}

function getJobLifecycleBadgeHtml(lifecycleStatus) {
  const s = String(lifecycleStatus || 'ACTIVE').toUpperCase();
  if (s === 'ASSIGNED') return `<span class="tag tag-assigned">ASSIGNED</span>`;
  if (s === 'DELETED') return `<span class="tag tag-deleted">DELETED (SETTLED)</span>`;
  return `<span class="tag tag-active">ACTIVE</span>`;
}

function renderStarsHtml(ratingScore) {
  const num = Number(ratingScore || 5);
  const full = Math.round(num);
  return '★'.repeat(Math.max(1, Math.min(5, full))) + '☆'.repeat(Math.max(0, 5 - full));
}

/* ==========================================================================
   REAL-TIME SSE STREAM + CROSS-TAB SYNC (ZERO PAGE REFRESH NEEDED)
   ========================================================================== */

function startRealtimeSync() {
  // 1. Cross-Tab BroadcastChannel listener
  if (crossTabChannel) {
    crossTabChannel.onmessage = () => {
      if (state.currentUser) {
        refreshWorkspaceData({ silent: true });
      }
    };
  }

  // 2. Server-Sent Events (SSE) Live Stream
  const isSandbox =
    typeof window !== 'undefined' &&
    (!window.location || window.location.origin === 'null' || window.location.protocol === 'file:');

  if (!isSandbox && typeof EventSource !== 'undefined') {
    try {
      const es = new EventSource('/api/v1/events/stream');
      es.onopen = () => {
        if ($('liveSyncBadge')) $('liveSyncBadge').classList.remove('hidden');
      };
      es.onmessage = (evt) => {
        try {
          const payload = JSON.parse(evt.data);
          if (payload.version && payload.version !== state.lastSyncVersion) {
            state.lastSyncVersion = payload.version;
            if (state.currentUser && payload.event !== 'CONNECTED') {
              refreshWorkspaceData({ silent: true });
            }
          }
        } catch {}
      };
    } catch {}
  }

  // 3. Lightweight fallback version check (every 4s) for proxy environments
  setInterval(async () => {
    if (!state.currentUser) return;
    try {
      const vRes = await apiRequest('/api/v1/events/version');
      if (vRes.data && vRes.data.version && vRes.data.version !== state.lastSyncVersion) {
        state.lastSyncVersion = vRes.data.version;
        await refreshWorkspaceData({ silent: true });
      }
    } catch {}
  }, 4000);
}

/* ==========================================================================
   ZERO-FLASH SESSION RESTORATION & BOOTSTRAP
   ========================================================================== */

async function checkSessionAndLoad() {
  // Immediately show cached workspace on Frame 0 so login screen NEVER flashes on refresh!
  if (state.currentUser) {
    ensureValidViewForRole();
    $('authScreen').classList.add('hidden');
    $('appScreen').classList.remove('hidden');
    $('mainNavTabs').classList.remove('hidden');
    $('headerRoleBadge').classList.remove('hidden');
  }

  try {
    if (typeof window !== 'undefined' && window.location && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      const oauthUser = params.get('user_id');
      if (oauthUser) {
        const sw = await apiRequest('/api/v1/auth/switch-role', { method: 'POST', body: { user_id: oauthUser } });
        if (sw.data && sw.data.access_token) {
          state.accessToken = sw.data.access_token;
          safeSet('MG_SESSION_TOKEN', state.accessToken);
          state.currentUser = sw.data.user;
          safeSet('MG_CACHED_USER', JSON.stringify(state.currentUser));
        }
      }
    }

    const meRes = await apiRequest('/api/v1/auth/me');
    if (meRes.data && meRes.data.authenticated && meRes.data.user) {
      state.currentUser = meRes.data.user;
      safeSet('MG_CACHED_USER', JSON.stringify(state.currentUser));
      await refreshWorkspaceData();
    } else {
      safeRemove('MG_CACHED_USER');
      renderLoggedOutScreen();
    }
  } catch {
    if (state.currentUser) {
      await refreshWorkspaceData();
    } else {
      renderLoggedOutScreen();
    }
  }
}

async function refreshWorkspaceData(opts = {}) {
  if (!state.currentUser) {
    renderLoggedOutScreen();
    return;
  }

  // Snapshot active input values before re-render so user typing is never interrupted during live sync
  const activeElementId = document.activeElement ? document.activeElement.id : null;
  const savedInputValues = {};
  $$('input, textarea, select').forEach((el) => {
    if (el.id && el.type !== 'file') {
      savedInputValues[el.id] = el.value;
    }
  });

  const viewerId = state.currentUser.user_id;
  const boot = await apiRequest(
    `/api/v1/bootstrap?student_corridor=${encodeURIComponent(state.studentCorridor)}&viewer_id=${encodeURIComponent(viewerId)}`
  );
  state.config = boot.data.config;
  state.users = boot.data.users;
  state.gigs = boot.data.gigs;
  state.telemetry = boot.data.telemetry;

  const updatedMe = state.users.find((u) => u.user_id === viewerId);
  if (updatedMe) {
    state.currentUser = updatedMe;
    safeSet('MG_CACHED_USER', JSON.stringify(updatedMe));
  }

  ensureValidViewForRole();
  renderAuthenticatedWorkspace();

  // Restore any input values & focus if this was a silent real-time sync
  if (opts.silent) {
    Object.entries(savedInputValues).forEach(([id, val]) => {
      const el = $(id);
      if (el && el.type !== 'file' && val !== undefined) {
        el.value = val;
      }
    });
    if (activeElementId && $(activeElementId)) {
      try { $(activeElementId).focus(); } catch {}
    }
  }
}

function ensureValidViewForRole() {
  const u = state.currentUser;
  if (!u) return;
  if (isStudentRole(u)) {
    const allowed = ['student-feed', 'student-assigned', 'user-profile'];
    if (!allowed.includes(state.activeView)) state.activeView = 'student-feed';
  } else {
    const allowed = ['poster-feed', 'poster-create', 'user-profile'];
    if (!allowed.includes(state.activeView)) state.activeView = 'poster-feed';
  }
}

function renderLoggedOutScreen() {
  state.currentUser = null;
  $('authScreen').classList.remove('hidden');
  $('appScreen').classList.add('hidden');
  $('mainNavTabs').classList.add('hidden');
  $('headerRoleBadge').classList.add('hidden');
  $('headerRightBox').innerHTML = `<span class="tag">Not Signed In</span>`;
}

window.switchAuthMode = function (mode) {
  const isLogin = mode === 'LOGIN';
  $('tabBtnLogin').classList.toggle('active', isLogin);
  $('tabBtnSignup').classList.toggle('active', !isLogin);
  $('loginForm').classList.toggle('hidden', !isLogin);
  $('signupForm').classList.toggle('hidden', isLogin);
};

window.quickFillLogin = function (email) {
  $('loginEmail').value = email;
  $('loginPassword').value = 'password123';
  showToast('CREDENTIALS FILLED', `Filled ${email}. Click "Sign In to Workspace" to log in.`);
};

window.logoutUser = async function () {
  try {
    await apiRequest('/api/v1/auth/logout', { method: 'POST' });
  } catch {}
  state.accessToken = '';
  state.currentUser = null;
  safeRemove('MG_SESSION_TOKEN');
  safeRemove('MG_CACHED_USER');
  showToast('LOGGED OUT', 'Your session cookie has been cleared.');
  renderLoggedOutScreen();
};

window.switchView = function (viewId) {
  state.activeView = viewId;
  ensureValidViewForRole();
  renderAuthenticatedWorkspace();
};

/* ==========================================================================
   RENDER AUTHENTICATED WORKSPACE (STRICT ROLE SEPARATION)
   ========================================================================== */

function renderAuthenticatedWorkspace() {
  const u = state.currentUser;
  if (!u) {
    renderLoggedOutScreen();
    return;
  }

  $('authScreen').classList.add('hidden');
  $('appScreen').classList.remove('hidden');
  $('mainNavTabs').classList.remove('hidden');
  $('headerRoleBadge').classList.remove('hidden');
  if ($('liveSyncBadge')) $('liveSyncBadge').classList.remove('hidden');

  const isStu = isStudentRole(u);
  $('headerRoleBadge').textContent = isStu ? 'Student Account' : 'Poster Account';
  $('headerRoleBadge').className = `tag ${isStu ? 'tag-sage' : 'tag-slate'}`;

  $('headerRightBox').innerHTML = `
    ${isStu ? getAvailabilityBadgeHtml(u.availability_status) : ''}
    ${isStu ? `<span class="tag tag-sage">★ ${Number(u.avg_rating || 5.0).toFixed(2)}</span>` : ''}
    <span class="tag mono">Balance: ₹${Number(u.wallet_balance_inr).toLocaleString('en-IN')}</span>
    <span style="font-size:13px; font-weight:600;">${u.full_name}</span>
    <button type="button" class="btn btn-sm" onclick="window.logoutUser()">Log Out</button>
  `;

  if (isStu) {
    const activeJobsCnt = state.gigs.filter((g) => g.lifecycle_status === 'ACTIVE').length;
    const myAssignedCnt = state.gigs.filter(
      (g) =>
        g.lifecycle_status === 'ASSIGNED' &&
        (g.assigned_lead_id === u.user_id || g.assigned_junior_id === u.user_id)
    ).length;

    $('mainNavTabs').innerHTML = `
      <button type="button" class="nav-tab ${state.activeView === 'student-feed' ? 'active' : ''}" onclick="window.switchView('student-feed')">
        Browse Jobs (${activeJobsCnt})
      </button>
      <button type="button" class="nav-tab ${state.activeView === 'student-assigned' ? 'active' : ''}" onclick="window.switchView('student-assigned')">
        My Assigned Work (${myAssignedCnt})
      </button>
      <button type="button" class="nav-tab ${state.activeView === 'user-profile' ? 'active' : ''}" onclick="window.switchView('user-profile')">
        Profile & Wallet
      </button>
    `;
  } else {
    const myJobsCnt = state.gigs.filter((g) => g.poster_id === u.user_id).length;
    $('mainNavTabs').innerHTML = `
      <button type="button" class="nav-tab ${state.activeView === 'poster-feed' ? 'active' : ''}" onclick="window.switchView('poster-feed')">
        My Posted Jobs (${myJobsCnt})
      </button>
      <button type="button" class="nav-tab ${state.activeView === 'poster-create' ? 'active' : ''}" onclick="window.switchView('poster-create')">
        + Create New Job
      </button>
      <button type="button" class="nav-tab ${state.activeView === 'user-profile' ? 'active' : ''}" onclick="window.switchView('user-profile')">
        Profile & Wallet
      </button>
    `;
  }

  $$('.app-view').forEach((v) => v.classList.add('hidden'));
  const targetSec = $(`view-${state.activeView}`);
  if (targetSec) targetSec.classList.remove('hidden');

  if (state.activeView === 'student-feed') renderStudentFeedView();
  if (state.activeView === 'student-assigned') renderStudentAssignedView();
  if (state.activeView === 'poster-feed') renderPosterFeedView();
  if (state.activeView === 'poster-create') renderPosterCreateView();
  if (state.activeView === 'user-profile') renderUserProfileView();
}

/* ==========================================================================
   STUDENT VIEWS (BROWSE -> CLICK TO READ DESCRIPTION -> APPLY | SUBMIT WORK / OFFLINE PINS)
   ========================================================================== */

function renderStudentFeedView() {
  const u = state.currentUser;
  $('pageTitle').textContent = 'Available Campus Jobs';
  $('pageSub').textContent = 'Click any job card to read the full description, mode (Online Vault vs Offline PIN), and apply.';
  $('pageHeaderRight').innerHTML = `
    <div style="display:flex; gap:8px; align-items:center;">
      <span style="font-size:12.5px; color:var(--text-secondary);">My Status:</span>
      ${getAvailabilityBadgeHtml(u.availability_status)}
    </div>
  `;

  const grid = $('studentFeedGrid');
  if (!grid) return;

  const q = ($('studentSearchInput') ? $('studentSearchInput').value : '').trim().toLowerCase();
  const modeFilter = $('studentModeFilter') ? $('studentModeFilter').value : 'ALL';

  const activeGigs = state.gigs.filter((g) => {
    if (g.lifecycle_status !== 'ACTIVE') return false;
    if (modeFilter !== 'ALL' && g.execution_mode !== modeFilter) return false;
    if (q && !`${g.title} ${g.description} ${g.corridor_label} ${g.track_name}`.toLowerCase().includes(q)) return false;
    return true;
  });

  if (activeGigs.length === 0) {
    grid.innerHTML = `<div class="card"><p style="color:var(--text-secondary);">No open active jobs match your filter right now.</p></div>`;
    return;
  }

  grid.innerHTML = activeGigs
    .map((g) => {
      const applicants = g.applicants || [];
      const hasApplied = applicants.some((a) => a.student_id === u.user_id);
      const isOffline = g.execution_mode === 'OFFLINE';

      return `
        <article class="job-card clickable" onclick="window.openJobDetailModal('${g.gig_id}')">
          <div>
            <div class="job-top">
              <div>
                <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-bottom:6px;">
                  ${getJobLifecycleBadgeHtml(g.lifecycle_status)}
                  <span class="tag ${isOffline ? 'tag-ochre' : 'tag-slate'}">
                    ${isOffline ? '📍 Offline On-Site (Dual PIN)' : '💻 Online (Vault + 3 Tweaks)'}
                  </span>
                  <span class="tag">${g.track_name}</span>
                </div>
                <h3 class="job-title">${g.title}</h3>
                <div class="job-meta">
                  Posted by ${g.poster ? g.poster.full_name : 'Verified Poster'} • ${g.corridor_label}
                </div>
              </div>
              <div class="job-amount">
                <div>₹${g.payout_inr}</div>
                <div class="job-amount-sub">Locked</div>
              </div>
            </div>

            <p style="font-size:13px; color:var(--text-secondary); margin-top:10px;">
              ${g.description.length > 110 ? g.description.slice(0, 110) + '...' : g.description}
            </p>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; padding-top:10px; border-top:1px solid var(--border);">
            <span style="font-size:12px; color:var(--text-muted);">${applicants.length} Applicant(s)</span>
            <span class="btn btn-sm ${hasApplied ? 'btn-sage' : 'btn-primary'}">
              ${hasApplied ? '✓ Applied (View Details)' : 'Read Description & Apply →'}
            </span>
          </div>
        </article>
      `;
    })
    .join('');
}

window.openJobDetailModal = function (gigId) {
  const g = state.gigs.find((x) => x.gig_id === gigId);
  if (!g) return;
  const u = state.currentUser;
  const applicants = g.applicants || [];
  const hasApplied = u && applicants.some((a) => a.student_id === u.user_id);
  const isOffline = g.execution_mode === 'OFFLINE';

  $('modalJobTrack').textContent = `${isOffline ? 'OFFLINE ON-SITE' : 'ONLINE DIGITAL'} • ${g.track_name} • ${g.corridor_label}`;
  $('modalJobTitle').textContent = g.title;
  $('modalJobMeta').textContent = `Posted by ${g.poster ? g.poster.full_name : 'Client'} (${g.poster ? g.poster.institution_or_org : ''}) • Locked Amount: ₹${g.payout_inr}`;

  $('modalJobBody').innerHTML = `
    <div style="background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); padding:14px; margin-bottom:14px;">
      <div style="font-size:12px; font-weight:650; color:var(--text-secondary); margin-bottom:4px;">Full Job Description</div>
      <p style="font-size:13.5px; color:var(--text);">${g.description}</p>
      <div style="font-size:12px; color:var(--text-muted); margin-top:8px;">
        ${
          isOffline
            ? `Physical Venue: <strong>${g.venue_label}</strong> • Shift Ends by: <strong>${g.scheduled_end_hour || 16}:00 IST (Curfew Safe)</strong> • Est. Auto Fare: ₹${g.fare_calculator ? g.fare_calculator.est_transport_inr : 30} (Net Take-Home: ₹${g.fare_calculator ? g.fare_calculator.net_take_home_inr : g.payout_inr})`
            : `Delivery Mode: <strong>Watermarked Anti-Theft Vault</strong> • Included Tweaks: <strong>Up to ${g.max_tweaks || 3} Tweaks</strong>`
        }
      </div>
    </div>

    <div style="background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); padding:14px; margin-bottom:16px;">
      <div style="font-size:12px; font-weight:650; color:var(--text-secondary); margin-bottom:8px;">3 Deliverable / Scope Requirements</div>
      <div style="font-size:13px; display:flex; flex-direction:column; gap:6px;">
        <div>1. ${g.criteria_1}</div>
        <div>2. ${g.criteria_2}</div>
        <div>3. ${g.criteria_3}</div>
      </div>
    </div>

    ${
      isStudentRole(u)
        ? hasApplied
          ? `<div style="background:var(--sage-bg); color:var(--sage-text); border:1px solid var(--sage-border); padding:12px; border-radius:var(--radius-sm); font-size:13px; font-weight:600; text-align:center;">
              ✓ You have applied for this job. The Poster can see your rating (★ ${Number(u.avg_rating || 5).toFixed(2)}), skills, and completed jobs (${u.completed_gigs_cnt}).
            </div>`
          : u.availability_status === 'OFFLINE'
            ? `<div style="background:var(--ochre-bg); color:var(--ochre-text); border:1px solid var(--ochre-border); padding:12px; border-radius:var(--radius-sm); font-size:13px;">
                Your profile status is currently <strong>OFFLINE</strong>. Switch to <strong>FREE</strong> in your Profile tab to apply for jobs.
              </div>`
            : `<div class="form-stack">
                <div class="field">
                  <label for="applyPitchInput">Your Application Note to the Poster</label>
                  <input type="text" id="applyPitchInput" class="input" value="I have read the job description and can deliver all 3 requirements on time." />
                </div>
                <button type="button" class="btn btn-primary btn-full" onclick="window.submitJobApplication('${g.gig_id}')">
                  Submit Application (₹${g.payout_inr} Locked)
                </button>
              </div>`
        : ''
    }
  `;

  $('jobDetailModal').classList.remove('hidden');
};

window.submitJobApplication = async function (gigId) {
  try {
    const pitch = $('applyPitchInput') ? $('applyPitchInput').value : '';
    await apiRequest(`/api/v1/gigs/${encodeURIComponent(gigId)}/apply`, {
      method: 'POST',
      body: { pitch_note: pitch }
    });
    $('jobDetailModal').classList.add('hidden');
    notifyOtherTabs('GIG_APPLIED');
    showToast('APPLICATION SUBMITTED', 'Your application is now live on the Poster dashboard (no refresh needed).');
    await refreshWorkspaceData();
  } catch (err) {
    showToast(err.code || 'ERR-MG-APPLY', err.detail || 'Could not submit application');
  }
};

function renderStudentAssignedView() {
  const u = state.currentUser;
  $('pageTitle').textContent = 'My Assigned Work';
  $('pageSub').textContent = 'Submit multi-format deliverables to the Watermarked Vault (Online) or verify Dual 4-Digit PINs (Offline).';
  $('pageHeaderRight').innerHTML = getAvailabilityBadgeHtml(u.availability_status);

  const container = $('studentAssignedContainer');
  if (!container) return;

  const myJobs = state.gigs.filter(
    (g) => g.assigned_lead_id === u.user_id || g.assigned_junior_id === u.user_id
  );

  if (myJobs.length === 0) {
    container.innerHTML = `
      <div class="card">
        <h3 class="job-title">No Jobs Assigned to You Yet</h3>
        <p style="color:var(--text-secondary); margin-top:4px;">
          Browse open jobs and submit an application. Once a Poster assigns you, the job will appear here in real time and your status will automatically switch to <strong>WORKING</strong>.
        </p>
      </div>
    `;
    return;
  }

  container.innerHTML = myJobs
    .map((g) => {
      const isSettled = g.lifecycle_status === 'DELETED';
      const isDelivered = g.state === 'DELIVERED_VAULT';
      const isOffline = g.execution_mode === 'OFFLINE';
      const vp = g.vault_protection;
      const tweaksList = g.revision_notes || [];

      let executionPipelineHtml = '';

      if (!isSettled) {
        if (isOffline) {
          // OFFLINE ON-SITE DUAL 4-DIGIT PIN PIPELINE + SAFETY SOS
          const isOnsiteStarted = g.state === 'IN_PROGRESS_ONSITE';
          executionPipelineHtml = `
            <div style="background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); padding:14px; display:flex; flex-direction:column; gap:12px;">
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                <div>
                  <span class="tag tag-ochre">📍 Offline On-Site Pipeline</span>
                  <span style="font-size:12.5px; color:var(--text-secondary); margin-left:6px;">
                    Venue: <strong>${g.venue_label}</strong> • Shift Ends ≤ ${g.scheduled_end_hour || 16}:00 IST
                  </span>
                </div>
                <button type="button" class="btn btn-clay btn-sm" onclick="window.triggerStudentSos('${g.gig_id}')">
                  🚨 1-Tap Campus Safety SOS (${g.safety_dispatch ? g.safety_dispatch.union.split(' ')[0] : 'Union'})
                </button>
              </div>

              ${
                !isOnsiteStarted
                  ? `<div style="border-top:1px solid var(--border); padding-top:12px;">
                      <div style="font-size:12.5px; font-weight:650; margin-bottom:6px;">
                        Step 1 of 2: On-Site Arrival Check-In (Enter 4-Digit START_PIN from Poster)
                      </div>
                      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                        <input type="text" id="startPinInput_${g.gig_id}" class="input mono" style="max-width:180px;" maxlength="4" value="${g.start_pin || '4821'}" placeholder="4-Digit START_PIN" />
                        <button type="button" class="btn btn-primary btn-sm" onclick="window.studentVerifyOfflinePin('${g.gig_id}', 'START_PIN')">
                          Verify START_PIN & Activate Safety Beacon
                        </button>
                        <span style="font-size:11.5px; color:var(--text-muted);">
                          (Poster's generated START_PIN: <strong class="mono">${g.start_pin || '4821'}</strong>)
                        </span>
                      </div>
                    </div>`
                  : `<div style="border-top:1px solid var(--border); padding-top:12px;">
                      <div style="margin-bottom:8px;">
                        <span class="tag tag-sage">✓ Step 1 Complete: On-Site Arrival Verified & Safety Beacon Active</span>
                      </div>
                      <div style="font-size:12.5px; font-weight:650; margin-bottom:6px;">
                        Step 2 of 2: Complete On-Site Shift (Enter 4-Digit COMPLETE_PIN from Poster to Settle ₹${g.payout_inr})
                      </div>
                      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                        <input type="text" id="completePinInput_${g.gig_id}" class="input mono" style="max-width:180px;" maxlength="4" value="${g.complete_pin || '9054'}" placeholder="4-Digit COMPLETE_PIN" />
                        <button type="button" class="btn btn-primary btn-sm" onclick="window.studentVerifyOfflinePin('${g.gig_id}', 'COMPLETE_PIN')">
                          Verify COMPLETE_PIN & Instant UPI Settlement (₹${g.payout_inr})
                        </button>
                        <span style="font-size:11.5px; color:var(--text-muted);">
                          (Poster's generated COMPLETE_PIN: <strong class="mono">${g.complete_pin || '9054'}</strong>)
                        </span>
                      </div>
                    </div>`
              }
            </div>
          `;
        } else {
          // ONLINE DIGITAL PIPELINE (PARTIAL CHECKPOINT + MULTI-FORMAT WATERMARKED VAULT + 3 TWEAKS)
          executionPipelineHtml = `
            <div style="background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); padding:14px; display:flex; flex-direction:column; gap:12px;">
              ${
                tweaksList.length > 0
                  ? `<div style="background:var(--ochre-bg); color:var(--ochre-text); border:1px solid var(--ochre-border); border-radius:var(--radius-sm); padding:10px 12px; font-size:12.5px;">
                      <div style="font-weight:700; margin-bottom:4px;">
                        Poster Requested Tweak / Revision (${g.revisions_left} of ${g.max_tweaks || 3} Tweaks Remaining):
                      </div>
                      ${tweaksList.map((tw, idx) => `<div>• <strong>Tweak #${idx + 1}:</strong> "${tw.note}"</div>`).join('')}
                    </div>`
                  : ''
              }

              <div>
                <div style="font-size:12px; font-weight:650; margin-bottom:6px;">
                  1. Partial Progress Checkpoint ${g.checkpoint_note ? `<span class="tag tag-sage">Saved</span>` : ''}
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                  <input type="text" id="partialInput_${g.gig_id}" class="input" style="flex:1;" value="${g.checkpoint_note || ''}" placeholder="Share 20% partial progress note or draft outline..." />
                  <button type="button" class="btn btn-sm" onclick="window.studentSavePartial('${g.gig_id}')">
                    Save Partial Progress
                  </button>
                </div>
              </div>

              <div style="border-top:1px solid var(--border); padding-top:12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; margin-bottom:8px;">
                  <div style="font-size:12px; font-weight:650;">
                    2. Multi-Format Watermarked & Blurrified Vault Submission
                    ${isDelivered ? `<span class="tag tag-sage">Submitted to Vault</span>` : ''}
                  </div>
                  <span class="tag">Tweaks Remaining: ${g.revisions_left} / ${g.max_tweaks || 3}</span>
                </div>

                <div class="grid-2" style="margin-bottom:8px;">
                  <div class="field">
                    <label>Deliverable Format</label>
                    <select id="mediaType_${g.gig_id}" class="select">
                      <option value="DOCUMENT" ${vp && vp.media_type === 'DOCUMENT' ? 'selected' : ''}>📄 Document / PDF / Excel Sheet</option>
                      <option value="IMAGE" ${vp && vp.media_type === 'IMAGE' ? 'selected' : ''}>🖼️ Image / Poster / Graphic</option>
                      <option value="VIDEO" ${vp && vp.media_type === 'VIDEO' ? 'selected' : ''}>🎬 Video / Reel (MP4 / WebM)</option>
                      <option value="ARCHIVE_LINK" ${vp && vp.media_type === 'ARCHIVE_LINK' ? 'selected' : ''}>📦 Code / Archive / Project Bundle</option>
                    </select>
                  </div>
                  <div class="field">
                    <label>Attach File (Auto-Watermarked & Blurred)</label>
                    <input type="file" id="fileUpload_${g.gig_id}" class="input" style="padding:6px;" onchange="window.handleStudentFileSelect('${g.gig_id}', this)" />
                  </div>
                </div>

                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                  <input type="text" id="finalInput_${g.gig_id}" class="input" style="flex:1;" value="${vp ? vp.deliverable_title : ''}" placeholder="Deliverable file name (e.g. Audit_Sheet.xlsx, Poster_Design.png, Reels_Cut.mp4)" />
                  <input type="text" id="finalSummary_${g.gig_id}" class="input" style="flex:1;" value="${vp ? vp.preview_summary : ''}" placeholder="Brief summary of completed deliverables..." />
                  <button type="button" class="btn btn-primary btn-sm" onclick="window.studentSubmitFinal('${g.gig_id}')">
                    ${isDelivered ? 'Re-Submit Updated Work' : 'Submit to Protected Vault'}
                  </button>
                  ${
                    vp
                      ? `<button type="button" class="btn btn-sm" onclick="window.openVaultPreviewModal('${g.gig_id}')">
                          🔒 Preview Watermarked Vault
                        </button>`
                      : ''
                  }
                </div>
              </div>
            </div>
          `;
        }
      } else {
        executionPipelineHtml = `
          <div style="background:var(--sage-bg); color:var(--sage-text); border:1px solid var(--sage-border); border-radius:var(--radius-sm); padding:12px 14px; font-size:13px;">
            <div><strong>✓ Job Completed & Settled (₹${g.payout_inr} Credited to Your Balance)</strong></div>
            ${
              g.rating_score
                ? `<div style="margin-top:6px;">
                    Poster Rating: <strong>${renderStarsHtml(g.rating_score)} (${g.rating_score}/5)</strong> —
                    <em>"${g.rating_feedback}"</em>
                  </div>`
                : `<div style="margin-top:4px; font-size:12px;">Awaiting Poster's 5-star rating & feedback.</div>`
            }
          </div>
        `;
      }

      return `
        <div class="card">
          <div class="job-top" style="margin-bottom:12px;">
            <div>
              <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-bottom:6px;">
                ${getJobLifecycleBadgeHtml(g.lifecycle_status)}
                <span class="tag ${isOffline ? 'tag-ochre' : 'tag-slate'}">
                  ${isOffline ? '📍 Offline On-Site' : '💻 Online Digital'}
                </span>
                <span class="tag mono">${g.gig_id}</span>
                <span class="tag">${g.track_name}</span>
              </div>
              <h3 class="job-title">${g.title}</h3>
              <div class="job-meta">Poster: ${g.poster ? g.poster.full_name : 'Client'} • Locked Payout: ₹${g.payout_inr}</div>
            </div>
            ${
              !isSettled
                ? `<button type="button" class="btn btn-clay btn-sm" onclick="window.studentQuitJob('${g.gig_id}')">
                    Quit Job
                  </button>`
                : `<span class="tag tag-sage">✓ Paid ₹${g.payout_inr}</span>`
            }
          </div>

          <p style="font-size:13px; color:var(--text-secondary); margin-bottom:12px;">${g.description}</p>
          ${executionPipelineHtml}
        </div>
      `;
    })
    .join('');
}

window.handleStudentFileSelect = function (gigId, fileInput) {
  const file = fileInput && fileInput.files && fileInput.files[0];
  if (!file) return;
  const titleEl = $(`finalInput_${gigId}`);
  if (titleEl) titleEl.value = file.name;

  const mediaSel = $(`mediaType_${gigId}`);
  if (mediaSel) {
    if (file.type.startsWith('image/')) mediaSel.value = 'IMAGE';
    else if (file.type.startsWith('video/')) mediaSel.value = 'VIDEO';
    else mediaSel.value = 'DOCUMENT';
  }

  const reader = new FileReader();
  reader.onload = (ev) => {
    state.pendingFileDataUriMap[gigId] = String(ev.target.result || '').slice(0, 300000);
    showToast('FILE ATTACHED FOR VAULT', `"${file.name}" ready for watermarked & blurrified vault upload.`);
  };
  reader.readAsDataURL(file);
};

window.studentSavePartial = async function (gigId) {
  try {
    const note = $(`partialInput_${gigId}`) ? $(`partialInput_${gigId}`).value : 'Partial progress updated';
    await apiRequest(`/api/v1/gigs/${encodeURIComponent(gigId)}/checkpoint`, {
      method: 'POST',
      body: { note }
    });
    notifyOtherTabs('CHECKPOINT_SAVED');
    showToast('PARTIAL PROGRESS SAVED', 'The Poster can now see your partial progress in real time.');
    await refreshWorkspaceData();
  } catch (err) {
    showToast(err.code || 'ERR-MG-3001', err.detail || 'Could not save partial progress');
  }
};

window.studentSubmitFinal = async function (gigId) {
  try {
    const mediaType = $(`mediaType_${gigId}`) ? $(`mediaType_${gigId}`).value : 'DOCUMENT';
    const val = $(`finalInput_${gigId}`) ? $(`finalInput_${gigId}`).value : `${gigId}_Deliverable`;
    const sum = $(`finalSummary_${gigId}`) ? $(`finalSummary_${gigId}`).value : `Completed ${mediaType} deliverable fulfilling all 3 criteria`;
    const dataUri = state.pendingFileDataUriMap[gigId] || null;

    await apiRequest(`/api/v1/vault/${encodeURIComponent(gigId)}/deliver`, {
      method: 'POST',
      body: {
        media_type: mediaType,
        deliverable_title: val || `${gigId}_${mediaType}_Deliverable`,
        preview_summary: sum,
        file_data_uri: dataUri,
        criteria_checked: [true, true, true]
      }
    });
    notifyOtherTabs('VAULT_DELIVERED');
    showToast('UPLOADED TO PROTECTED VAULT', 'Deliverable watermarked & blurrified. Poster notified in real time.');
    await refreshWorkspaceData();
  } catch (err) {
    showToast(err.code || 'ERR-MG-3001', err.detail || 'Could not submit final work');
  }
};

window.studentVerifyOfflinePin = async function (gigId, pinType) {
  try {
    const inputEl = pinType === 'START_PIN' ? $(`startPinInput_${gigId}`) : $(`completePinInput_${gigId}`);
    const pinVal = inputEl ? inputEl.value.trim() : '';
    await apiRequest(`/api/v1/gigs/${encodeURIComponent(gigId)}/onsite/pin-handshake`, {
      method: 'POST',
      body: {
        pin_type: pinType,
        pin_entered: pinVal,
        actor_id: state.currentUser.user_id
      }
    });
    notifyOtherTabs('PIN_VERIFIED');
    if (pinType === 'START_PIN') {
      showToast('START_PIN VERIFIED', 'On-site arrival confirmed & Campus Safety Beacon activated!');
    } else {
      showToast('COMPLETE_PIN VERIFIED • SETTLED', 'Escrow settled to your wallet balance & job marked DELETED!');
    }
    await refreshWorkspaceData();
  } catch (err) {
    showToast(err.code || 'ERR-MG-4001', err.detail || 'Invalid 4-digit PIN');
  }
};

window.triggerStudentSos = async function (gigId) {
  try {
    const res = await apiRequest(`/api/v1/gigs/${encodeURIComponent(gigId)}/safety-sos`, {
      method: 'POST',
      body: { custom_note: '1-Tap Campus SOS triggered from active offline assignment' }
    });
    const pkt = res.data.sos_packet || res.data;
    showToast(
      `🚨 SOS DISPATCHED (${pkt.alert_id})`,
      `Alert sent to ${pkt.dispatched_to_union} (${pkt.union_helpline}) & ${pkt.hostel_warden_desk}.`
    );
  } catch (err) {
    showToast('ERR-MG-SOS', err.detail || 'Could not trigger SOS');
  }
};

window.studentQuitJob = async function (gigId) {
  try {
    await apiRequest(`/api/v1/gigs/${encodeURIComponent(gigId)}/quit`, {
      method: 'POST',
      body: { reason: 'Student withdrew from assignment' }
    });
    notifyOtherTabs('GIG_QUIT');
    showToast('JOB QUIT', 'Job returned to ACTIVE and your status is now FREE.');
    await refreshWorkspaceData();
  } catch (err) {
    showToast(err.code || 'ERR-MG-QUIT', err.detail || 'Could not quit job');
  }
};

/* ==========================================================================
   ANTI-THEFT WATERMARKED & BLURRIFIED VAULT VIEWER (NO DOWNLOAD / NO SCREENSHOT)
   ========================================================================== */

window.openVaultPreviewModal = function (gigId) {
  const g = state.gigs.find((x) => x.gig_id === gigId);
  if (!g || !g.vault_protection) return;
  state.activeVaultGigId = gigId;

  const vp = g.vault_protection;
  const isUnlocked = Boolean(vp.raw_download_unlocked || g.lifecycle_status === 'DELETED');
  const mediaType = vp.media_type || 'DOCUMENT';

  $('vaultModalBadge').textContent = isUnlocked
    ? '✓ SETTLED • CLEAN MASTER UNLOCKED'
    : '🔒 UNPAID PREVIEW • WATERMARKED & BLURRIFIED (NO DOWNLOAD / NO SCREENSHOT)';
  $('vaultModalBadge').className = `tag ${isUnlocked ? 'tag-sage' : 'tag-ochre'}`;
  $('vaultModalTitle').textContent = `${vp.deliverable_title} [${mediaType}]`;
  $('vaultModalSub').textContent = `Job: ${g.title} (${g.gig_id}) • SHA-256: ${(vp.file_sha256 || '').slice(0, 20)}...`;

  let mediaPreviewInner = '';

  if (mediaType === 'IMAGE') {
    const imgSrc = vp.file_data_uri && vp.file_data_uri.startsWith('data:image/')
      ? vp.file_data_uri
      : `data:image/svg+xml;utf8,${encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="260" viewBox="0 0 540 260">
            <rect width="540" height="260" fill="#272725"/>
            <rect x="24" y="24" width="492" height="212" rx="10" fill="#32322F" stroke="#52524E" stroke-width="2"/>
            <circle cx="150" cy="115" r="36" fill="#6E8B74"/>
            <polygon points="110,205 220,120 310,190 380,140 460,205" fill="#4A5550"/>
            <text x="270" y="70" fill="#FAF9F6" font-family="sans-serif" font-size="16" font-weight="bold" text-anchor="middle">${vp.deliverable_title}</text>
            <text x="270" y="225" fill="#D4D2CC" font-family="monospace" font-size="12" text-anchor="middle">${vp.preview_summary}</text>
          </svg>`
        )}`;
    mediaPreviewInner = `
      <div style="text-align:center;">
        <img src="${imgSrc}" alt="Vault Image Preview" style="max-width:100%; max-height:260px; border-radius:6px; pointer-events:none;" ondragstart="return false;" />
        <p style="font-size:12.5px; color:#D4D2CC; margin-top:8px;">${vp.preview_summary}</p>
      </div>
    `;
  } else if (mediaType === 'VIDEO') {
    mediaPreviewInner = `
      <div style="background:#232321; border:1px solid #3E3E3A; border-radius:8px; padding:18px; text-align:center;">
        <div style="font-size:32px; margin-bottom:6px;">🎬</div>
        <div style="font-size:14px; font-weight:650; color:#FAF9F6;">9:16 Vertical Video Stream Preview: ${vp.deliverable_title}</div>
        <p style="font-size:12.5px; color:#C4C2BC; margin-top:6px;">${vp.preview_summary}</p>
        <div style="margin-top:12px; height:8px; background:#3A3A36; border-radius:99px; overflow:hidden;">
          <div style="width:65%; height:100%; background:#7A9A82;"></div>
        </div>
        <div class="mono" style="font-size:11px; color:#A3A19A; margin-top:6px;">
          360p Watermarked Stream • Audio Synced • Raw 1080p MP4 Locked in Escrow
        </div>
      </div>
    `;
  } else {
    // DOCUMENT / EXCEL / ARCHIVE PREVIEW
    const rows = vp.tabular_rows || [];
    mediaPreviewInner = `
      <div style="background:#232321; border:1px solid #3E3E3A; border-radius:8px; padding:14px;">
        <div style="font-size:13px; font-weight:650; color:#FAF9F6; margin-bottom:6px;">
          📄 Document / Spreadsheet Preview: ${vp.deliverable_title}
        </div>
        <p style="font-size:12px; color:#C4C2BC; margin-bottom:10px;">${vp.preview_summary}</p>
        <div style="font-family:var(--font-mono); font-size:11.5px; display:flex; flex-direction:column; gap:4px;">
          ${rows
            .slice(0, 6)
            .map(
              (r) => `
              <div style="display:flex; justify-content:space-between; padding:4px 8px; background:#1B1B19; border-radius:4px;">
                <span>#${r.row} ${r.item}</span>
                <span>${r.cost} → ${r.price} (${r.margin})</span>
              </div>
            `
            )
            .join('')}
        </div>
      </div>
    `;
  }

  $('vaultModalBody').innerHTML = `
    <div class="vault-stage" id="vaultStageBox" oncontextmenu="return false;" oncopy="return false;" oncut="return false;" ondragstart="return false;">
      <!-- Blurrified Content Layer (Blurred until Escrow is Settled!) -->
      <div id="vaultContentLayer" class="${isUnlocked ? 'vault-clean-content' : 'vault-blur-content'}">
        ${mediaPreviewInner}
      </div>

      <!-- Diagonal Repeating MorungGig Watermark Overlay -->
      ${
        !isUnlocked
          ? `<div class="vault-watermark-overlay" id="vaultWatermarkLayer">
              <div class="vault-watermark-stamp">MORUNGGIG ESCROW VAULT • UNPAID PREVIEW • DO NOT COPY OR SCREENSHOT • ${g.gig_id}</div>
              <div class="vault-watermark-stamp">PROTECTED STUDENT IP (${g.assigned_lead_id || 'STUDENT'}) • SETTLE ESCROW TO UNLOCK</div>
              <div class="vault-watermark-stamp">MORUNGGIG ESCROW VAULT • NO DOWNLOAD • NO SCREENSHOT • ${g.gig_id}</div>
            </div>`
          : ''
      }

      <!-- Anti-Screenshot / Focus Loss Blackout Curtain -->
      <div id="vaultScreenshotCurtain" class="vault-screenshot-curtain hidden">
        <div style="font-size:28px; margin-bottom:8px;">🛡️</div>
        <div style="font-size:15px; font-weight:700;">ANTI-SCREENSHOT & FOCUS-LOSS PROTECTION ACTIVE</div>
        <p style="font-size:12.5px; color:#C4C2BC; max-width:420px; margin-top:6px;">
          The preview was automatically hidden because a screenshot shortcut or window focus change was detected while the deliverable is unpaid.
        </p>
        <button type="button" class="btn btn-sm" style="margin-top:12px;" onclick="window.resumeVaultPreview()">
          Resume Protected Preview
        </button>
      </div>
    </div>

    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-top:14px;">
      <div style="font-size:12px; color:var(--text-secondary);">
        ${
          isUnlocked
            ? 'Escrow is settled. Watermark and blurrification have been removed.'
            : 'Right-click, copy, raw download, and screenshots are blocked until ₹' + g.payout_inr + ' escrow is settled.'
        }
      </div>
      <div style="display:flex; gap:8px;">
        ${
          !isUnlocked
            ? `<button type="button" class="btn btn-sm" onclick="window.triggerAntiScreenshotCurtain()">
                Test Anti-Screenshot Shield
              </button>`
            : ''
        }
        <button type="button" class="btn ${isUnlocked ? 'btn-primary' : ''} btn-sm" onclick="window.attemptRawVaultDownload('${g.gig_id}')">
          ${isUnlocked ? '⬇ Download Clean Master File' : '🔒 Raw Download Locked (403)'}
        </button>
      </div>
    </div>
  `;

  $('vaultPreviewModal').classList.remove('hidden');
};

window.closeVaultPreviewModal = function () {
  state.activeVaultGigId = null;
  $('vaultPreviewModal').classList.add('hidden');
};

window.triggerAntiScreenshotCurtain = function () {
  const curtain = $('vaultScreenshotCurtain');
  if (curtain) {
    curtain.classList.remove('hidden');
    showToast('🛡️ SCREENSHOT BLOCKED', 'MorungGig Anti-Screenshot Curtain activated to protect unpaid student work.');
  }
};

window.resumeVaultPreview = function () {
  const curtain = $('vaultScreenshotCurtain');
  if (curtain) curtain.classList.add('hidden');
};

window.attemptRawVaultDownload = async function (gigId) {
  try {
    const res = await apiRequest(`/api/v1/vault/${encodeURIComponent(gigId)}/raw-file`);
    showToast(
      'CLEAN MASTER DOWNLOADED',
      `Downloaded unwatermarked "${res.data.master_file.filename}" (SHA-256 verified).`
    );
  } catch (err) {
    showToast(err.code || 'ERR-MG-4003', err.detail || 'Raw download is blocked until escrow is settled.');
  }
};

/* ==========================================================================
   POSTER VIEWS (RATING-SORTED APPLICANTS, APPLICANT PROFILE MODAL, 3 TWEAKS, OFFLINE PINS & 5-STAR RATING)
   ========================================================================== */

window.setPosterFilter = function (filterVal) {
  state.posterFilter = filterVal;
  renderPosterFeedView();
};

window.openApplicantProfileModal = function (studentId, gigId = '') {
  const stu = state.users.find((u) => u.user_id === studentId);
  if (!stu) return;

  const avgRating = Number(stu.avg_rating || 5.0).toFixed(2);
  const reviews = stu.reviews || [];
  const proficiencies = stu.proficiencies || [];

  $('applicantModalRatingBadge').textContent = `${renderStarsHtml(stu.avg_rating)} ${avgRating} / 5.0 (${stu.ratings_count || 1} Reviews)`;
  $('applicantModalName').textContent = stu.full_name;
  $('applicantModalSub').textContent = `${stu.institution_or_org} • ${stu.stream_or_sector} • ${stu.completed_gigs_cnt} Jobs Completed`;

  $('applicantModalBody').innerHTML = `
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
      ${getAvailabilityBadgeHtml(stu.availability_status)}
      <span class="tag tag-sage">★ Avg Rating: ${avgRating} / 5.0</span>
      <span class="tag tag-slate">✓ ${stu.completed_gigs_cnt} Jobs Completed</span>
      <span class="tag">Trust Score: ${stu.trust_score}%</span>
    </div>

    <div style="background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); padding:12px; margin-bottom:14px;">
      <div style="font-size:12px; font-weight:650; color:var(--text-secondary); margin-bottom:4px;">Student Bio & Summary</div>
      <p style="font-size:13px;">${stu.bio || stu.stream_or_sector}</p>
    </div>

    <div style="background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); padding:12px; margin-bottom:14px;">
      <div style="font-size:12px; font-weight:650; color:var(--text-secondary); margin-bottom:8px;">Skills & Verified Proficiencies</div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        ${
          proficiencies.length > 0
            ? proficiencies
                .map(
                  (p) => `
                  <span class="tag tag-sage" style="padding:5px 10px;">
                    <strong>${p.skill}:</strong> ${p.level}
                  </span>
                `
                )
                .join('')
            : (stu.skills || []).map((s) => `<span class="tag">${s}</span>`).join('')
        }
      </div>
    </div>

    <div style="background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); padding:12px; margin-bottom:14px;">
      <div style="font-size:12px; font-weight:650; color:var(--text-secondary); margin-bottom:8px;">
        Past Poster Ratings & Feedback (${reviews.length})
      </div>
      ${
        reviews.length > 0
          ? `<div style="display:flex; flex-direction:column; gap:8px;">
              ${reviews
                .map(
                  (r) => `
                  <div style="background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-sm); padding:10px;">
                    <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:650;">
                      <span>${r.gig_title} (${r.poster_name})</span>
                      <span style="color:var(--sage-text);">${renderStarsHtml(r.rating_score)} ${r.rating_score}/5</span>
                    </div>
                    <p style="font-size:12.5px; color:var(--text-secondary); margin-top:4px;">"${r.feedback_text}"</p>
                  </div>
                `
                )
                .join('')}
            </div>`
          : `<p style="font-size:12.5px; color:var(--text-muted);">No feedback reviews recorded yet.</p>`
      }
    </div>

    ${
      gigId
        ? `<button type="button" class="btn btn-primary btn-full" onclick="document.getElementById('applicantProfileModal').classList.add('hidden'); window.posterAssignApplicant('${gigId}', '${stu.user_id}')" ${stu.availability_status === 'OFFLINE' ? 'disabled' : ''}>
            Assign Job to ${stu.full_name}
          </button>`
        : ''
    }
  `;

  $('applicantProfileModal').classList.remove('hidden');
};

function renderPosterFeedView() {
  const u = state.currentUser;
  $('pageTitle').textContent = 'My Posted Jobs';
  $('pageSub').textContent = 'Applicants are sorted by highest rating & completed jobs. Inspect watermarked previews, request up to 3 tweaks, or rate settled jobs.';
  $('pageHeaderRight').innerHTML = `
    <button type="button" class="btn btn-primary btn-sm" onclick="window.switchView('poster-create')">+ Post New Job</button>
  `;

  const container = $('posterJobsContainer');
  if (!container) return;

  const myJobs = state.gigs.filter((g) => {
    if (g.poster_id !== u.user_id) return false;
    if (state.posterFilter !== 'ALL' && g.lifecycle_status !== state.posterFilter) return false;
    return true;
  });

  const freeStudents = state.users
    .filter((stu) => stu.role === 'STUDENT' && stu.availability_status !== 'OFFLINE')
    .sort((a, b) => Number(b.avg_rating || 5) - Number(a.avg_rating || 5));

  if (myJobs.length === 0) {
    container.innerHTML = `
      <div class="card">
        <p style="color:var(--text-secondary);">No jobs found in this status filter. Click <strong>+ Post New Job</strong> to create an Online or Offline job.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = myJobs
    .map((g) => {
      const status = g.lifecycle_status;
      const applicants = g.applicants || [];
      const vp = g.vault_protection;
      const isOffline = g.execution_mode === 'OFFLINE';

      let statusBodyHtml = '';

      if (status === 'ACTIVE') {
        statusBodyHtml = `
          <div style="background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); padding:14px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; margin-bottom:10px;">
              <div style="font-size:12.5px; font-weight:650;">
                Applicants (${applicants.length}) — Sorted by Highest Avg Rating & Jobs Completed:
              </div>
              <span style="font-size:11.5px; color:var(--text-muted);">Click "View Profile" to inspect skills & past reviews</span>
            </div>
            ${
              applicants.length > 0
                ? `<div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;">
                    ${applicants
                      .map(
                        (a, idx) => `
                        <div style="background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-sm); padding:12px; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                          <div style="flex:1; min-width:240px;">
                            <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                              <span class="tag tag-sage">#${idx + 1} ★ ${Number(a.avg_rating || 5.0).toFixed(2)} / 5.0</span>
                              <strong style="font-size:14px;">${a.full_name}</strong>
                              ${getAvailabilityBadgeHtml(a.availability_status)}
                              <span class="tag">${a.completed_gigs_cnt || 0} Jobs Done</span>
                            </div>
                            <div style="font-size:12px; color:var(--text-secondary); margin-top:4px;">
                              ${a.institution} • Pitch: <em>"${a.pitch_note}"</em>
                            </div>
                            <div style="display:flex; gap:5px; flex-wrap:wrap; margin-top:6px;">
                              ${(a.proficiencies || [])
                                .slice(0, 3)
                                .map((p) => `<span class="tag" style="font-size:10.5px;">${p.skill}: ${p.level}</span>`)
                                .join('')}
                            </div>
                          </div>
                          <div style="display:flex; gap:6px; align-items:center;">
                            <button type="button" class="btn btn-sm" onclick="window.openApplicantProfileModal('${a.student_id}', '${g.gig_id}')">
                              View Profile & Reviews
                            </button>
                            <button type="button" class="btn btn-primary btn-sm" onclick="window.posterAssignApplicant('${g.gig_id}', '${a.student_id}')" ${a.availability_status === 'OFFLINE' ? 'disabled' : ''}>
                              Assign Job
                            </button>
                          </div>
                        </div>
                      `
                      )
                      .join('')}
                  </div>`
                : `<p style="font-size:12.5px; color:var(--text-muted); margin-bottom:12px;">No student applications yet, or assign an available student directly below:</p>`
            }

            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; border-top:1px solid var(--border); padding-top:10px;">
              <span style="font-size:12px; color:var(--text-secondary);">Or select any available student (sorted by ★ rating):</span>
              <select id="assignSelect_${g.gig_id}" class="select" style="width:auto; flex:1;">
                ${freeStudents
                  .map(
                    (s) => `
                    <option value="${s.user_id}">
                      ★ ${Number(s.avg_rating || 5.0).toFixed(2)} • ${s.full_name} (${s.completed_gigs_cnt} Jobs Done • ${s.institution_or_org}) — [${s.availability_status}]
                    </option>
                  `
                  )
                  .join('')}
              </select>
              <button type="button" class="btn btn-sm" onclick="window.posterAssignFromDropdown('${g.gig_id}')">
                Assign Selected Student
              </button>
            </div>
          </div>
        `;
      } else if (status === 'ASSIGNED') {
        statusBodyHtml = `
          <div style="background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); padding:14px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
              <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                <span style="font-size:12px; color:var(--text-secondary);">Assigned Student:</span>
                <strong style="font-size:14px;">${g.lead_student ? g.lead_student.full_name : g.assigned_lead_id}</strong>
                ${g.lead_student ? `<span class="tag tag-sage">★ ${Number(g.lead_student.avg_rating || 5).toFixed(2)}</span>` : ''}
                ${g.lead_student ? getAvailabilityBadgeHtml(g.lead_student.availability_status) : ''}
                ${
                  g.lead_student
                    ? `<button type="button" class="btn btn-sm" onclick="window.openApplicantProfileModal('${g.lead_student.user_id}')">View Profile</button>`
                    : ''
                }
              </div>
              <span class="tag mono">State: ${g.state}</span>
            </div>

            ${
              isOffline
                ? `<div style="background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-sm); padding:12px; margin-bottom:12px; font-size:13px;">
                    <div style="font-weight:650; margin-bottom:6px;">
                      📍 Offline On-Site Handshake PINs (Venue: ${g.venue_label})
                    </div>
                    <div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:8px;">
                      <div>1. Arrival Check-In <strong>START_PIN:</strong> <span class="tag mono">${g.start_pin || '4821'}</span></div>
                      <div>2. Shift Completion <strong>COMPLETE_PIN:</strong> <span class="tag mono">${g.complete_pin || '9054'}</span></div>
                    </div>
                    <div style="font-size:12px; color:var(--text-secondary);">
                      ${
                        g.state === 'IN_PROGRESS_ONSITE'
                          ? '✓ Student has checked in on-site with START_PIN. Click below or share COMPLETE_PIN when shift finishes.'
                          : 'Share START_PIN with the student when they arrive at the venue.'
                      }
                    </div>
                  </div>`
                : `<div style="background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-sm); padding:12px; margin-bottom:12px; font-size:13px;">
                    <div style="margin-bottom:6px;">
                      <strong>Partial Progress Note:</strong>
                      <span style="color:var(--text-secondary);">${g.checkpoint_note || 'No partial checkpoint submitted yet.'}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                      <div>
                        <strong>Submitted Deliverable:</strong>
                        <span style="color:var(--text); font-weight:600;">
                          ${vp ? `[${vp.media_type || 'DOCUMENT'}] ${vp.deliverable_title} — "${vp.preview_summary}"` : 'Waiting for student to upload deliverable to Vault.'}
                        </span>
                      </div>
                      ${
                        vp
                          ? `<button type="button" class="btn btn-sm" onclick="window.openVaultPreviewModal('${g.gig_id}')">
                              🔒 Inspect Watermarked & Blurred Vault
                            </button>`
                          : ''
                      }
                    </div>
                  </div>`
            }

            ${
              !isOffline && g.state === 'DELIVERED_VAULT'
                ? `<div style="background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-sm); padding:12px; margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                      <span style="font-size:12px; font-weight:650;">Request Tweak / Revision on Submitted Work</span>
                      <span class="tag">${g.revisions_left} of ${g.max_tweaks || 3} Tweaks Left</span>
                    </div>
                    ${
                      g.revisions_left > 0
                        ? `<div style="display:flex; gap:8px; flex-wrap:wrap;">
                            <input type="text" id="tweakNoteInput_${g.gig_id}" class="input" style="flex:1;" placeholder="Describe what tweak/revision is needed (e.g. Adjust caption font or fix Row 4)..." />
                            <button type="button" class="btn btn-sm" onclick="window.posterRequestTweak('${g.gig_id}')">
                              Send Tweak Request (${g.revisions_left} Left)
                            </button>
                          </div>`
                        : `<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                            <span style="font-size:12px; color:var(--text-secondary);">All ${g.max_tweaks || 3} free tweaks used.</span>
                            <button type="button" class="btn btn-sm" onclick="window.posterTopUpTweak('${g.gig_id}')">
                              + Lock ₹150 Extra-Scope Top-Up (+1 Tweak)
                            </button>
                          </div>`
                    }
                  </div>`
                : ''
            }

            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button type="button" class="btn btn-primary" onclick="window.posterSettleJob('${g.gig_id}')" ${!vp && !isOffline ? 'disabled title="Student must submit work first"' : ''}>
                ${isOffline ? `Verify Completion & Settle ₹${g.payout_inr} to Student` : `Approve Work & Settle ₹${g.payout_inr} to Student Account`}
              </button>
            </div>
          </div>
        `;
      } else {
        // DELETED (SETTLED) -> SHOW RECEIPT + POSTER 5-STAR RATING & 50-WORD FEEDBACK FORM
        statusBodyHtml = `
          <div style="background:var(--clay-bg); color:var(--clay-text); border:1px solid var(--clay-border); border-radius:var(--radius-sm); padding:12px 14px; font-size:13px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <span>
              <strong>Job Closed & Marked DELETED (Settled)</strong> • ₹${g.payout_inr} credited to ${g.lead_student ? g.lead_student.full_name : 'Assigned Student'}.
            </span>
            <div style="display:flex; gap:8px; align-items:center;">
              ${
                vp
                  ? `<button type="button" class="btn btn-sm" onclick="window.openVaultPreviewModal('${g.gig_id}')">
                      ⬇ View Unlocked Master File
                    </button>`
                  : ''
              }
              <span class="mono" style="font-size:11.5px;">UTR: ${g.escrow_receipt ? g.escrow_receipt.utr_reference : 'SETTLED'}</span>
            </div>
          </div>

          <div style="background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); padding:14px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <span style="font-size:12.5px; font-weight:650;">
                Rate Student Performance (Out of 5 ★) & Feedback (Max 50 Words)
              </span>
              ${
                g.rating_score
                  ? `<span class="tag tag-sage">Rated: ${renderStarsHtml(g.rating_score)} (${g.rating_score}/5)</span>`
                  : `<span class="tag tag-ochre">Pending Your Rating</span>`
              }
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
              <select id="rateScore_${g.gig_id}" class="select" style="width:auto;">
                <option value="5" ${g.rating_score === 5 || !g.rating_score ? 'selected' : ''}>★★★★★ (5 / 5 — Excellent)</option>
                <option value="4" ${g.rating_score === 4 ? 'selected' : ''}>★★★★☆ (4 / 5 — Good)</option>
                <option value="3" ${g.rating_score === 3 ? 'selected' : ''}>★★★☆☆ (3 / 5 — Satisfactory)</option>
                <option value="2" ${g.rating_score === 2 ? 'selected' : ''}>★★☆☆☆ (2 / 5 — Below Avg)</option>
                <option value="1" ${g.rating_score === 1 ? 'selected' : ''}>★☆☆☆☆ (1 / 5 — Poor)</option>
              </select>
              <input
                type="text"
                id="rateFeedback_${g.gig_id}"
                class="input"
                style="flex:1; min-width:220px;"
                value="${g.rating_feedback || ''}"
                placeholder="Write feedback (max 50 words)..."
                oninput="window.updateFeedbackWordCount('${g.gig_id}', this.value)"
              />
              <span id="rateWordCount_${g.gig_id}" class="mono" style="font-size:11px; color:var(--text-muted);">≤ 50 words</span>
              <button type="button" class="btn btn-primary btn-sm" onclick="window.posterSubmitRating('${g.gig_id}')">
                ${g.rating_score ? 'Update Rating' : 'Submit Rating & Feedback'}
              </button>
            </div>
          </div>
        `;
      }

      return `
        <div class="card">
          <div class="job-top" style="margin-bottom:12px;">
            <div>
              <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-bottom:6px;">
                ${getJobLifecycleBadgeHtml(status)}
                <span class="tag ${isOffline ? 'tag-ochre' : 'tag-slate'}">
                  ${isOffline ? '📍 Offline On-Site' : '💻 Online Digital'}
                </span>
                <span class="tag mono">${g.gig_id}</span>
                <span class="tag">${g.track_name}</span>
              </div>
              <h3 class="job-title">${g.title}</h3>
              <div class="job-meta">${g.corridor_label} • ${g.description}</div>
            </div>
            <div class="job-amount">
              <div>₹${g.payout_inr}</div>
              <div class="job-amount-sub">${status === 'DELETED' ? 'Settled' : 'Locked'}</div>
            </div>
          </div>

          ${statusBodyHtml}
        </div>
      `;
    })
    .join('');
}

window.updateFeedbackWordCount = function (gigId, text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  const el = $(`rateWordCount_${gigId}`);
  if (el) {
    el.textContent = `${words} / 50 words`;
    el.style.color = words > 50 ? 'var(--clay-text)' : 'var(--text-muted)';
  }
};

window.posterRequestTweak = async function (gigId) {
  try {
    const noteEl = $(`tweakNoteInput_${gigId}`);
    const note = noteEl && noteEl.value.trim() ? noteEl.value.trim() : 'Please refine the deliverable formatting as discussed.';
    const res = await apiRequest(`/api/v1/vault/${encodeURIComponent(gigId)}/revision`, {
      method: 'POST',
      body: {
        checkbox_index: 2,
        revision_note: note,
        actor_id: state.currentUser.user_id
      }
    });
    notifyOtherTabs('TWEAK_REQUESTED');
    showToast('TWEAK FEEDBACK SENT', `Sent tweak request to student (${res.revisions_left} tweaks remaining).`);
    await refreshWorkspaceData();
  } catch (err) {
    showToast(err.code || 'ERR-MG-4002', err.detail || 'Could not request tweak');
  }
};

window.posterTopUpTweak = async function (gigId) {
  try {
    await apiRequest(`/api/v1/gigs/${encodeURIComponent(gigId)}/topup-revision`, {
      method: 'POST',
      body: { actor_id: state.currentUser.user_id }
    });
    notifyOtherTabs('TWEAK_TOPUP');
    showToast('+₹150 EXTRA-SCOPE LOCKED', 'Added ₹150 to student payout and unlocked +1 extra tweak.');
    await refreshWorkspaceData();
  } catch (err) {
    showToast(err.code || 'ERR-MG-TOPUP', err.detail || 'Could not top up tweak');
  }
};

window.posterSubmitRating = async function (gigId) {
  try {
    const score = Number($(`rateScore_${gigId}`) ? $(`rateScore_${gigId}`).value : 5);
    const feedback = $(`rateFeedback_${gigId}`) ? $(`rateFeedback_${gigId}`).value.trim() : 'Completed all deliverables accurately.';
    const words = feedback.split(/\s+/).filter(Boolean).length;
    if (words > 50) {
      showToast('ERR-MG-RATING-WORDS', `Feedback must be 50 words or fewer (currently ${words} words).`);
      return;
    }
    await apiRequest(`/api/v1/gigs/${encodeURIComponent(gigId)}/rate`, {
      method: 'POST',
      body: {
        rating_score: score,
        rating_feedback: feedback,
        actor_id: state.currentUser.user_id
      }
    });
    notifyOtherTabs('GIG_RATED');
    showToast('RATING & FEEDBACK SAVED', `Rated ${score}/5 ★. Student's average rating has been updated.`);
    await refreshWorkspaceData();
  } catch (err) {
    showToast(err.code || 'ERR-MG-RATE', err.detail || 'Could not submit rating');
  }
};

window.posterAssignApplicant = async function (gigId, studentId) {
  try {
    await apiRequest(`/api/v1/gigs/${encodeURIComponent(gigId)}/assign`, {
      method: 'POST',
      body: {
        lead_student_id: studentId,
        execution_type: 'SOLO',
        actor_id: state.currentUser.user_id
      }
    });
    notifyOtherTabs('GIG_ASSIGNED');
    showToast('STUDENT ASSIGNED', 'Job status updated to ASSIGNED and student status set to WORKING in real time.');
    await refreshWorkspaceData();
  } catch (err) {
    showToast(err.code || 'ERR-MG-ASSIGN', err.detail || 'Could not assign student');
  }
};

window.posterAssignFromDropdown = async function (gigId) {
  const sel = $(`assignSelect_${gigId}`);
  if (!sel || !sel.value) return;
  await window.posterAssignApplicant(gigId, sel.value);
};

window.posterSettleJob = async function (gigId) {
  try {
    const gig = state.gigs.find((x) => x.gig_id === gigId);
    if (gig && gig.execution_mode === 'OFFLINE') {
      if (gig.state === 'ASSIGNED_OFFLINE') {
        await apiRequest(`/api/v1/gigs/${encodeURIComponent(gigId)}/onsite/pin-handshake`, {
          method: 'POST',
          body: {
            pin_type: 'START_PIN',
            pin_entered: gig.start_pin || '4821',
            actor_id: state.currentUser.user_id
          }
        });
      }
      await apiRequest(`/api/v1/gigs/${encodeURIComponent(gigId)}/onsite/pin-handshake`, {
        method: 'POST',
        body: {
          pin_type: 'COMPLETE_PIN',
          pin_entered: gig.complete_pin || '9054',
          actor_id: state.currentUser.user_id
        }
      });
    } else {
      await apiRequest(`/api/v1/escrow/${encodeURIComponent(gigId)}/settle`, {
        method: 'POST',
        body: {
          trigger_type: 'POSTER_APPROVAL',
          actor_id: state.currentUser.user_id
        }
      });
    }
    notifyOtherTabs('GIG_SETTLED');
    showToast('PAYMENT SETTLED • JOB DELETED', 'Locked amount credited to student balance. You can now rate the student out of 5 ★.');
    await refreshWorkspaceData();
  } catch (err) {
    showToast(err.code || 'ERR-MG-SETTLE', err.detail || 'Could not settle payment');
  }
};

window.toggleOfflineJobFields = function () {
  const mode = $('jobExecutionMode') ? $('jobExecutionMode').value : 'DIGITAL';
  const box = $('offlineJobFieldsBox');
  if (box) box.classList.toggle('hidden', mode !== 'OFFLINE');
};

window.toggleCustomCategoryField = function () {
  const cat = $('jobCategory') ? $('jobCategory').value : 'CONTENT_REELS';
  const box = $('customCategoryFieldBox');
  if (box) box.classList.toggle('hidden', cat !== 'OTHER_CUSTOM');
};

function renderPosterCreateView() {
  $('pageTitle').textContent = 'Create a New Job (Online or Offline)';
  $('pageSub').textContent = 'Choose Online (Watermarked Vault + 3 Tweaks) or Offline (On-Site Venue + Dual 4-Digit PIN Handshake), or specify a Custom Category.';
  $('pageHeaderRight').innerHTML = '';
  window.toggleOfflineJobFields();
  window.toggleCustomCategoryField();
}

/* ==========================================================================
   PROFILE & WALLET VIEW (AVAILABILITY + RATINGS/REVIEWS + MOCK WITHDRAWAL)
   ========================================================================== */

function renderUserProfileView() {
  const u = state.currentUser;
  const isStu = isStudentRole(u);
  $('pageTitle').textContent = 'My Profile & Wallet';
  $('pageSub').textContent = 'Manage your profile details, availability status, ratings & skills, account balance, and mock withdrawals.';
  $('pageHeaderRight').innerHTML = isStu ? getAvailabilityBadgeHtml(u.availability_status) : `<span class="tag tag-slate">${u.role}</span>`;

  const container = $('userProfileContainer');
  if (!container) return;

  const txs = u.wallet_transactions || [];
  const reviews = u.reviews || [];
  const proficiencies = u.proficiencies || [];
  const isWorking = u.availability_status === 'WORKING';

  const myLockedEscrowInr = isStu
    ? state.gigs
        .filter((g) => g.lifecycle_status === 'ASSIGNED' && g.assigned_lead_id === u.user_id)
        .reduce((sum, g) => sum + Number(g.payout_inr), 0)
    : state.gigs
        .filter((g) => g.poster_id === u.user_id && g.lifecycle_status !== 'DELETED')
        .reduce((sum, g) => sum + Number(g.payout_inr), 0);

  container.innerHTML = `
    <div class="grid-2" style="align-items:start;">
      <!-- Left Column: Availability Status (Student) + Wallet & Mock Withdrawal -->
      <div class="form-stack">
        ${
          isStu
            ? `<div class="card">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                  <h3 class="job-title">My Availability Status & Rating</h3>
                  <div style="display:flex; gap:6px; align-items:center;">
                    <span class="tag tag-sage">★ ${Number(u.avg_rating || 5.0).toFixed(2)} / 5.0 (${u.completed_gigs_cnt} Jobs)</span>
                    ${getAvailabilityBadgeHtml(u.availability_status)}
                  </div>
                </div>
                <p style="font-size:12.5px; color:var(--text-secondary); margin-bottom:14px;">
                  ${
                    isWorking
                      ? 'Your status is <strong>system-maintained as WORKING</strong> because you have an active assigned job. Complete or quit your active job before toggling to FREE or OFFLINE.'
                      : 'Toggle between <strong>FREE</strong> (up for work) and <strong>OFFLINE</strong> (not taking jobs). WORKING status is automatically set by the system when a Poster assigns you a job.'
                  }
                </p>
                <div style="display:flex; gap:8px;">
                  <button type="button" class="btn btn-sm ${u.availability_status === 'FREE' ? 'btn-primary' : ''}" onclick="window.toggleMyAvailability('FREE')" ${isWorking ? 'disabled' : ''}>
                    Set FREE (Up for Work)
                  </button>
                  <button type="button" class="btn btn-sm ${u.availability_status === 'OFFLINE' ? 'btn-primary' : ''}" onclick="window.toggleMyAvailability('OFFLINE')" ${isWorking ? 'disabled' : ''}>
                    Set OFFLINE (Not Taking Jobs)
                  </button>
                </div>
              </div>`
            : ''
        }

        <div class="card">
          <h3 class="job-title" style="margin-bottom:12px;">Account Balance & Mock Withdrawal</h3>
          <div class="grid-2" style="margin-bottom:16px;">
            <div style="background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); padding:12px;">
              <div style="font-size:11.5px; color:var(--text-secondary);">Available Balance</div>
              <div class="mono" style="font-size:20px; font-weight:700; margin-top:4px;">
                ₹${Number(u.wallet_balance_inr).toLocaleString('en-IN')}
              </div>
            </div>
            <div style="background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); padding:12px;">
              <div style="font-size:11.5px; color:var(--text-secondary);">
                ${isStu ? 'Locked in Assigned Jobs' : 'Locked in Active Jobs'}
              </div>
              <div class="mono" style="font-size:20px; font-weight:700; margin-top:4px;">
                ₹${myLockedEscrowInr.toLocaleString('en-IN')}
              </div>
            </div>
          </div>

          <form id="withdrawForm" class="form-stack" onsubmit="window.handleMockWithdraw(event)">
            <div class="grid-2">
              <div class="field">
                <label for="withdrawAmountInput">Withdraw Amount (₹ INR)</label>
                <input type="number" id="withdrawAmountInput" class="input mono" min="1" max="${u.wallet_balance_inr || 1}" required placeholder="e.g. 500" />
              </div>
              <div class="field">
                <label for="withdrawUpiInput">Destination UPI ID</label>
                <input type="text" id="withdrawUpiInput" class="input mono" required value="${u.upi_vpa}" />
              </div>
            </div>
            <button type="submit" class="btn btn-primary btn-full" ${Number(u.wallet_balance_inr) <= 0 ? 'disabled' : ''}>
              Withdraw from Account Balance
            </button>
          </form>

          <div style="margin-top:18px; border-top:1px solid var(--border); padding-top:12px;">
            <div style="font-size:12px; font-weight:650; color:var(--text-secondary); margin-bottom:8px;">
              Recent Account Transactions
            </div>
            <div style="display:flex; flex-direction:column; gap:6px;">
              ${
                txs.length > 0
                  ? txs
                      .slice(0, 8)
                      .map(
                        (t) => `
                        <div style="background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); padding:8px 10px; display:flex; justify-content:space-between; font-size:12px;">
                          <span>${t.note}</span>
                          <span class="mono" style="font-weight:650; color:${t.amount_inr >= 0 ? 'var(--sage-text)' : 'var(--clay-text)'};">
                            ${t.amount_inr >= 0 ? `+₹${t.amount_inr}` : `-₹${Math.abs(t.amount_inr)}`}
                          </span>
                        </div>
                      `
                      )
                      .join('')
                  : `<span style="font-size:12px; color:var(--text-muted);">No transactions yet.</span>`
              }
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column: Edit Own Profile Details + Skills & Past Reviews -->
      <div class="form-stack">
        <div class="card">
          <h3 class="job-title" style="margin-bottom:4px;">Profile Details</h3>
          <p style="font-size:12.5px; color:var(--text-secondary); margin-bottom:14px;">
            User ID: <span class="mono">${u.user_id}</span> • Phone: <span class="mono">${u.visible_phone}</span>
          </p>

          <form id="profileUpdateForm" class="form-stack" onsubmit="window.handleProfileSave(event)">
            <div class="field">
              <label for="profName">Full Name</label>
              <input type="text" id="profName" class="input" required value="${u.full_name}" />
            </div>
            <div class="field">
              <label for="profOrg">${isStu ? 'College / Institution' : 'Business / Organization'}</label>
              <input type="text" id="profOrg" class="input" required value="${u.institution_or_org}" />
            </div>
            <div class="field">
              <label for="profCorridor">Corridor</label>
              <select id="profCorridor" class="select">
                <option value="SOVIMA_6MILE" ${u.corridor_cluster === 'SOVIMA_6MILE' ? 'selected' : ''}>Sovima / 6th Mile</option>
                <option value="CHUMOUKEDIMA" ${u.corridor_cluster === 'CHUMOUKEDIMA' ? 'selected' : ''}>Chümoukedima</option>
                <option value="DIMAPUR_TOWN" ${u.corridor_cluster === 'DIMAPUR_TOWN' ? 'selected' : ''}>Dimapur Town</option>
                <option value="KOHIMA_TOWN" ${u.corridor_cluster === 'KOHIMA_TOWN' ? 'selected' : ''}>Kohima Town</option>
                <option value="JOTSOMA_MERIEMA" ${u.corridor_cluster === 'JOTSOMA_MERIEMA' ? 'selected' : ''}>Jotsoma / Meriema</option>
              </select>
            </div>
            <div class="field">
              <label for="profUpi">UPI ID</label>
              <input type="text" id="profUpi" class="input mono" required value="${u.upi_vpa}" />
            </div>
            <div class="field">
              <label for="profBio">Bio & Skills Summary</label>
              <textarea id="profBio" class="textarea" rows="2">${u.bio || ''}</textarea>
            </div>
            <button type="submit" class="btn btn-primary btn-full">Save Profile Changes</button>
          </form>
        </div>

        ${
          isStu
            ? `<div class="card">
                <h3 class="job-title" style="margin-bottom:8px;">My Skills, Proficiencies & Poster Reviews</h3>
                <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px;">
                  ${proficiencies
                    .map((p) => `<span class="tag tag-sage"><strong>${p.skill}:</strong> ${p.level}</span>`)
                    .join('')}
                </div>
                <div style="display:flex; flex-direction:column; gap:8px;">
                  ${
                    reviews.length > 0
                      ? reviews
                          .map(
                            (r) => `
                            <div style="background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); padding:10px; font-size:12.5px;">
                              <div style="display:flex; justify-content:space-between; font-weight:650;">
                                <span>${r.gig_title}</span>
                                <span style="color:var(--sage-text);">${renderStarsHtml(r.rating_score)} ${r.rating_score}/5</span>
                              </div>
                              <div style="color:var(--text-secondary); margin-top:4px;">"${r.feedback_text}" — <em>${r.poster_name}</em></div>
                            </div>
                          `
                          )
                          .join('')
                      : `<span style="font-size:12px; color:var(--text-muted);">No Poster reviews yet.</span>`
                  }
                </div>
              </div>`
            : ''
        }
      </div>
    </div>
  `;
}

window.toggleMyAvailability = async function (targetStatus) {
  try {
    await apiRequest('/api/v1/users/me/availability', {
      method: 'POST',
      body: { availability_status: targetStatus }
    });
    notifyOtherTabs('AVAILABILITY_CHANGED');
    showToast('STATUS UPDATED', `Your availability status is now ${targetStatus}.`);
    await refreshWorkspaceData();
  } catch (err) {
    showToast(err.code || 'ERR-MG-WORKING-LOCKED', err.detail || 'Cannot change status while WORKING');
  }
};

window.handleMockWithdraw = async function (e) {
  e.preventDefault();
  try {
    const amt = Number($('withdrawAmountInput').value);
    const upi = $('withdrawUpiInput').value;
    const res = await apiRequest('/api/v1/wallet/withdraw', {
      method: 'POST',
      body: { amount_inr: amt, upi_vpa: upi }
    });
    notifyOtherTabs('WALLET_WITHDRAWN');
    showToast(
      `WITHDRAWAL COMPLETE (${res.data.withdrawal.tx_id})`,
      `Deducted ₹${amt} from your balance to ${upi}.`
    );
    await refreshWorkspaceData();
  } catch (err) {
    showToast(err.code || 'ERR-MG-WD', err.detail || 'Withdrawal failed');
  }
};

window.handleProfileSave = async function (e) {
  e.preventDefault();
  try {
    await apiRequest('/api/v1/users/me/profile', {
      method: 'PUT',
      body: {
        full_name: $('profName').value,
        institution_or_org: $('profOrg').value,
        corridor_cluster: $('profCorridor').value,
        upi_vpa: $('profUpi').value,
        bio: $('profBio').value
      }
    });
    notifyOtherTabs('PROFILE_UPDATED');
    showToast('PROFILE SAVED', 'Your profile details have been updated.');
    await refreshWorkspaceData();
  } catch (err) {
    showToast(err.code || 'ERR-MG-PROF', err.detail || 'Could not update profile');
  }
};

/* ==========================================================================
   INITIALIZATION, ANTI-SCREENSHOT LISTENERS & FORM BINDINGS
   ========================================================================== */

function bindVaultAntiScreenshotGuards() {
  // Intercept PrintScreen, Ctrl+S, Ctrl+P, Cmd+Shift+3/4 while Vault Modal is open
  window.addEventListener('keydown', (e) => {
    if (!state.activeVaultGigId) return;
    const isPrintScreen = e.key === 'PrintScreen' || e.keyCode === 44;
    const isSaveOrPrint = (e.ctrlKey || e.metaKey) && ['s', 'p', 'u', 'c'].includes(String(e.key).toLowerCase());
    const isMacShot = e.metaKey && e.shiftKey && ['3', '4', '5'].includes(String(e.key));
    if (isPrintScreen || isSaveOrPrint || isMacShot) {
      e.preventDefault();
      window.triggerAntiScreenshotCurtain();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (!state.activeVaultGigId) return;
    if (e.key === 'PrintScreen' || e.keyCode === 44) {
      window.triggerAntiScreenshotCurtain();
    }
  });

  window.addEventListener('blur', () => {
    if (!state.activeVaultGigId) return;
    const g = state.gigs.find((x) => x.gig_id === state.activeVaultGigId);
    if (g && g.lifecycle_status !== 'DELETED') {
      window.triggerAntiScreenshotCurtain();
    }
  });
}

function initApp() {
  bindVaultAntiScreenshotGuards();
  startRealtimeSync();

  // Login Form
  const loginForm = $('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const res = await apiRequest('/api/v1/auth/login', {
          method: 'POST',
          body: {
            email: $('loginEmail').value,
            password: $('loginPassword').value
          }
        });
        state.accessToken = res.data.access_token;
        safeSet('MG_SESSION_TOKEN', state.accessToken);
        state.currentUser = res.data.user;
        safeSet('MG_CACHED_USER', JSON.stringify(state.currentUser));
        showToast('SIGNED IN', `Welcome back, ${state.currentUser.full_name}.`);
        await refreshWorkspaceData();
      } catch (err) {
        showToast(err.code || 'ERR-MG-AUTH-401', err.detail || 'Invalid email or password');
      }
    });
  }

  // Sign Up Form
  const signupForm = $('signupForm');
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const role = $('signupRole').value;
        const res = await apiRequest('/api/v1/auth/signup', {
          method: 'POST',
          body: {
            role,
            full_name: $('signupName').value,
            email: $('signupEmail').value,
            password: $('signupPassword').value,
            corridor_cluster: $('signupCorridor').value,
            institution_or_org: $('signupOrg').value,
            college_code: $('signupOrg').value.slice(0, 10),
            roll_number: $('signupRoll').value,
            org_or_aadhaar_last4: $('signupRoll').value,
            phone: $('signupPhone').value,
            upi_vpa: $('signupUpi').value,
            bio: $('signupBio').value
          }
        });
        state.accessToken = res.data.access_token;
        safeSet('MG_SESSION_TOKEN', state.accessToken);
        state.currentUser = res.data.user;
        safeSet('MG_CACHED_USER', JSON.stringify(state.currentUser));
        showToast('ACCOUNT CREATED', `Signed up and logged in as ${state.currentUser.full_name}.`);
        await refreshWorkspaceData();
      } catch (err) {
        showToast(err.code || 'ERR-MG-SIGNUP', err.detail || 'Sign up failed');
      }
    });
  }

  // Google OAuth Button
  if ($('googleOAuthLoginBtn')) {
    $('googleOAuthLoginBtn').addEventListener('click', async () => {
      const res = await apiRequest('/api/v1/auth/google/url?role=STUDENT');
      if (res.data && res.data.configured && res.data.auth_url) {
        window.location.href = res.data.auth_url;
      } else {
        showToast('GOOGLE OAUTH', 'Configure GOOGLE_CLIENT_ID in Render Environment Variables or use Email/Password Sign Up & Login.');
      }
    });
  }

  // Poster Create Job Form (Supports Online & Offline + Custom Category)
  const createJobForm = $('createJobForm');
  if (createJobForm) {
    createJobForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const execMode = $('jobExecutionMode') ? $('jobExecutionMode').value : 'DIGITAL';
        const cat = $('jobCategory').value;
        const customCat = cat === 'OTHER_CUSTOM' && $('jobCustomCategory') ? $('jobCustomCategory').value.trim() : '';
        const venue = execMode === 'OFFLINE' && $('jobVenueLabel') && $('jobVenueLabel').value.trim()
          ? $('jobVenueLabel').value.trim()
          : 'Campus / Digital Delivery';
        const endHour = execMode === 'OFFLINE' && $('jobEndHour') ? Number($('jobEndHour').value) : 16;

        const res = await apiRequest('/api/v1/gigs/create-and-lock', {
          method: 'POST',
          body: {
            poster_id: state.currentUser.user_id,
            poster_type: state.currentUser.role,
            title: $('jobTitle').value,
            description: $('jobDescription').value,
            track_category: cat,
            custom_category_label: customCat,
            execution_mode: execMode,
            corridor_cluster: $('jobCorridor').value,
            venue_label: venue,
            scheduled_end_hour: endHour,
            payout_inr: Number($('jobPayout').value),
            is_public_venue: true,
            allow_morung_squad: true,
            revisions_left: 3,
            criteria_1: $('jobCrit1').value,
            criteria_2: $('jobCrit2').value,
            criteria_3: $('jobCrit3').value
          }
        });
        notifyOtherTabs('GIG_CREATED');
        showToast('JOB CREATED (ACTIVE)', `Published ${res.gig_id} (${execMode}) and locked ₹${$('jobPayout').value}.`);
        createJobForm.reset();
        window.toggleOfflineJobFields();
        window.toggleCustomCategoryField();
        state.activeView = 'poster-feed';
        await refreshWorkspaceData();
      } catch (err) {
        showToast(err.code || 'ERR-MG-2001', err.detail || 'Could not create job');
      }
    });
  }

  // Student Search, Mode & Corridor Filter
  if ($('studentSearchInput')) {
    $('studentSearchInput').addEventListener('input', renderStudentFeedView);
  }
  if ($('studentModeFilter')) {
    $('studentModeFilter').addEventListener('change', renderStudentFeedView);
  }
  if ($('studentCorridorSelect')) {
    $('studentCorridorSelect').addEventListener('change', async (e) => {
      state.studentCorridor = e.target.value;
      await refreshWorkspaceData();
    });
  }

  // Close Job Modal
  if ($('closeJobModalBtn')) {
    $('closeJobModalBtn').addEventListener('click', () => $('jobDetailModal').classList.add('hidden'));
  }

  checkSessionAndLoad();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
