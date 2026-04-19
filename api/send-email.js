const nodemailer = require('nodemailer');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://studly.it.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, data } = req.body;
  if (!type || !data) return res.status(400).json({ error: 'Missing type or data' });

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  const PLATFORM_EMAIL = process.env.GMAIL_USER || 'studly.it@gmail.com';
  const PLATFORM_NAME  = 'Studly';

  const base = (body) => `
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#0a0a0a;">
      <div style="border-bottom:1px solid #e8e8e5;padding:24px 0 16px;margin-bottom:28px;">
        <span style="font-size:22px;letter-spacing:0.1em;">Studly</span>
        <span style="font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:#888884;border:1px solid #c8c8c4;padding:2px 7px;margin-left:10px;font-family:sans-serif;">UK & USA</span>
      </div>
      ${body}
      <div style="border-top:1px solid #e8e8e5;padding-top:16px;margin-top:32px;font-size:11px;color:#888884;font-family:sans-serif;">
        Studly · studly.it.com · <a href="mailto:studly.it@gmail.com" style="color:#888884;">studly.it@gmail.com</a>
      </div>
    </div>`;

  const sessionLabel = (t) => t === '1hr' ? '1-hour session' : t === '90min' ? '90-minute session' : t === 'block5' ? 'Block of 5 sessions' : t || 'Session';

  let mail = null;
  let adminMail = null;

  try {
    switch (type) {

      // ── NEW BOOKING (tutee paid) ──────────────────────────────
      case 'booking_confirmed': {
        const { tuteeEmail, tuteeName, tutorName, sessionType, date, time, notes } = data;

        // Email to tutee (confirmation)
        mail = {
          from: `"${PLATFORM_NAME}" <${PLATFORM_EMAIL}>`,
          to: tuteeEmail,
          subject: `Booking confirmed — ${sessionLabel(sessionType)} with ${tutorName}`,
          html: base(`
            <h2 style="font-weight:300;font-size:26px;margin-bottom:6px;">Your session is booked.</h2>
            <p style="font-size:12px;color:#888884;margin-bottom:24px;">Here's what happens next.</p>
            <div style="border:1px solid #e8e8e5;padding:18px;margin-bottom:20px;">
              <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#888884;margin-bottom:12px;font-family:sans-serif;">Session details</div>
              <div style="font-size:14px;margin-bottom:6px;"><strong>${sessionLabel(sessionType)}</strong> with ${tutorName}</div>
              <div style="font-size:13px;color:#444442;">${date || '—'} · ${time || '—'}</div>
              ${notes ? `<div style="font-size:12px;color:#888884;margin-top:8px;font-style:italic;">"${notes}"</div>` : ''}
            </div>
            <p style="font-size:13px;line-height:1.8;">Your tutor will be in touch via Studly messages to confirm the session link. You can message them directly at <a href="https://studly.it.com" style="color:#0a0a0a;">studly.it.com</a>.</p>
            <p style="font-size:12px;color:#888884;line-height:1.8;">If you need to cancel or have a problem, email us at <a href="mailto:studly.it@gmail.com" style="color:#888884;">studly.it@gmail.com</a>.</p>`),
        };

        // Email to admin (you)
        adminMail = {
          from: `"${PLATFORM_NAME}" <${PLATFORM_EMAIL}>`,
          to: PLATFORM_EMAIL,
          subject: `New booking — ${tutorName} · ${sessionLabel(sessionType)}`,
          html: base(`
            <h2 style="font-weight:300;font-size:22px;margin-bottom:16px;">New booking received</h2>
            <table style="font-size:13px;border-collapse:collapse;width:100%;">
              <tr><td style="padding:6px 0;color:#888884;width:120px;">Tutee</td><td>${tuteeName || tuteeEmail}</td></tr>
              <tr><td style="padding:6px 0;color:#888884;">Tutor</td><td>${tutorName}</td></tr>
              <tr><td style="padding:6px 0;color:#888884;">Session</td><td>${sessionLabel(sessionType)}</td></tr>
              <tr><td style="padding:6px 0;color:#888884;">Date</td><td>${date || '—'} · ${time || '—'}</td></tr>
              ${notes ? `<tr><td style="padding:6px 0;color:#888884;">Notes</td><td><em>${notes}</em></td></tr>` : ''}
            </table>`),
        };
        break;
      }

      // ── TUTOR NEW BOOKING REQUEST ─────────────────────────────
      case 'tutor_new_booking': {
        const { tutorEmail, tutorName, tuteeName, sessionType, date, time, notes } = data;
        mail = {
          from: `"${PLATFORM_NAME}" <${PLATFORM_EMAIL}>`,
          to: tutorEmail,
          subject: `New booking request — ${sessionLabel(sessionType)}`,
          html: base(`
            <h2 style="font-weight:300;font-size:26px;margin-bottom:6px;">You have a new booking.</h2>
            <p style="font-size:12px;color:#888884;margin-bottom:24px;">A student has paid and requested a session with you.</p>
            <div style="border:1px solid #e8e8e5;padding:18px;margin-bottom:20px;">
              <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#888884;margin-bottom:12px;font-family:sans-serif;">Session details</div>
              <div style="font-size:14px;margin-bottom:6px;"><strong>${sessionLabel(sessionType)}</strong></div>
              <div style="font-size:13px;color:#444442;">${date || '—'} · ${time || '—'}</div>
              <div style="font-size:13px;color:#444442;margin-top:4px;">Student: ${tuteeName || 'Student'}</div>
              ${notes ? `<div style="font-size:12px;color:#888884;margin-top:8px;font-style:italic;">"${notes}"</div>` : ''}
            </div>
            <p style="font-size:13px;line-height:1.8;">Log into <a href="https://studly.it.com" style="color:#0a0a0a;">studly.it.com</a> to accept or decline, and to message the student.</p>`),
        };
        break;
      }

      // ── BOOKING ACCEPTED ──────────────────────────────────────
      case 'booking_accepted': {
        const { tuteeEmail, tutorName, sessionType, date, time } = data;
        mail = {
          from: `"${PLATFORM_NAME}" <${PLATFORM_EMAIL}>`,
          to: tuteeEmail,
          subject: `Session confirmed — ${tutorName} accepted your booking`,
          html: base(`
            <h2 style="font-weight:300;font-size:26px;margin-bottom:6px;">Your session is confirmed.</h2>
            <p style="font-size:13px;color:#444442;margin-bottom:20px;">${tutorName} has accepted your booking for <strong>${sessionLabel(sessionType)}</strong> on ${date || '—'} · ${time || '—'}.</p>
            <p style="font-size:13px;line-height:1.8;">Your tutor will share the session link via Studly messages. Log in at <a href="https://studly.it.com" style="color:#0a0a0a;">studly.it.com</a> to chat.</p>`),
        };
        break;
      }

      // ── BOOKING DECLINED ──────────────────────────────────────
      case 'booking_declined': {
        const { tuteeEmail, tutorName, sessionType } = data;
        mail = {
          from: `"${PLATFORM_NAME}" <${PLATFORM_EMAIL}>`,
          to: tuteeEmail,
          subject: `Session declined — ${tutorName}`,
          html: base(`
            <h2 style="font-weight:300;font-size:26px;margin-bottom:6px;">Your session was declined.</h2>
            <p style="font-size:13px;color:#444442;margin-bottom:20px;">${tutorName} was unable to accept your <strong>${sessionLabel(sessionType)}</strong> request.</p>
            <p style="font-size:13px;line-height:1.8;">We'll process a full refund within 2 business days. You can find another tutor at <a href="https://studly.it.com" style="color:#0a0a0a;">studly.it.com</a>.</p>
            <p style="font-size:12px;color:#888884;">Questions? Email <a href="mailto:studly.it@gmail.com" style="color:#888884;">studly.it@gmail.com</a>.</p>`),
        };
        adminMail = {
          from: `"${PLATFORM_NAME}" <${PLATFORM_EMAIL}>`,
          to: PLATFORM_EMAIL,
          subject: `Booking declined — refund needed · ${tutorName}`,
          html: base(`<p style="font-size:13px;">Tutor <strong>${tutorName}</strong> declined a <strong>${sessionLabel(sessionType)}</strong> booking. Tutee: <strong>${tuteeEmail}</strong>. Please process refund via Stripe dashboard.</p>`),
        };
        break;
      }

      // ── REFUND REQUEST ────────────────────────────────────────
      case 'refund_requested': {
        const { tuteeEmail, tutorName, sessionType, reason } = data;
        mail = {
          from: `"${PLATFORM_NAME}" <${PLATFORM_EMAIL}>`,
          to: tuteeEmail,
          subject: 'Refund request received',
          html: base(`
            <h2 style="font-weight:300;font-size:26px;margin-bottom:6px;">Refund request received.</h2>
            <p style="font-size:13px;line-height:1.8;">We've received your refund request for your <strong>${sessionLabel(sessionType)}</strong> with ${tutorName}. We'll process it within 2 business days and the amount will return to your original payment method.</p>`),
        };
        adminMail = {
          from: `"${PLATFORM_NAME}" <${PLATFORM_EMAIL}>`,
          to: PLATFORM_EMAIL,
          subject: `Refund requested — ${sessionLabel(sessionType)} · ${tutorName}`,
          html: base(`
            <h2 style="font-weight:300;font-size:22px;margin-bottom:16px;">Refund request</h2>
            <table style="font-size:13px;border-collapse:collapse;width:100%;">
              <tr><td style="padding:6px 0;color:#888884;width:120px;">Tutee</td><td>${tuteeEmail}</td></tr>
              <tr><td style="padding:6px 0;color:#888884;">Tutor</td><td>${tutorName}</td></tr>
              <tr><td style="padding:6px 0;color:#888884;">Session</td><td>${sessionLabel(sessionType)}</td></tr>
              <tr><td style="padding:6px 0;color:#888884;">Reason</td><td><em>${reason || 'No reason given'}</em></td></tr>
            </table>
            <p style="font-size:13px;margin-top:16px;"><a href="https://dashboard.stripe.com/payments" style="color:#0a0a0a;">Process refund in Stripe →</a></p>`),
        };
        break;
      }

      // ── PAYOUT REQUEST ────────────────────────────────────────
      case 'payout_requested': {
        const { tutorEmail, tutorName, payoutType, details } = data;
        mail = {
          from: `"${PLATFORM_NAME}" <${PLATFORM_EMAIL}>`,
          to: tutorEmail,
          subject: 'Payout request received',
          html: base(`
            <h2 style="font-weight:300;font-size:26px;margin-bottom:6px;">Payout request received.</h2>
            <p style="font-size:13px;line-height:1.8;">We'll send your earnings within 2 business days. Questions? <a href="mailto:studly.it@gmail.com" style="color:#0a0a0a;">studly.it@gmail.com</a></p>`),
        };
        adminMail = {
          from: `"${PLATFORM_NAME}" <${PLATFORM_EMAIL}>`,
          to: PLATFORM_EMAIL,
          subject: `Payout requested — ${tutorName}`,
          html: base(`
            <h2 style="font-weight:300;font-size:22px;margin-bottom:16px;">Payout request</h2>
            <table style="font-size:13px;border-collapse:collapse;width:100%;">
              <tr><td style="padding:6px 0;color:#888884;width:120px;">Tutor</td><td>${tutorName}</td></tr>
              <tr><td style="padding:6px 0;color:#888884;">Email</td><td>${tutorEmail}</td></tr>
              <tr><td style="padding:6px 0;color:#888884;">Method</td><td>${payoutType}</td></tr>
              <tr><td style="padding:6px 0;color:#888884;">Details</td><td>${details || '—'}</td></tr>
            </table>`),
        };
        break;
      }

      default:
        return res.status(400).json({ error: 'Unknown email type' });
    }

    // Send emails
    if (mail) await transporter.sendMail(mail);
    if (adminMail) await transporter.sendMail(adminMail);

    return res.status(200).json({ sent: true });

  } catch(err) {
    console.error('[Studly] Email error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
