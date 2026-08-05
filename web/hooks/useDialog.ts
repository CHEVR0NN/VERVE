'use client';

import { useCallback, useRef } from 'react';
import { nowSGT } from '@/lib/dashboard-time';

// Ported 1:1 from public/js/dashboard.js:614-627 (showModal/closeModal). The
// original locks past dates on every <input type="date"> inside the dialog
// being opened, and toggles one shared #modalOverlay backdrop alongside the
// native <dialog>'s own showModal()/close(). setOverlayVisible is the single
// piece of state (owned by the page) driving that shared backdrop.
export function useDialog(setOverlayVisible: (visible: boolean) => void) {
  const ref = useRef<HTMLDialogElement>(null);

  const open = useCallback(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const today = nowSGT().date;
    dialog.querySelectorAll('input[type="date"]').forEach((inp) => {
      (inp as HTMLInputElement).min = today;
    });
    dialog.showModal();
    setOverlayVisible(true);
  }, [setOverlayVisible]);

  const close = useCallback(() => {
    ref.current?.close();
    setOverlayVisible(false);
  }, [setOverlayVisible]);

  return { ref, open, close };
}

// Ported 1:1 from dashboard.js:644-649 — clicking the shared overlay force-closes
// every currently-open <dialog>, matching the original's direct DOM query
// rather than tracking a registry of open dialogs in React state.
export function closeAllDialogs() {
  document.querySelectorAll('dialog[open]').forEach((d) => (d as HTMLDialogElement).close());
}
