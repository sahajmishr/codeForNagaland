/**
 * MORUNGGIG (SKILLBRIDGE NL) — DATABASE MIGRATION & SEED UTILITY
 * Connects to Neon PostgreSQL (`DATABASE_URL`) if provided, executes `db/schema.sql`,
 * and syncs the baseline Nagaland seed dataset.
 */

require('dotenv').config();
const { db } = require('../src/db/database');

(async () => {
  console.log('====================================================================');
  console.log(' MORUNGGIG (SKILLBRIDGE NL) — DATABASE MIGRATION & SEED RUNNER');
  console.log('====================================================================');
  const res = await db.initPostgres();
  console.log('Database Status:', JSON.stringify(res, null, 2));
  console.log(`Users seeded: ${db.state.users.length}`);
  console.log(`Gigs seeded: ${db.state.gigs.length}`);
  console.log(`Escrow Ledger rows: ${db.state.escrow_ledger.length}`);
  console.log(`Skill Credentials: ${db.state.skill_credentials.length}`);
  await db.close();
})();
