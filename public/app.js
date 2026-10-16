/**
 * MORUNGGIG — PRODUCTION MULTI-USER FRONTEND CONTROLLER
 * Implements:
 *  - Persistent Login, Sign Up, Sessions & Cookies (No auto-login / no auto-assign to Toshi Ao)
 *  - Click-to-Expand Job Description Modal & Student Application Flow
 *  - Poster Applicant Review & Assignment -> System-Maintained Job Status (`ACTIVE` -> `ASSIGNED` -> `DELETED`)
 *  - System-Maintained Student Availability (`FREE` <-> `OFFLINE` user-toggled; `WORKING` system-locked)
 *  - Profile & Wallet Tab with Locked Escrow -> Balance Credit & Mock Withdrawal
 *  - Strict Ownership & Role Isolation (`STUDENT` vs `POSTER_*`)
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

const state = {
  config: null,
  users: [],
  gigs: [],
  telemetry: null,
  currentUser: null,
  accessToken: safeGet('MG_SESSION_TOKEN', ''),
  activeView: 'student-feed',
  posterFilter: 'ALL',
  studentCorridor: 'SOVIMA_6MILE'
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

function isPosterRole(user) {
  return user && (user.role === 'POSTER_BUSINESS' || user.role === 'POSTER_INDIVIDUAL');
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

/* ==========================================================================
   SESSION RESTORATION & BOOTSTRAP
   ========================================================================== */

async function checkSessionAndLoad() {
  try {
    // Check URL params for Google OAuth callback redirect
    if (typeof window !== 'undefined' && window.location && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      const oauthUser = params.get('user_id');
      if (oauthUser) {
        const sw = await apiRequest('/api/v1/auth/switch-role', { method: 'POST', body: { user_id: oauthUser } });
        if (sw.data && sw.data.access_token) {
          state.accessToken = sw.data.access_token;
          safeSet('MG_SESSION_TOKEN', state.accessToken);
          state.currentUser = sw.data.user;
        }
      }
    }

    const meRes = await apiRequest('/api/v1/auth/me');
    if (meRes.data && meRes.data.authenticated && meRes.data.user) {
      state.currentUser = meRes.data.user;
      await refreshWorkspaceData();
    } else {
      renderLoggedOutScreen();
    }
  } catch {
    renderLoggedOutScreen();
  }
}

async function refreshWorkspaceData() {
  if (!state.currentUser) {
    renderLoggedOutScreen();
    return;
  }
  const viewerId = state.currentUser.user_id;
  const boot = await apiRequest(
    `/api/v1/bootstrap?student_corridor=${encodeURIComponent(state.studentCorridor)}&viewer_id=${encodeURIComponent(viewerId)}`
  );
  state.config = boot.data.config;
  state.users = boot.data.users;
  state.gigs = boot.data.gigs;
  state.telemetry = boot.data.telemetry;

  const updatedMe = state.users.find((u) => u.user_id === viewerId);
  if (updatedMe) state.currentUser = updatedMe;

  ensureValidViewForRole();
  renderAuthenticatedWorkspace();
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

  const isStu = isStudentRole(u);
  $('headerRoleBadge').textContent = isStu ? 'Student Account' : 'Poster Account';
  $('headerRoleBadge').className = `tag ${isStu ? 'tag-sage' : 'tag-slate'}`;

  // Header Right: User Name, Availability Tag (if Student), Account Balance & Logout
  $('headerRightBox').innerHTML = `
    ${isStu ? getAvailabilityBadgeHtml(u.availability_status) : ''}
    <span class="tag mono">Balance: ₹${Number(u.wallet_balance_inr).toLocaleString('en-IN')}</span>
    <span style="font-size:13px; font-weight:600;">${u.full_name}</span>
    <button type="button" class="btn btn-sm" onclick="window.logoutUser()">Log Out</button>
  `;

  // Role-Isolated Navigation Tabs
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

  // Hide all views, show only active view
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
   STUDENT VIEWS (BROWSE -> CLICK TO READ DESCRIPTION -> APPLY | SUBMIT WORK)
   ========================================================================== */

function renderStudentFeedView() {
  const u = state.currentUser;
  $('pageTitle').textContent = 'Available Campus Jobs';
  $('pageSub').textContent = 'Click any job card to read the full description and requirements before applying.';
  $('pageHeaderRight').innerHTML = `
    <div style="display:flex; gap:8px; align-items:center;">
      <span style="font-size:12.5px; color:var(--text-secondary);">My Status:</span>
      ${getAvailabilityBadgeHtml(u.availability_status)}
    </div>
  `;

  const grid = $('studentFeedGrid');
  if (!grid) return;

  const q = ($('studentSearchInput') ? $('studentSearchInput').value : '').trim().toLowerCase();
  const activeGigs = state.gigs.filter((g) => {
    if (g.lifecycle_status !== 'ACTIVE') return false;
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

      return `
        <article class="job-card clickable" onclick="window.openJobDetailModal('${g.gig_id}')">
          <div>
            <div class="job-top">
              <div>
                <div style="display:flex; gap:6px; align-items:center; margin-bottom:6px;">
                  ${getJobLifecycleBadgeHtml(g.lifecycle_status)}
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

  $('modalJobTrack').textContent = `${g.track_name} • ${g.corridor_label}`;
  $('modalJobTitle').textContent = g.title;
  $('modalJobMeta').textContent = `Posted by ${g.poster ? g.poster.full_name : 'Client'} (${g.poster ? g.poster.institution_or_org : ''}) • Locked Amount: ₹${g.payout_inr}`;

  $('modalJobBody').innerHTML = `
    <div style="background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); padding:14px; margin-bottom:14px;">
      <div style="font-size:12px; font-weight:650; color:var(--text-secondary); margin-bottom:4px;">Full Job Description</div>
      <p style="font-size:13.5px; color:var(--text);">${g.description}</p>
      <div style="font-size:12px; color:var(--text-muted); margin-top:8px;">
        Venue / Delivery: ${g.venue_label} • Turnaround: ${g.duration_label || 'Flexible'}
      </div>
    </div>

    <div style="background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); padding:14px; margin-bottom:16px;">
      <div style="font-size:12px; font-weight:650; color:var(--text-secondary); margin-bottom:8px;">3 Deliverable Requirements</div>
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
              ✓ You have applied for this job. The Poster will review applicants and assign the job.
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
    showToast('APPLICATION SUBMITTED', 'Your application is now visible to the Poster.');
    await refreshWorkspaceData();
  } catch (err) {
    showToast(err.code || 'ERR-MG-APPLY', err.detail || 'Could not submit application');
  }
};

function renderStudentAssignedView() {
  const u = state.currentUser;
  $('pageTitle').textContent = 'My Assigned Work';
  $('pageSub').textContent = 'Jobs assigned to you by Posters. Submit partial or final work here, or quit if you cannot continue.';
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
          Browse open jobs and submit an application. Once a Poster assigns you, the job will appear here and your status will automatically switch to <strong>WORKING</strong>.
        </p>
      </div>
    `;
    return;
  }

  container.innerHTML = myJobs
    .map((g) => {
      const isSettled = g.lifecycle_status === 'DELETED';
      const isDelivered = g.state === 'DELIVERED_VAULT';
      const vp = g.vault_protection;

      return `
        <div class="card">
          <div class="job-top" style="margin-bottom:12px;">
            <div>
              <div style="display:flex; gap:6px; align-items:center; margin-bottom:6px;">
                ${getJobLifecycleBadgeHtml(g.lifecycle_status)}
                <span class="tag mono">${g.gig_id}</span>
              </div>
              <h3 class="job-title">${g.title}</h3>
              <div class="job-meta">Poster: ${g.poster ? g.poster.full_name : 'Client'} • Locked Payout: ₹${g.payout_inr}</div>
            </div>
            ${
              !isSettled
                ? `<button type="button" class="btn btn-clay btn-sm" onclick="window.studentQuitJob('${g.gig_id}')">
                    Quit Job
                  </button>`
                : `<span class="tag tag-sage">✓ Paid ₹${g.payout_inr} to Your Account</span>`
            }
          </div>

          <p style="font-size:13px; color:var(--text-secondary); margin-bottom:12px;">${g.description}</p>

          ${
            !isSettled
              ? `<div style="background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); padding:14px; display:flex; flex-direction:column; gap:12px;">
                  <div>
                    <div style="font-size:12px; font-weight:650; margin-bottom:6px;">
                      1. Partial Progress Update ${g.checkpoint_note ? `<span class="tag tag-sage">Saved</span>` : ''}
                    </div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                      <input type="text" id="partialInput_${g.gig_id}" class="input" style="flex:1;" value="${g.checkpoint_note || ''}" placeholder="Share partial progress note or draft link for the Poster..." />
                      <button type="button" class="btn btn-sm" onclick="window.studentSavePartial('${g.gig_id}')">
                        Save Partial Progress
                      </button>
                    </div>
                  </div>

                  <div style="border-top:1px solid var(--border); padding-top:12px;">
                    <div style="font-size:12px; font-weight:650; margin-bottom:6px;">
                      2. Final Work Submission ${isDelivered ? `<span class="tag tag-sage">Submitted for Settlement</span>` : ''}
                    </div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                      <input type="text" id="finalInput_${g.gig_id}" class="input" style="flex:1;" value="${vp ? vp.deliverable_title : ''}" placeholder="Final deliverable file name or link (e.g. Final_Reels_Pack.mp4)" />
                      <button type="button" class="btn btn-primary btn-sm" onclick="window.studentSubmitFinal('${g.gig_id}')">
                        ${isDelivered ? 'Update Submitted Work' : 'Submit Completed Work'}
                      </button>
                    </div>
                  </div>
                </div>`
              : ''
          }
        </div>
      `;
    })
    .join('');
}

window.studentSavePartial = async function (gigId) {
  try {
    const note = $(`partialInput_${gigId}`) ? $(`partialInput_${gigId}`).value : 'Partial progress updated';
    await apiRequest(`/api/v1/gigs/${encodeURIComponent(gigId)}/checkpoint`, {
      method: 'POST',
      body: { note }
    });
    showToast('PARTIAL PROGRESS SAVED', 'The Poster can now see your partial progress on their job card.');
    await refreshWorkspaceData();
  } catch (err) {
    showToast(err.code || 'ERR-MG-3001', err.detail || 'Could not save partial progress');
  }
};

window.studentSubmitFinal = async function (gigId) {
  try {
    const val = $(`finalInput_${gigId}`) ? $(`finalInput_${gigId}`).value : `${gigId}_Completed.mp4`;
    await apiRequest(`/api/v1/vault/${encodeURIComponent(gigId)}/deliver`, {
      method: 'POST',
      body: {
        deliverable_title: val || `${gigId}_Completed.mp4`,
        preview_summary: val || 'Completed deliverable submitted by student',
        criteria_checked: [true, true, true]
      }
    });
    showToast('WORK SUBMITTED', 'Your completed work is now visible to the Poster for payment settlement.');
    await refreshWorkspaceData();
  } catch (err) {
    showToast(err.code || 'ERR-MG-3001', err.detail || 'Could not submit final work');
  }
};

window.studentQuitJob = async function (gigId) {
  try {
    await apiRequest(`/api/v1/gigs/${encodeURIComponent(gigId)}/quit`, {
      method: 'POST',
      body: { reason: 'Student withdrew from assignment' }
    });
    showToast('JOB QUIT', 'Job returned to ACTIVE and your status is now FREE.');
    await refreshWorkspaceData();
  } catch (err) {
    showToast(err.code || 'ERR-MG-QUIT', err.detail || 'Could not quit job');
  }
};

/* ==========================================================================
   POSTER VIEWS (MY POSTED JOBS: ACTIVE -> APPLICANTS | ASSIGNED -> WORK | DELETED)
   ========================================================================== */

window.setPosterFilter = function (filterVal) {
  state.posterFilter = filterVal;
  renderPosterFeedView();
};

function renderPosterFeedView() {
  const u = state.currentUser;
  $('pageTitle').textContent = 'My Posted Jobs';
  $('pageSub').textContent = 'Job statuses (ACTIVE, ASSIGNED, DELETED) are automatically maintained by the platform lifecycle.';
  $('pageHeaderRight').innerHTML = `
    <button type="button" class="btn btn-primary btn-sm" onclick="window.switchView('poster-create')">+ Post New Job</button>
  `;

  const container = $('posterJobsContainer');
  if (!container) return;

  // Strictly show only jobs owned by this Poster
  const myJobs = state.gigs.filter((g) => {
    if (g.poster_id !== u.user_id) return false;
    if (state.posterFilter !== 'ALL' && g.lifecycle_status !== state.posterFilter) return false;
    return true;
  });

  const freeStudents = state.users.filter((stu) => stu.role === 'STUDENT' && stu.availability_status !== 'OFFLINE');

  if (myJobs.length === 0) {
    container.innerHTML = `
      <div class="card">
        <p style="color:var(--text-secondary);">No jobs found in this status filter. Click <strong>+ Post New Job</strong> to create one.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = myJobs
    .map((g) => {
      const status = g.lifecycle_status;
      const applicants = g.applicants || [];
      const vp = g.vault_protection;

      let statusBodyHtml = '';

      if (status === 'ACTIVE') {
        statusBodyHtml = `
          <div style="background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); padding:14px;">
            <div style="font-size:12.5px; font-weight:650; margin-bottom:10px;">
              Applicants (${applicants.length}) — Choose Who Will Do This Job:
            </div>
            ${
              applicants.length > 0
                ? `<div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;">
                    ${applicants
                      .map(
                        (a) => `
                        <div style="background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-sm); padding:10px 12px; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                          <div>
                            <div style="display:flex; gap:6px; align-items:center;">
                              <strong style="font-size:13.5px;">${a.full_name}</strong>
                              ${getAvailabilityBadgeHtml(a.availability_status)}
                            </div>
                            <div style="font-size:12px; color:var(--text-secondary);">${a.institution} • "${a.pitch_note}"</div>
                          </div>
                          <button type="button" class="btn btn-primary btn-sm" onclick="window.posterAssignApplicant('${g.gig_id}', '${a.student_id}')" ${a.availability_status === 'OFFLINE' ? 'disabled' : ''}>
                            Assign Job to ${a.full_name.split(' ')[0]}
                          </button>
                        </div>
                      `
                      )
                      .join('')}
                  </div>`
                : `<p style="font-size:12.5px; color:var(--text-muted); margin-bottom:12px;">No student applications yet, or assign an available student directly below:</p>`
            }

            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; border-top:1px solid var(--border); padding-top:10px;">
              <span style="font-size:12px; color:var(--text-secondary);">Or select any available student:</span>
              <select id="assignSelect_${g.gig_id}" class="select" style="width:auto; flex:1;">
                ${freeStudents
                  .map(
                    (s) => `
                    <option value="${s.user_id}">
                      ${s.full_name} (${s.institution_or_org}) — [${s.availability_status}]
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
              <div>
                <span style="font-size:12px; color:var(--text-secondary);">Assigned Student:</span>
                <strong style="font-size:14px; margin-left:4px;">${g.lead_student ? g.lead_student.full_name : g.assigned_lead_id}</strong>
                ${g.lead_student ? getAvailabilityBadgeHtml(g.lead_student.availability_status) : ''}
              </div>
              <span class="tag mono">State: ${g.state}</span>
            </div>

            <div style="background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-sm); padding:10px 12px; margin-bottom:12px; font-size:13px;">
              <div style="margin-bottom:6px;">
                <strong>Partial Progress Note:</strong>
                <span style="color:var(--text-secondary);">${g.checkpoint_note || 'No partial checkpoint submitted yet.'}</span>
              </div>
              <div>
                <strong>Submitted Work:</strong>
                <span style="color:var(--text); font-weight:600;">
                  ${vp ? `${vp.deliverable_title} — "${vp.preview_summary}"` : 'Waiting for student to upload final deliverable.'}
                </span>
              </div>
            </div>

            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button type="button" class="btn btn-primary" onclick="window.posterSettleJob('${g.gig_id}')" ${!vp && g.execution_mode === 'DIGITAL' ? 'disabled title="Student must submit work first"' : ''}>
                Approve Work & Settle ₹${g.payout_inr} to Student Account
              </button>
            </div>
          </div>
        `;
      } else {
        statusBodyHtml = `
          <div style="background:var(--clay-bg); color:var(--clay-text); border:1px solid var(--clay-border); border-radius:var(--radius-sm); padding:12px 14px; font-size:13px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;">
            <span>
              <strong>Job Closed & Marked DELETED (Settled)</strong> • ₹${g.payout_inr} credited to ${g.lead_student ? g.lead_student.full_name : 'Assigned Student'}.
            </span>
            <span class="mono" style="font-size:11.5px;">UTR: ${g.escrow_receipt ? g.escrow_receipt.utr_reference : 'SETTLED'}</span>
          </div>
        `;
      }

      return `
        <div class="card">
          <div class="job-top" style="margin-bottom:12px;">
            <div>
              <div style="display:flex; gap:6px; align-items:center; margin-bottom:6px;">
                ${getJobLifecycleBadgeHtml(status)}
                <span class="tag mono">${g.gig_id}</span>
                <span class="tag">${g.track_name}</span>
              </div>
              <h3 class="job-title">${g.title}</h3>
              <div class="job-meta">${g.corridor_label} • Description: ${g.description}</div>
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
    showToast('STUDENT ASSIGNED', 'Job status updated to ASSIGNED and student status set to WORKING.');
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
    if (gig && gig.execution_mode === 'OFFLINE' && gig.state === 'IN_PROGRESS_ONSITE') {
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
    showToast('PAYMENT SETTLED • JOB DELETED', 'Locked amount credited to student balance and job marked DELETED (Settled).');
    await refreshWorkspaceData();
  } catch (err) {
    showToast(err.code || 'ERR-MG-SETTLE', err.detail || 'Could not settle payment');
  }
};

function renderPosterCreateView() {
  $('pageTitle').textContent = 'Create a New Scoped Job';
  $('pageSub').textContent = 'Enter the job title, full description, locked payout amount, and 3 deliverables.';
  $('pageHeaderRight').innerHTML = '';
}

/* ==========================================================================
   PROFILE & WALLET VIEW (AVAILABILITY TOGGLE + MOCK WITHDRAWAL + PROFILE EDIT)
   ========================================================================== */

function renderUserProfileView() {
  const u = state.currentUser;
  const isStu = isStudentRole(u);
  $('pageTitle').textContent = 'My Profile & Wallet';
  $('pageSub').textContent = 'Manage your profile details, availability status, account balance, and mock withdrawals.';
  $('pageHeaderRight').innerHTML = isStu ? getAvailabilityBadgeHtml(u.availability_status) : `<span class="tag tag-slate">${u.role}</span>`;

  const container = $('userProfileContainer');
  if (!container) return;

  const txs = u.wallet_transactions || [];
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
                  <h3 class="job-title">My Availability Status</h3>
                  ${getAvailabilityBadgeHtml(u.availability_status)}
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

      <!-- Right Column: Edit Own Profile Details -->
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
            <label for="profBio">Bio / Summary</label>
            <textarea id="profBio" class="textarea" rows="3">${u.bio || ''}</textarea>
          </div>
          <button type="submit" class="btn btn-primary btn-full">Save Profile Changes</button>
        </form>
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
    showToast('PROFILE SAVED', 'Your profile details have been updated.');
    await refreshWorkspaceData();
  } catch (err) {
    showToast(err.code || 'ERR-MG-PROF', err.detail || 'Could not update profile');
  }
};

/* ==========================================================================
   INITIALIZATION & FORM BINDINGS
   ========================================================================== */

function initApp() {
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

  // Poster Create Job Form
  const createJobForm = $('createJobForm');
  if (createJobForm) {
    createJobForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const res = await apiRequest('/api/v1/gigs/create-and-lock', {
          method: 'POST',
          body: {
            poster_id: state.currentUser.user_id,
            poster_type: state.currentUser.role,
            title: $('jobTitle').value,
            description: $('jobDescription').value,
            track_category: $('jobCategory').value,
            execution_mode: 'DIGITAL',
            corridor_cluster: $('jobCorridor').value,
            venue_label: 'Campus / Digital Delivery',
            payout_inr: Number($('jobPayout').value),
            is_public_venue: true,
            allow_morung_squad: true,
            criteria_1: $('jobCrit1').value,
            criteria_2: $('jobCrit2').value,
            criteria_3: $('jobCrit3').value
          }
        });
        showToast('JOB CREATED (ACTIVE)', `Published ${res.gig_id} and locked ₹${$('jobPayout').value}.`);
        createJobForm.reset();
        state.activeView = 'poster-feed';
        await refreshWorkspaceData();
      } catch (err) {
        showToast(err.code || 'ERR-MG-2001', err.detail || 'Could not create job');
      }
    });
  }

  // Student Search & Corridor Filter
  if ($('studentSearchInput')) {
    $('studentSearchInput').addEventListener('input', renderStudentFeedView);
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
