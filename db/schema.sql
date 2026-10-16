-- ============================================================================
-- MORUNGGIG (SKILLBRIDGE NL) — NORMALIZED RELATIONAL SCHEMA (POSTGRESQL 16)
-- Compliant with SRS Section 3.5 & SDD Section 2.4 + Live Production Auth & Lifecycle
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS users (
    user_id                  VARCHAR(32) PRIMARY KEY,
    role                     VARCHAR(24) NOT NULL CHECK (role IN ('STUDENT', 'POSTER_BUSINESS', 'POSTER_INDIVIDUAL', 'EDC_ARBITRATOR')),
    full_name                VARCHAR(100) NOT NULL,
    email                    VARCHAR(120),
    password_hash            VARCHAR(128),
    google_sub               VARCHAR(80),
    institution_or_org       VARCHAR(120) NOT NULL,
    stream_or_sector         VARCHAR(80) NOT NULL,
    corridor_cluster         VARCHAR(40) NOT NULL CHECK (corridor_cluster IN ('SOVIMA_6MILE', 'CHUMOUKEDIMA', 'DIMAPUR_TOWN', 'KOHIMA_TOWN', 'JOTSOMA_MERIEMA')),
    kyc_id_hash              CHAR(64) NOT NULL UNIQUE,
    upi_vpa                  VARCHAR(80) NOT NULL,
    masked_phone             VARCHAR(20) NOT NULL,
    contact_phone            VARCHAR(20),
    trust_score              DECIMAL(4,1) NOT NULL DEFAULT 98.0 CHECK (trust_score BETWEEN 0.0 AND 100.0),
    completed_gigs_cnt       INT NOT NULL DEFAULT 0,
    wallet_balance_inr       INT NOT NULL DEFAULT 0,
    exam_freeze_active       BOOLEAN NOT NULL DEFAULT FALSE,
    nda_accepted             BOOLEAN NOT NULL DEFAULT FALSE,
    availability_status      VARCHAR(24) NOT NULL DEFAULT 'FREE',
    bio                      TEXT NOT NULL DEFAULT '',
    avg_rating               DECIMAL(3,2) NOT NULL DEFAULT 5.00,
    ratings_count            INT NOT NULL DEFAULT 1,
    reviews_json             TEXT NOT NULL DEFAULT '[]',
    proficiencies_json       TEXT NOT NULL DEFAULT '[]',
    wallet_transactions_json TEXT NOT NULL DEFAULT '[]',
    free_slots_json          TEXT NOT NULL DEFAULT '[]',
    skills_json              TEXT NOT NULL DEFAULT '[]',
    created_at               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Safe idempotent column additions for existing Neon PostgreSQL deployments
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(128);
ALTER TABLE users ADD COLUMN IF NOT EXISTS availability_status VARCHAR(24) NOT NULL DEFAULT 'FREE';
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS avg_rating DECIMAL(3,2) NOT NULL DEFAULT 5.00;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ratings_count INT NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reviews_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE users ADD COLUMN IF NOT EXISTS proficiencies_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_transactions_json TEXT NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS gigs (
    gig_id               VARCHAR(32) PRIMARY KEY,
    poster_id            VARCHAR(32) NOT NULL REFERENCES users(user_id),
    poster_type          VARCHAR(24) NOT NULL CHECK (poster_type IN ('POSTER_BUSINESS', 'POSTER_INDIVIDUAL')),
    title                VARCHAR(140) NOT NULL,
    description          TEXT NOT NULL DEFAULT '',
    portfolio_title      VARCHAR(140) NOT NULL,
    track_category       VARCHAR(32) NOT NULL CHECK (track_category IN ('COMMERCE_OPS', 'CONTENT_REELS', 'EVENTS_STALLS', 'LANGUAGE_TUTOR', 'DIGITAL_TECH', 'OTHER_CUSTOM')),
    custom_category_label VARCHAR(120) NOT NULL DEFAULT '',
    execution_mode       VARCHAR(16) NOT NULL CHECK (execution_mode IN ('DIGITAL', 'OFFLINE')),
    corridor_cluster     VARCHAR(40) NOT NULL CHECK (corridor_cluster IN ('SOVIMA_6MILE', 'CHUMOUKEDIMA', 'DIMAPUR_TOWN', 'KOHIMA_TOWN', 'JOTSOMA_MERIEMA')),
    venue_label          VARCHAR(140) NOT NULL,
    is_public_venue      BOOLEAN NOT NULL DEFAULT TRUE,
    is_church_event      BOOLEAN NOT NULL DEFAULT FALSE,
    scheduled_day        VARCHAR(20) NOT NULL DEFAULT 'SATURDAY',
    scheduled_end_hour   INT NOT NULL DEFAULT 16,
    payout_inr           INT NOT NULL CHECK (payout_inr >= 300),
    platform_fee_inr     INT NOT NULL DEFAULT 0,
    extra_scope_topup_inr INT NOT NULL DEFAULT 0,
    duration_label       VARCHAR(60) NOT NULL,
    required_slot        VARCHAR(40) NOT NULL,
    language_tag         VARCHAR(40) NOT NULL DEFAULT 'English / Nagamese',
    requires_nda         BOOLEAN NOT NULL DEFAULT FALSE,
    criteria_1           VARCHAR(200) NOT NULL,
    criteria_2           VARCHAR(200) NOT NULL,
    criteria_3           VARCHAR(200) NOT NULL,
    allow_morung_squad   BOOLEAN NOT NULL DEFAULT TRUE,
    state                VARCHAR(32) NOT NULL CHECK (state IN (
                             'DRAFT', 'ESCROW_LOCKED', 'ASSIGNED_DIGITAL', 'ASSIGNED_OFFLINE',
                             'CHECKPOINT_VERIFIED', 'IN_PROGRESS_ONSITE', 'DELIVERED_VAULT',
                             'DISPUTED_EDC', 'SETTLED', 'AUTO_RELEASED', 'REFUNDED'
                         )),
    lifecycle_status     VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
    applicants_json      TEXT NOT NULL DEFAULT '[]',
    execution_type       VARCHAR(24) NOT NULL DEFAULT 'SOLO' CHECK (execution_type IN ('SOLO', 'MORUNG_SQUAD_70_30')),
    assigned_lead_id     VARCHAR(32) REFERENCES users(user_id),
    assigned_junior_id   VARCHAR(32) REFERENCES users(user_id),
    standby_buddy_id     VARCHAR(32) REFERENCES users(user_id),
    checkpoint_note      TEXT,
    checkpoint_at        TIMESTAMPTZ,
    revisions_left       INT NOT NULL DEFAULT 3 CHECK (revisions_left BETWEEN 0 AND 10),
    max_tweaks           INT NOT NULL DEFAULT 3,
    revision_notes_json  TEXT NOT NULL DEFAULT '[]',
    start_pin            CHAR(4),
    complete_pin         CHAR(4),
    safety_beacon_active BOOLEAN NOT NULL DEFAULT FALSE,
    onsite_started_at    TIMESTAMPTZ,
    vault_payload_json   TEXT,
    dispute_reason       VARCHAR(250),
    disputed_checkbox    INT,
    rating_score         INT,
    rating_feedback      TEXT,
    rated_at             TIMESTAMPTZ,
    auto_release_at      TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE gigs ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE gigs ADD COLUMN IF NOT EXISTS custom_category_label VARCHAR(120) NOT NULL DEFAULT '';
ALTER TABLE gigs ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE gigs ADD COLUMN IF NOT EXISTS applicants_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE gigs ADD COLUMN IF NOT EXISTS max_tweaks INT NOT NULL DEFAULT 3;
ALTER TABLE gigs ADD COLUMN IF NOT EXISTS rating_score INT;
ALTER TABLE gigs ADD COLUMN IF NOT EXISTS rating_feedback TEXT;
ALTER TABLE gigs ADD COLUMN IF NOT EXISTS rated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS escrow_ledger (
    escrow_id            VARCHAR(32) PRIMARY KEY,
    gig_id               VARCHAR(32) NOT NULL UNIQUE REFERENCES gigs(gig_id),
    utr_reference        VARCHAR(40) NOT NULL UNIQUE,
    locked_payout_inr    INT NOT NULL,
    platform_fee_inr     INT NOT NULL,
    lead_payout_inr      INT NOT NULL,
    junior_payout_inr    INT NOT NULL DEFAULT 0,
    poster_refund_inr    INT NOT NULL DEFAULT 0,
    status               VARCHAR(32) NOT NULL CHECK (status IN (
                             'LOCKED', 'SETTLED_SOLO', 'SETTLED_SQUAD_70_30',
                             'AUTO_RELEASED_36H', 'ARBITRATED_50_50', 'REFUNDED_POSTER'
                         )),
    webhook_event_id     VARCHAR(64),
    locked_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    settled_at           TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS skill_credentials (
    credential_id        VARCHAR(32) PRIMARY KEY,
    gig_id               VARCHAR(32) NOT NULL REFERENCES gigs(gig_id),
    student_id           VARCHAR(32) NOT NULL REFERENCES users(user_id),
    student_name         VARCHAR(100) NOT NULL,
    institution          VARCHAR(120) NOT NULL,
    role_badge           VARCHAR(40) NOT NULL,
    portfolio_title      VARCHAR(140) NOT NULL,
    skill_pillar         VARCHAR(80) NOT NULL DEFAULT 'Applied Enterprise & Digital Operations',
    client_org           VARCHAR(120) NOT NULL,
    payout_earned_inr    INT NOT NULL,
    qr_verification_hash CHAR(64) NOT NULL,
    issued_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    log_id               SERIAL PRIMARY KEY,
    gig_id               VARCHAR(32) NOT NULL,
    actor_id             VARCHAR(32) NOT NULL,
    from_state           VARCHAR(32) NOT NULL,
    to_state             VARCHAR(32) NOT NULL,
    action_summary       VARCHAR(200) NOT NULL,
    utr_or_hash          VARCHAR(64),
    logged_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications_outbox (
    notification_id      VARCHAR(40) PRIMARY KEY,
    recipient_id         VARCHAR(32) NOT NULL,
    gig_id               VARCHAR(32),
    channel              VARCHAR(24) NOT NULL DEFAULT 'WHATSAPP_INAPP',
    title                VARCHAR(160) NOT NULL,
    message              TEXT NOT NULL,
    whatsapp_uri         TEXT,
    is_read              BOOLEAN NOT NULL DEFAULT FALSE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gigs_corridor_state ON gigs(corridor_cluster, state, track_category);
CREATE INDEX IF NOT EXISTS idx_gigs_auto_release ON gigs(state, auto_release_at) WHERE state = 'DELIVERED_VAULT';
CREATE INDEX IF NOT EXISTS idx_users_role_corridor ON users(role, corridor_cluster, exam_freeze_active);
CREATE INDEX IF NOT EXISTS idx_gigs_title_trgm ON gigs USING GIN (title gin_trgm_ops);
