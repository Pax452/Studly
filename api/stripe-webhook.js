const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const sig    = req.headers['stripe-signature'];

  let event;
  try {
    const raw = await getRawBody(req);
    event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch(err) {
    console.error('Webhook sig error:', err.message);
    return res.status(400).json({ error: err.message });
  }

  const sb = createClient(
    'https://pqteekzbbuowmflhvzov.supabase.co',
    process.env.SUPABASE_SERVICE_KEY
  );

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const meta    = session.metadata || {};
      if (meta.tutee_id && meta.tutor_id) {
        await sb.from('bookings')
          .update({
            status:     'confirmed',
            payment_id: session.payment_intent || session.id,
            updated_at: new Date().toISOString(),
          })
          .eq('tutee_id', meta.tutee_id)
          .eq('tutor_id', meta.tutor_id)
          .eq('status', 'pending_payment');
      }
    }

    if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
      const sub  = event.data.object;
      const meta = sub.metadata || {};
      if (meta.tutor_id && meta.tier) {
        await sb.from('tutor_profiles')
          .upsert({ id: meta.tutor_id, promotion_tier: meta.tier, updated_at: new Date().toISOString() }, { onConflict: 'id' });
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub  = event.data.object;
      const meta = sub.metadata || {};
      if (meta.tutor_id) {
        await sb.from('tutor_profiles')
          .upsert({ id: meta.tutor_id, promotion_tier: null, updated_at: new Date().toISOString() }, { onConflict: 'id' });
      }
    }
  } catch(err) {
    console.error('Webhook handler error:', err.message);
  }

  return res.status(200).json({ received: true });
}
