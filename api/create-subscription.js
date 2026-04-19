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

  const PRICE_IDS = {
    basic:    process.env.STRIPE_PRICE_BASIC,
    featured: process.env.STRIPE_PRICE_FEATURED,
    premium:  process.env.STRIPE_PRICE_PREMIUM,
  };

  try {
    const { tier, tutorEmail, tutorId, action } = req.body;

    // ── CANCEL SUBSCRIPTION ───────────────────────────────────
    if (action === 'cancel') {
      if (!tutorId) return res.status(400).json({ error: 'Missing tutor ID' });

      // Get tutor's subscription ID from DB
      const { data: profile } = await sb
        .from('tutor_profiles')
        .select('stripe_subscription_id')
        .eq('id', tutorId)
        .single();

      if (!profile?.stripe_subscription_id) {
        return res.status(400).json({ error: 'No active subscription found' });
      }

      // Cancel at period end — they keep promotion until billing cycle ends
      const sub = await stripe.subscriptions.update(profile.stripe_subscription_id, {
        cancel_at_period_end: true,
      });

      const endDate = new Date(sub.current_period_end * 1000);
      const endStr  = endDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

      // Save cancel flag to DB
      await sb.from('tutor_profiles').upsert(
        { id: tutorId, promotion_cancels_at: endDate.toISOString(), updated_at: new Date().toISOString() },
        { onConflict: 'id' }
      );

      return res.status(200).json({ cancelled: true, endsOn: endStr });
    }

    // ── CREATE SUBSCRIPTION ───────────────────────────────────
    if (!tier || !PRICE_IDS[tier]) return res.status(400).json({ error: 'Invalid tier' });
    if (!tutorEmail) return res.status(400).json({ error: 'Email required' });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: tutorEmail,
      line_items: [{ price: PRICE_IDS[tier], quantity: 1 }],
      subscription_data: {
        metadata: { tutor_id: tutorId || '', tier, platform: 'studly' },
      },
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
