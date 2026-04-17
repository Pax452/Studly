const Stripe = require('stripe');
 
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://studly.it.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
 
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
 
  try {
    const {
      tutorName, sessionType, rateGbp, rateUsd,
      multiplier = 1, tuteeEmail, tutorId, tuteeId,
      date, time, stripeAccountId
    } = req.body;
 
    if (!rateGbp && !rateUsd) return res.status(400).json({ error: 'No rate provided' });
 
    const isUSD    = !rateGbp && rateUsd;
    const base     = isUSD ? parseFloat(rateUsd) : parseFloat(rateGbp || 20);
    const currency = isUSD ? 'usd' : 'gbp';
    const total    = Math.round(base * multiplier * 100); // pence/cents
 
    // Commission: starts at 10%, drops based on session count
    // For now flat 10% — webhook will handle tier updates later
    const commission    = Math.round(total * 0.10);
    const tutorReceives = total - commission;
 
    const labels = {
      '1hr':    '1-hour session',
      '90min':  '90-minute session',
      'block5': 'Block of 5 sessions',
    };
 
    const sessionConfig = {
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
          tutor_id:     tutorId   || '',
          tutee_id:     tuteeId   || '',
          session_type: sessionType || '',
          date:         date || '',
          time:         time || '',
          commission:   String(commission),
          platform:     'studly',
        },
      },
      success_url: 'https://studly.it.com?payment=success&session_id={CHECKOUT_SESSION_ID}',
      cancel_url:  'https://studly.it.com?payment=cancelled',
    };
 
    // If tutor has a Stripe Connect account, auto-split the payment
    if (stripeAccountId) {
      sessionConfig.payment_intent_data.application_fee_amount = commission;
      sessionConfig.payment_intent_data.transfer_data = {
        destination: stripeAccountId,
      };
    }
 
    const session = await stripe.checkout.sessions.create(sessionConfig);
    return res.status(200).json({ url: session.url });
 
  } catch(err) {
    console.error('[Studly] Checkout error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
 
