// /api/verify-code.js
//
// Server-side access-code verification. Replaces the old client-side
// direct-Firebase-read approach in gate.html so that we can:
//   1. Log every verification attempt (timestamp, IP, user agent)
//   2. Count how many distinct devices/sessions have used a code
//   3. Automatically revoke a code once it's been used far more times
//      than a legitimate small group would need — a signal that the
//      code has been shared or resold beyond the original booking.
//
// Required environment variables (already set in Vercel):
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

// How many *distinct* device/browser fingerprints may successfully use
// the same code before it's treated as likely shared/resold and
// automatically revoked. Generous enough for a family or small group
// booking (matches the "up to 10 travelers per booking" limit set on
// Viator), but well below what casual resharing/reselling would produce.
const MAX_DISTINCT_DEVICES = 10;
const MAX_LOG_ENTRIES = 50; // cap stored log size

function fingerprint(req) {
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  const ua = req.headers['user-agent'] || 'unknown';
  return ip + '|' + ua;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const { code } = req.body || {};
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ ok: false, error: 'missing_code' });
  }

  try {
    const db = admin.database();
    const codeRef = db.ref('accessCodes/' + code);
    const snap = await codeRef.get();

    if (!snap.exists()) {
      return res.status(200).json({ ok: false, error: 'not_found' });
    }

    const data = snap.val();

    if (data.revoked) {
      return res.status(200).json({ ok: false, error: 'revoked' });
    }

    if (Date.now() > data.expiresAt) {
      return res.status(200).json({ ok: false, error: 'expired' });
    }

    // Log this attempt and count distinct devices.
    const fp = fingerprint(req);
    const log = Array.isArray(data.usageLog) ? data.usageLog.slice(-MAX_LOG_ENTRIES + 1) : [];
    log.push({ t: Date.now(), fp });

    const distinctCount = new Set(log.map((entry) => entry.fp)).size;

    const updates = { usageLog: log, usageCount: (data.usageCount || 0) + 1 };

    if (distinctCount > MAX_DISTINCT_DEVICES) {
      updates.revoked = true;
      updates.revokedAt = Date.now();
      updates.revokedReason = 'usage_threshold_exceeded';
      await codeRef.update(updates);
      return res.status(200).json({ ok: false, error: 'revoked' });
    }

    await codeRef.update(updates);
    return res.status(200).json({ ok: true, expiresAt: data.expiresAt });
  } catch (err) {
    console.error('verify-code error:', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
}
