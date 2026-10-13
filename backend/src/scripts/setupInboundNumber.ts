// backend/src/scripts/setupInboundNumber.ts
//
// LeadMind AI — Day 18, Session 1 one-time setup script
// Run with: npm run setup:inbound-number -- <your-public-webhook-url>
//
// Configures your VAPI_PHONE_NUMBER_ID (backend/.env) to route inbound
// calls through the assistant-request flow instead of a static assistant:
//   - Clears any assistantId currently set on the number
//   - Sets the number's Server URL to <your-public-webhook-url>/api/webhooks/vapi
//
// The URL you pass MUST be publicly reachable over HTTPS — Vapi's servers
// call it directly. `localhost` will not work. During development, use
// ngrok: `ngrok http 8000`, then pass the printed https://*.ngrok-free.app
// URL. In production, pass your deployed backend's URL.
//
// This only needs to be run once per phone number (re-run any time you
// change your public URL, e.g. a new ngrok tunnel).

import dotenv from 'dotenv';
dotenv.config();

import { attachServerUrlToPhoneNumber } from '../services/vapiService';

async function run() {
  const publicUrl = process.argv[2];

  if (!publicUrl) {
    console.error('❌ Missing argument.\n');
    console.error('Usage:');
    console.error('  npm run setup:inbound-number -- https://your-public-url.example.com\n');
    console.error('During development with ngrok:');
    console.error('  1. In another terminal: ngrok http 8000');
    console.error('  2. Copy the https://*.ngrok-free.app URL ngrok prints');
    console.error('  3. npm run setup:inbound-number -- https://xxxx.ngrok-free.app');
    process.exit(1);
  }

  if (!/^https:\/\//.test(publicUrl)) {
    console.error(`❌ "${publicUrl}" must start with https:// — Vapi requires HTTPS for server URLs.`);
    process.exit(1);
  }

  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;
  if (!phoneNumberId) {
    console.error('❌ VAPI_PHONE_NUMBER_ID is not set in backend/.env');
    process.exit(1);
  }
  if (!process.env.VAPI_WEBHOOK_SECRET) {
    console.error('❌ VAPI_WEBHOOK_SECRET is not set in backend/.env');
    process.exit(1);
  }

  const webhookUrl = `${publicUrl.replace(/\/$/, '')}/api/webhooks/vapi`;

  console.log(`Attaching server URL to phone number ${phoneNumberId}...`);
  console.log(`  Server URL: ${webhookUrl}`);
  console.log(`  Webhook secret header: included`);
  console.log(`  Clearing any existing static assistantId (required for assistant-request to fire)\n`);

  try {
    await attachServerUrlToPhoneNumber(phoneNumberId, webhookUrl);
    console.log('✅ Phone number updated successfully.');
    console.log('\nYour inbound number will now send an "assistant-request" event to your');
    console.log('backend for every incoming call. Make sure your backend is running and');
    console.log('reachable at the URL above before calling in.');
  } catch (err: any) {
    console.error('❌ Failed to update phone number:', err.response?.data || err.message);
    console.error('\nIf this fails with a validation error, your VAPI account may require');
    console.error('the "provider" field alongside "server" on this endpoint — check the');
    console.error('error details above and, if needed, add your number\'s provider');
    console.error('(e.g. "telnyx") to the PATCH body in attachServerUrlToPhoneNumber().');
    process.exit(1);
  }
}

run();