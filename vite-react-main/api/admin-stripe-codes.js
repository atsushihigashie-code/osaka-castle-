// /api/admin-stripe-codes.js
//
// Admin-only, READ-ONLY endpoint: lists individually-issued Stripe
// purchase codes (i.e. every accessCodes entry WITHOUT a "-shared"
// source — the opposite filter of admin-shared-codes.js) along with
// their usageCount, so the total "how many times were codes actually
// used" figure can include direct Stripe sales, not just OTA shared
// codes.
//
// This file only reads from Firebase — it never writes, updates, or
// deletes anything, and it does not touch verify-purchase.js,
// verify-code.js, or any other existing file.
//
// POST /api/admin-stripe-codes   body: { adminKey, limit? }
//   - limit: optional, how many most-recent codes to return (default 50)

import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    ),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { adminKey, limit } = req.body || {};
  if (!adminKey || adminKey !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Invalid admin key' });
  }

  try {
    const db = admin.database();
    const snap = await db.ref('accessCodes').once('value');
    const all = snap.val() || {};

    const codes = [];
    let totalUsage = 0;
    for (const [code, data] of Object.entries(all)) {
      const source = typeof data.source === 'string' ? data.source : '';
      if (source.endsWith('-shared')) continue; // exclude OTA shared-pool codes; those are covered by admin-shared-codes.js

      const usageCount = data.usageCount || 0;
      totalUsage += usageCount;

      codes.push({
        code,
        sessionId: data.sessionId || null,
        usageCount,
        revoked: !!data.revoked,
        createdAt: data.createdAt || null,
        expiresAt: data.expiresAt || null,
      });
    }

    codes.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const maxItems = typeof limit === 'number' && limit > 0 ? limit : 50;

    return res.status(200).json({
      codes: codes.slice(0, maxItems),
      codeCount: codes.length,
      totalUsage,
    });
  } catch (err) {
    console.error('admin-stripe-codes error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
