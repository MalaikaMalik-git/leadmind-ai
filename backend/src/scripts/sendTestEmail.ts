// backend/src/scripts/sendTestEmail.ts
//
// Sends a sample meeting-invitation email so you can check, BEFORE a demo,
// that it reaches the inbox and not the spam folder.
//
// Usage:
//   npm run email:test -- you@gmail.com
//
// Tip: also send one to the address shown on https://www.mail-tester.com
// (it scores SPF / DKIM / DMARC / content out of 10 — aim for 9+).

import dotenv from 'dotenv';
dotenv.config();
import { isEmailConfigured, verifyEmailTransport, sendDeliverabilityTestEmail } from '../services/emailService';

async function main() {
  const to = process.argv[2];
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) {
    console.error('Usage: npm run email:test -- recipient@example.com');
    process.exit(1);
  }

  if (!isEmailConfigured()) {
    console.error('❌ SMTP is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS in backend/.env (see EMAIL_SETUP.md).');
    process.exit(1);
  }

  console.log('Checking SMTP login…');
  const check = await verifyEmailTransport();
  if (!check.ok) {
    console.error(`❌ SMTP login failed: ${check.error}`);
    process.exit(1);
  }
  console.log('✅ SMTP login OK');

  const result = await sendDeliverabilityTestEmail(to);
  if (!result.sent) {
    console.error(`❌ Send failed: ${result.reason}`);
    process.exit(1);
  }
  console.log(`✅ Sent to ${to} (message id ${result.messageId})`);
  console.log('   Now open it and check: Inbox (not Spam)? "Show original" → SPF: PASS, DKIM: PASS, DMARC: PASS?');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
