#!/usr/bin/env node
/**
 * Import Printify products into the OK Music Firestore marketplace.
 *
 * Prerequisites:
 *   1. Download your Firebase service account key:
 *      Firebase Console → Project Settings → Service Accounts → Generate new private key
 *      Save the file as  service-account.json  in the project root (next to package.json).
 *
 *   2. Get your Printify API token:
 *      https://printify.com/app/account/api-access
 *
 * Usage:
 *   node scripts/import-printify.js <PRINTIFY_TOKEN> [STORE_URL] [SHOP_ID]
 *
 * Examples:
 *   node scripts/import-printify.js eyJ0eXAi...
 *   node scripts/import-printify.js eyJ0eXAi... https://mystore.printify.me
 *   node scripts/import-printify.js eyJ0eXAi... https://mystore.printify.me 12345678
 */

const https = require('https');
const path  = require('path');

// ── Firebase Admin (v11+ modular API) ────────────────────────────────────────
let initializeApp, cert, getFirestore, getAuth;
try {
  ({ initializeApp, cert } = require('firebase-admin/app'));
  ({ getFirestore }        = require('firebase-admin/firestore'));
  ({ getAuth }             = require('firebase-admin/auth'));
} catch {
  console.error('\n❌  firebase-admin not found.\n    Run: npm install firebase-admin\n');
  process.exit(1);
}

const saPath = path.join(__dirname, '..', 'service-account.json');
let serviceAccount;
try { serviceAccount = require(saPath); }
catch {
  console.error(`\n❌  service-account.json not found at:\n    ${saPath}\n`);
  console.error('    Download it from: Firebase Console → Project Settings → Service Accounts → Generate new private key\n');
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ── Printify API helper ───────────────────────────────────────────────────────
function printifyGet(apiPath, token) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: 'api.printify.com', path: `/v1${apiPath}`, method: 'GET',
        headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'OK-Music-Importer/1.0' } },
      res => {
        let raw = '';
        res.on('data', c => raw += c);
        res.on('end', () => {
          if (res.statusCode === 401) { reject(new Error('Invalid or expired Printify API token.')); return; }
          if (res.statusCode !== 200) { reject(new Error(`Printify API returned HTTP ${res.statusCode}: ${raw.slice(0,200)}`)); return; }
          try { resolve(JSON.parse(raw)); }
          catch { reject(new Error('Unexpected response from Printify: ' + raw.slice(0,200))); }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim().slice(0, 1000);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const token    = process.argv[2];
  const storeUrl = (process.argv[3] || '').replace(/\/$/, '');
  let   shopId   = process.argv[4] || '';

  if (!token) {
    console.error('Usage: node scripts/import-printify.js <TOKEN> [STORE_URL] [SHOP_ID]\n');
    process.exit(1);
  }

  // ── 1. Find admin's Firebase UID ───────────────────────────────────────────
  console.log('🔐  Looking up admin account in Firebase Auth…');
  let sellerId;
  try {
    const userRecord = await getAuth().getUserByEmail('trendai509@gmail.com');
    sellerId = userRecord.uid;
    console.log(`    UID: ${sellerId}`);
  } catch (e) {
    console.error('❌  Could not find trendai509@gmail.com in Firebase Auth:', e.message);
    process.exit(1);
  }

  // ── 2. List Printify shops ─────────────────────────────────────────────────
  console.log('\n🏪  Fetching Printify shops…');
  const shops = await printifyGet('/shops.json', token);
  if (!shops.length) { console.error('No shops found on this Printify account.'); process.exit(1); }

  console.log(`    Found ${shops.length} shop(s):`);
  shops.forEach(s => console.log(`    [${s.id}] ${s.title}`));

  if (!shopId) { shopId = String(shops[0].id); }
  const shop = shops.find(s => String(s.id) === String(shopId)) || shops[0];
  console.log(`\n    Using shop: ${shop.title} (ID: ${shopId})`);

  // ── 3. Fetch products ──────────────────────────────────────────────────────
  console.log('\n📦  Fetching products…');
  const data     = await printifyGet(`/shops/${shopId}/products.json?limit=100`, token);
  const products = data.data || data;
  const published = products.filter(p => p.visible !== false && p.is_locked !== true);
  console.log(`    ${published.length} published product(s) found.\n`);

  if (!published.length) {
    console.log('Nothing to import. Publish some products on Printify first.');
    process.exit(0);
  }

  // ── 4. Import to Firestore ─────────────────────────────────────────────────
  let created = 0, updated = 0;

  for (const p of published) {
    const img     = p.images?.find(i => i.is_default) || p.images?.[0];
    const variant = p.variants?.find(v => v.is_enabled) || p.variants?.[0];
    const price   = variant?.price ? Number((variant.price / 100).toFixed(2)) : 0;
    const handle  = p.external?.handle || String(p.id);
    const buyUrl  = p.external?.url || (storeUrl ? `${storeUrl}/products/${handle}` : '');

    const doc = {
      sellerId,
      source:         'printify',
      printifyId:     String(p.id),
      printifyShopId: String(shopId),
      title:          p.title,
      description:    stripHtml(p.description),
      photos:         img ? [img.src] : [],
      category:       'Merch',
      price,
      shipping:       0,
      buyUrl,
      stock:          null,
      lncPrice:       null,
      updatedAt:      Date.now(),
    };

    const snap = await db.collection('products').where('printifyId','==', String(p.id)).limit(1).get();
    if (!snap.empty) {
      await snap.docs[0].ref.update(doc);
      console.log(`  ✏️   Updated : ${p.title}`);
      updated++;
    } else {
      await db.collection('products').add({ ...doc, createdAt: Date.now() });
      console.log(`  ✅  Imported: ${p.title}`);
      created++;
    }
  }

  console.log(`\n🎉  Done! ${created} new, ${updated} updated.`);
  console.log('    Your Printify products are now live in the OK Music marketplace.\n');
  process.exit(0);
}

main().catch(e => {
  console.error('\n❌  Error:', e.message, '\n');
  process.exit(1);
});
