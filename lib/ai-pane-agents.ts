import type { AppSettings } from '@/store/types';

export const AI_PANE_AGENT_IDS = [
  'gemini',
  'cerebras',
  'groq',
  'perplexity',
  'local',
] as const;

export type AiPaneAgentId = (typeof AI_PANE_AGENT_IDS)[number];

const AI_PANE_AGENT_SET = new Set<string>(AI_PANE_AGENT_IDS);

export function isAiPaneAgent(agent: string | null | undefined): agent is AiPaneAgentId {
  return !!agent && AI_PANE_AGENT_SET.has(agent);
}

export function getEnabledAiPaneAgents(teamMembers?: Record<string, boolean>): AiPaneAgentId[] {
  return AI_PANE_AGENT_IDS.filter((agent) => teamMembers?.[agent] !== false);
}

export function pickDefaultAiPaneAgent(settings: AppSettings): AiPaneAgentId {
  const enabled = getEnabledAiPaneAgents(settings.teamMembers);

  const firstEnabled = (...agents: AiPaneAgentId[]): AiPaneAgentId | null => {
    for (const agent of agents) {
      if (enabled.includes(agent)) return agent;
    }
    return null;
  };

  return (
    (settings.cerebrasApiKey ? firstEnabled('cerebras') : null) ??
    (settings.groqApiKey ? firstEnabled('groq') : null) ??
    (settings.geminiApiKey ? firstEnabled('gemini') : null) ??
    (settings.perplexityApiKey ? firstEnabled('perplexity') : null) ??
    firstEnabled('cerebras', 'groq', 'gemini', 'perplexity', 'local') ??
    'gemini'
  );
}
