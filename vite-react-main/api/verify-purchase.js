// /api/verify-purchase.js
//
// Required packages (add to package.json):
//   npm install stripe firebase-admin
//
// Required environment variables (already set in Vercel):
//   STRIPE_SECRET_KEY
//   FIREBASE_SERVICE_ACCOUNT
//   FIREBASE_DATABASE_URL

import Stripe from 'stripe';
import admin from 'firebase-admin';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
const VALID_MS = 24 * 60 * 60 * 1000;

function generateCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

// "Today" in Japan time, as YYYY-MM-DD — used so hotel dashboards match
// what the front-desk staff mean by "today", not UTC's today.
function getJstDateString() {
  const jstOffset = 9 * 60 * 60 * 1000;
  return new Date(Date.now() + jstOffset).toISOString().slice(0, 10);
}

// Records one referred booking under referrals/{hotelId}/{date}/{sessionId}.
// Called at most once per session (guarded by the caller).
async function logReferralIfAny(db, session, sessionId) {
  const hotelId = session.client_reference_id;
  if (!hotelId) return;

  const date = getJstDateString();
  await db.ref(`referrals/${hotelId}/${date}/${sessionId}`).set({
    timestamp: Date.now(),
    commission: 100,
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { session_id } = req.query;
  if (!session_id) {
    return res.status(400).json({ error: 'Missing session_id' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== 'paid') {
      return res.status(402).json({ error: 'Payment not completed' });
    }

    const db = admin.database();

    const existing = await db.ref('accessCodesBySession/' + session_id).once('value');
    if (existing.exists()) {
      const code = existing.val();
      const codeSnap = await db.ref('accessCodes/' + code).once('value');
      if (codeSnap.exists()) {
        return res.status(200).json({
          code,
          expiresAt: codeSnap.val().expiresAt,
        });
      }
    }

    const code = generateCode();
    const expiresAt = Date.now() + VALID_MS;

    await db.ref('accessCodes/' + code).set({
      expiresAt,
      sessionId: session_id,
      createdAt: Date.now(),
    });
    await db.ref('accessCodesBySession/' + session_id).set(code);

    // Only reached the first time this session is verified, so the
    // referral is logged exactly once per purchase.
    await logReferralIfAny(db, session, session_id);

    return res.status(200).json({ code, expiresAt });
  } catch (err) {
    console.error('verify-purchase error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
