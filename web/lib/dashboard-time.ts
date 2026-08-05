// Time helpers ported from public/js/dashboard.js:18-92 and dashboard.html's
// Next-Reservation-chip script (1642-1684). Behavior preserved exactly,
// including the "midnight sorts after 23:30" normalization trick.

export interface TimeOption {
  value: string;
  label: string;
}

export function makeTimeOpt(h: number, m: number): TimeOption {
  const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h > 12 ? h - 12 : h;
  const label = `${h12}:${String(m).padStart(2, '0')} ${period}`;
  return { value, label };
}

// Valid operating hours: 6:30 AM – 12:00 AM (midnight)
export function buildTimeOptions(): TimeOption[] {
  const opts: TimeOption[] = [];
  for (let h = 6; h < 24; h++) {
    for (const m of [0, 30]) {
      if (h === 6 && m === 0) continue; // start at 06:30
      opts.push(makeTimeOpt(h, m));
    }
  }
  opts.push({ value: '00:00', label: '12:00 AM' }); // midnight
  return opts;
}

export function nowSGT(): { date: string; time: string } {
  const d = new Date();
  return {
    date: d.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' }),
    time: d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hour12: false }),
  };
}

// Normalise so midnight '00:00' sorts after '23:30' instead of before '06:30'.
export function normTime(t: string): string {
  return t === '00:00' ? '24:00' : t;
}

// All slots for a future date; only slots strictly after now for today.
export function buildTimeOptionsForDate(dateStr: string): TimeOption[] {
  const all = buildTimeOptions();
  const { date: today, time: now } = nowSGT();
  if (dateStr !== today) return all;
  return all.filter((opt) => normTime(opt.value) > normTime(now));
}

export function formatDisplayTime(time24: string | undefined | null): string {
  if (!time24) return '—';
  // GHL stores slot_start_time as "YYYY-MM-DD HH:MM AM/PM" — extract the time portion
  const timeOnly = time24.replace(/^\d{4}-\d{2}-\d{2}\s+/, '').trim();
  // Already has AM/PM — return as-is
  if (/[AP]M$/i.test(timeOnly)) return timeOnly;
  // HH:MM 24-hour → 12-hour
  const [h, m] = timeOnly.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return time24;
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

// Add N hours to a HH:MM string.
export function addHours(time: string, hours: number): string {
  const [h, m] = time.split(':').map(Number);
  const endH = String((h + hours) % 24).padStart(2, '0');
  return `${endH}:${m.toString().padStart(2, '0')}`;
}

export const PAST_STATUSES = ['cancelled', 'late-cancellation', 'checked-in', 'no-show', 'completed', 'done', 'late-fee-paid'];

export function statusKeyOf(status: string | undefined | null): string {
  return (status || 'confirmed').toLowerCase().replace(/[\s_]+/g, '-');
}

export function statusDisplayOf(status: string): string {
  return status.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function isUpcoming(slotDate: string | undefined, bookingStatus: string | undefined | null): boolean {
  const { date: todaySG } = nowSGT();
  const key = statusKeyOf(bookingStatus);
  if (PAST_STATUSES.includes(key)) return false;
  return (slotDate || '') >= todaySG;
}

// Fully-SGT-local "day + time" formatting for the Next Reservation chip
// (dashboard.html:1653-1664).
export function fmtChipTime(t: string | undefined): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h)) return t;
  const p = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${p}`;
}

export function fmtChipDay(d: string): string {
  const { date: todaySG } = nowSGT();
  if (d === todaySG) return 'Today';
  return new Date(d + 'T00:00:00+08:00').toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' });
}
