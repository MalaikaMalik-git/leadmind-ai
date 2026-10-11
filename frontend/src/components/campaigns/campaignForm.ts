import { CreateCampaignPayload } from '@/src/lib/api/campaigns';

export interface CampaignFormData {
  name: string;
  goal: string;
  instructions: string;
  dailyCallLimit: number;
  tone: 'Professional' | 'Friendly' | 'Direct' | 'Consultative' | 'Persuasive' | 'Soft Warm' | '';
  startDate: string;
  endDate: string;
  quietHours: {
    enabled: boolean;
    startTime: string;
    endTime: string;
    timezone: string;
  };
}

export const INITIAL_CAMPAIGN_FORM: CampaignFormData = {
  name: '',
  goal: '',
  instructions: '',
  dailyCallLimit: 50,
  tone: '',
  startDate: '',
  endDate: '',
  quietHours: {
    enabled: false,
    startTime: '22:00',
    endTime: '08:00',
    timezone: 'Asia/Karachi',
  },
};

export function campaignFormError(form: CampaignFormData): string | null {
  if (!form.name.trim() || !form.goal.trim() || !form.instructions.trim()) {
    return 'Name, goal, and agent instructions are required.';
  }
  if (form.dailyCallLimit < 1) return 'Daily call limit must be at least 1.';
  if (!form.tone) return 'Choose a voice tone.';
  if (form.quietHours.enabled && form.quietHours.startTime === form.quietHours.endTime) {
    return 'Quiet hours start and end must be different.';
  }
  if (form.startDate && form.endDate && form.endDate < form.startDate) {
    return 'End date cannot be before the start date.';
  }
  return null;
}

export function toCampaignPayload(form: CampaignFormData): CreateCampaignPayload {
  return {
    name: form.name.trim(),
    goal: form.goal.trim(),
    tone: form.tone,
    instructions: form.instructions.trim(),
    dailyCallLimit: form.dailyCallLimit,
    startDate: form.startDate || null,
    endDate: form.endDate || null,
    quietHours: form.quietHours,
  };
}
