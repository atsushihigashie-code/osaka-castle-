// /api/admin-issue-code.js
//
// Manually issues a 6-character access code, for bookings that did NOT
// come through the Stripe checkout on this site (e.g. Viator, Tripadvisor,
// or any other channel that collects payment elsewhere).
//
// Protected by an admin secret so the public can't mint free codes.
//
// Required environment variables (same Firebase ones already set in Vercel,
// plus one new one):
//   FIREBASE_SERVICE_ACCOUNT   (already set)
//   FIREBASE_DATABASE_URL      (already set)
//   ADMIN_SECRET                (NEW — add this in Vercel → Settings →
//                                 Environment Variables)

import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    ),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const VALID_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — longer than the Stripe
// flow's 24h, since Viator customers may book days before their visit.

function generateCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { adminKey, source, bookingRef, note } = req.body || {};

  if (!adminKey || adminKey !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const db = admin.database();
    const code = generateCode();
    const expiresAt = Date.now() + VALID_MS;

    await db.ref('accessCodes/' + code).set({
      expiresAt,
      createdAt: Date.now(),
      source: source || 'manual',       // e.g. "viator"
      bookingRef: bookingRef || null,   // e.g. Viator booking reference BR-xxxxxx
      note: note || null,
      issuedManually: true,
    });

    return res.status(200).json({ code, expiresAt });
  } catch (err) {
    console.error('admin-issue-code error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
