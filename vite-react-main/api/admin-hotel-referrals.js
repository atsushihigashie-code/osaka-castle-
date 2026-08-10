// /api/admin-hotel-referrals.js
//
// Admin-only endpoint: returns referral booking counts and commission
// totals for EVERY partner hotel at once, so admin-hotel-overview.html
// can show a single ranked list instead of checking each hotel one by
// one via /api/hotel-referrals?hotel=xxx.
//
// POST /api/admin-hotel-referrals   body: { adminKey }
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

const COMMISSION_PER_BOOKING = 100;

function getJstDateString() {
  const jstOffset = 9 * 60 * 60 * 1000;
  return new Date(Date.now() + jstOffset).toISOString().slice(0, 10);
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
    const snap = await db.ref('referrals').once('value');
    const allData = snap.val() || {};

    const today = getJstDateString();
    const hotels = [];
    let grandTotalCount = 0;

    for (const [hotelId, byDate] of Object.entries(allData)) {
      let totalCount = 0;
      let todayCount = 0;
      let lastDate = null;

      for (const [date, bookings] of Object.entries(byDate)) {
        const count = Object.keys(bookings).length;
        totalCount += count;
        if (date === today) todayCount = count;
        if (!lastDate || date > lastDate) lastDate = date;
      }

      grandTotalCount += totalCount;
      hotels.push({
        hotel: hotelId,
        todayCount,
        totalCount,
        totalCommission: totalCount * COMMISSION_PER_BOOKING,
        lastBookingDate: lastDate,
      });
    }

    // Highest earners first.
    hotels.sort((a, b) => b.totalCount - a.totalCount);

    return res.status(200).json({
      date: today,
      hotelCount: hotels.length,
      grandTotalCount,
      grandTotalCommission: grandTotalCount * COMMISSION_PER_BOOKING,
      hotels,
    });
  } catch (err) {
    console.error('admin-hotel-referrals error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
