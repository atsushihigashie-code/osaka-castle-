// /api/hotel-referrals.js
//
// Returns booking counts + commission for ONE partner hotel, for the
// hotel-facing dashboard page (partner-dashboard.html).
//
// GET /api/hotel-referrals?hotel=001&key=<per-hotel dashboard key>
//
// The `key` must match an HMAC of the hotel id, keyed by
// HOTEL_DASHBOARD_SECRET. This stops one partner hotel from simply
// editing the `hotel=` value in the URL to see another hotel's numbers —
// each hotel's dashboard link only works for its own id.
//
// Required env vars:
//   FIREBASE_SERVICE_ACCOUNT
//   FIREBASE_DATABASE_URL
//   HOTEL_DASHBOARD_SECRET   (new — see admin-hotel-overview.html for how
//                             to generate the matching per-hotel keys)

import admin from 'firebase-admin';
import crypto from 'crypto';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    ),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

function getJstDateString() {
  const jstOffset = 9 * 60 * 60 * 1000;
  return new Date(Date.now() + jstOffset).toISOString().slice(0, 10);
}

function expectedKeyFor(hotelId) {
  return crypto
    .createHmac('sha256', process.env.HOTEL_DASHBOARD_SECRET)
    .update(hotelId)
    .digest('hex')
    .slice(0, 10);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { hotel, key } = req.query;
  if (!hotel) {
    return res.status(400).json({ error: 'Missing hotel id (?hotel=001)' });
  }

  const expected = expectedKeyFor(hotel);
  if (!key || key !== expected) {
    return res.status(401).json({ error: 'Missing or incorrect dashboard key for this hotel' });
  }

  try {
    const db = admin.database();
    const snap = await db.ref(`referrals/${hotel}`).once('value');
    const data = snap.val() || {};

    const today = getJstDateString();
    const byDate = {};
    const commissionByDate = {};
    let totalCount = 0;
    let totalCommission = 0;

    for (const [date, bookings] of Object.entries(data)) {
      const entries = Object.values(bookings);
      const count = entries.length;
      // Sum each booking's own recorded commission, rather than assuming
      // a fixed rate — this stays correct even if the commission amount
      // changes in the future for new bookings.
      const commission = entries.reduce((sum, b) => sum + (b.commission || 0), 0);
      byDate[date] = count;
      commissionByDate[date] = commission;
      totalCount += count;
      totalCommission += commission;
    }

    const todayCount = byDate[today] || 0;
    const todayCommission = commissionByDate[today] || 0;

    // Last 14 days for a simple recent-history list, newest first.
    const recentDates = Object.keys(byDate).sort().reverse().slice(0, 14);

    return res.status(200).json({
      hotel,
      date: today,
      todayCount,
      todayCommission,
      totalCount,
      totalCommission,
      recent: recentDates.map((d) => ({ date: d, count: byDate[d], commission: commissionByDate[d] })),
    });
  } catch (err) {
    console.error('hotel-referrals error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
