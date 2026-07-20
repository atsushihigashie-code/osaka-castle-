/**
 * /api/admin-issue-code.js
 *
 * Two modes:
 *  1. mode: "single"  (default) — issues a one-off code, as before
 *  2. mode: "shared"  — creates/rotates the standing "Viator shared code"
 *     that is embedded directly in the Viator ticket text. This is what
 *     makes Viator bookings fully hands-off: Viator auto-sends the ticket
 *     to every customer, and the ticket already contains a valid code.
 *
 * Required environment variables (same Firebase ones already set in Vercel,
 * plus one new one):
 *   FIREBASE_SERVICE_ACCOUNT   (already set)
 *   FIREBASE_DATABASE_URL      (already set)
 *   ADMIN_SECRET                (already set)
 */

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
const SINGLE_VALID_MS = 7 * 24 * 60 * 60 * 1000;   // 7 days
const SHARED_VALID_MS = 30 * 24 * 60 * 60 * 1000;  // 30 days

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

  const { adminKey, source, bookingRef, note, mode } = req.body || {};

  if (!adminKey || adminKey !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const db = admin.database();

    if (mode === 'shared') {
      // Rotate the standing Viator shared code. The OLD code is kept valid
      // for a short grace period (48h) so already-booked customers who
      // haven't visited yet aren't locked out immediately.
      const newCode = generateCode();
      const expiresAt = Date.now() + SHARED_VALID_MS;

      const currentSnap = await db.ref('sharedViatorAccess/current').get();
      if (currentSnap.exists()) {
        const old = currentSnap.val();
        if (old.code) {
          await db.ref('accessCodes/' + old.code).update({
            expiresAt: Date.now() + 48 * 60 * 60 * 1000, // 48h grace period
          });
        }
      }

      await db.ref('accessCodes/' + newCode).set({
        expiresAt,
        createdAt: Date.now(),
        source: 'viator-shared',
        issuedManually: true,
      });

      await db.ref('sharedViatorAccess/current').set({
        code: newCode,
        expiresAt,
        rotatedAt: Date.now(),
      });

      return res.status(200).json({ code: newCode, expiresAt, mode: 'shared' });
    }

    // Default: single one-off code (existing behaviour)
    const code = generateCode();
    const expiresAt = Date.now() + SINGLE_VALID_MS;

    await db.ref('accessCodes/' + code).set({
      expiresAt,
      createdAt: Date.now(),
      source: source || 'manual',
      bookingRef: bookingRef || null,
      note: note || null,
      issuedManually: true,
    });

    return res.status(200).json({ code, expiresAt, mode: 'single' });
  } catch (err) {
    console.error('admin-issue-code error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

