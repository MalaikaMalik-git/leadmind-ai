// Turns a VAPI call into the AI / Lead turns we store and show.
// VAPI's message array uses role "bot" for the agent. A parser that only
// keeps "assistant" drops every agent line and leaves a lead-only transcript.
// The plain-text transcript still has both sides, so it is the backup.

export interface TranscriptTurn {
  speaker: 'AI' | 'Lead';
  text: string;
  timestamp: Date;
}

function speakerForRole(role: unknown): 'AI' | 'Lead' | null {
  const value = String(role || '').toLowerCase();
  if (value === 'assistant' || value === 'bot' || value === 'ai') return 'AI';
  if (value === 'user' || value === 'customer' || value === 'human' || value === 'lead') return 'Lead';
  return null;
}

function textOf(message: any): string {
  if (!message) return '';
  if (typeof message.message === 'string') return message.message;
  if (typeof message.content === 'string') return message.content;
  if (typeof message.transcript === 'string') return message.transcript;
  if (Array.isArray(message.content)) {
    return message.content
      .map((part: any) => (typeof part === 'string' ? part : part?.text || ''))
      .join(' ')
      .trim();
  }
  return '';
}

export function parseRawTranscript(raw: string | null | undefined, when = new Date()): TranscriptTurn[] {
  if (!raw || !raw.trim()) return [];
  const turns: TranscriptTurn[] = [];
  let current: { speaker: 'AI' | 'Lead'; text: string } | null = null;

  const flush = () => {
    if (current && current.text.trim()) {
      turns.push({ speaker: current.speaker, text: current.text.trim(), timestamp: new Date(when.getTime() + turns.length * 1000) });
    }
    current = null;
  };

  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^(AI|Bot|Assistant|User|Lead|Customer):\s*(.*)$/i);
    if (match) {
      flush();
      const who = match[1].toLowerCase();
      const speaker: 'AI' | 'Lead' = who === 'user' || who === 'lead' || who === 'customer' ? 'Lead' : 'AI';
      current = { speaker, text: match[2] || '' };
    } else if (current && line.trim()) {
      current.text = `${current.text} ${line.trim()}`.trim();
    }
  }
  flush();
  return turns;
}

export function buildTranscriptMessages(vapiMessages: any[] | undefined, rawTranscript?: string | null): TranscriptTurn[] {
  const fromArray: TranscriptTurn[] = [];
  if (Array.isArray(vapiMessages)) {
    for (const message of vapiMessages) {
      const speaker = speakerForRole(message?.role);
      const text = textOf(message).trim();
      if (!speaker || !text) continue;
      fromArray.push({
        speaker,
        text,
        timestamp: message.time ? new Date(message.time) : message.endTime ? new Date(message.endTime) : new Date(),
      });
    }
  }

  if (fromArray.some((turn) => turn.speaker === 'AI')) return fromArray;
  const fromRaw = parseRawTranscript(rawTranscript);
  if (fromRaw.some((turn) => turn.speaker === 'AI')) return fromRaw;
  return fromArray;
}
