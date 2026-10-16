/**
 * MORUNGGIG (SKILLBRIDGE NL) — DUAL-MODE ACID RELATIONAL PERSISTENCE ENGINE
 * - Mode 1: External Neon PostgreSQL (`pg.Pool`) when `DATABASE_URL` is configured
 * - Mode 2: Built-in Persistent Transactional Store (`data/morunggig_store.json`) with automatic sync
 * Supports live hot-swapping of Neon `DATABASE_URL` and Google OAuth credentials from the UI or `.env`!
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { buildInitialSeedState } = require('./seed.data');

const DATA_DIR = path.join(__dirname, '../../data');
const STORE_FILE = path.join(DATA_DIR, 'morunggig_store.json');
const RUNTIME_CONFIG_FILE = path.join(DATA_DIR, 'runtime_config.json');
const SCHEMA_SQL_FILE = path.join(__dirname, '../../db/schema.sql');

class MorungDatabase {
  constructor() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    this.pgPool = null;
    this.pgConnected = false;
    this.pgLastError = null;
    this.pgServerVersion = null;
    this.runtimeConfig = this.loadRuntimeConfig();
    this.state = this.loadOrInitLocalState();
  }

  loadRuntimeConfig() {
    const base = {
      databaseUrl: process.env.DATABASE_URL || '',
      googleClientId: process.env.GOOGLE_CLIENT_ID || '',
      googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || ''
    };
    if (fs.existsSync(RUNTIME_CONFIG_FILE)) {
      try {
        const saved = JSON.parse(fs.readFileSync(RUNTIME_CONFIG_FILE, 'utf8'));
        return {
          databaseUrl: saved.databaseUrl || base.databaseUrl,
          googleClientId: saved.googleClientId || base.googleClientId,
          googleClientSecret: saved.googleClientSecret || base.googleClientSecret,
          googleRedirectUri: saved.googleRedirectUri || base.googleRedirectUri
        };
      } catch {
        return base;
      }
    }
    return base;
  }

  saveRuntimeConfig(newConfig) {
    this.runtimeConfig = {
      ...this.runtimeConfig,
      ...newConfig
    };
    fs.writeFileSync(RUNTIME_CONFIG_FILE, JSON.stringify(this.runtimeConfig, null, 2), 'utf8');

    // Also update .env file so CLI and restarts inherit it seamlessly
    try {
      const envPath = path.join(__dirname, '../../.env');
      const envLines = [
        `PORT=${process.env.PORT || 3000}`,
        `HOST=${process.env.HOST || '0.0.0.0'}`,
        `NODE_ENV=${process.env.NODE_ENV || 'development'}`,
        `LOG_LEVEL=${process.env.LOG_LEVEL || 'info'}`,
        `DATABASE_URL=${this.runtimeConfig.databaseUrl || ''}`,
        `GOOGLE_CLIENT_ID=${this.runtimeConfig.googleClientId || ''}`,
        `GOOGLE_CLIENT_SECRET=${this.runtimeConfig.googleClientSecret || ''}`,
        `GOOGLE_REDIRECT_URI=${this.runtimeConfig.googleRedirectUri || ''}`,
        `MG_SALT_2026=${process.env.MG_SALT_2026 || 'MG_SALT_2026_NAGALAND_CAMPUS_EXCHANGE'}`,
        `JWT_SECRET=${process.env.JWT_SECRET || 'mg_nl_2026_stateless_jwt_secret_key_994821048'}`,
        `WEBHOOK_HMAC_SECRET=${process.env.WEBHOOK_HMAC_SECRET || 'mg_nl_2026_razorpay_nodal_webhook_hmac_secret'}`
      ];
      fs.writeFileSync(envPath, envLines.join('\n') + '\n', 'utf8');
    } catch {
      // Ignore if read-only
    }
  }

  loadOrInitLocalState() {
    if (fs.existsSync(STORE_FILE)) {
      try {
        const raw = fs.readFileSync(STORE_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.users) && Array.isArray(parsed.gigs)) {
          return parsed;
        }
      } catch {
        // Fallback to fresh seed
      }
    }
    const seed = buildInitialSeedState();
    this.persistLocalState(seed);
    return seed;
  }

  persistLocalState(stateObj = this.state) {
    const tmpFile = `${STORE_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(stateObj, null, 2), 'utf8');
    fs.renameSync(tmpFile, STORE_FILE);
  }

  resetToSeed() {
    const seed = buildInitialSeedState();
    this.state = seed;
    this.persistLocalState(seed);
    if (this.pgConnected && this.pgPool) {
      this.syncLocalStateToPostgres().catch(() => {});
    }
    return this.state;
  }

  /**
   * Initialize or reconnect to External Neon PostgreSQL (`DATABASE_URL`)
   */
  async initPostgres(customUrl) {
    const dbUrl = (customUrl !== undefined ? customUrl : this.runtimeConfig.databaseUrl || '').trim();
    if (!dbUrl) {
      this.pgConnected = false;
      this.pgLastError = null;
      return { connected: false, mode: 'LOCAL_PERSISTENT_ACID_STORE' };
    }

    if (this.pgPool) {
      try {
        await this.pgPool.end();
      } catch {
        // ignore
      }
      this.pgPool = null;
    }

    try {
      const needsSsl = dbUrl.includes('neon.tech') || dbUrl.includes('sslmode=require') || dbUrl.includes('supabase');
      const pool = new Pool({
        connectionString: dbUrl,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        ssl: needsSsl ? { rejectUnauthorized: false } : undefined
      });

      const client = await pool.connect();
      try {
        const verRes = await client.query('SELECT version()');
        this.pgServerVersion = verRes.rows[0]?.version || 'PostgreSQL';

        // Run DDL schema migration
        if (fs.existsSync(SCHEMA_SQL_FILE)) {
          const ddl = fs.readFileSync(SCHEMA_SQL_FILE, 'utf8');
          await client.query(ddl);
        }
      } finally {
        client.release();
      }

      this.pgPool = pool;
      this.pgConnected = true;
      this.pgLastError = null;

      // Sync current state to Neon PostgreSQL or pull if Neon already has data
      await this.reconcileWithPostgres();

      return {
        connected: true,
        mode: 'NEON_POSTGRESQL_LIVE',
        serverVersion: this.pgServerVersion
      };
    } catch (err) {
      this.pgConnected = false;
      this.pgLastError = err.message;
      return {
        connected: false,
        mode: 'LOCAL_PERSISTENT_ACID_STORE',
        error: err.message
      };
    }
  }

  async reconcileWithPostgres() {
    if (!this.pgConnected || !this.pgPool) return;
    const client = await this.pgPool.connect();
    try {
      const countRes = await client.query('SELECT COUNT(*)::int AS cnt FROM users');
      const existingUsers = countRes.rows[0]?.cnt || 0;
      if (existingUsers === 0) {
        await this.syncLocalStateToPostgres(client);
      } else {
        await this.pullStateFromPostgres(client);
      }
    } finally {
      client.release();
    }
  }

  async pullStateFromPostgres(externalClient = null) {
    if (!this.pgConnected || !this.pgPool) return;
    const client = externalClient || (await this.pgPool.connect());
    try {
      const [uRes, gRes, eRes, cRes, aRes, nRes] = await Promise.all([
        client.query('SELECT * FROM users ORDER BY created_at ASC'),
        client.query('SELECT * FROM gigs ORDER BY created_at DESC'),
        client.query('SELECT * FROM escrow_ledger ORDER BY locked_at DESC'),
        client.query('SELECT * FROM skill_credentials ORDER BY issued_at DESC'),
        client.query('SELECT * FROM audit_logs ORDER BY log_id DESC LIMIT 200'),
        client.query('SELECT * FROM notifications_outbox ORDER BY created_at DESC LIMIT 100')
      ]);

      this.state.users = uRes.rows.map((r) => ({ ...r, trust_score: Number(r.trust_score) }));
      this.state.gigs = gRes.rows;
      this.state.escrow_ledger = eRes.rows;
      this.state.skill_credentials = cRes.rows;
      this.state.audit_logs = aRes.rows;
      this.state.notifications_outbox = nRes.rows;
      this.persistLocalState();
    } finally {
      if (!externalClient) client.release();
    }
  }

  async syncLocalStateToPostgres(externalClient = null) {
    if (!this.pgConnected || !this.pgPool) return;
    const client = externalClient || (await this.pgPool.connect());
    try {
      await client.query('BEGIN');

      for (const u of this.state.users) {
        await client.query(
          `INSERT INTO users (
            user_id, role, full_name, email, google_sub, institution_or_org, stream_or_sector,
            corridor_cluster, kyc_id_hash, upi_vpa, masked_phone, contact_phone, trust_score,
            completed_gigs_cnt, wallet_balance_inr, exam_freeze_active, nda_accepted, free_slots_json, skills_json, created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
          ON CONFLICT (user_id) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            email = EXCLUDED.email,
            google_sub = EXCLUDED.google_sub,
            corridor_cluster = EXCLUDED.corridor_cluster,
            trust_score = EXCLUDED.trust_score,
            completed_gigs_cnt = EXCLUDED.completed_gigs_cnt,
            wallet_balance_inr = EXCLUDED.wallet_balance_inr,
            exam_freeze_active = EXCLUDED.exam_freeze_active,
            nda_accepted = EXCLUDED.nda_accepted,
            free_slots_json = EXCLUDED.free_slots_json,
            skills_json = EXCLUDED.skills_json`,
          [
            u.user_id, u.role, u.full_name, u.email || null, u.google_sub || null,
            u.institution_or_org, u.stream_or_sector, u.corridor_cluster, u.kyc_id_hash,
            u.upi_vpa, u.masked_phone, u.contact_phone || null, Number(u.trust_score),
            Number(u.completed_gigs_cnt), Number(u.wallet_balance_inr), Boolean(u.exam_freeze_active),
            Boolean(u.nda_accepted), u.free_slots_json, u.skills_json, u.created_at || new Date().toISOString()
          ]
        );
      }

      for (const g of this.state.gigs) {
        await client.query(
          `INSERT INTO gigs (
            gig_id, poster_id, poster_type, title, portfolio_title, track_category, execution_mode,
            corridor_cluster, venue_label, is_public_venue, is_church_event, scheduled_day, scheduled_end_hour,
            payout_inr, platform_fee_inr, extra_scope_topup_inr, duration_label, required_slot, language_tag,
            requires_nda, criteria_1, criteria_2, criteria_3, allow_morung_squad, state, execution_type,
            assigned_lead_id, assigned_junior_id, standby_buddy_id, checkpoint_note, checkpoint_at,
            revisions_left, revision_notes_json, start_pin, complete_pin, safety_beacon_active,
            onsite_started_at, vault_payload_json, dispute_reason, disputed_checkbox, auto_release_at, created_at
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
            $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42
          )
          ON CONFLICT (gig_id) DO UPDATE SET
            state = EXCLUDED.state,
            execution_type = EXCLUDED.execution_type,
            assigned_lead_id = EXCLUDED.assigned_lead_id,
            assigned_junior_id = EXCLUDED.assigned_junior_id,
            standby_buddy_id = EXCLUDED.standby_buddy_id,
            checkpoint_note = EXCLUDED.checkpoint_note,
            checkpoint_at = EXCLUDED.checkpoint_at,
            revisions_left = EXCLUDED.revisions_left,
            revision_notes_json = EXCLUDED.revision_notes_json,
            start_pin = EXCLUDED.start_pin,
            complete_pin = EXCLUDED.complete_pin,
            safety_beacon_active = EXCLUDED.safety_beacon_active,
            onsite_started_at = EXCLUDED.onsite_started_at,
            vault_payload_json = EXCLUDED.vault_payload_json,
            dispute_reason = EXCLUDED.dispute_reason,
            disputed_checkbox = EXCLUDED.disputed_checkbox,
            auto_release_at = EXCLUDED.auto_release_at,
            extra_scope_topup_inr = EXCLUDED.extra_scope_topup_inr`,
          [
            g.gig_id, g.poster_id, g.poster_type, g.title, g.portfolio_title, g.track_category, g.execution_mode,
            g.corridor_cluster, g.venue_label, Boolean(g.is_public_venue), Boolean(g.is_church_event),
            g.scheduled_day || 'SATURDAY', Number(g.scheduled_end_hour ?? 16), Number(g.payout_inr),
            Number(g.platform_fee_inr), Number(g.extra_scope_topup_inr || 0), g.duration_label, g.required_slot,
            g.language_tag || 'English / Nagamese', Boolean(g.requires_nda), g.criteria_1, g.criteria_2, g.criteria_3,
            Boolean(g.allow_morung_squad), g.state, g.execution_type || 'SOLO', g.assigned_lead_id || null,
            g.assigned_junior_id || null, g.standby_buddy_id || null, g.checkpoint_note || null,
            g.checkpoint_at || null, Number(g.revisions_left ?? 2), g.revision_notes_json || '[]',
            g.start_pin || null, g.complete_pin || null, Boolean(g.safety_beacon_active),
            g.onsite_started_at || null, g.vault_payload_json || null, g.dispute_reason || null,
            g.disputed_checkbox || null, g.auto_release_at || null, g.created_at || new Date().toISOString()
          ]
        );
      }

      for (const e of this.state.escrow_ledger) {
        await client.query(
          `INSERT INTO escrow_ledger (
            escrow_id, gig_id, utr_reference, locked_payout_inr, platform_fee_inr,
            lead_payout_inr, junior_payout_inr, poster_refund_inr, status, webhook_event_id, locked_at, settled_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          ON CONFLICT (escrow_id) DO UPDATE SET
            lead_payout_inr = EXCLUDED.lead_payout_inr,
            junior_payout_inr = EXCLUDED.junior_payout_inr,
            poster_refund_inr = EXCLUDED.poster_refund_inr,
            status = EXCLUDED.status,
            settled_at = EXCLUDED.settled_at`,
          [
            e.escrow_id, e.gig_id, e.utr_reference, Number(e.locked_payout_inr), Number(e.platform_fee_inr),
            Number(e.lead_payout_inr), Number(e.junior_payout_inr), Number(e.poster_refund_inr),
            e.status, e.webhook_event_id || null, e.locked_at || new Date().toISOString(), e.settled_at || null
          ]
        );
      }

      for (const c of this.state.skill_credentials) {
        await client.query(
          `INSERT INTO skill_credentials (
            credential_id, gig_id, student_id, student_name, institution, role_badge,
            portfolio_title, skill_pillar, client_org, payout_earned_inr, qr_verification_hash, issued_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          ON CONFLICT (credential_id) DO NOTHING`,
          [
            c.credential_id, c.gig_id, c.student_id, c.student_name, c.institution, c.role_badge,
            c.portfolio_title, c.skill_pillar || 'YouthNet EDC Pillar', c.client_org,
            Number(c.payout_earned_inr), c.qr_verification_hash, c.issued_at || new Date().toISOString()
          ]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      if (!externalClient) client.release();
    }
  }

  async commitMutation() {
    this.persistLocalState();
    if (this.pgConnected && this.pgPool) {
      try {
        await this.syncLocalStateToPostgres();
      } catch (err) {
        this.pgLastError = err.message;
      }
    }
  }

  getConnectionStatus() {
    const hasGoogleOAuth = Boolean(this.runtimeConfig.googleClientId && this.runtimeConfig.googleClientSecret);
    return {
      dbMode: this.pgConnected ? 'NEON_POSTGRESQL_LIVE' : 'LOCAL_PERSISTENT_ACID_STORE',
      neonConnected: this.pgConnected,
      neonConfigured: Boolean(this.runtimeConfig.databaseUrl),
      neonServerVersion: this.pgServerVersion,
      neonLastError: this.pgLastError,
      googleOAuthConfigured: hasGoogleOAuth,
      googleClientIdPreview: this.runtimeConfig.googleClientId
        ? `${this.runtimeConfig.googleClientId.slice(0, 12)}...`
        : null
    };
  }

  async close() {
    if (this.pgPool) {
      await this.pgPool.end();
      this.pgPool = null;
      this.pgConnected = false;
    }
  }
}

const db = new MorungDatabase();

module.exports = { db, MorungDatabase };
