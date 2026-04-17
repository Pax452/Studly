const Stripe = require('stripe');
 
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://studly.it.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
 
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
 
  try {
    const { tutorId, tutorEmail } = req.body;
    if (!tutorId || !tutorEmail) return res.status(400).json({ error: 'Missing tutor details' });
 
    // Create a new Express Connect account for this tutor
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'GB',
      email: tutorEmail,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_type: 'individual',
      metadata: { tutor_id: tutorId, platform: 'studly' },
    });
 
    // Generate onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `https://studly.it.com?connect=refresh&tutor_id=${tutorId}`,
      return_url:  `https://studly.it.com?connect=success&account_id=${account.id}&tutor_id=${tutorId}`,
      type: 'account_onboarding',
    });
 
    return res.status(200).json({ url: accountLink.url, accountId: account.id });
 
  } catch(err) {
    console.error('[Studly] Connect onboard error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
