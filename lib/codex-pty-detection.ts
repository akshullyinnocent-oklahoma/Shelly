export type CodexPtyDetection = {
  cwd: string | null;
  reason: 'banner' | 'prompt';
};

const ANSI_ESCAPE = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

export function detectCodexPtyLaunchText(output: string): CodexPtyDetection | null {
  const text = stripTerminalControl(output);
  const cwd = extractCodexCwd(text);
  if (cwd && /OpenAI\s+Codex/i.test(text)) {
    return { cwd, reason: 'banner' };
  }
  if (cwd && /\b(?:gpt|o\d|codex)[\w.-]*\b.*[·•]\s*\//i.test(text)) {
    return { cwd, reason: 'prompt' };
  }
  return null;
}

export function detectCodexActiveTranscript(output: string): boolean {
  const text = stripTerminalControl(output);
  const lines = text.split('\n').map((line) => line.trimEnd());
  let lastCodexPrompt = -1;
  let lastShellPrompt = -1;

  lines.forEach((line, index) => {
    if (isCodexPromptLine(line) || /OpenAI\s+Codex/i.test(line)) {
      lastCodexPrompt = index;
    } else if (isShellPromptLine(line)) {
      lastShellPrompt = index;
    }
  });

  return lastCodexPrompt >= 0 && lastCodexPrompt > lastShellPrompt;
}

export function detectCodexApprovalPrompt(output: string): boolean {
  const text = stripTerminalControl(output);
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const recentLines = lines.slice(-8);
  const tail = recentLines.join('\n');
  if (!tail) return false;
  const hasApprovalKeyword = /\b(?:approval|approve|permission|allow|deny)\b/i.test(tail);
  const hasChoice = recentLines.some((line) =>
    /\b(?:y\/n|yes\/no|allow|deny|approve|reject)\b/i.test(line)
      || /^\s*(?:[^A-Za-z0-9\s]\s*)?(?:\d+[\).]\s*)?(?:yes|no|y|n)\b(?:\s*[,):.-]|\s*$)/i.test(line)
  );
  return hasApprovalKeyword && hasChoice;
}

export function detectShellReadyText(output: string): boolean {
  const text = stripTerminalControl(output);
  const lines = text.split('\n').map((line) => line.trimEnd()).filter((line) => line.trim().length > 0);
  const lastLine = lines[lines.length - 1] ?? '';
  return isShellPromptLine(lastLine);
}

function extractCodexCwd(text: string): string | null {
  const directory = /(?:^|\n)\s*(?:directory|cwd)\s*:\s*(\/\S+)/i.exec(text)?.[1];
  if (directory) return normalizeDetectedPath(directory);

  const promptCwd = /(?:^|\n)[^\n]*\b(?:gpt|o\d|codex)[\w.-]*\b[^\n]*[·•]\s*(\/\S+)/i.exec(text)?.[1];
  if (promptCwd) return normalizeDetectedPath(promptCwd);

  return null;
}

function isCodexPromptLine(line: string): boolean {
  return /\b(?:gpt|o\d|codex)[\w.-]*\b.*[·•]\s*\//i.test(line);
}

function isShellPromptLine(line: string): boolean {
  return /^\s*(?:[~\w./:@+-]+\s*)?[$#]\s*$/.test(line);
}

function normalizeDetectedPath(path: string): string {
  return path
    .replace(/[.,;:)]+$/g, '')
    .trim();
}

function stripTerminalControl(value: string): string {
  return value
    .replace(ANSI_ESCAPE, '')
    .replace(/\r/g, '\n')
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '');
}
