// backend/src/scripts/testVapiSetup.ts
// Day 14 — Session 1 verification script
//
// Run with: npm run test:vapi
//
// What it checks:
// 1. All required VAPI env vars are present in backend/.env
// 2. VAPI_API_KEY + VAPI_PHONE_NUMBER_ID are valid by calling VAPI's
//    GET /phone-number/:id endpoint — if this succeeds, your key and
//    phone number are both correctly configured.
//
// This does NOT place a call and does NOT touch MongoDB — it only confirms
// your VAPI account/credentials are wired up correctly before we build the
// assistant service (Session 2) and webhook handler (Session 3).

import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';

const REQUIRED_VARS = [
  'VAPI_API_KEY',
  'VAPI_PHONE_NUMBER_ID',
  'VAPI_WEBHOOK_SECRET',
  'VAPI_BASE_URL',
];

function checkEnvVars(): boolean {
  console.log('\n🔎 Checking required VAPI environment variables...\n');
  let allPresent = true;

  for (const key of REQUIRED_VARS) {
    const value = process.env[key];
    if (!value || value.startsWith('your_')) {
      console.log(`  ❌ ${key} — missing or still set to placeholder value`);
      allPresent = false;
    } else {
      const masked =
        key.includes('KEY') || key.includes('SECRET')
          ? value.slice(0, 4) + '••••••••'
          : value;
      console.log(`  ✅ ${key} = ${masked}`);
    }
  }

  return allPresent;
}

async function checkVapiConnection(): Promise<boolean> {
  const baseUrl = process.env.VAPI_BASE_URL;
  const apiKey = process.env.VAPI_API_KEY;
  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;

  console.log('\n🔎 Verifying credentials against the VAPI API...\n');

  try {
    const response = await axios.get(
      `${baseUrl}/phone-number/${phoneNumberId}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
      }
    );

    console.log('  ✅ Successfully authenticated with VAPI');
    console.log(`  ✅ Phone number found: ${response.data.number || '(no number field returned)'}`);
    console.log(`  ✅ Phone number status: ${response.data.status || 'unknown'}`);
    return true;
  } catch (err: any) {
    if (err.response) {
      console.log(`  ❌ VAPI responded with status ${err.response.status}`);
      console.log(`  ❌ ${JSON.stringify(err.response.data)}`);
      if (err.response.status === 401) {
        console.log('  ↳ This usually means VAPI_API_KEY is wrong or expired.');
      }
      if (err.response.status === 404) {
        console.log('  ↳ This usually means VAPI_PHONE_NUMBER_ID is wrong.');
      }
    } else {
      console.log(`  ❌ Could not reach VAPI: ${err.message}`);
    }
    return false;
  }
}

(async () => {
  console.log('═══════════════════════════════════════════════════');
  console.log('  LeadMind AI — Day 14 Session 1: VAPI Setup Check');
  console.log('═══════════════════════════════════════════════════');

  const envOk = checkEnvVars();

  if (!envOk) {
    console.log('\n❌ Fix the missing/placeholder env vars above in backend/.env, then re-run this script.\n');
    process.exit(1);
  }

  const connectionOk = await checkVapiConnection();

  console.log('\n───────────────────────────────────────────────────');
  if (connectionOk) {
    console.log('✅ ALL CHECKS PASSED — VAPI is correctly configured.');
    console.log('   Ready to move to Session 2 (assistant creation).');
  } else {
    console.log('❌ VAPI connection check failed — see errors above.');
  }
  console.log('───────────────────────────────────────────────────\n');

  process.exit(connectionOk ? 0 : 1);
})();