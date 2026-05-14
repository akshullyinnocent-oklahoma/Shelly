// lib/terminal-session-actions.ts
//
// Shared helpers for terminal session lifecycle actions that need to keep
// the global session store and the focused multi-pane slot in sync.

import { useMultiPaneStore } from '@/hooks/use-multi-pane';
import { usePaneStore } from '@/store/pane-store';
import { useFocusStore } from '@/store/focus-store';
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

  const multiPane = useMultiPaneStore.getState();
  const focusedPaneId = usePaneStore.getState().focusedPaneId;
  let slotIdx = focusedPaneId
    ? multiPane.slots.findIndex((slot) => slot?.id === focusedPaneId && slot.tab === 'terminal')
    : -1;
  if (slotIdx < 0) {
    slotIdx = multiPane.slots.findIndex((slot) => slot?.tab === 'terminal');
  }
  const targetSlot = slotIdx >= 0 ? multiPane.slots[slotIdx] : null;
  if (!targetSlot) return newSessionId;

  multiPane.setSlotSessionId(targetSlot.id, newSessionId);
  if (slotIdx < 4) multiPane.focusSlot(slotIdx as 0 | 1 | 2 | 3);
  usePaneStore.getState().setFocusedPane(targetSlot.id);
  useTerminalStore.getState().setActiveSession(newSessionId);
  setTimeout(() => useFocusStore.getState().requestTerminalRefocus(), 80);
  setTimeout(() => useFocusStore.getState().requestTerminalRefocus(), 240);

  return newSessionId;
}
