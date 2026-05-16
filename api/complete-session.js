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
    const { bookingId, markedBy } = req.body;
    if (!bookingId) return res.status(400).json({ error: 'Missing bookingId' });

    // Get booking details
    const { data: booking, error: bookingErr } = await sb
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (bookingErr || !booking) return res.status(404).json({ error: 'Booking not found' });

    // Update completion flags
    const update = {};
    if (markedBy === 'tutor')  update.tutor_marked_complete  = true;
    if (markedBy === 'student') update.student_marked_complete = true;
    update.updated_at = new Date().toISOString();

    await sb.from('bookings').update(update).eq('id', bookingId);

    // Reload to check both flags
    const { data: updated } = await sb.from('bookings').select('*').eq('id', bookingId).single();
    const bothComplete = updated.tutor_marked_complete && updated.student_marked_complete;

    // If only one has marked complete, just acknowledge
    if (!bothComplete) {
      return res.status(200).json({
        message: markedBy === 'tutor'
          ? 'Marked complete — waiting for student confirmation before paying out.'
          : 'Marked complete — waiting for tutor confirmation.',
        complete: false,
      });
    }

    // Both confirmed — mark as complete and transfer to tutor
    if (!booking.payment_id) {
      return res.status(400).json({ error: 'No payment ID on this booking' });
    }
    if (!booking.stripe_account_id && !booking.tutor_stripe_account) {
      // No Connect account — mark complete, you pay manually
      await sb.from('bookings').update({ status: 'complete', updated_at: new Date().toISOString() }).eq('id', bookingId);
      return res.status(200).json({ complete: true, transfer: 'manual', message: 'Session complete — pay tutor manually from Stripe dashboard.' });
    }

    // Get tutor's Connect account from tutor_profiles
    const { data: tutorProfile } = await sb
      .from('tutor_profiles')
      .select('stripe_account_id')
      .eq('id', booking.tutor_id)
      .single();

    const destination = tutorProfile?.stripe_account_id;
    if (!destination) {
      await sb.from('bookings').update({ status: 'complete', updated_at: new Date().toISOString() }).eq('id', bookingId);
      return res.status(200).json({ complete: true, transfer: 'manual', message: 'Session complete — tutor has no Connect account, pay manually.' });
    }

    // Get payment intent to find amount
    const paymentIntent = await stripe.paymentIntents.retrieve(booking.payment_id);
    const meta          = paymentIntent.metadata || {};
    const tutorAmt      = parseInt(meta.tutor_amt || '0');
    const currency      = paymentIntent.currency;

    if (tutorAmt <= 0) {
      return res.status(400).json({ error: 'Could not determine tutor payout amount' });
    }

    // Create transfer to tutor
    const transfer = await stripe.transfers.create({
      amount:      tutorAmt,
      currency,
      destination,
      description: `Studly payout — booking ${bookingId}`,
      metadata: {
        booking_id: bookingId,
        tutor_id:   booking.tutor_id || '',
        platform:   'studly',
      },
    });

    // Mark booking complete with transfer ID
    await sb.from('bookings').update({
      status:      'complete',
      transfer_id: transfer.id,
      updated_at:  new Date().toISOString(),
    }).eq('id', bookingId);

    return res.status(200).json({
      complete:   true,
      transfer:   'automatic',
      transferId: transfer.id,
      message:    'Session complete — tutor payout sent automatically.',
    });

  } catch(err) {
    console.error('[Studly] Complete session error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
