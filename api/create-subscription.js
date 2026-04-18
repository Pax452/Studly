const Stripe = require('stripe');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://studly.it.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const PRICE_IDS = {
    basic:    process.env.STRIPE_PRICE_BASIC,
    featured: process.env.STRIPE_PRICE_FEATURED,
    premium:  process.env.STRIPE_PRICE_PREMIUM,
  };

  try {
    const { tier, tutorEmail, tutorId } = req.body;
    if (!tier || !PRICE_IDS[tier]) return res.status(400).json({ error: 'Invalid tier' });
    if (!tutorEmail) return res.status(400).json({ error: 'Email required' });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: tutorEmail,
      line_items: [{ price: PRICE_IDS[tier], quantity: 1 }],
      subscription_data: { metadata: { tutor_id: tutorId || '', tier, platform: 'studly' } },
      metadata: { tutor_id: tutorId || '', tier },
      success_url: `https://studly.it.com?promo=success&tier=${tier}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  'https://studly.it.com?promo=cancelled',
    });

    return res.status(200).json({ url: session.url });
  } catch(err) {
    console.error('[Studly] Subscription error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
