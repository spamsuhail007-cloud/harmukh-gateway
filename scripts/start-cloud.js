import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrations, getDatabase, ensureDatabaseInitialized } from '../packages/db/src/index.js';
import { startServer } from '../apps/payment-api/src/index.js';
import { startCheckoutServer } from '../apps/checkout-portal/src/index.js';
import { startAdminServer } from '../apps/merchant-admin/src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 1. Environment & Database Init
const publicPort = Number(process.env.PORT || 10000);
process.env.YOUPI_MODE = 'production';
process.env.NODE_ENV = 'production';
process.env.YOUPI_ALLOW_PRIVATE_WEBHOOKS = 'true';
process.env.USE_SQLITE_FALLBACK = 'true';
process.env.YOUPI_BIND_HOST = '0.0.0.0';

const dataDir = path.join(rootDir, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

process.env.SQLITE_DB_PATH = path.join(dataDir, 'youpi_pg.sqlite');
const DEFAULT_ADMIN_TOKEN = 'adde5f5215078a77c1c18696f4a5412b82bb748cb2e7f66f32f3a48e678f2428';
process.env.ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN || DEFAULT_ADMIN_TOKEN;

const secretsDir = path.join(dataDir, '.secrets');
if (!fs.existsSync(secretsDir)) fs.mkdirSync(secretsDir, { recursive: true });
const tokenFile = path.join(secretsDir, 'admin_api_token');
try {
  fs.writeFileSync(tokenFile, process.env.ADMIN_API_TOKEN, { mode: 0o600 });
} catch {}

console.log('====================================================');
console.log('🚀 Starting Harmukh Threads YouPI Gateway (Cloud Mode)');
console.log(`📡 Listening on public port: ${publicPort}`);
console.log('====================================================');

// Run migrations
const db = getDatabase();
ensureDatabaseInitialized(db);
runMigrations(db);

// Seed Harmukh Threads active VPA
try {
  db.execute(`
    UPDATE payment_receiving_accounts
    SET upi_id = ?, payee_name = ?
    WHERE merchant_id = '00000000-0000-0000-0000-000000000001'
  `, ['9796381311@axl', 'Harmukh Threads']);

  db.execute(`
    UPDATE merchants 
    SET business_name = ?, slug = ?, contact_email = ?
    WHERE id = '00000000-0000-0000-0000-000000000001'
  `, ['Harmukh Threads', 'harmukh-threads', 'orders@harmukhthreads.com']);
  console.log('[✓] Receiving account verified: 9796381311@axl');
} catch (e) {
  console.warn('[!] DB seed notice:', e.message);
}

// 2. Start Sub-services on internal loopback ports
const API_PORT = 6100;
const CHECKOUT_PORT = 7000;
const ADMIN_PORT = 6001;

await startServer(API_PORT, db);
console.log(`[✓] Payment Core REST API online on ${API_PORT}`);

await startCheckoutServer(CHECKOUT_PORT, { db });
console.log(`[✓] Checkout Portal online on ${CHECKOUT_PORT}`);

await startAdminServer(ADMIN_PORT, { db });
console.log(`[✓] Merchant Admin Hub online on ${ADMIN_PORT}`);

// 3. Unified Reverse Proxy Gateway on Render Public Port
function proxyRequest(req, res, targetPort) {
  const proxyReq = http.request({
    hostname: '127.0.0.1',
    port: targetPort,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `127.0.0.1:${targetPort}`,
      'x-forwarded-host': req.headers.host || '',
      'x-forwarded-proto': req.headers['x-forwarded-proto'] || 'https'
    }
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Gateway sub-service unavailable', details: err.message }));
    }
  });

  req.pipe(proxyReq);
}

const gateway = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // Render & Uptime Health check
  if (pathname === '/health' || pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'UP', service: 'harmukh-youpi-cloud', vpa: '9796381311@axl' }));
    return;
  }

  // API calls & Android Observer Webhooks
  if (pathname.startsWith('/api/')) {
    proxyRequest(req, res, API_PORT);
    return;
  }

  // Customer Checkout Modal & SDK
  if (pathname.startsWith('/checkout') || pathname === '/youpi.js' || pathname.startsWith('/pay/')) {
    proxyRequest(req, res, CHECKOUT_PORT);
    return;
  }

  // Merchant Admin, Supervisor & APK downloads
  proxyRequest(req, res, ADMIN_PORT);
});

gateway.listen(publicPort, '0.0.0.0', () => {
  console.log('====================================================');
  console.log(`🟢 HARMUKH YOUPI PG CLOUD GATEWAY FULLY ONLINE`);
  console.log(`🌐 Public Port: ${publicPort}`);
  console.log('====================================================');
});
