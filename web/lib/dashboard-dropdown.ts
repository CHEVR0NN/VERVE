// Ported 1:1 from dashboard.html's window.__vervePositionDropdown (974-1006).
// Anchors a footer-triggered dropdown next to its button, measuring the
// dropdown's actual rendered size so it never lands off-screen or
// disconnected from the button.
export function positionDropdown(btn: HTMLElement, dropdown: HTMLElement) {
  const r = btn.getBoundingClientRect();
  dropdown.style.top = 'auto';
  dropdown.style.bottom = 'auto';
  dropdown.style.left = 'auto';
  dropdown.style.right = 'auto';

  dropdown.style.visibility = 'hidden';
  dropdown.hidden = false;
  const dw = dropdown.offsetWidth;
  const dh = dropdown.offsetHeight;
  dropdown.hidden = true;
  dropdown.style.visibility = '';

  let left = r.right + 12;
  if (left + dw > window.innerWidth - 12) left = Math.max(12, r.left - dw - 12);

  const gap = 10;
  let top: number;
  if (r.bottom + gap + dh <= window.innerHeight - 12) {
    top = r.bottom + gap;
  } else if (r.top - gap - dh >= 12) {
    top = r.top - gap - dh;
  } else {
    top = Math.max(12, Math.min(r.top, window.innerHeight - dh - 12));
  }

  dropdown.style.left = `${Math.round(left)}px`;
  dropdown.style.top = `${Math.round(top)}px`;
}
