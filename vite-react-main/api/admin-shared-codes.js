// /api/admin-shared-codes.js
//
// Admin-only endpoint: returns usage stats for every "shared pool" access
// code (source ending in "-shared" — e.g. viator-shared,
// getyourguide-shared) so admin-hotel-overview.html can show how many
// times each platform's fixed ticket code has actually been used,
// without having to look up each code one by one in Firebase console.
//
// POST /api/admin-shared-codes   body: { adminKey }
//
// Required env vars (already set in Vercel for the other admin/*.js files):
//   ADMIN_SECRET
//   FIREBASE_SERVICE_ACCOUNT
//   FIREBASE_DATABASE_URL

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

  const { adminKey } = req.body || {};
  if (!adminKey || adminKey !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Invalid admin key' });
  }

  try {
    const db = admin.database();
    const snap = await db.ref('accessCodes').once('value');
    const all = snap.val() || {};

    const codes = [];
    for (const [code, data] of Object.entries(all)) {
      const source = typeof data.source === 'string' ? data.source : '';
      if (!source.endsWith('-shared')) continue; // only shared-pool codes

      const distinctDevices = Array.isArray(data.usageLog)
        ? new Set(data.usageLog.map((e) => e.fp)).size
        : 0;

      codes.push({
        code,
        source,
        usageCount: data.usageCount || 0,
        distinctDevices,
        revoked: !!data.revoked,
        revokedReason: data.revokedReason || null,
        createdAt: data.createdAt || null,
        expiresAt: data.expiresAt || null,
      });
    }

    // Most recently created first, so the current live code for each
    // platform naturally floats to the top.
    codes.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return res.status(200).json({ codes });
  } catch (err) {
    console.error('admin-shared-codes error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
