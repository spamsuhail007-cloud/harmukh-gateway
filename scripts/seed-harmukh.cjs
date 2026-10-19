const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

async function seedHarmukh() {
  const rootDir = path.resolve(__dirname, '..');
  const dbPath = process.env.SQLITE_DB_PATH || path.join(rootDir, 'data', 'youpi_pg.sqlite');

  console.log(`[+] Seeding Harmukh Threads configuration into: ${dbPath}`);
  const db = new DatabaseSync(dbPath);

  // Update merchant
  db.prepare(`
    UPDATE merchants 
    SET business_name = ?, slug = ?, contact_email = ?, webhook_url = ?, webhook_secret = ?, branding = ?
    WHERE id = '00000000-0000-0000-0000-000000000001'
  `).run(
    'Harmukh Threads',
    'harmukh-threads',
    'orders@harmukhthreads.com',
    'http://localhost:3000/api/youpi-webhook',
    'ht_sec_youpi_2026_dev',
    JSON.stringify({
      appName: 'Harmukh Threads',
      primaryColor: '#9b4000',
      logoUrl: null
    })
  );

  // Update receiving account
  db.prepare(`
    UPDATE payment_receiving_accounts
    SET upi_id = ?, payee_name = ?
    WHERE merchant_id = '00000000-0000-0000-0000-000000000001'
  `).run('9796381311@axl', 'Harmukh Threads');

  console.log('[✓] Merchant updated to "Harmukh Threads"');
  console.log('[✓] Webhook endpoint set to "http://localhost:3000/api/youpi-webhook"');
  console.log('[✓] VPA set to "9796381311@axl"');

  db.close();
}

seedHarmukh().catch(console.error);
