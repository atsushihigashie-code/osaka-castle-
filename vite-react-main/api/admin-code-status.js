// /api/admin-code-status.js
//
// Lets the admin page look up how many times a given code (or the
// current shared code) has been used, and whether it's been revoked.

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

  const { adminKey, code } = req.body || {};
  if (!adminKey || adminKey !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!code) return res.status(400).json({ error: 'code is required' });

  try {
    const db = admin.database();
    const snap = await db.ref('accessCodes/' + code).get();
    if (!snap.exists()) return res.status(200).json({ found: false });

    const data = snap.val();
    const distinctDevices = Array.isArray(data.usageLog)
      ? new Set(data.usageLog.map((e) => e.fp)).size
      : 0;

    return res.status(200).json({
      found: true,
      usageCount: data.usageCount || 0,
      distinctDevices,
      revoked: !!data.revoked,
      revokedReason: data.revokedReason || null,
      expiresAt: data.expiresAt,
      source: data.source || null,
    });
  } catch (err) {
    console.error('admin-code-status error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
