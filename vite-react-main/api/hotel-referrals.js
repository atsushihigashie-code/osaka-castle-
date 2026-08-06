// /api/hotel-referrals.js
//
// Returns booking counts for one partner hotel, so the hotel-facing
// dashboard page can show "today's count" and the running total.
//
// GET /api/hotel-referrals?hotel=doubletree
//
// Required env vars (already set in Vercel for verify-purchase.js):
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

const COMMISSION_PER_BOOKING = 100;

function getJstDateString() {
  const jstOffset = 9 * 60 * 60 * 1000;
  return new Date(Date.now() + jstOffset).toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { hotel } = req.query;
  if (!hotel) {
    return res.status(400).json({ error: 'Missing hotel id (?hotel=doubletree)' });
  }

  try {
    const db = admin.database();
    const snap = await db.ref(`referrals/${hotel}`).once('value');
    const data = snap.val() || {};

    const today = getJstDateString();
    const byDate = {};
    let totalCount = 0;

    for (const [date, bookings] of Object.entries(data)) {
      const count = Object.keys(bookings).length;
      byDate[date] = count;
      totalCount += count;
    }

    const todayCount = byDate[today] || 0;

    // Last 14 days for a simple recent-history list, newest first.
    const recentDates = Object.keys(byDate).sort().reverse().slice(0, 14);

    return res.status(200).json({
      hotel,
      date: today,
      todayCount,
      todayCommission: todayCount * COMMISSION_PER_BOOKING,
      totalCount,
      totalCommission: totalCount * COMMISSION_PER_BOOKING,
      recent: recentDates.map((d) => ({ date: d, count: byDate[d] })),
    });
  } catch (err) {
    console.error('hotel-referrals error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
