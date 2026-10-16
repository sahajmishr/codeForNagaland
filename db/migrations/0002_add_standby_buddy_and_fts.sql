-- Migration 0002: Standby Buddy Handover (`FR-MAT-05`), Nodal Escrow Ledger, Credentials & Full-Text Search Indexes
-- SDD Section 4.1 (`db/migrations/0002_add_standby_buddy_and_fts.sql`)

ALTER TABLE gigs ADD COLUMN IF NOT EXISTS standby_buddy_id VARCHAR(32) REFERENCES users(user_id);

CREATE TABLE IF NOT EXISTS escrow_ledger (
    escrow_id           VARCHAR(32) PRIMARY KEY,
    gig_id              VARCHAR(32) NOT NULL UNIQUE REFERENCES gigs(gig_id),
    utr_reference       VARCHAR(48) NOT NULL UNIQUE,
    locked_payout_inr   NUMERIC(10,2) NOT NULL CHECK (locked_payout_inr >= 300.00),
    platform_fee_inr    NUMERIC(10,2) NOT NULL CHECK (platform_fee_inr >= 0.00),
    lead_payout_inr     NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    junior_payout_inr   NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    poster_refund_inr   NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    status              VARCHAR(32) NOT NULL CHECK (status IN (
                            'LOCKED', 'SETTLED_SOLO', 'SETTLED_SQUAD_70_30',
                            'AUTO_RELEASED_36H', 'ARBITRATED_50_50', 'REFUNDED_POSTER'
                        )),
    locked_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    settled_at          TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS skill_credentials (
    credential_id       VARCHAR(32) PRIMARY KEY,
    gig_id              VARCHAR(32) NOT NULL REFERENCES gigs(gig_id),
    student_id          VARCHAR(32) NOT NULL REFERENCES users(user_id),
    student_name        VARCHAR(120) NOT NULL,
    institution         VARCHAR(160) NOT NULL,
    role_badge          VARCHAR(48) NOT NULL,
    portfolio_title     VARCHAR(160) NOT NULL,
    skill_pillar        VARCHAR(64) NOT NULL,
    client_org          VARCHAR(160) NOT NULL,
    payout_earned_inr   NUMERIC(10,2) NOT NULL,
    qr_verification_hash CHAR(64) NOT NULL UNIQUE,
    issued_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    log_id              SERIAL PRIMARY KEY,
    gig_id              VARCHAR(32) NOT NULL,
    actor_id            VARCHAR(32) NOT NULL,
    from_state          VARCHAR(32) NOT NULL,
    to_state            VARCHAR(32) NOT NULL,
    action_summary      VARCHAR(240) NOT NULL,
    utr_or_hash         VARCHAR(80),
    logged_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications_outbox (
    notification_id     VARCHAR(40) PRIMARY KEY,
    recipient_id        VARCHAR(32) NOT NULL,
    gig_id              VARCHAR(32),
    channel             VARCHAR(24) NOT NULL DEFAULT 'WHATSAPP_INAPP',
    title               VARCHAR(160) NOT NULL,
    message             TEXT NOT NULL,
    whatsapp_uri        TEXT,
    is_read             BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gigs_corridor_state ON gigs(corridor_cluster, state, track_category);
CREATE INDEX IF NOT EXISTS idx_gigs_auto_release ON gigs(state, auto_release_at);
CREATE INDEX IF NOT EXISTS idx_users_role_corridor ON users(role, corridor_cluster, exam_freeze_active);
