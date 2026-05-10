// lib/terminal-session-actions.ts
//
// Shared helpers for terminal session lifecycle actions that need to keep
// the global session store and the focused multi-pane slot in sync.

import { useMultiPaneStore } from '@/hooks/use-multi-pane';
import { usePaneStore } from '@/store/pane-store';
import { useTerminalStore } from '@/store/terminal-store';

/**
 * Create a new terminal session and, when the user is currently focused on a
 * terminal pane, bind that new session to the focused pane so the visual tab
 * switch actually maps to a fresh PTY instead of leaving the old shell state
 * attached to the visible pane.
 */
export function createTerminalSessionForFocusedPane(): string | undefined {
  const newSessionId = useTerminalStore.getState().addSession();
  if (!newSessionId) return undefined;

  const focusedPaneId = usePaneStore.getState().focusedPaneId;
  if (!focusedPaneId) return newSessionId;

  const multiPane = useMultiPaneStore.getState();
  const focusedSlot = multiPane.slots.find((slot) => slot?.id === focusedPaneId);
  if (focusedSlot?.tab === 'terminal') {
    multiPane.setSlotSessionId(focusedPaneId, newSessionId);
    useTerminalStore.getState().setActiveSession(newSessionId);
  }

  return newSessionId;
}
