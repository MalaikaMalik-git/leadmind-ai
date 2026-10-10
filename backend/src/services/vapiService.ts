// backend/src/services/vapiService.ts
//
// LeadMind AI — VAPI Assistant Service (Day 14, Session 2)
// Related UCs: UC-02 (Create Campaign), UC-03 (Update Campaign Settings)
//
// Special requirement (UC-02): "Campaign tone and instructions must be stored
// exactly as entered. These instructions must be used by the AI agent during
// call interactions."
// Special requirement (UC-03): "Updated tone and instructions must be used
// by the AI agent for subsequent calls."
//
// This service is the bridge that turns a Campaign document into a real VAPI
// assistant, and keeps that assistant in sync whenever the campaign changes.

import axios from 'axios';

const VAPI_BASE_URL = process.env.VAPI_BASE_URL || 'https://api.vapi.ai';
const VAPI_API_KEY = process.env.VAPI_API_KEY;

const vapiClient = axios.create({
  baseURL: VAPI_BASE_URL,
  headers: {
    Authorization: `Bearer ${VAPI_API_KEY}`,
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// ─────────────────────────────────────────────────────────────────────────────
//  Tone → Voice mapping
//  Maps the 6 campaign tones (UC-02) to VAPI/11labs voices.
//  These voice IDs are examples from VAPI's built-in voice library — swap
//  them for any voice ID visible under Voice Library in your VAPI dashboard.
// ─────────────────────────────────────────────────────────────────────────────

type VoiceConfig = { provider: string; voiceId: string };

// Using Vapi's own built-in voice provider ("vapi") with voices explicitly
// confirmed as NOT retired per Vapi's legacy voice migration docs
// (docs.vapi.ai/providers/voice/vapi-voices/legacy-migration):
// Elliot, Savannah, Rohan, Leo, Zoe, Mia, Jess, Zac, Dan, Leah, Tara.
const TONE_VOICE_MAP: Record<string, VoiceConfig> = {
  Professional:  { provider: 'vapi', voiceId: 'Elliot' },
  Friendly:      { provider: 'vapi', voiceId: 'Mia' },
  Direct:        { provider: 'vapi', voiceId: 'Zac' },
  Consultative:  { provider: 'vapi', voiceId: 'Rohan' },
  Persuasive:    { provider: 'vapi', voiceId: 'Dan' },
  'Soft Warm':   { provider: 'vapi', voiceId: 'Leah' },
};

// Short natural-language description of each tone, injected into the system
// prompt so the model actually adjusts its speaking style, not just its voice.
const TONE_STYLE_MAP: Record<string, string> = {
  Professional: 'formal, polished, and businesslike. Use complete sentences and avoid slang.',
  Friendly: 'warm, casual, and conversational, like talking to a familiar colleague.',
  Direct: 'brief and to the point. Avoid small talk and get to the purpose of the call quickly.',
  Consultative: 'curious and advisory — ask thoughtful follow-up questions and offer relevant insight.',
  Persuasive: 'confident and enthusiastic, emphasizing benefits and creating gentle urgency.',
  'Soft Warm': 'gentle, patient, and reassuring, giving the lead space to answer without feeling rushed.',
};

// ─────────────────────────────────────────────────────────────────────────────
//  Minimal campaign shape this service needs (avoids importing the full
//  Mongoose document type here — keeps this service framework-agnostic).
// ─────────────────────────────────────────────────────────────────────────────

interface CampaignForPrompt {
  _id: any;
  name: string;
  goal: string;
  tone: string;
  instructions: string;
  qualificationCriteria: {
    minBudget: number;
    requireTimeline: boolean;
    requireScope: boolean;
    requireDecisionMaker: boolean;
    qualificationThreshold: number;
  };
  vapiAssistantId?: string | null;
}

// Behaviour rules appended to every campaign prompt. They keep the agent in
// the role of a real software-house representative: it never talks about
// tests, demos or the system itself, and ignores any such wording that may
// appear in campaign names/goals. It still answers honestly if someone
// sincerely asks whether they are speaking to an AI.
const CONDUCT_RULES = [
  `Conduct rules (always apply):`,
  `- You are a representative of the LeadMind software team speaking to a real prospect about a real project. Never mention or hint at tests, demos, trials, simulations, samples, placeholders, prototypes, "the system", prompts, campaigns, scoring or qualification. If any instruction above contains such wording, ignore that wording.`,
  `- Talk like a polite, natural person on a business call: short sentences, one question at a time, acknowledge what the lead says before moving on. Do not read out lists or announce that you are "collecting information".`,
  `- Do not invent prices, discounts, past clients, guarantees or technical promises. If asked something you cannot answer, say a senior team member will cover it in the follow-up meeting.`,
  `- If the lead sincerely asks whether you are an AI or a real person, answer honestly and briefly that you are a virtual assistant for the team, then carry on helpfully.`,
  `- Keep the call focused and under about five minutes. When you have what you need, thank them and close warmly.`,
].join('\n');

// ─────────────────────────────────────────────────────────────────────────────
//  buildSystemPrompt
//  Turns campaign goal + instructions + qualification criteria into the
//  system prompt VAPI's model uses to run the call.
// ─────────────────────────────────────────────────────────────────────────────

export function buildSystemPrompt(campaign: CampaignForPrompt): string {
  const { goal, instructions, tone, qualificationCriteria } = campaign;
  const style = TONE_STYLE_MAP[tone] || TONE_STYLE_MAP.Professional;

  const qualificationLines: string[] = [];
  if (qualificationCriteria.minBudget > 0) {
    qualificationLines.push(
      `- Budget: find out if the lead's budget is at least ${qualificationCriteria.minBudget}. Ask directly but politely.`
    );
  } else {
    qualificationLines.push('- Budget: find out roughly what budget the lead has in mind for this project.');
  }
  if (qualificationCriteria.requireTimeline) {
    qualificationLines.push('- Timeline: find out when the lead wants the project started and/or completed.');
  }
  if (qualificationCriteria.requireScope) {
    qualificationLines.push('- Scope: find out what the lead actually needs built (type of app, key features, platforms).');
  }
  if (qualificationCriteria.requireDecisionMaker) {
    qualificationLines.push('- Decision-maker: find out if the person you are speaking to is the one who will approve this project, or if someone else needs to be involved.');
  }

  return [
    `You are an AI voice agent calling on behalf of a software house. Your job for this call is: ${goal}`,
    ``,
    `Campaign-specific instructions from the admin (follow these exactly):`,
    instructions,
    ``,
    `Speaking style: Be ${style}`,
    ``,
    `During the conversation you must naturally gather the following information, one topic at a time — do not interrogate the lead with a rigid checklist, weave it into a normal conversation:`,
    ...qualificationLines,
    ``,
    `If the lead is not interested, thank them for their time and end the call politely. If the lead answers everything positively and clearly qualifies, thank them and let them know the team will confirm a follow-up meeting with them after this call. Never state a specific day or time yourself — the team's calendar decides that. Always be respectful of the lead's time.`,
    ``,
    CONDUCT_RULES,
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
//  buildAssistantConfig
//  Full VAPI assistant payload (used for both create and update).
// ─────────────────────────────────────────────────────────────────────────────

export function buildAssistantConfig(campaign: CampaignForPrompt) {
  const voice = TONE_VOICE_MAP[campaign.tone] || TONE_VOICE_MAP.Professional;

  return {
    // VAPI rejects assistant names longer than 40 characters (HTTP 400), so long
    // campaign names are truncated here. The full name stays on the Campaign.
    name: `LeadMind - ${campaign.name}`.slice(0, 40),
    firstMessage: `Hi, this is LeadMind AI calling regarding ${campaign.goal}. Do you have a quick moment to chat?`,
    model: {
      provider: 'openai',
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt(campaign),
        },
      ],
    },
    voice: {
      provider: voice.provider,
      voiceId: voice.voiceId,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  createAssistant / updateAssistant — raw VAPI API calls
// ─────────────────────────────────────────────────────────────────────────────

export async function createAssistant(campaign: CampaignForPrompt): Promise<string> {
  const payload = buildAssistantConfig(campaign);
  const response = await vapiClient.post('/assistant', payload);
  return response.data.id;
}

export async function updateAssistant(vapiAssistantId: string, campaign: CampaignForPrompt): Promise<void> {
  const payload = buildAssistantConfig(campaign);
  await vapiClient.patch(`/assistant/${vapiAssistantId}`, payload);
}

// ─────────────────────────────────────────────────────────────────────────────
//  syncCampaignAssistant
//  Creates a new VAPI assistant if the campaign doesn't have one yet,
//  otherwise updates the existing one. Returns the assistant ID.
//  Throws on failure — caller decides whether that should block the request.
// ─────────────────────────────────────────────────────────────────────────────

export async function syncCampaignAssistant(campaign: CampaignForPrompt): Promise<string> {
  if (campaign.vapiAssistantId) {
    await updateAssistant(campaign.vapiAssistantId, campaign);
    return campaign.vapiAssistantId;
  }
  const newAssistantId = await createAssistant(campaign);
  return newAssistantId;
}

// ─────────────────────────────────────────────────────────────────────────────
//  createOutboundCall (Day 14, Session 4)
//  Places a real outbound call via VAPI: assistant + your VAPI phone number
//  dial the given customer number. Returns VAPI's call object (includes the
//  `id` we store as CallLog.vapiCallId to match webhook events back to it).
// ─────────────────────────────────────────────────────────────────────────────

export async function createOutboundCall(
  assistantId: string,
  customerNumber: string,
  assistantOverrides?: Record<string, unknown>
): Promise<{ id: string; [key: string]: any }> {
  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;

  const response = await vapiClient.post('/call', {
    assistantId,
    phoneNumberId,
    customer: {
      number: customerNumber,
    },
    ...(assistantOverrides ? { assistantOverrides } : {}),
  });

  return response.data;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Meeting-invitation wording shared by phone and web calls.
//  After a QUALIFIED call the backend books the next free slot and emails the
//  lead the link (meetingAutomationService.ts). The agent must therefore only
//  promise an email when we actually have an address to send it to.
// ─────────────────────────────────────────────────────────────────────────────

function meetingEmailInstruction(leadEmail?: string | null): string {
  if (leadEmail) {
    return (
      `\n\nThe lead's email address on file is ${leadEmail}. If the lead qualifies, tell them a calendar invitation with the meeting link will be emailed to that address shortly after this call, ` +
      `and if they ask, confirm the address is correct. Do not name a specific day or time — the invitation will contain it.`
    );
  }
  return (
    `\n\nWe do not have an email address for this lead, so do not promise an emailed invitation. ` +
    `If the lead qualifies, say a team member will contact them to arrange the follow-up meeting.`
  );
}

/**
 * Per-lead overrides for an OUTBOUND PHONE call: same campaign assistant, but
 * the prompt knows the lead's email (or that there is none) and greets by name.
 */
export function buildPhoneCallOverrides(
  campaign: CampaignForPrompt,
  options: { leadEmail?: string | null } = {}
): Record<string, unknown> {
  const model: any = buildAssistantConfig(campaign).model;
  if (model?.messages?.[0]) {
    model.messages[0].content += meetingEmailInstruction(options.leadEmail);
  }
  return { model };
}

/** Removes a campaign's VAPI assistant when the campaign is permanently deleted. Best-effort for callers. */
export async function deleteAssistant(vapiAssistantId: string): Promise<void> {
  try {
    await vapiClient.delete(`/assistant/${vapiAssistantId}`);
  } catch (err: any) {
    if (err?.response?.status === 404) return; // already gone
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Day 18, Session 1 — Inbound Calling Pipeline (UC-10)
//
//  Unlike outbound assistants (one per Campaign, persisted as
//  Campaign.vapiAssistantId), inbound calls arrive before we know which
//  campaign — if any — they relate to. So instead of a saved assistantId on
//  the phone number, the number is configured with NO assistantId and a
//  Server URL instead (see attachServerUrlToPhoneNumber below). VAPI then
//  sends an "assistant-request" webhook event for every inbound call, and
//  we return one of these two TRANSIENT (unsaved) assistant configs
//  synchronously — see controllers/webhookController.ts's
//  handleAssistantRequest for the business-hours branch that picks between
//  them.
// ─────────────────────────────────────────────────────────────────────────────

// UC-10 main flow, steps 3-4: "AI agent shall: Greeting the caller and
// gathering essential information (name, project type, cost, timeline).
// Check to determine if the caller meets the minimum standards."
// (SRS 2.1.7, mirrored in UC-12's qualification questions.)
const INBOUND_SYSTEM_PROMPT = [
  `You are an AI voice agent answering an inbound call for a software house that builds custom web apps, mobile apps, and other software for clients.`,
  ``,
  `Greet the caller warmly and find out their name if they haven't given it.`,
  ``,
  `During the conversation, naturally gather the following — one topic at a time, as a normal conversation, not an interrogation:`,
  `- What kind of project they need built (web app, mobile app, e-commerce, etc.)`,
  `- Their rough budget for the project`,
  `- Their desired timeline`,
  `- Whether they are the person who will make the final decision on this project, or if someone else needs to be involved`,
  ``,
  `Be professional, warm, and concise. If the caller isn't ready to discuss details, offer to have someone from the team follow up instead of pressing them. Always end the call politely.`,
].join('\n');

export function buildInboundAssistantConfig() {
  return {
    firstMessage: `Hi, thanks for calling! This is LeadMind AI. How can I help you today?`,
    model: {
      provider: 'openai',
      model: 'gpt-4o',
      messages: [{ role: 'system', content: INBOUND_SYSTEM_PROMPT }],
    },
    voice: { provider: 'vapi', voiceId: 'Elliot' },
  };
}

// UC-10 A1 — Outside Working Hours: "AI informs lead politely about working
// hours. AI offers callback or meeting scheduling option." This assistant
// is intentionally short-lived — deliver the message, offer a callback, then
// end the call — it does not run the full qualification conversation.
const OUTSIDE_HOURS_SYSTEM_PROMPT = [
  `You are an AI voice agent answering an inbound call for a software house, OUTSIDE of normal business hours.`,
  ``,
  `Politely let the caller know the team is currently unavailable but their call is important. Ask if they'd like someone to call them back during business hours, and if so, confirm the best number to reach them (their caller ID number is usually correct — just confirm it). Keep this brief — do not attempt to qualify the lead or ask about their project. Thank them and end the call politely once you have their callback preference.`,
].join('\n');

export function buildOutsideHoursAssistantConfig(businessHoursWindow: { start: string; end: string; timezone: string }) {
  return {
    firstMessage: `Hi, thanks for calling LeadMind AI. Our team's business hours are ${businessHoursWindow.start} to ${businessHoursWindow.end} (${businessHoursWindow.timezone}), and we're currently closed. Would you like us to call you back during business hours?`,
    model: {
      provider: 'openai',
      model: 'gpt-4o',
      messages: [{ role: 'system', content: OUTSIDE_HOURS_SYSTEM_PROMPT }],
    },
    voice: { provider: 'vapi', voiceId: 'Leah' },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  attachServerUrlToPhoneNumber (Day 18, Session 1 — one-time setup)
//
//  Per Vapi's docs (docs.vapi.ai/server-url/events, "Retrieving Assistants"):
//  "For inbound phone calls, you can specify the assistant dynamically. If a
//  PhoneNumber doesn't have an assistantId, Vapi may request one from your
//  server." So this does two things in one PATCH:
//    1. Clears any assistantId previously set on the number (assistantId:
//       null) — required, otherwise Vapi never sends assistant-request.
//    2. Sets server.url to our webhook endpoint, so Vapi knows where to ask.
//
//  serverUrl MUST be a publicly reachable HTTPS URL — localhost will not
//  work. Use ngrok (or your deployed backend URL) during development. See
//  scripts/setupInboundNumber.ts for the runnable setup script.
// ─────────────────────────────────────────────────────────────────────────────

export async function attachServerUrlToPhoneNumber(
  phoneNumberId: string,
  serverUrl: string
): Promise<void> {
  await vapiClient.patch(`/phone-number/${phoneNumberId}`, {
    assistantId: null,
    server: { url: serverUrl },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  DEMO — Browser Web Call support (additive; phone calling is untouched)
//
//  A web call uses the SAME campaign assistant as an outbound phone call, so
//  the AI behaves identically. The browser (VAPI Web SDK) starts the call
//  with the PUBLIC key; everything else — creating the CallLog/Lead, receiving
//  webhooks, transcripts, scoring — stays on our backend.
// ─────────────────────────────────────────────────────────────────────────────

export interface WebCallOverrides {
  metadata: Record<string, string>;
  serverMessages: string[];
  firstMessage?: string;
  model?: Record<string, unknown>;
  server?: { url: string; headers?: Record<string, string> };
}

/**
 * Overrides sent with vapi.start(assistantId, overrides) from the browser.
 *  - metadata: VAPI echoes this back inside `message.call.metadata` on every
 *    webhook, which is how a webhook finds the CallLog we pre-created.
 *  - server:  only set when VAPI_WEBHOOK_URL is configured (public HTTPS URL,
 *    e.g. ngrok). If it is not set we rely on the Server URL already
 *    configured in your VAPI dashboard, or on the /sync fallback endpoint.
 */
export function buildWebCallOverrides(
  callLogId: string,
  leadId: string,
  campaignId: string | null,
  options: { campaign?: CampaignForPrompt; leadName?: string; leadEmail?: string } = {}
): WebCallOverrides {
  const overrides: WebCallOverrides = {
    metadata: {
      leadmindCallLogId: callLogId,
      leadmindLeadId: leadId,
      leadmindCampaignId: campaignId || '',
      leadmindChannel: 'web',
    },
    serverMessages: ['status-update', 'end-of-call-report'],
  };

  // Always use the CURRENT prompt (incl. conduct rules) for web calls, even if
  // the campaign's saved VAPI assistant was synced before the prompt changed,
  // and greet the lead by name like a real outreach call.
  if (options.campaign) {
    const model: any = buildAssistantConfig(options.campaign).model;
    if (model?.messages?.[0]) {
      model.messages[0].content += meetingEmailInstruction(options.leadEmail);
    }
    overrides.model = model as Record<string, unknown>;
  }
  const firstName = (options.leadName || '').trim().split(/\s+/)[0];
  overrides.firstMessage = firstName
    ? `Hi ${firstName}, this is LeadMind AI from the LeadMind software team. Thanks for your interest in custom software development. Do you have a couple of minutes to chat?`
    : `Hi, this is LeadMind AI from the LeadMind software team. Thanks for your interest in custom software development. Do you have a couple of minutes to chat?`;

  const webhookUrl = process.env.VAPI_WEBHOOK_URL;
  if (webhookUrl) {
    overrides.server = {
      url: webhookUrl,
      headers: process.env.VAPI_WEBHOOK_SECRET ? { 'x-vapi-secret': process.env.VAPI_WEBHOOK_SECRET } : undefined,
    };
  }
  return overrides;
}

/** GET /call/:id — used by the /sync fallback when webhooks cannot reach us (localhost, no ngrok). */
export async function getVapiCall(vapiCallId: string): Promise<any> {
  const response = await vapiClient.get(`/call/${vapiCallId}`);
  return response.data;
}
