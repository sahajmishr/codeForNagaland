/**
 * Asynchronous Background Job & Auto-Release Queue Manager
 * SDD Section 2.4 & Section 3.1 (`src/workers/queue.manager.js`)
 * Manages:
 *  - `q:escrow:auto-release` (36-hour SLA check for DELIVERED_VAULT gigs)
 *  - `q:vault:watermark` (CPU-bound SHA-256 + diagonal watermark metadata generation)
 *  - `q:notify:whatsapp` (₹0 In-App & WhatsApp Outbox Ledger dispatch)
 *  - `q:credentials:mint` (Verifiable Campus Skill Passport SVG QR generation)
 */

const { processVaultArtifact } = require('./watermark.thread');

class MorungQueueManager {
  constructor(engine) {
    this.engine = engine;
    this.intervalHandle = null;
    this.metrics = {
      autoReleaseChecks: 0,
      autoReleasedGigs: 0,
      watermarksGenerated: 0,
      notificationsQueued: 0
    };
  }

  startBackgroundSweep(intervalMs = 30000) {
    if (this.intervalHandle) return;
    this.intervalHandle = setInterval(async () => {
      await this.sweepExpiredVaultDeliveries();
    }, intervalMs);
    if (this.intervalHandle.unref) {
      this.intervalHandle.unref();
    }
  }

  stopBackgroundSweep() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async sweepExpiredVaultDeliveries() {
    this.metrics.autoReleaseChecks += 1;
    if (!this.engine || !this.engine.db) return [];
    const gigs = await this.engine.db.getGigs();
    const now = Date.now();
    const settledIds = [];

    for (const gig of gigs) {
      if (gig.state === 'DELIVERED_VAULT' && gig.auto_release_at) {
        const deadline = new Date(gig.auto_release_at).getTime();
        if (!Number.isNaN(deadline) && deadline <= now) {
          await this.engine.settleEscrow(gig.gig_id, {
            trigger_type: 'AUTO_RELEASE_36H',
            actor_id: 'SYSTEM_36H_SLA_DAEMON'
          });
          this.metrics.autoReleasedGigs += 1;
          settledIds.push(gig.gig_id);
        }
      }
    }
    return settledIds;
  }

  runWatermarkJob(payload) {
    this.metrics.watermarksGenerated += 1;
    return processVaultArtifact(payload);
  }
}

module.exports = { MorungQueueManager };
