/**
 * Worker Thread for Anti-Theft Watermark & SHA-256 Digest Computation
 * SDD Section 2.4 & Section 3.1 (`src/workers/watermark.thread.js`)
 * Offloads CPU-intensive deliverable hashing and tabular row masking off the Fastify event loop.
 */

const { parentPort, workerData } = require('worker_threads');
const crypto = require('crypto');

function processVaultArtifact(payload = {}) {
  const rawBuffer = Buffer.from(
    JSON.stringify({
      gig_id: payload.gig_id,
      deliverable_title: payload.deliverable_title,
      submitted_by: payload.submitted_by,
      timestamp: payload.timestamp || Date.now()
    }),
    'utf8'
  );

  const fileSha256 = crypto.createHash('sha256').update(rawBuffer).digest('hex');
  const rows = Array.isArray(payload.tabular_rows) ? payload.tabular_rows : [];
  const previewRows = rows.map((row, idx) => ({
    ...row,
    locked_blur: idx >= 5
  }));

  return {
    file_sha256: fileSha256,
    watermark_spec: {
      diagonal_angle_deg: -30,
      overlay_text: `MORUNGGIG UNPAID PREVIEW • ESCROW LOCKED • ${payload.gig_id || 'GIG-NL'}`,
      hash_stamp: `SHA-256: ${fileSha256.slice(0, 24)}...`,
      unblurred_row_limit: 5,
      total_rows: previewRows.length
    },
    preview_rows: previewRows
  };
}

if (parentPort) {
  parentPort.on('message', (task) => {
    try {
      const result = processVaultArtifact(task);
      parentPort.postMessage({ ok: true, result });
    } catch (err) {
      parentPort.postMessage({ ok: false, error: err.message });
    }
  });
}

if (workerData && parentPort) {
  const result = processVaultArtifact(workerData);
  parentPort.postMessage({ ok: true, result });
}

module.exports = { processVaultArtifact };
