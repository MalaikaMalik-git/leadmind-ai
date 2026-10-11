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

// One place for the company story. The agent says this only after the lead
// agrees to two minutes, and only in these words.
const COMPANY_INTRO =
  'LeadMind builds custom web apps, mobile apps, and AI features for businesses, using modern web, mobile, and cloud tools. The team is based in Islamabad, Pakistan.';

// Live slot checks only work when VAPI can reach this server. Without that,
// the agent must not invent a meeting time.
function liveCalendarEnabled(): boolean {
  return !!process.env.VAPI_WEBHOOK_URL;
}

/** First spoken line for phone and web calls: who is calling, one sentence, then permission. */
export function buildOpeningLine(leadName?: string): string {
  const firstName = (leadName || '').trim().split(/\s+/)[0];
  const greeting = firstName ? `Hi ${firstName}, this is LeadMind.` : 'Hi, this is LeadMind.';
  return `${greeting} We build custom software for businesses. Do you have two minutes?`;
}

function schedulingRules(): string {
  if (!liveCalendarEnabled()) {
    return [
      `Meeting time:`,
      `- The company calendar cannot be checked during this call, so never name a day or a time.`,
      `- If they qualify, confirm their email, then say the team will email a confirmed time.`,
    ].join('\n');
  }
  return [
    `Meeting time (required before you end a qualified call — the company calendar decides):`,
    `- Do not say goodbye, and do not say the team will send a time, until a meeting time is booked or the lead refuses a meeting.`,
    `- After they qualify, confirm the email on file. If they correct it, call confirm_lead_email before you book. If there is no email, ask for one and confirm it the same way.`,
    `- Then ask when they can meet. You must ask this. Turn their answer into an ISO-8601 time in Asia/Karachi (UTC+5), for example 2026-10-14T15:00:00+05:00, and call check_meeting_time. Do not say that time works until the tool says it is free.`,
    `- If it is free, call book_meeting_time with the exact startTimeIso from the tool result, then tell them the spoken time from that result and that the meeting link is being emailed to the confirmed address.`,
    `- If it is busy, apologize and ask whether they want the nearest open times or they would rather name another time. For suggestions, call suggest_meeting_times and offer only the spoken times it returns. If they name another time, check it again before booking.`,
    `- Say a time only when it appears in a tool result. If a tool result says the calendar could not be checked, then say the team will follow up to confirm a time. Do not pick a time yourself.`,
  ].join('\n');
}

function schedulingToolServer(): {
  url: string;
  secret?: string;
  headers?: Record<string, string>;
  timeoutSeconds: number;
} | null {
  const url = process.env.VAPI_WEBHOOK_URL;
  if (!url) return null;
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  return {
    url,
    ...(secret ? { secret, headers: { 'x-vapi-secret': secret } } : {}),
    timeoutSeconds: 20,
  };
}

/** Tools the model may call during a phone or web call. Omitted when no public webhook is configured. */
export function buildSchedulingTools(): Array<Record<string, unknown>> | undefined {
  const server = schedulingToolServer();
  if (!server) return undefined;

  const tool = (
    name: string,
    description: string,
    properties: Record<string, unknown>,
    required: string[]
  ) => ({
    type: 'function',
    async: false,
    server,
    function: {
      name,
      description,
      parameters: { type: 'object', properties, required },
    },
  });

  return [
    tool(
      'confirm_lead_email',
      'Save the email address the lead just confirmed. Call this before booking if they correct the address on file or if there was no address on file.',
      {
        email: { type: 'string', description: 'The email address the lead confirmed, exactly as they said it.' },
      },
      ['email']
    ),
    tool(
      'check_meeting_time',
      'Check the company calendar for the time the lead named. Call this before saying any time is free. Pass an ISO-8601 datetime in Asia/Karachi (UTC+5).',
      {
        startTimeIso: {
          type: 'string',
          description: 'ISO-8601 start time with offset, e.g. 2026-10-14T15:00:00+05:00.',
        },
      },
      ['startTimeIso']
    ),
    tool(
      'suggest_meeting_times',
      'Return the nearest open meeting times. Offer only the spoken times in the result. Never invent a time.',
      {
        aroundIso: {
          type: 'string',
          description: 'Optional ISO-8601 time to search around. Omit it to get the soonest open times.',
        },
      },
      []
    ),
    tool(
      'book_meeting_time',
      'Book a time that check_meeting_time or suggest_meeting_times already returned as free. Pass that exact startTimeIso. This also emails the meeting link.',
      {
        startTimeIso: {
          type: 'string',
          description: 'The exact startTimeIso from a previous check or suggest result.',
        },
      },
      ['startTimeIso']
    ),
  ];
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
    `You are a representative of the LeadMind software team calling a prospect. Your job for this call is: ${goal}`,
    ``,
    `Campaign-specific instructions from the admin (follow these, except where the call flow below says to stop):`,
    instructions,
    ``,
    `Speaking style: Be ${style}`,
    ``,
    `Call flow (follow this order on every call):`,
    `- The opening line already asked for two minutes. If they say no, thank them and end the call. Do not introduce the company and do not ask qualification questions.`,
    `- If they say yes, give this short introduction and nothing longer: "${COMPANY_INTRO}"`,
    `- Then ask whether they have a software need. If they say no, thank them and end the call. Do not ask qualification questions.`,
    `- Only if they say yes, gather the following, one question at a time:`,
    ...qualificationLines,
    `- If they are not a fit, thank them and end the call. Do not offer a meeting.`,
    ``,
    schedulingRules(),
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

  const tools = buildSchedulingTools();

  return {
    // VAPI rejects assistant names longer than 40 characters (HTTP 400), so long
    // campaign names are truncated here. The full name stays on the Campaign.
    name: `LeadMind - ${campaign.name}`.slice(0, 40),
    firstMessage: buildOpeningLine(),
    // Keep tool-calls off the assistant server. Each tool posts to its own
    // server URL, so subscribing here as well would book the same slot twice.
    ...(tools ? { serverMessages: ['status-update', 'end-of-call-report'] } : {}),
    model: {
      provider: 'openai',
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt(campaign),
        },
      ],
      ...(tools ? { tools } : {}),
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
  assistantOverrides?: Record<string, unknown>,
  metadata?: Record<string, string>
): Promise<{ id: string; [key: string]: any }> {
  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;

  const response = await vapiClient.post('/call', {
    assistantId,
    phoneNumberId,
    customer: {
      number: customerNumber,
    },
    ...(assistantOverrides ? { assistantOverrides } : {}),
    // Echoed back on every webhook as message.call.metadata, so a live
    // calendar tool can find this lead without waiting for the call to end.
    ...(metadata ? { metadata } : {}),
  });

  return response.data;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Meeting-invitation wording shared by phone and web calls.
//  A time is booked only when the lead agrees to a free slot during the call.
//  The agent must ask for that time, and must only promise an email once
//  book_meeting_time has an address to send it to.
// ─────────────────────────────────────────────────────────────────────────────

function meetingEmailInstruction(leadEmail?: string | null): string {
  const live = liveCalendarEnabled();
  if (leadEmail && live) {
    return (
      `\n\nThe email address on file is ${leadEmail}. When they qualify, read it back and ask if it is correct. ` +
      `If they give a different address, call confirm_lead_email before booking. ` +
      `Then ask when they can meet. The meeting email goes out only after book_meeting_time succeeds, to the address they just confirmed.`
    );
  }
  if (leadEmail) {
    return (
      `\n\nThe email address on file is ${leadEmail}. When they qualify, read it back and ask if it is correct. ` +
      `Do not name a day or time. Tell them the team will email a confirmed time to that address.`
    );
  }
  if (live) {
    return (
      `\n\nThere is no email address on file. When they qualify, ask for an email and call confirm_lead_email with it before booking. ` +
      `Do not promise an email until an address has been confirmed.`
    );
  }
  return (
    `\n\nThere is no email address on file. When they qualify, ask for an email so the team can write to them. ` +
    `Do not name a day or time, and do not promise an email until they have given an address.`
  );
}

/**
 * Per-lead overrides for an OUTBOUND PHONE call: same campaign assistant, but
 * the prompt knows the lead's email (or that there is none) and greets by name.
 */
export function buildPhoneCallOverrides(
  campaign: CampaignForPrompt,
  options: { leadEmail?: string | null; leadName?: string | null } = {}
): Record<string, unknown> {
  const model: any = buildAssistantConfig(campaign).model;
  if (model?.messages?.[0]) {
    model.messages[0].content += meetingEmailInstruction(options.leadEmail);
  }
  const overrides: Record<string, unknown> = {
    model,
    firstMessage: buildOpeningLine(options.leadName || undefined),
  };
  // Same event list as the saved assistant: tool results come back on the
  // tool server, not as a second copy of this call's server events.
  if (liveCalendarEnabled()) {
    overrides.serverMessages = ['status-update', 'end-of-call-report'];
  }
  return overrides;
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
  // the campaign's saved VAPI assistant was synced before the prompt changed.
  // Phone and web share the same opening line and the same call flow.
  if (options.campaign) {
    const model: any = buildAssistantConfig(options.campaign).model;
    if (model?.messages?.[0]) {
      model.messages[0].content += meetingEmailInstruction(options.leadEmail);
    }
    overrides.model = model as Record<string, unknown>;
  }
  overrides.firstMessage = buildOpeningLine(options.leadName);

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
