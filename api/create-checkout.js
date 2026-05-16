const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://studly.it.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const sb = createClient(
    'https://pqteekzbbuowmflhvzov.supabase.co',
    process.env.SUPABASE_SERVICE_KEY
  );

  try {
    const {
      tutorName, sessionType, rateGbp, rateUsd,
      multiplier = 1, tuteeEmail, tutorId, tuteeId,
      date, time, stripeAccountId
    } = req.body;

    if (!rateGbp && !rateUsd) return res.status(400).json({ error: 'No rate provided' });

    // ── COMMISSION TIER ───────────────────────────────────────
    let commissionRate = 0.10;
    if (tutorId) {
      const { count } = await sb
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('tutor_id', tutorId)
        .eq('status', 'complete');
      const sessions = count || 0;
      if      (sessions >= 30) commissionRate = 0.05;
      else if (sessions >= 16) commissionRate = 0.06;
      else if (sessions >= 6)  commissionRate = 0.08;
      else                     commissionRate = 0.10;
    }

    const isUSD     = !rateGbp && rateUsd;
    const base      = isUSD ? parseFloat(rateUsd) : parseFloat(rateGbp || 20);
    const currency  = isUSD ? 'usd' : 'gbp';
    const total     = Math.round(base * multiplier * 100);
    const commission = Math.round(total * commissionRate);
    const tutorAmt  = total - commission;

    const labels = {
      '1hr':    '1-hour session',
      '90min':  '90-minute session',
      'block5': 'Block of 5 sessions',
    };

    // ── NO AUTO-TRANSFER — hold full amount in platform ───────
    // Money stays in your Stripe account until session is confirmed complete.
    // Transfer to tutor is triggered manually via /api/complete-session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: tuteeEmail || undefined,
      line_items: [{
        price_data: {
          currency,
          product_data: {
            name: `Studly — ${labels[sessionType] || sessionType} with ${tutorName || 'Tutor'}`,
            description: [date, time].filter(Boolean).join(' · ') || undefined,
          },
          unit_amount: total,
        },
        quantity: 1,
      }],
      payment_intent_data: {
        metadata: {
          tutor_id:        tutorId        || '',
          tutee_id:        tuteeId        || '',
          session_type:    sessionType    || '',
          date:            date           || '',
          time:            time           || '',
          commission_rate: String(commissionRate),
          commission_amt:  String(commission),
          tutor_amt:       String(tutorAmt),
          stripe_account:  stripeAccountId || '',
          platform:        'studly',
        },
      },
      success_url: 'https://studly.it.com?payment=success&session_id={CHECKOUT_SESSION_ID}',
      cancel_url:  'https://studly.it.com?payment=cancelled',
    });

    return res.status(200).json({ url: session.url, commissionRate });

  } catch(err) {
    console.error('[Studly] Checkout error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
