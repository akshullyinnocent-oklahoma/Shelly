import { detectCodexActiveTranscript, detectCodexPtyLaunchText, detectShellReadyText } from '@/lib/codex-pty-detection';

describe('codex pty detection', () => {
  it('detects the Codex banner and directory', () => {
    expect(detectCodexPtyLaunchText([
      '>_ OpenAI Codex (v0.135.0)',
      'model:     gpt-5.5   /model to change',
      'directory: /data/data/dev.shelly.terminal/files/home',
    ].join('\n'))).toEqual({
      cwd: '/data/data/dev.shelly.terminal/files/home',
      reason: 'banner',
    });
  });

  it('detects the Codex prompt line cwd', () => {
    expect(detectCodexPtyLaunchText(
      'gpt-5.5 default · /data/data/dev.shelly.terminal/files/home\n',
    )).toEqual({
      cwd: '/data/data/dev.shelly.terminal/files/home',
      reason: 'prompt',
    });
  });

  it('ignores ordinary terminal output', () => {
    expect(detectCodexPtyLaunchText('~/project $ pnpm check\n')).toBeNull();
  });

  it('ignores a Codex banner when no cwd is present', () => {
    expect(detectCodexPtyLaunchText('>_ OpenAI Codex (v0.135.0)\n')).toBeNull();
  });

  it('detects an active Codex prompt in the visible transcript tail', () => {
    expect(detectCodexActiveTranscript([
      '>_ OpenAI Codex (v0.135.0)',
      'directory: /data/data/dev.shelly.terminal/files/home',
      'gpt-5.5 default · /data/data/dev.shelly.terminal/files/home',
    ].join('\n'))).toBe(true);
  });

  it('treats a later shell prompt as no longer inside Codex', () => {
    expect(detectCodexActiveTranscript([
      'gpt-5.5 default · /data/data/dev.shelly.terminal/files/home',
      'Use /skills to list available skills',
      '~$',
    ].join('\n'))).toBe(false);
  });

  it('detects a ready shell prompt from the current screen', () => {
    expect(detectShellReadyText([
      'some output',
      '~$',
    ].join('\n'))).toBe(true);
  });

  it('does not treat an output-only screen as ready for command injection', () => {
    expect(detectShellReadyText([
      'Downloading...',
      'still running',
    ].join('\n'))).toBe(false);
  });
});
