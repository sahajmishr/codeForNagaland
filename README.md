# MorungGig | SkillBridge NL — End-to-End Platform

**Campus Micro-Apprenticeship, Anti-Theft Watermarked Delivery Vault & Nodal UPI Task Exchange for Nagaland**  
*Built in strict 100% compliance with `SRS-MG-NL-2026-IEEE830-V2.0` & `SDD-MG-NL-2026-V1.0`.*

---

## 1. Quick Start & Running the Full-Stack Application

```bash
cd /home/user/morunggig
npm install
npm test            # Runs all automated E2E QA tests (TC-01 through TC-30)
npm run db:migrate  # Runs PostgreSQL / Local ACID schema migration & seed
npm start           # Starts Fastify server on http://0.0.0.0:3000
```

---

## 2. Connecting Your External Neon PostgreSQL & Google OAuth 2.0 Credentials

You can connect your **Neon PostgreSQL (`DATABASE_URL`)** and **Google OAuth (`GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET`)** in two ways:

### Method A: Directly From the Live Web UI (Zero Restart Required)
1. Click **`[Cloud & OAuth]`** in the top navigation bar.
2. Paste your Neon connection string (`postgresql://user:pass@ep-xyz.aws.neon.tech/neondb?sslmode=require`), `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET`.
3. Click **`[Save, Connect Neon DB & Run Migrations]`** — the server immediately connects to Neon PostgreSQL, executes `db/schema.sql` (`users`, `gigs`, `escrow_ledger`, `skill_credentials`, `audit_logs`, `notifications_outbox`, plus `pg_trgm` GIN indexes), and syncs all records live.

### Method B: Via `.env` File
Edit `/home/user/morunggig/.env`:
```env
PORT=3000
HOST=0.0.0.0
DATABASE_URL=postgresql://your_user:your_pass@ep-your-host.aws.neon.tech/neondb?sslmode=require
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/v1/auth/google/callback
```
*(When `DATABASE_URL` is left blank, MorungGig automatically uses its built-in persistent local ACID store in `data/morunggig_store.json` so it works 100% out of the box).*

---

## 3. Complete SRS & SDD Feature Verification Matrix

| Module | Implemented Business Logic & Endpoints |
| :--- | :--- |
| **Module 1: Identity, Privacy & Anti-Scam (`FR-IAM-01..05`)** | • Salted SHA-256 Student Roll No hashing: `SHA256(UPPER(college_code) + ":" + TRIM(roll_number) + ":MG_SALT_2026")`<br>• Duplicate Roll No rejection (`409 ERR-MG-1001`)<br>• Masked phone relay (`+91-8794-XX-4912`) prior to contract assignment<br>• Dual-track Business (`POSTER_BUSINESS`) & Household (`POSTER_INDIVIDUAL`) onboarding<br>• First-Time Household (`<2` gigs) Public-Venue / Morung Squad guardrail (`403 ERR-MG-1004`)<br>• Anti-Scam Fee Solicitation Regex Firewall (`422 ERR-MG-1005`) |
| **Module 2: 30-Second Gig Creation (`FR-GIG-01..05`)** | • 6 One-Tap Naga Task Presets (`<100ms` population)<br>• Nagamese & English Voice-to-Task NLP Parser (`POST /api/v1/gigs/voice-parse`)<br>• Nagaland Student Fair-Rate Floor validator (`422 ERR-MG-2001`)<br>• Immutable 3-Checkbox Acceptance Scope Lock (`ERR-MG-2002`)<br>• Sunday & 4:30 PM / 17:00 IST Winter Curfew schedule validator (`422 ERR-MG-2003`) |
| **Module 3: Timetable Matching, Net-Fare & Squads (`FR-MAT-01..05`)** | • 5×5 Nagaland Campus Corridor Shared-Auto Fare Matrix (`DR-NAG-03`) & Net-Take-Home Calculator (`Gross - Auto Fare`) + Inter-District NH-29 alert<br>• Class-Timetable Slot Filter & Penalty-Free Exam / Hornbill Freeze Toggle (`DR-NAG-08`)<br>• Zero-Resume Top-3 Composite Ranking ($M(s,g)$ formula, `Section 3.6.1`)<br>• 2-Person Morung Squad (`70%` Senior Lead / `30%` Junior Apprentice split)<br>• 20% Early Checkpoint & Standby Buddy Auto-Handover |
| **Module 4: Nodal UPI Escrow Ledger (`FR-ESC-01..03`)** | • 100% Upfront Nodal UPI Escrow Lock (`POST /api/v1/gigs/create-and-lock`)<br>• Community-First Tiered Fee (`0%` for $\le ₹500$; `5%` for $> ₹500$ paid by Poster, `0%` deducted from Student)<br>• Cryptographic `HMAC-SHA256` Payment Webhook (`POST /api/v1/webhooks/payments`) with `crypto.timingSafeEqual` & 300s replay window<br>• Atomic idempotent Solo & 70/30 Squad Split Settlement (`POST /api/v1/escrow/:gigId/settle`) |
| **Module 5: Anti-Theft Watermarked Vault & Dual-PIN (`FR-VLT-01..05`)** | • HTML5 2D Canvas `-30°` Repeating Diagonal Watermarked Preview + Blurred Spreadsheet Rows (`rows > 5`)<br>• Strict ABAC Raw Master File Gate (`GET /api/v1/vault/:gigId/raw-file` blocks Poster with `403 ERR-MG-4003` until settled)<br>• Hard Revision Counter (`Max 2 Revisions`, blocks 3rd with `403 ERR-MG-4002`, supports `+₹150` Extra-Scope Top-Up)<br>• Cryptographic Dual 4-Digit PIN Handshake (`START_PIN` & `COMPLETE_PIN`) for offline gigs<br>• 1-Tap ANCSU / Student Union Welfare Safety SOS Beacon (`DR-NAG-12`) |
| **Module 6 & 7: 36h Auto-Release, 60s EDC Arbitration & QR Skill Passport (`FR-ARB`, `FR-PAS`)** | • 36-Hour Anti-Ghosting Smart Auto-Release Timer + 1-Click Expiry Simulator<br>• 60-Second YouthNet EDC Nodal Officer 3-Checkbox Arbitrator (`100% Student`, `50/50 Split`, `100% Poster Refund`)<br>• Automatic Co-Branded YouthNet EDC & College QR Skill Credential Minter (`MG-CRED-2026-XXXX`) with inline SVG QR & Printable Certificate |
