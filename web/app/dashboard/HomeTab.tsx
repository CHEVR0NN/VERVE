'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Member } from '@/lib/auth';
import {
  cancelBooking,
  createBooking,
  fetchAvailability,
  fetchBookings,
  fetchGuestQuota,
  registerGuest,
  updateBooking,
  type AvailabilitySlot,
  type Booking,
} from '@/lib/dashboard-api';
import {
  addHours,
  buildTimeOptions,
  buildTimeOptionsForDate,
  fmtChipDay,
  fmtChipTime,
  formatDisplayTime,
  isUpcoming,
  normTime,
  nowSGT,
  PAST_STATUSES,
  statusDisplayOf,
  statusKeyOf,
  type TimeOption,
} from '@/lib/dashboard-time';
import { useDialog } from '@/hooks/useDialog';

const FACILITIES = [
  { name: 'Tennis', cid: 'PBybXIrnK5Y5Z8QYj0Re' },
  { name: 'Squash', cid: 'iOHOpI35vxyABNK2NDKK' },
  { name: 'Gym', cid: 'j1jv7fk0AnlrfAeSCgQ5' },
];
const VENUES = [
  { name: 'Oasis', cid: 'LGzqWrWZ0Ia6DYsOQ3wZ' },
  { name: 'Barkerslounge', cid: 'SrFhhBpGuhprk6nVuND5' },
  { name: 'Le Mansion', cid: '' },
];
const LE_MANSION_CALENDARS: Record<string, string> = { Lunch: 'hPNlJNlQtHcOBLQdMhmq', Dinner: 'Xppv7hBSv8VikwOygLYp' };
const SHIFT_TIMES: Record<string, { start: string; end: string }> = { Lunch: { start: '12:00', end: '15:00' }, Dinner: { start: '18:00', end: '22:00' } };
const NOTES_PLACEHOLDERS: Record<string, string> = {
  Tennis: 'e.g. racket rental needed, court preference',
  Squash: 'e.g. racket rental needed, coaching request',
  Gym: 'e.g. personal training session, equipment preference',
  'Le Mansion': 'e.g. window seat preferred, vegetarian menu, birthday cake arrangement',
  Barkerslounge: 'e.g. preferred seating, birthday celebration setup',
  Oasis: 'e.g. poolside table preference, dietary requirements',
};

interface GuestBookingRow {
  name: string;
  email: string;
  facility: string;
  date: string;
  booking_reference: string;
  status: string;
}

interface GuestFormRow {
  name: string;
  email: string;
  phone: string;
}

interface SummaryRow {
  label: string;
  value: string;
}

type SummarySource = 'facility' | 'dining' | 'guest';

function escapeAll(s: string | undefined | null): string {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function monthAbbr(dateStr: string): string {
  if (!dateStr) return '';
  const m = new Date(dateStr + 'T00:00:00+08:00');
  if (isNaN(m.getTime())) return '';
  return m.toLocaleDateString('en-SG', { month: 'short', timeZone: 'Asia/Singapore' }).toUpperCase();
}

function dayNum(dateStr: string): string | number {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  return parts[2] ? parseInt(parts[2], 10) : '—';
}

function getTimingChip(b: Booking): 'soon' | 'live' | null {
  const key = statusKeyOf(b.booking_status);
  if (PAST_STATUSES.includes(key)) return null;
  const { date: todaySGT, time: nowTime } = nowSGT();
  if ((b.slot_date || '') !== todaySGT) return null;
  const start = b.slot_start_time;
  const end = b.slot_end_time;
  if (!start) return null;
  if (normTime(start) > normTime(nowTime)) return 'soon';
  if (end && normTime(nowTime) >= normTime(start) && normTime(end) > normTime(nowTime)) return 'live';
  return null;
}

function applyAvailabilityToOptions(base: TimeOption[], data: { slots: Record<string, AvailabilitySlot>; cap: number | null } | null): { value: string; label: string; disabled: boolean }[] {
  if (!data) return base.map((o) => ({ ...o, disabled: false }));
  const { slots, cap } = data;
  return base.map((o) => {
    const slot = slots[o.value];
    if (!slot) return { ...o, disabled: false };
    if (slot.isFull) return { value: o.value, label: `${o.label} — Fully booked`, disabled: true };
    if (cap && slot.used > 0 && slot.used >= cap / 2) return { value: o.value, label: `${o.label} (${slot.used}/${cap} booked)`, disabled: false };
    return { ...o, disabled: false };
  });
}

export default function HomeTab({ token, member, setOverlayVisible }: { token: string; member: Member; setOverlayVisible: (v: boolean) => void }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [guestRows, setGuestRows] = useState<GuestBookingRow[]>([]);
  const [expandedRefs, setExpandedRefs] = useState<Set<string>>(new Set());
  const [nextReservationText, setNextReservationText] = useState('Nothing scheduled');
  const [nextReservationActive, setNextReservationActive] = useState(false);

  const loadBookings = useCallback(async () => {
    const all = await fetchBookings(token);
    const isGuestType = (t: string) => t === 'guest' || t === 'guest_pass';
    setBookings(all.filter((b) => !isGuestType(b.booking_type)));
    setGuestRows(
      all
        .filter((b) => isGuestType(b.booking_type))
        .map((b) => ({
          name: b.name || '—',
          email: b.email || '',
          facility: b.facility_or_venue || '',
          date: b.slot_date || '',
          booking_reference: b.booking_reference || '',
          status: b.booking_status || '',
        }))
    );
  }, [token]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  // Next Reservation chip — independent fetch, ported from dashboard.html:1642-1684.
  useEffect(() => {
    (async () => {
      const { date: todaySG } = nowSGT();
      const all = await fetchBookings(token);
      const rows = all
        .filter((b) => b.booking_type !== 'block')
        .filter((b) => !PAST_STATUSES.includes(statusKeyOf(b.booking_status)))
        .filter((b) => (b.slot_date || '') >= todaySG)
        .sort((a, b) => (a.slot_date + a.slot_start_time).localeCompare(b.slot_date + b.slot_start_time));
      if (rows.length) {
        const b = rows[0];
        setNextReservationText(`${fmtChipDay(b.slot_date)}, ${fmtChipTime(b.slot_start_time)} · ${b.facility_or_venue}`);
        setNextReservationActive(true);
      }
    })();
  }, [token]);

  const facilityCount = bookings.filter((b) => b.booking_type !== 'dining').length;
  const diningCount = bookings.filter((b) => b.booking_type === 'dining').length;
  const upcoming = useMemo(() => bookings.filter((b) => isUpcoming(b.slot_date, b.booking_status)), [bookings]);
  const past = useMemo(() => bookings.filter((b) => !isUpcoming(b.slot_date, b.booking_status)), [bookings]);

  const toggleExpand = (ref: string) => {
    setExpandedRefs((prev) => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });
  };

  // ── Modals ──
  const facilityModal = useDialog(setOverlayVisible);
  const diningModal = useDialog(setOverlayVisible);
  const editBookingModal = useDialog(setOverlayVisible);
  const guestModal = useDialog(setOverlayVisible);
  const allBookingsModal = useDialog(setOverlayVisible);
  const confirmationModal = useDialog(setOverlayVisible);
  const qrViewModal = useDialog(setOverlayVisible);
  const guestConfirmationModal = useDialog(setOverlayVisible);
  const summaryModal = useDialog(setOverlayVisible);
  const cancelConfirmModal = useDialog(setOverlayVisible);

  // ── Facility form ──
  const [facilityName, setFacilityName] = useState('');
  const [facilityDate, setFacilityDate] = useState('');
  const [facilityTime, setFacilityTime] = useState('');
  const [facilityGuests, setFacilityGuests] = useState('1');
  const [facilityDateError, setFacilityDateError] = useState(false);
  const [facilityTimeError, setFacilityTimeError] = useState<string | null>(null);
  const [facilityCapacityError, setFacilityCapacityError] = useState<string | null>(null);
  const [facilityAvailability, setFacilityAvailability] = useState<{ slots: Record<string, AvailabilitySlot>; cap: number | null } | null>(null);

  const facilityTimeOptions = useMemo(() => applyAvailabilityToOptions(buildTimeOptionsForDate(facilityDate), facilityAvailability), [facilityDate, facilityAvailability]);

  useEffect(() => {
    if (!facilityName || !facilityDate) {
      setFacilityAvailability(null);
      return;
    }
    fetchAvailability(token, facilityName, facilityDate).then(setFacilityAvailability);
  }, [token, facilityName, facilityDate]);

  // ── Dining form ──
  const [diningVenue, setDiningVenue] = useState('');
  const [diningShift, setDiningShift] = useState('');
  const [diningDate, setDiningDate] = useState('');
  const [diningTime, setDiningTime] = useState('');
  const [diningPax, setDiningPax] = useState('1');
  const [diningNotes, setDiningNotes] = useState('');
  const [diningDateError, setDiningDateError] = useState(false);
  const [diningTimeError, setDiningTimeError] = useState<string | null>(null);
  const [diningCapacityError, setDiningCapacityError] = useState<string | null>(null);
  const [diningAvailability, setDiningAvailability] = useState<{ slots: Record<string, AvailabilitySlot>; cap: number | null } | null>(null);
  const isLeMansion = diningVenue === 'Le Mansion';

  const diningBaseTimeOptions = useMemo(() => {
    let opts = buildTimeOptions();
    if (isLeMansion && diningShift && SHIFT_TIMES[diningShift]) {
      const { start, end } = SHIFT_TIMES[diningShift];
      opts = opts.filter((o) => o.value >= start && o.value <= end);
    }
    return opts;
  }, [isLeMansion, diningShift]);
  const diningTimeOptions = useMemo(() => applyAvailabilityToOptions(diningBaseTimeOptions, diningAvailability), [diningBaseTimeOptions, diningAvailability]);

  useEffect(() => {
    if (!diningVenue || !diningDate) {
      setDiningAvailability(null);
      return;
    }
    fetchAvailability(token, diningVenue, diningDate).then(setDiningAvailability);
  }, [token, diningVenue, diningDate, diningShift]);

  // ── Edit booking form ──
  const [editBookingRef, setEditBookingRef] = useState('');
  const [editBookingVenue, setEditBookingVenue] = useState('');
  const [editBookingDate, setEditBookingDate] = useState('');
  const [editBookingStart, setEditBookingStart] = useState('');
  const [editBookingEnd, setEditBookingEnd] = useState('');
  const [editBookingPax, setEditBookingPax] = useState('1');
  const [editBookingNotes, setEditBookingNotes] = useState('');
  const editTimeOptions = useMemo(() => buildTimeOptionsForDate(editBookingDate), [editBookingDate]);

  const openEditBooking = (b: Booking) => {
    setEditBookingRef(b.booking_reference);
    setEditBookingVenue(b.facility_or_venue || '—');
    setEditBookingDate(b.slot_date || '');
    setEditBookingStart(b.slot_start_time || '');
    setEditBookingEnd(b.slot_end_time || '');
    setEditBookingPax(b.outlet_pax || b.pax_size || '1');
    setEditBookingNotes(b.notes || b.special_request || '');
    editBookingModal.open();
  };

  const handleEditBookingSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { date: todayEdit, time: nowTime } = nowSGT();
    if (editBookingDate < todayEdit) {
      alert('You cannot reschedule a booking to a past date. Please select today or a future date.');
      return;
    }
    if (editBookingDate === todayEdit && (!editBookingStart || normTime(editBookingStart) <= normTime(nowTime))) {
      alert('Start time has already passed. Please select a future time.');
      return;
    }
    if (editBookingStart && editBookingEnd && normTime(editBookingEnd) <= normTime(editBookingStart)) {
      alert('End time must be after start time.');
      return;
    }
    if (editBookingNotes.length > 500) {
      alert('Special request must not exceed 500 characters.');
      return;
    }
    const result = await updateBooking(token, editBookingRef, {
      slot_date: editBookingDate,
      slot_start_time: editBookingStart,
      slot_end_time: editBookingEnd,
      outlet_pax: editBookingPax,
      notes: editBookingNotes,
    });
    if (!result.ok) {
      alert(result.message);
      return;
    }
    editBookingModal.close();
    loadBookings();
  };

  // ── Cancel booking ──
  const [cancelRef, setCancelRef] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);

  const handleCancelBooking = (ref: string) => {
    setCancelRef(ref);
    setCancelError(null);
    cancelConfirmModal.open();
  };

  const confirmCancelBooking = async () => {
    setCancelError(null);
    const result = await cancelBooking(token, member.email, cancelRef);
    if (!result.ok) {
      setCancelError(result.message);
      return;
    }
    cancelConfirmModal.close();
    loadBookings();
  };

  // ── QR view ──
  const [qrViewRef, setQrViewRef] = useState('');
  const showQrView = (reference: string) => {
    setQrViewRef(reference);
    qrViewModal.open();
  };
  function downloadQr(src: string, filename: string) {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d')?.drawImage(img, 0, 0);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = filename;
      a.click();
    };
    img.src = src;
  }

  // ── Confirmation modal ──
  const [confirmData, setConfirmData] = useState<{ venue: string; date: string; time: string; pax: string; reference: string } | null>(null);
  const showConfirmation = (data: { venue: string; date: string; time: string; pax: string; reference: string }) => {
    setConfirmData(data);
    confirmationModal.open();
  };

  // ── Guest registration confirmation ──
  const [guestConfirmResults, setGuestConfirmResults] = useState<{ name: string; email: string; booking_reference: string }[]>([]);
  const showGuestConfirmation = (results: { name: string; email: string; booking_reference: string }[]) => {
    setGuestConfirmResults(results);
    guestConfirmationModal.open();
  };

  // ── Summary (review) modal — shared by facility/dining/guest ──
  const [summaryRows, setSummaryRows] = useState<SummaryRow[]>([]);
  const [summarySource, setSummarySource] = useState<SummarySource | null>(null);
  const [pendingSubmit, setPendingSubmit] = useState<(() => Promise<void>) | null>(null);

  const showSummary = (rows: SummaryRow[], source: SummarySource, onConfirm: () => Promise<void>) => {
    setSummaryRows(rows);
    setSummarySource(source);
    setPendingSubmit(() => onConfirm);
    if (source === 'facility') facilityModal.ref.current?.close();
    if (source === 'dining') diningModal.ref.current?.close();
    if (source === 'guest') guestModal.ref.current?.close();
    summaryModal.ref.current?.showModal();
  };

  const handleSummaryEdit = () => {
    summaryModal.ref.current?.close();
    if (summarySource === 'facility') facilityModal.ref.current?.showModal();
    if (summarySource === 'dining') diningModal.ref.current?.showModal();
    if (summarySource === 'guest') guestModal.ref.current?.showModal();
  };

  const handleSummaryCloseX = () => {
    summaryModal.ref.current?.close();
    setOverlayVisible(false);
    setPendingSubmit(null);
    setSummarySource(null);
  };

  const handleSummaryConfirm = async () => {
    const doSubmit = pendingSubmit;
    setPendingSubmit(null);
    setSummarySource(null);
    summaryModal.ref.current?.close();
    setOverlayVisible(false);
    if (doSubmit) await doSubmit();
  };

  // ── Facility submit ──
  const handleFacilitySubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const calendarId = FACILITIES.find((f) => f.name === facilityName)?.cid || '';
    if (!facilityName || !facilityDate || !facilityTime) {
      alert('Please select a facility, date, and start time.');
      return;
    }
    const { date: todayFacility } = nowSGT();
    if (facilityDate < todayFacility) {
      setFacilityDateError(true);
      return;
    }
    setFacilityDateError(false);
    if (facilityDate === todayFacility) {
      const now = new Date();
      const sgMinutes = (now.getUTCHours() * 60 + now.getUTCMinutes() + 480) % 1440;
      const [h, m] = facilityTime.split(':').map(Number);
      if (h * 60 + m <= sgMinutes) {
        setFacilityTimeError('This time has already passed. Please select a future time.');
        return;
      }
    }
    setFacilityTimeError(null);
    const endTime = addHours(facilityTime, 1);
    if (endTime <= facilityTime) {
      setFacilityTimeError('Selected time would extend past midnight. Please choose an earlier time.');
      return;
    }

    showSummary(
      [
        ['Facility', facilityName],
        ['Date', facilityDate],
        ['Time', formatDisplayTime(facilityTime)],
        ['Pax', facilityGuests],
      ].map(([label, value]) => ({ label, value })),
      'facility',
      async () => {
        const result = await createBooking(token, {
          email: member.email,
          name: member.name,
          membership_number: member.membership_number,
          facility_or_venue: facilityName,
          calendar_id: calendarId,
          slot_date: facilityDate,
          slot_start_time: facilityTime,
          slot_end_time: addHours(facilityTime, 1),
          outlet_pax: facilityGuests,
          booking_type: 'facility',
        });
        if (!result.ok) {
          facilityModal.ref.current?.showModal();
          setFacilityCapacityError(result.message);
          return;
        }
        setFacilityCapacityError(null);
        setFacilityName('');
        setFacilityDate('');
        setFacilityTime('');
        setFacilityGuests('1');
        loadBookings();
        showConfirmation({ venue: facilityName, date: facilityDate, time: facilityTime, pax: facilityGuests, reference: result.reference });
      }
    );
  };

  // ── Dining submit ──
  const handleDiningSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const calendarId = isLeMansion ? LE_MANSION_CALENDARS[diningShift] || '' : VENUES.find((v) => v.name === diningVenue)?.cid || '';
    if (!diningVenue || !diningDate || !diningTime || !diningPax) {
      alert('Please select a venue, date, time, and pax size.');
      return;
    }
    if (diningNotes.length > 500) {
      alert('Special request must not exceed 500 characters.');
      return;
    }
    const { date: todayDining } = nowSGT();
    if (diningDate < todayDining) {
      setDiningDateError(true);
      return;
    }
    setDiningDateError(false);
    if (diningDate === todayDining) {
      const now = new Date();
      const sgMinutes = (now.getUTCHours() * 60 + now.getUTCMinutes() + 480) % 1440;
      const [h, m] = diningTime.split(':').map(Number);
      if (h * 60 + m <= sgMinutes) {
        setDiningTimeError('This time has already passed. Please select a future time.');
        return;
      }
    }
    setDiningTimeError(null);
    const endTime = addHours(diningTime, 1);
    if (endTime <= diningTime) {
      setDiningTimeError('Selected time would extend past midnight. Please choose an earlier time.');
      return;
    }
    if (isLeMansion && !diningShift) {
      alert('Please select a booking shift (Lunch or Dinner) for Le Mansion.');
      return;
    }
    if (isLeMansion && diningShift && SHIFT_TIMES[diningShift] && diningTime) {
      const { start, end } = SHIFT_TIMES[diningShift];
      if (diningTime < start || diningTime > end) {
        alert(`${diningShift} shift only accepts times between ${SHIFT_TIMES[diningShift].start === '12:00' ? '12:00 PM – 3:00 PM' : '6:00 PM – 10:00 PM'}.`);
        return;
      }
    }

    const rows: SummaryRow[] = [
      { label: 'Venue', value: diningVenue },
      ...(diningShift ? [{ label: 'Shift', value: diningShift }] : []),
      { label: 'Date', value: diningDate },
      { label: 'Time', value: formatDisplayTime(diningTime) },
      { label: 'Pax', value: diningPax },
      ...(diningNotes ? [{ label: 'Notes', value: diningNotes }] : []),
    ];

    showSummary(rows, 'dining', async () => {
      const result = await createBooking(token, {
        email: member.email,
        name: member.name,
        membership_number: member.membership_number,
        facility_or_venue: diningVenue,
        calendar_id: calendarId,
        booking_shift: diningShift || '',
        slot_date: diningDate,
        slot_start_time: diningTime,
        slot_end_time: addHours(diningTime, 1),
        outlet_pax: diningPax,
        booking_type: 'dining',
        special_request: diningNotes || '',
      });
      if (!result.ok) {
        diningModal.ref.current?.showModal();
        setDiningCapacityError(result.message);
        return;
      }
      setDiningCapacityError(null);
      setDiningVenue('');
      setDiningShift('');
      setDiningDate('');
      setDiningTime('');
      setDiningPax('1');
      setDiningNotes('');
      loadBookings();
      showConfirmation({ venue: diningVenue, date: diningDate, time: diningTime, pax: diningPax, reference: result.reference });
    });
  };

  // ── Guest registration ──
  const [guestQuotaRemaining, setGuestQuotaRemaining] = useState(4);
  const [guestQuotaUsed, setGuestQuotaUsed] = useState(0);
  const [guestFieldRows, setGuestFieldRows] = useState<GuestFormRow[]>([]);
  const [guestFacility, setGuestFacility] = useState('');
  const [guestShift, setGuestShift] = useState('');
  const [guestVisitDate, setGuestVisitDate] = useState('');
  const [guestDateError, setGuestDateError] = useState(false);
  const [guestCapacityError, setGuestCapacityError] = useState<string | null>(null);
  const guestIsLeMansion = guestFacility === 'Le Mansion';

  const openGuestModal = async () => {
    guestModal.open();
    const quota = await fetchGuestQuota(token);
    setGuestQuotaUsed(quota.used);
    setGuestQuotaRemaining(quota.remaining);
  };

  const addGuestRow = () => {
    if (guestFieldRows.length >= guestQuotaRemaining) return;
    setGuestFieldRows((prev) => [...prev, { name: '', email: '', phone: '' }]);
  };
  const removeGuestRow = (idx: number) => {
    setGuestFieldRows((prev) => prev.filter((_, i) => i !== idx));
  };
  const updateGuestRow = (idx: number, field: keyof GuestFormRow, value: string) => {
    setGuestFieldRows((prev) => prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row)));
  };

  const handleGuestSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!guestFieldRows.length) {
      alert('Please add at least one guest.');
      return;
    }
    if (guestFieldRows.length > guestQuotaRemaining) {
      alert(`You can only register ${guestQuotaRemaining} more guest(s) this month. Please remove ${guestFieldRows.length - guestQuotaRemaining} guest(s) from this form.`);
      return;
    }
    const names = guestFieldRows.map((r) => r.name.trim());
    const emails = guestFieldRows.map((r) => r.email.trim());
    const phones = guestFieldRows.map((r) => r.phone.trim());
    if (names.some((n) => !n) || emails.some((em) => !em) || !guestVisitDate || !guestFacility) {
      alert('Please complete all required fields, select a facility, and set a visit date.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmail = emails.find((em) => !emailRegex.test(em));
    if (invalidEmail) {
      alert(`"${invalidEmail}" is not a valid email address. Please enter a valid guest email.`);
      return;
    }
    const phoneRegex = /^\+?[\d\s\-(). ]{7,20}$/;
    const invalidPhone = phones.find((p) => p && !phoneRegex.test(p));
    if (invalidPhone) {
      alert(`Invalid phone number: "${invalidPhone}". Please enter digits only (e.g. +6512345678).`);
      return;
    }
    const { date: todayGuest } = nowSGT();
    if (guestVisitDate < todayGuest) {
      setGuestDateError(true);
      return;
    }
    setGuestDateError(false);
    if (guestIsLeMansion && !guestShift) {
      alert('Please select a booking shift (Lunch or Dinner) for Le Mansion.');
      return;
    }

    const rows: SummaryRow[] = [
      { label: 'Facility', value: guestFacility },
      ...(guestShift ? [{ label: 'Shift', value: guestShift }] : []),
      { label: 'Date', value: guestVisitDate },
      { label: 'Guests', value: String(guestFieldRows.length) },
      ...names.map((name, i) => ({ label: `Guest ${i + 1}`, value: `${name} (${emails[i]})` })),
    ];

    showSummary(rows, 'guest', async () => {
      const results: { success: boolean; message?: string; booking_reference?: string }[] = [];
      for (let idx = 0; idx < names.length; idx++) {
        const r = await registerGuest(token, {
          email: member.email,
          guest_name: names[idx],
          guest_email: emails[idx],
          guest_phone: phones[idx] || '',
          inviting_member_id: member.membership_number,
          slot_date: guestVisitDate,
          facility_or_venue: guestFacility,
          booking_shift: guestShift || '',
        });
        results.push(r);
      }
      const failed = results.filter((r) => !r.success);
      if (failed.length) {
        guestModal.ref.current?.showModal();
        setGuestCapacityError(failed[0].message || `${failed.length} guest(s) failed to register. Please try again.`);
        return;
      }
      setGuestCapacityError(null);
      const guestResults = results.map((r, i) => ({ name: names[i], email: emails[i], booking_reference: r.booking_reference || '—' }));
      setGuestFieldRows([]);
      setGuestFacility('');
      setGuestShift('');
      setGuestVisitDate('');
      loadBookings();
      showGuestConfirmation(guestResults);
    });
  };

  // ── All bookings modal ──
  const [allBookingsCache, setAllBookingsCache] = useState<Booking[]>([]);
  const [allBookingsFilter, setAllBookingsFilter] = useState<'all' | 'upcoming' | 'past'>('all');
  const [allBookingsLoading, setAllBookingsLoading] = useState(false);

  const openAllBookings = async () => {
    setAllBookingsLoading(true);
    allBookingsModal.open();
    const all = await fetchBookings(token);
    const isGuest = (t: string) => t === 'guest' || t === 'guest_pass';
    setAllBookingsCache(all.filter((b) => !isGuest(b.booking_type)));
    setAllBookingsLoading(false);
  };

  const allBookingsFiltered = useMemo(() => {
    const { date: todaySG } = nowSGT();
    let list = allBookingsCache.slice();
    if (allBookingsFilter === 'upcoming') {
      list = list.filter((b) => !PAST_STATUSES.includes(statusKeyOf(b.booking_status)) && (b.slot_date || '') >= todaySG);
    } else if (allBookingsFilter === 'past') {
      list = list.filter((b) => PAST_STATUSES.includes(statusKeyOf(b.booking_status)) || (b.slot_date || '') < todaySG);
    }
    list.sort((a, b) => (b.slot_date || '').localeCompare(a.slot_date || ''));
    return list;
  }, [allBookingsCache, allBookingsFilter]);

  return (
    <div className="max-w-[1400px] mx-auto grid grid-cols-12 gap-8 px-[clamp(16px,4vw,48px)] py-[clamp(24px,4vw,40px)] pb-[clamp(40px,6vw,72px)] items-start">
      {/* ── HERO ── */}
      <section className="col-span-12 flex items-center justify-between gap-6 flex-wrap pb-[26px] border-b border-[var(--hairline)]">
        <div className="flex flex-col gap-1.5 min-w-0">
          <h2 className="font-display text-[clamp(26px,3.4vw,38px)] font-normal italic tracking-[0.02em] leading-[1.05] text-ink m-0">Welcome back, {member.name || 'Member'}.</h2>
          <div className="flex items-center gap-3">
            <p className="font-ui italic text-sm tracking-[0.1em] text-gold-dim m-0">Member ID: {member.membership_number || '—'}</p>
            <span className="inline-block w-px h-3.5 bg-[rgba(var(--gold-dim-rgb),0.3)] shrink-0" />
            <span className="font-ui text-[11px] font-semibold tracking-[0.16em] uppercase text-gold-dim">
              {new Date().toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-3">
          <span className="flex flex-col items-end gap-1 pr-0.5 whitespace-nowrap max-w-full">
            <span
              className={`inline-flex items-center gap-1.5 font-ui text-[9.5px] font-bold tracking-[0.2em] uppercase before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:[transition:background_0.3s_ease-out,opacity_0.3s_ease-out] ${
                nextReservationActive ? 'text-gold before:bg-[var(--coral)] before:opacity-100' : 'text-muted before:bg-muted before:opacity-40'
              }`}
            >
              Next Reservation
            </span>
            <span className="font-display text-[17px] font-normal italic text-ink overflow-hidden text-ellipsis">{nextReservationText}</span>
          </span>
          <div className="flex items-baseline gap-0 flex-wrap">
            <span className="inline-flex items-baseline gap-1.5 px-4.5 first:pl-0 first:border-l-0 border-l border-[var(--hairline)] font-ui text-[10px] font-bold tracking-[0.14em] uppercase text-muted">
              <strong className="font-display text-xl font-normal text-ink tracking-normal">{facilityCount}</strong> Facility
            </span>
            <span className="inline-flex items-baseline gap-1.5 px-4.5 border-l border-[var(--hairline)] font-ui text-[10px] font-bold tracking-[0.14em] uppercase text-muted">
              <strong className="font-display text-xl font-normal text-ink tracking-normal">{diningCount}</strong> Dining
            </span>
            <span className="inline-flex items-baseline gap-1.5 px-4.5 border-l border-[var(--hairline)] font-ui text-[10px] font-bold tracking-[0.14em] uppercase text-muted">
              <strong className="font-display text-xl font-normal text-ink tracking-normal">{guestRows.length}</strong> Guests
            </span>
          </div>
        </div>
      </section>

      {/* ── CONCIERGE ACTIONS ── */}
      <section className="col-span-12 min-w-0">
        <div className="font-ui text-[10px] font-bold tracking-[0.28em] uppercase text-gold mb-4">Concierge</div>
        <div className="grid grid-cols-3 max-[900px]:grid-cols-1 gap-6 items-stretch">
          <button
            className="relative isolate flex flex-col justify-end text-left min-h-[320px] max-[900px]:min-h-[260px] border border-[var(--hairline)] rounded-[var(--radius)] overflow-hidden cursor-pointer p-0 shadow-[var(--shadow)] [transition:transform_0.4s_cubic-bezier(0.16,1,0.3,1),box-shadow_0.4s_ease-out,border-color_0.3s_ease-out] hover:-translate-y-[5px] hover:shadow-[var(--shadow-lg)] hover:border-[rgba(var(--gold-dim-rgb),0.55)] group/card1 bg-[url('/asset/facility-booking.jpg')] bg-cover bg-center before:content-[''] before:absolute before:inset-0 before:-z-10 before:[background:linear-gradient(to_top,rgba(12,10,14,0.9)_0%,rgba(12,10,14,0.55)_30%,rgba(12,10,14,0.12)_58%,rgba(12,10,14,0)_100%),linear-gradient(135deg,rgba(var(--gold-dim-rgb),0.22),rgba(var(--rose-glow-rgb),0.1))]"
            onClick={facilityModal.open}
            type="button"
          >
            <span className="relative flex flex-col gap-1.5 p-6 pb-6.5">
              <span className="font-display text-[22px] font-semibold tracking-[0.02em] text-[#F6EBE7] [text-shadow:0_1px_14px_rgba(0,0,0,0.4)]">Reserve Venue</span>
              <span className="font-ui text-[12.5px] leading-[1.5] text-[rgba(246,235,231,0.82)] [text-shadow:0_1px_10px_rgba(0,0,0,0.35)]">Secure a court or space, in moments.</span>
              <span className="font-ui text-[11px] font-bold tracking-[0.16em] uppercase text-[#E3B3A6] inline-flex items-center gap-1.5 mt-1.5">
                Begin <span aria-hidden="true">→</span>
              </span>
            </span>
          </button>

          <button
            className="relative isolate flex flex-col justify-end text-left min-h-[320px] max-[900px]:min-h-[260px] border border-[var(--hairline)] rounded-[var(--radius)] overflow-hidden cursor-pointer p-0 shadow-[var(--shadow)] [transition:transform_0.4s_cubic-bezier(0.16,1,0.3,1),box-shadow_0.4s_ease-out,border-color_0.3s_ease-out] hover:-translate-y-[5px] hover:shadow-[var(--shadow-lg)] hover:border-[rgba(var(--gold-dim-rgb),0.55)] bg-[url('/asset/dining-reservation.jpg')] bg-cover bg-center before:content-[''] before:absolute before:inset-0 before:-z-10 before:[background:linear-gradient(to_top,rgba(12,10,14,0.9)_0%,rgba(12,10,14,0.55)_30%,rgba(12,10,14,0.12)_58%,rgba(12,10,14,0)_100%),linear-gradient(135deg,rgba(var(--gold-dim-rgb),0.22),rgba(var(--rose-glow-rgb),0.1))]"
            onClick={diningModal.open}
            type="button"
          >
            <span className="relative flex flex-col gap-1.5 p-6 pb-6.5">
              <span className="font-display text-[22px] font-semibold tracking-[0.02em] text-[#F6EBE7] [text-shadow:0_1px_14px_rgba(0,0,0,0.4)]">Secure Table</span>
              <span className="font-ui text-[12.5px] leading-[1.5] text-[rgba(246,235,231,0.82)] [text-shadow:0_1px_10px_rgba(0,0,0,0.35)]">Dining reserved to your taste.</span>
              <span className="font-ui text-[11px] font-bold tracking-[0.16em] uppercase text-[#E3B3A6] inline-flex items-center gap-1.5 mt-1.5">
                Begin <span aria-hidden="true">→</span>
              </span>
            </span>
          </button>

          <button
            className="relative isolate flex flex-col justify-end text-left min-h-[320px] max-[900px]:min-h-[260px] border border-[var(--hairline)] rounded-[var(--radius)] overflow-hidden cursor-pointer p-0 shadow-[var(--shadow)] [transition:transform_0.4s_cubic-bezier(0.16,1,0.3,1),box-shadow_0.4s_ease-out,border-color_0.3s_ease-out] hover:-translate-y-[5px] hover:shadow-[var(--shadow-lg)] hover:border-[rgba(var(--gold-dim-rgb),0.55)] bg-[url('/asset/register-guests.jpg')] bg-cover bg-center before:content-[''] before:absolute before:inset-0 before:-z-10 before:[background:linear-gradient(to_top,rgba(12,10,14,0.9)_0%,rgba(12,10,14,0.55)_30%,rgba(12,10,14,0.12)_58%,rgba(12,10,14,0)_100%),linear-gradient(135deg,rgba(var(--gold-dim-rgb),0.22),rgba(var(--rose-glow-rgb),0.1))]"
            onClick={openGuestModal}
            type="button"
          >
            <span className="relative flex flex-col gap-1.5 p-6 pb-6.5">
              <span className="font-display text-[22px] font-semibold tracking-[0.02em] text-[#F6EBE7] [text-shadow:0_1px_14px_rgba(0,0,0,0.4)]">Invite Guest</span>
              <span className="font-ui text-[12.5px] leading-[1.5] text-[rgba(246,235,231,0.82)] [text-shadow:0_1px_10px_rgba(0,0,0,0.35)]">Extend a personal invitation.</span>
              <span className="font-ui text-[11px] font-bold tracking-[0.16em] uppercase text-[#E3B3A6] inline-flex items-center gap-1.5 mt-1.5">
                Begin <span aria-hidden="true">→</span>
              </span>
            </span>
          </button>
        </div>
      </section>

      {/* ── FEED: bookings + guests ── */}
      <aside className="col-span-12 flex flex-col gap-0 min-w-0">
        <section>
          <div className="flex items-center justify-between mb-5.5 pb-4 border-b border-[rgba(var(--gold-dim-rgb),0.22)] relative before:content-[''] before:absolute before:-bottom-px before:left-0 before:w-12 before:h-0.5 before:[background:linear-gradient(to_right,var(--gold),transparent)]">
            <div className="flex items-baseline gap-3">
              <span className="font-ui text-xl font-semibold tracking-[0.08em] text-ink uppercase">Upcoming Bookings</span>
              <span className="font-ui text-[10px] tracking-[0.14em] uppercase text-gold-dim">
                {bookings.length} booking{bookings.length === 1 ? '' : 's'}
              </span>
            </div>
            <button className="font-ui text-[11px] font-semibold tracking-[0.1em] uppercase text-gold-dim bg-transparent border-none cursor-pointer p-0 underline [transition:color_0.2s] hover:text-ink" onClick={openAllBookings}>
              View All
            </button>
          </div>
          <div className="flex flex-col gap-0">
            {bookings.length === 0 ? (
              <EmptyBookingsState />
            ) : (
              <>
                {upcoming.length > 0 && (
                  <>
                    <h3 className="font-ui text-[13px] font-bold tracking-[0.08em] uppercase text-ink mt-5 mb-2 pb-1.5 border-b border-[rgba(var(--ink-rgb),0.08)]">Upcoming ({upcoming.length})</h3>
                    {upcoming
                      .slice()
                      .reverse()
                      .map((b) => (
                        <BookingItem
                          key={b.booking_reference}
                          booking={b}
                          expanded={expandedRefs.has(b.booking_reference)}
                          onToggle={() => toggleExpand(b.booking_reference)}
                          onQr={() => showQrView(b.booking_reference)}
                          onEdit={() => openEditBooking(b)}
                          onCancel={() => handleCancelBooking(b.booking_reference)}
                        />
                      ))}
                  </>
                )}
                {past.length > 0 && (
                  <>
                    <h3 className="font-ui text-[13px] font-bold tracking-[0.08em] uppercase text-[#666] mt-8 mb-2 pb-1.5 border-b border-[rgba(var(--ink-rgb),0.08)]">Past Bookings ({past.length})</h3>
                    {past
                      .slice()
                      .reverse()
                      .map((b) => (
                        <BookingItem
                          key={b.booking_reference}
                          booking={b}
                          expanded={expandedRefs.has(b.booking_reference)}
                          onToggle={() => toggleExpand(b.booking_reference)}
                          onQr={() => showQrView(b.booking_reference)}
                          onEdit={() => openEditBooking(b)}
                          onCancel={() => handleCancelBooking(b.booking_reference)}
                        />
                      ))}
                  </>
                )}
              </>
            )}
          </div>
        </section>

        <section className="border-t border-[var(--hairline)] mt-10 pt-10">
          <div className="flex items-center justify-between mb-5.5 pb-4 border-b border-[rgba(var(--gold-dim-rgb),0.22)] relative before:content-[''] before:absolute before:-bottom-px before:left-0 before:w-12 before:h-0.5 before:[background:linear-gradient(to_right,var(--gold),transparent)]">
            <div className="flex items-baseline gap-3">
              <span className="font-ui text-xl font-semibold tracking-[0.08em] text-ink uppercase">Registered Guests</span>
              <span className="font-ui text-[10px] tracking-[0.14em] uppercase text-gold-dim">
                {guestRows.length} guest{guestRows.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-0">
            {guestRows.length === 0 ? (
              <EmptyGuestsState />
            ) : (
              guestRows.map((g, i) => <GuestItem key={i} guest={g} onQr={() => showQrView(g.booking_reference)} />)
            )}
          </div>
        </section>
      </aside>

      {/* ══════════════════ MODALS ══════════════════ */}

      <dialog ref={facilityModal.ref} className="vrv-modal modal-dialog-base">
        <button className="modal-close-base" onClick={facilityModal.close} type="button">
          &times;
        </button>
        <h3 className="modal-h3-base">Reserve Venue</h3>
        <p className="modal-step-base">Select your venue, choose a time, and we&apos;ll take care of the rest.</p>
        <form className="flex flex-col gap-4" onSubmit={handleFacilitySubmit}>
          <label className="modal-label-base">
            Facility
            <select className="modal-input-base" required value={facilityName} onChange={(e) => setFacilityName(e.target.value)}>
              <option value="">Select a facility</option>
              {FACILITIES.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label className="modal-label-base">
            Date to Visit
            <input
              className="modal-input-base"
              type="date"
              required
              value={facilityDate}
              onChange={(e) => {
                setFacilityDate(e.target.value);
                setFacilityDateError(false);
              }}
            />
            {facilityDateError && <span className="time-error-base">You cannot book on a past date. Please select today or a future date.</span>}
          </label>
          <label className="modal-label-base">
            Start Time
            <select
              className="modal-input-base"
              required
              value={facilityTime}
              onChange={(e) => {
                setFacilityTime(e.target.value);
                setFacilityTimeError(null);
              }}
            >
              <option value="">Select a time</option>
              {facilityTimeOptions.map((o) => (
                <option key={o.value} value={o.value} disabled={o.disabled} style={o.disabled ? { color: '#aaa' } : undefined}>
                  {o.label}
                </option>
              ))}
            </select>
            {facilityTimeError && <span className="time-error-base">{facilityTimeError}</span>}
          </label>
          <label className="modal-label-base">
            Pax Size
            <input className="modal-input-base" type="number" min={1} max={20} required value={facilityGuests} onChange={(e) => setFacilityGuests(e.target.value)} />
          </label>
          {facilityCapacityError && <span className="time-error-base">{facilityCapacityError}</span>}
          <button className="btn-primary-base" type="submit">
            Confirm Booking
          </button>
        </form>
      </dialog>

      <dialog ref={diningModal.ref} className="vrv-modal modal-dialog-base">
        <button className="modal-close-base" onClick={diningModal.close} type="button">
          &times;
        </button>
        <h3 className="modal-h3-base">Secure Table</h3>
        <p className="modal-step-base">Reserve your table — share any preferences and we&apos;ll prepare accordingly.</p>
        <form className="flex flex-col gap-4" onSubmit={handleDiningSubmit}>
          <label className="modal-label-base">
            Venue
            <select
              className="modal-input-base"
              required
              value={diningVenue}
              onChange={(e) => {
                setDiningVenue(e.target.value);
                setDiningShift('');
              }}
            >
              <option value="">Select a venue</option>
              {VENUES.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          {isLeMansion && (
            <label className="modal-label-base">
              Booking Shift
              <select className="modal-input-base" required value={diningShift} onChange={(e) => setDiningShift(e.target.value)}>
                <option value="">Select a shift</option>
                <option value="Lunch">Lunch</option>
                <option value="Dinner">Dinner</option>
              </select>
            </label>
          )}
          <label className="modal-label-base">
            Date
            <input
              className="modal-input-base"
              type="date"
              required
              value={diningDate}
              onChange={(e) => {
                setDiningDate(e.target.value);
                setDiningDateError(false);
              }}
            />
            {diningDateError && <span className="time-error-base">You cannot reserve on a past date. Please select today or a future date.</span>}
          </label>
          <label className="modal-label-base">
            Time
            <select
              className="modal-input-base"
              required
              value={diningTime}
              onChange={(e) => {
                setDiningTime(e.target.value);
                setDiningTimeError(null);
              }}
            >
              <option value="">Select a time</option>
              {diningTimeOptions.map((o) => (
                <option key={o.value} value={o.value} disabled={o.disabled} style={o.disabled ? { color: '#aaa' } : undefined}>
                  {o.label}
                </option>
              ))}
            </select>
            {diningTimeError && <span className="time-error-base">{diningTimeError}</span>}
          </label>
          <label className="modal-label-base">
            Pax Size (mandatory)
            <input className="modal-input-base" type="number" min={1} max={20} required value={diningPax} onChange={(e) => setDiningPax(e.target.value)} />
          </label>
          <label className="modal-label-base">
            Special Requests (optional)
            <textarea
              className="modal-input-base"
              rows={3}
              maxLength={500}
              placeholder={NOTES_PLACEHOLDERS[diningVenue] || 'e.g. any special requests or notes'}
              value={diningNotes}
              onChange={(e) => setDiningNotes(e.target.value)}
            />
          </label>
          {diningCapacityError && <span className="time-error-base">{diningCapacityError}</span>}
          <button className="btn-primary-base" type="submit">
            Confirm Reservation
          </button>
        </form>
      </dialog>

      <dialog ref={editBookingModal.ref} className="vrv-modal modal-dialog-base [max-width:420px]">
        <button className="modal-close-base" onClick={editBookingModal.close} type="button">
          &times;
        </button>
        <h3 className="modal-h3-base">Edit Booking</h3>
        <p className="modal-step-base">Update the details below and save your changes.</p>
        <form className="flex flex-col gap-4" onSubmit={handleEditBookingSubmit}>
          <div className="flex flex-col gap-1 py-3 pb-2 border-b border-[rgba(var(--ink-rgb),0.08)] mb-2">
            <span className="font-ui text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-dim shrink-0">Venue</span>
            <span className="font-ui text-[15px] text-ink tracking-[0.01em]">{editBookingVenue}</span>
          </div>
          <label className="modal-label-base">
            Date
            <input className="modal-input-base" type="date" required value={editBookingDate} onChange={(e) => setEditBookingDate(e.target.value)} min={nowSGT().date} />
          </label>
          <label className="modal-label-base">
            Start Time
            <select className="modal-input-base" required value={editBookingStart} onChange={(e) => setEditBookingStart(e.target.value)}>
              {editTimeOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="modal-label-base">
            End Time
            <select className="modal-input-base" required value={editBookingEnd} onChange={(e) => setEditBookingEnd(e.target.value)}>
              {editTimeOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="modal-label-base">
            Pax Size
            <input className="modal-input-base" type="number" min={1} max={20} required value={editBookingPax} onChange={(e) => setEditBookingPax(e.target.value)} />
          </label>
          <label className="modal-label-base">
            Notes / Special Requests
            <textarea className="modal-input-base" rows={3} maxLength={500} placeholder={NOTES_PLACEHOLDERS[editBookingVenue] || 'e.g. any special requests or notes'} value={editBookingNotes} onChange={(e) => setEditBookingNotes(e.target.value)} />
          </label>
          <button className="btn-primary-base" type="submit">
            Save Changes
          </button>
        </form>
      </dialog>

      <dialog ref={guestModal.ref} className="vrv-modal modal-dialog-base">
        <button className="modal-close-base" onClick={guestModal.close} type="button">
          &times;
        </button>
        <h3 className="modal-h3-base">Invite Guest</h3>
        <p className="modal-step-base">Extend a personal invitation — up to 4 guests each month.</p>
        <p className="modal-step-base" style={{ color: guestQuotaRemaining <= 0 ? '#c96a5e' : undefined }}>
          {guestQuotaRemaining <= 0
            ? `You have reached your monthly limit of 4 guests (${guestQuotaUsed}/4 used). The quota resets on the 1st of next month.`
            : `You can register ${guestQuotaRemaining} more ${guestQuotaRemaining === 1 ? 'guest' : 'guests'} this month (${guestQuotaUsed}/4 used).`}
        </p>
        <form className="flex flex-col gap-4" onSubmit={handleGuestSubmit}>
          <div>
            {guestFieldRows.map((row, i) => (
              <div key={i} className="border border-[rgba(var(--ink-rgb),0.1)] rounded-xl p-3.5 px-4 bg-[rgba(var(--card-rgb),0.5)] mb-3">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-display text-[13px] font-semibold text-ink uppercase tracking-[0.14em]">Guest {i + 1}</span>
                  <button type="button" className="font-ui text-[10px] font-semibold tracking-[0.12em] uppercase bg-transparent border border-[rgba(192,57,43,0.22)] text-[#c96a5e] py-[3px] px-2.5 cursor-pointer hover:bg-[rgba(192,57,43,0.06)] hover:border-[rgba(192,57,43,0.45)]" onClick={() => removeGuestRow(i)}>
                    Remove
                  </button>
                </div>
                <label className="modal-label-base mb-2.5">
                  Full Name
                  <input className="modal-input-base" type="text" required value={row.name} onChange={(e) => updateGuestRow(i, 'name', e.target.value)} />
                </label>
                <label className="modal-label-base mb-2.5">
                  Email
                  <input className="modal-input-base" type="email" required value={row.email} onChange={(e) => updateGuestRow(i, 'email', e.target.value)} />
                </label>
                <label className="modal-label-base mb-2.5">
                  Phone (optional)
                  <input className="modal-input-base" type="tel" value={row.phone} onChange={(e) => updateGuestRow(i, 'phone', e.target.value)} />
                </label>
              </div>
            ))}
          </div>
          <button type="button" className="btn-ghost-base" disabled={guestQuotaRemaining <= 0 || guestFieldRows.length >= guestQuotaRemaining} onClick={addGuestRow}>
            {guestQuotaRemaining <= 0 ? 'Monthly limit reached' : guestFieldRows.length >= guestQuotaRemaining ? `+ Add Guest (max ${guestQuotaRemaining} this month)` : '+ Add Guest'}
          </button>
          <label className="modal-label-base">
            Facility / Venue
            <select
              className="modal-input-base"
              required
              value={guestFacility}
              onChange={(e) => {
                setGuestFacility(e.target.value);
                setGuestShift('');
              }}
            >
              <option value="">Select a facility / venue</option>
              {[...FACILITIES, ...VENUES].map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          {guestIsLeMansion && (
            <label className="modal-label-base">
              Booking Shift
              <select className="modal-input-base" required value={guestShift} onChange={(e) => setGuestShift(e.target.value)}>
                <option value="">Select a shift</option>
                <option value="Lunch">Lunch</option>
                <option value="Dinner">Dinner</option>
              </select>
            </label>
          )}
          <label className="modal-label-base">
            Visit Date
            <input
              className="modal-input-base"
              type="date"
              required
              value={guestVisitDate}
              onChange={(e) => {
                setGuestVisitDate(e.target.value);
                setGuestDateError(false);
                setGuestCapacityError(null);
              }}
            />
            {guestDateError && <span className="time-error-base">You cannot register guests for a past date. Please select today or a future date.</span>}
          </label>
          {guestCapacityError && <span className="time-error-base">{guestCapacityError}</span>}
          <button className="btn-primary-base" type="submit">
            Submit Guests
          </button>
        </form>
      </dialog>

      <dialog ref={allBookingsModal.ref} className="vrv-modal modal-dialog-base [max-width:640px] [width:92vw] [padding:0] [border:none] [border-radius:12px] [background:var(--panel-bg)] [box-shadow:0_24px_60px_rgba(var(--ink-rgb),0.18),0_0_0_1px_rgba(var(--gold-dim-rgb),0.16)] [max-height:86vh]">
        <button className="modal-close-base !text-[rgba(245,247,249,0.85)] !top-3.5 !right-4" onClick={allBookingsModal.close} type="button">
          &times;
        </button>
        <header className="py-5.5 px-6.5 pb-3.5 [background:linear-gradient(135deg,var(--navy)_0%,var(--navy-deep)_100%)] text-white border-b-2 border-gold">
          <h3 className="m-0 mb-1 font-display text-[22px] font-medium text-white tracking-[0.3px]">All My Bookings</h3>
          <p className="m-0 text-[13px] text-gold-light font-ui tracking-[0.4px]">{allBookingsLoading ? 'Loading…' : `${allBookingsFiltered.length} ${allBookingsFiltered.length === 1 ? 'booking' : 'bookings'}${allBookingsFilter !== 'all' ? ' · ' + allBookingsFilter : ''}`}</p>
        </header>
        <div className="flex gap-2 py-3.5 px-6.5 pb-3 bg-[var(--panel-hi)] border-b border-[rgba(var(--gold-dim-rgb),0.18)]">
          {(['all', 'upcoming', 'past'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`py-1.5 px-3.5 text-[12.5px] font-ui tracking-[0.3px] border rounded-pill cursor-pointer [transition:all_0.15s] ${
                allBookingsFilter === f ? 'bg-navy text-white border-ink' : 'border-[rgba(var(--ink-rgb),0.18)] bg-[var(--panel-bg)] text-ink hover:border-gold hover:text-gold-dim'
              }`}
              onClick={() => setAllBookingsFilter(f)}
            >
              {f === 'all' ? 'All' : f === 'upcoming' ? 'Upcoming' : 'Past'}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto py-2 px-6.5 pb-6 bg-[var(--panel-bg)]">
          {allBookingsLoading ? (
            <p className="text-center text-[#666] font-ui text-[13px] py-10 px-4 m-0">Loading your bookings…</p>
          ) : allBookingsFiltered.length === 0 ? (
            <p className="text-center text-[#666] font-ui text-[13px] py-10 px-4 m-0">{allBookingsCache.length === 0 ? "You don't have any bookings yet." : 'No bookings to show.'}</p>
          ) : (
            allBookingsFiltered.map((b) => {
              const statusKey = statusKeyOf(b.booking_status);
              const statusDisp = statusDisplayOf(b.booking_status || 'Confirmed');
              const startTime = b.slot_start_time ? formatDisplayTime(b.slot_start_time) : b.booking_shift || '—';
              const endTime = b.slot_end_time ? ' – ' + formatDisplayTime(b.slot_end_time) : '';
              return (
                <article key={b.booking_reference} className="grid grid-cols-[80px_1fr_auto] gap-3.5 py-3.5 px-3 m-0 border-b border-[rgba(var(--ink-rgb),0.07)] items-center last:border-b-0 hover:bg-[var(--panel-hi)]">
                  <div className="text-center font-ui border-r border-[rgba(var(--ink-rgb),0.08)] pr-3.5">
                    <span className="block text-[22px] font-semibold text-ink leading-[1.1]">{dayNum(b.slot_date)}</span>
                    <span className="block text-[10.5px] tracking-[1.3px] text-gold-dim uppercase mt-0.5">{monthAbbr(b.slot_date)}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="block font-display text-base text-ink font-medium mb-0.5">{escapeAll(b.facility_or_venue || '—')}</span>
                    <span className="block text-[12.5px] text-[#5a5a6a] font-ui">
                      {escapeAll(startTime)}
                      {escapeAll(endTime)}
                      {b.outlet_pax ? ` · ${escapeAll(b.outlet_pax)} pax` : ''}
                    </span>
                    <span className="block text-[11px] text-[#999] mt-1 font-mono">{escapeAll(b.booking_reference || '—')}</span>
                  </div>
                  <span
                    className="text-[11px] font-ui tracking-[0.4px] uppercase py-1 px-2.5 rounded-pill whitespace-nowrap font-medium"
                    style={
                      ['confirmed', 'checked-in', 'completed', 'late-fee-paid'].includes(statusKey)
                        ? { background: 'color-mix(in srgb, var(--teal) 16%, transparent)', color: 'var(--teal)' }
                        : statusKey === 'overdue'
                          ? { background: 'color-mix(in srgb, var(--coral) 42%, transparent)', color: 'var(--ink)' }
                          : { background: 'color-mix(in srgb, var(--muted) 16%, transparent)', color: 'var(--muted)' }
                    }
                  >
                    {escapeAll(statusDisp)}
                  </span>
                </article>
              );
            })
          )}
        </div>
      </dialog>

      <dialog ref={confirmationModal.ref} className="vrv-modal modal-dialog-base confirmation-modal-base">
        <button className="modal-close-base" onClick={confirmationModal.close} type="button">
          &times;
        </button>
        {confirmData && (
          <div className="flex flex-col items-center gap-0">
            <div className="[animation:checkPop_0.5s_cubic-bezier(0.4,0,0.2,1)]">
              <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
                <circle cx="26" cy="26" r="25" stroke="#D49A8F" strokeWidth="2" />
                <path d="M15 27l7 7 15-15" stroke="#D49A8F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 className="text-[26px] font-light my-3.5 mb-1">Booking Confirmed</h3>
            <p className="font-display italic text-[13px] text-gold-dim mb-5">Hi {member.name || 'Member'}, your booking has been confirmed!</p>
            <div className="w-full bg-[rgba(var(--ink-rgb),0.03)] border border-[rgba(var(--gold-dim-rgb),0.18)] py-3.5 px-4.5 flex flex-col gap-2.5 mb-5.5">
              <ConfirmRow icon="📍" label="Venue" value={confirmData.venue} />
              <ConfirmRow icon="📅" label="Date" value={confirmData.date} />
              <ConfirmRow icon="🕐" label="Time" value={formatDisplayTime(confirmData.time)} />
              <ConfirmRow icon="👥" label="Pax" value={confirmData.pax} />
              <ConfirmRow icon="🔖" label="Reference" value={confirmData.reference} mono />
            </div>
            <div className="flex flex-col items-center gap-2.5 mb-3.5">
              <p className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-muted opacity-70">Your Check-in QR Code</p>
              {/* Plain <img>, matching the original: dynamically-generated third-party
                  QR image (api.qrserver.com), and downloadQr() draws it to a <canvas>
                  via the raw element's naturalWidth/Height — next/image's wrapper
                  would need remotePatterns config for no behavioral benefit here. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(confirmData.reference)}`} alt="QR Code" className="w-40 h-40 border-[5px] border-white-token" />
              <button
                type="button"
                className="inline-flex items-center gap-1.5 py-1.5 px-4 font-ui text-[10px] font-semibold tracking-[0.12em] uppercase bg-transparent border border-[rgba(var(--ink-rgb),0.18)] text-ink cursor-pointer hover:bg-[rgba(var(--gold-dim-rgb),0.08)] hover:border-gold hover:text-gold-dim"
                onClick={() => downloadQr(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(confirmData.reference)}`, `VRV-QR-${confirmData.reference}.png`)}
              >
                Download QR
              </button>
            </div>
            <p className="font-display italic text-xs text-muted opacity-70 mb-1">Please present this QR code to security upon arrival.</p>
            <p className="font-display text-[11px] font-semibold tracking-[0.2em] uppercase text-gold-dim mb-5">Verve</p>
            <button className="btn-primary-base w-full mt-0" onClick={confirmationModal.close} type="button">
              Done
            </button>
          </div>
        )}
      </dialog>

      <dialog ref={qrViewModal.ref} className="vrv-modal modal-dialog-base [max-width:340px] [text-align:center] [padding:40px_36px_32px]">
        <button className="modal-close-base" onClick={qrViewModal.close} type="button">
          &times;
        </button>
        <div className="flex flex-col items-center gap-0">
          <h3 className="text-[26px] font-light my-3.5 mb-1">Check-in QR Code</h3>
          <p className="font-ui text-sm font-semibold text-gold-dim tracking-[0.08em] my-2 mb-4">{qrViewRef}</p>
          <div className="flex flex-col items-center gap-2.5 mb-3.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- see facilityModal's confirmationModal QR for rationale */}
            {qrViewRef && <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrViewRef)}`} alt="QR Code" className="w-40 h-40 border-[5px] border-white-token" />}
            <button
              type="button"
              className="inline-flex items-center gap-1.5 py-1.5 px-4 font-ui text-[10px] font-semibold tracking-[0.12em] uppercase bg-transparent border border-[rgba(var(--ink-rgb),0.18)] text-ink cursor-pointer hover:bg-[rgba(var(--gold-dim-rgb),0.08)] hover:border-gold hover:text-gold-dim"
              onClick={() => downloadQr(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrViewRef)}`, `VRV-QR-${qrViewRef}.png`)}
            >
              Download QR
            </button>
          </div>
          <p className="font-display italic text-xs text-muted opacity-70 mb-1">Please present this QR code to security upon arrival.</p>
          <p className="font-display text-[11px] font-semibold tracking-[0.2em] uppercase text-gold-dim mb-5">Verve</p>
          <button className="btn-primary-base w-full mt-0" onClick={qrViewModal.close} type="button">
            Close
          </button>
        </div>
      </dialog>

      <dialog ref={guestConfirmationModal.ref} className="vrv-modal modal-dialog-base confirmation-modal-base">
        <button className="modal-close-base" onClick={guestConfirmationModal.close} type="button">
          &times;
        </button>
        <div className="flex flex-col items-center gap-0">
          <div className="[animation:checkPop_0.5s_cubic-bezier(0.4,0,0.2,1)]">
            <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
              <circle cx="26" cy="26" r="25" stroke="#D49A8F" strokeWidth="2" />
              <path d="M15 27l7 7 15-15" stroke="#D49A8F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h3 className="text-[26px] font-light my-3.5 mb-1">Guests Registered</h3>
          <p className="font-display italic text-[13px] text-gold-dim mb-5">
            Hi {member.name || 'Member'}, your guest{guestConfirmResults.length > 1 ? 's have' : ' has'} been registered!
          </p>
          <div className="flex flex-col gap-5 my-4.5 max-h-[400px] overflow-y-auto w-full">
            {guestConfirmResults.map((g, i) => (
              <div key={i} className="bg-[rgba(var(--gold-dim-rgb),0.06)] border border-[rgba(var(--gold-dim-rgb),0.18)] rounded-xl p-4 text-center">
                <div className="font-display text-[15px] font-semibold text-ink mb-0.5">{g.name}</div>
                <div className="text-xs text-muted mb-1">{g.email}</div>
                <div className="font-ui text-xs font-semibold text-gold-dim tracking-[0.08em] mb-2.5">Ref: {g.booking_reference}</div>
                <div className="flex flex-col items-center gap-1.5">
                  <div className="font-display text-[10px] font-semibold uppercase tracking-[0.15em] text-muted mb-1.5">Guest Check-in QR Code</div>
                  {/* eslint-disable-next-line @next/next/no-img-element -- see confirmationModal's QR for rationale */}
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(g.booking_reference)}`} alt={`QR Code for ${g.name}`} className="w-[140px] h-[140px] border-4 border-white-token" />
                </div>
              </div>
            ))}
          </div>
          <p className="font-display italic text-xs text-muted opacity-70 mb-1">Please ensure each guest presents their QR code to security upon arrival.</p>
          <p className="font-display text-[11px] font-semibold tracking-[0.2em] uppercase text-gold-dim mb-5">Verve</p>
          <button className="btn-primary-base w-full mt-0" onClick={guestConfirmationModal.close} type="button">
            Done
          </button>
        </div>
      </dialog>

      <dialog ref={summaryModal.ref} className="vrv-modal modal-dialog-base [max-width:400px]">
        <button className="modal-close-base" onClick={handleSummaryCloseX} type="button">
          &times;
        </button>
        <h3 className="modal-h3-base">Review Booking</h3>
        <p className="modal-step-base">Confirm the details below before submitting.</p>
        <div className="flex flex-col border border-[rgba(var(--ink-rgb),0.1)] overflow-hidden mb-6 mt-1">
          {summaryRows.map((row, i) => (
            <div key={i} className={`flex items-center py-2.5 px-4 gap-3 border-b border-[rgba(var(--ink-rgb),0.06)] last:border-b-0 ${i % 2 === 0 ? 'bg-[rgba(var(--card-rgb),0.85)]' : 'bg-[rgba(248,245,239,0.7)]'}`}>
              <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.16em] text-muted min-w-[72px] shrink-0 opacity-70">{row.label}</span>
              <span className="font-ui text-[13.5px] text-ink font-medium">{row.value}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <button className="btn-ghost-base flex-1" onClick={handleSummaryEdit} type="button">
            Edit
          </button>
          <button className="btn-primary-base flex-[2] mt-0" onClick={handleSummaryConfirm} type="button">
            Confirm
          </button>
        </div>
      </dialog>

      <dialog ref={cancelConfirmModal.ref} className="vrv-modal modal-dialog-base">
        <button className="modal-close-base" onClick={cancelConfirmModal.close} type="button">
          &times;
        </button>
        <h3 className="modal-h3-base">Cancel Booking</h3>
        <p className="my-2 mb-5">
          Are you sure you want to cancel booking <strong>{cancelRef}</strong>? This cannot be undone.
        </p>
        {cancelError && <span className="time-error-base block mb-2">{cancelError}</span>}
        <div className="flex gap-3 justify-end mt-4">
          <button className="btn-secondary-base !mt-0" onClick={cancelConfirmModal.close} type="button">
            Keep Booking
          </button>
          <button className="btn-primary-base !mt-0" onClick={confirmCancelBooking} type="button">
            Yes, Cancel
          </button>
        </div>
      </dialog>
    </div>
  );
}

function ConfirmRow({ icon, label, value, mono }: { icon: string; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-3 text-left">
      <span className="text-base w-6 text-center shrink-0">{icon}</span>
      <div className="flex flex-col gap-px">
        <span className="font-ui text-[9px] font-semibold uppercase tracking-[0.18em] text-muted opacity-60">{label}</span>
        <span className={`font-ui text-sm font-medium text-ink ${mono ? 'font-mono font-bold tracking-[0.06em] text-gold-dim' : ''}`}>{value}</span>
      </div>
    </div>
  );
}

function EmptyBookingsState() {
  return (
    <div className="flex flex-col items-center gap-3 py-8 opacity-50">
      <svg viewBox="0 0 120 100" fill="none" className="w-[72px] h-auto" aria-hidden="true">
        <rect x="20" y="20" width="80" height="65" rx="4" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.5" />
        <rect x="35" y="10" width="12" height="20" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
        <rect x="73" y="10" width="12" height="20" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
        <line x1="20" y1="38" x2="100" y2="38" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.5" />
        <circle cx="60" cy="65" r="14" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
        <line x1="60" y1="58" x2="60" y2="65" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
        <line x1="60" y1="65" x2="65" y2="70" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      </svg>
      <p className="font-display italic text-[13px] tracking-[0.06em] text-muted">No bookings yet. Reserve one above.</p>
    </div>
  );
}

function EmptyGuestsState() {
  return (
    <div className="flex flex-col items-center gap-3 py-8 opacity-50">
      <svg viewBox="0 0 120 100" fill="none" className="w-[72px] h-auto" aria-hidden="true">
        <circle cx="60" cy="36" r="16" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.5" />
        <path d="M28 84 Q28 62 60 62 Q92 62 92 84" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" fill="none" opacity="0.5" />
      </svg>
      <p className="font-display italic text-[13px] tracking-[0.06em] text-muted">No guests registered yet.</p>
    </div>
  );
}

function BookingItem({ booking: b, expanded, onToggle, onQr, onEdit, onCancel }: { booking: Booking; expanded: boolean; onToggle: () => void; onQr: () => void; onEdit: () => void; onCancel: () => void }) {
  const type = b.booking_type === 'dining' ? 'Dining' : 'Facility';
  const origStatusKey = statusKeyOf(b.booking_status);
  const isLateCancellation = b.late_cancellation || origStatusKey === 'late-fee-paid';
  const rawStatus = isLateCancellation ? 'late cancellation' : (b.booking_status || 'confirmed').toLowerCase();
  const statusKey = rawStatus.replace(/[\s_]+/g, '-');
  const statusDisp = statusDisplayOf(rawStatus);
  const isActive = !PAST_STATUSES.includes(statusKey);
  const timingChip = getTimingChip(b);
  const date = b.slot_date || '—';
  const time = b.slot_start_time ? formatDisplayTime(b.slot_start_time) + (b.slot_end_time ? ' – ' + formatDisplayTime(b.slot_end_time) : '') : '—';
  const pax = b.outlet_pax || b.pax_size || '—';
  const notes = b.special_request || b.notes || '—';
  const name = b.facility_or_venue || '—';

  const feeChip = isLateCancellation
    ? origStatusKey === 'late-fee-paid'
      ? { text: 'Fee Paid', color: 'var(--teal)' }
      : b.fee_waived
        ? { text: 'Fee Waived', color: 'var(--muted)' }
        : { text: 'Fee Outstanding', color: 'var(--champagne)' }
    : null;

  const statusColor = ['confirmed', 'checked-in', 'completed', 'done', 'late-fee-paid'].includes(statusKey)
    ? 'var(--teal)'
    : ['pending', 'overdue', 'walkin'].includes(statusKey)
      ? 'var(--champagne)'
      : 'var(--muted)';

  return (
    <article className={`border-b border-[var(--hairline)] [transition:border-color_0.3s_ease-out,transform_0.3s_ease-out] hover:translate-x-[3px] last:border-b-0 ${expanded ? 'bg-[color-mix(in_srgb,var(--gold-dim)_4%,transparent)]' : ''}`}>
      <div className={`grid grid-cols-[auto_1fr_auto_auto] items-center gap-3.5 py-4 px-1 border-l-2 [transition:border-color_0.3s_ease-out] ${expanded ? 'border-l-[var(--gold)] pl-3' : 'border-l-transparent'}`}>
        <span className={`font-ui text-[10px] font-bold tracking-[0.18em] uppercase whitespace-nowrap shrink-0 ${b.booking_type === 'dining' ? 'text-gold-dim' : 'text-muted'}`}>{type}</span>
        <span className="font-display text-[18px] font-semibold text-ink tracking-[0.02em] min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">{name}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className="inline-flex items-center gap-1.5 py-[3px] pr-2.5 pl-2 rounded-pill text-[9.5px] font-bold tracking-[0.13em] uppercase font-ui whitespace-nowrap before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-current"
            style={{ background: `color-mix(in srgb, ${statusColor} 16%, transparent)`, color: statusColor }}
          >
            {statusDisp}
          </span>
          {timingChip && (
            <span
              className="inline-flex items-center gap-1.5 py-[3px] pr-2.5 pl-2 rounded-pill text-[9.5px] font-bold tracking-[0.13em] uppercase font-ui whitespace-nowrap before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-current"
              style={{ background: `color-mix(in srgb, ${timingChip === 'live' ? 'var(--teal)' : 'var(--champagne)'} 16%, transparent)`, color: timingChip === 'live' ? 'var(--teal)' : 'var(--champagne)' }}
            >
              {timingChip === 'live' ? 'In Progress' : 'Not Yet Started'}
            </span>
          )}
          {feeChip && (
            <span
              className="inline-flex items-center gap-1.5 py-[3px] pr-2.5 pl-2 rounded-pill text-[9.5px] font-bold tracking-[0.13em] uppercase font-ui whitespace-nowrap before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-current"
              style={{ background: `color-mix(in srgb, ${feeChip.color} 16%, transparent)`, color: feeChip.color }}
            >
              {feeChip.text}
            </span>
          )}
        </div>
        <div className="flex gap-2 items-center shrink-0">
          {isActive && !['cancelled', 'no-show'].includes(statusKey) && (
            <button className="inline-flex items-center justify-center w-7 h-7 p-0 bg-transparent border border-[rgba(var(--ink-rgb),0.18)] rounded-pill text-ink cursor-pointer [transition:all_0.2s] shrink-0 hover:border-gold hover:text-gold-dim hover:bg-[rgba(var(--gold-dim-rgb),0.06)]" title="View QR Code" onClick={onQr} type="button">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="3" height="3" />
                <line x1="21" y1="14" x2="21" y2="14.01" />
                <line x1="21" y1="21" x2="21" y2="21.01" />
                <line x1="17" y1="21" x2="17" y2="21.01" />
                <line x1="21" y1="17" x2="21" y2="17.01" />
              </svg>
            </button>
          )}
          <button
            className={`py-1.5 px-3.5 font-ui text-[10px] font-semibold tracking-[0.12em] uppercase rounded-pill cursor-pointer [transition:all_0.2s] whitespace-nowrap border ${
              expanded ? 'bg-navy text-gold-light border-ink hover:bg-navy-deep hover:border-navy-deep' : 'bg-transparent border-[rgba(var(--ink-rgb),0.18)] text-ink hover:border-gold hover:text-gold-dim hover:bg-[rgba(var(--gold-dim-rgb),0.06)]'
            }`}
            onClick={onToggle}
            type="button"
          >
            {expanded ? 'Hide' : 'Details'}
          </button>
          {isActive && (
            <button className="py-1.5 px-3.5 font-ui text-[10px] font-semibold tracking-[0.12em] uppercase bg-transparent border border-[rgba(var(--ink-rgb),0.18)] rounded-pill text-ink cursor-pointer [transition:all_0.2s] whitespace-nowrap hover:bg-[rgba(var(--gold-dim-rgb),0.08)] hover:border-gold hover:text-gold-dim" onClick={onEdit} type="button">
              Edit
            </button>
          )}
          {isActive && (
            <button className="py-1.5 px-3.5 font-ui text-[10px] font-semibold tracking-[0.12em] uppercase bg-transparent border border-[rgba(192,57,43,0.24)] rounded-pill text-[#c96a5e] cursor-pointer [transition:all_0.2s] whitespace-nowrap hover:bg-[rgba(192,57,43,0.07)] hover:border-[rgba(192,57,43,0.5)]" onClick={onCancel} type="button">
              Cancel
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <div className="grid grid-cols-2 gap-y-4 gap-x-6 border-t border-[var(--hairline)] py-5 px-1 pl-4 [animation:detailsReveal_0.28s_cubic-bezier(0.16,1,0.3,1)]">
          <DetailRow label="Date" value={date} />
          <DetailRow label="Time" value={time} />
          <DetailRow label="Pax" value={String(pax)} />
          <DetailRow label="Notes" value={notes} />
        </div>
      )}
    </article>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-ui text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-dim shrink-0">{label}</span>
      <span className="font-ui text-[15px] font-normal text-ink tracking-[0.01em]">{value}</span>
    </div>
  );
}

function GuestItem({ guest: g, onQr }: { guest: GuestBookingRow; onQr: () => void }) {
  const statusKey = statusKeyOf(g.status).replace(/^confirmed$/, 'confirmed');
  const statusDisp = g.status ? statusDisplayOf(g.status) : '';
  let dateDisp = '';
  if (g.date) {
    const d = new Date(g.date);
    dateDisp = isNaN(d.getTime()) ? g.date : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  const statusColor = ['confirmed', 'checked-in', 'completed', 'done', 'late-fee-paid'].includes(statusKey) ? 'var(--teal)' : ['pending', 'overdue', 'walkin'].includes(statusKey) ? 'var(--champagne)' : 'var(--muted)';

  return (
    <div className="py-3.5 px-1 border-l-2 border-l-transparent border-b border-[var(--hairline)] [transition:border-color_0.3s_ease-out,transform_0.3s_ease-out,padding-left_0.3s_ease-out] flex items-center justify-between gap-2 last:border-b-0 hover:border-l-[var(--gold)] hover:pl-3 hover:translate-x-0.5">
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span className="font-display text-[15px] font-normal text-ink tracking-[0.03em]">{g.name}</span>
        {(g.facility || dateDisp) && (
          <span className="font-ui text-xs text-muted tracking-[0.03em] flex items-center gap-1.5 flex-wrap">
            {g.facility && <span className="text-ink font-medium">{g.facility}</span>}
            {g.facility && dateDisp && <span className="text-gold-dim font-bold">·</span>}
            {dateDisp && <span className="text-muted">{dateDisp}</span>}
          </span>
        )}
      </div>
      {statusDisp && (
        <span
          className="inline-flex items-center gap-1.5 py-[3px] pr-2.5 pl-2 rounded-pill text-[9.5px] font-bold tracking-[0.13em] uppercase font-ui whitespace-nowrap before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-current"
          style={{ background: `color-mix(in srgb, ${statusColor} 16%, transparent)`, color: statusColor }}
        >
          {statusDisp}
        </span>
      )}
      <div className="flex items-center gap-2 shrink-0">
        {g.booking_reference && <span className="font-mono text-[11px] font-semibold text-gold-dim tracking-[0.06em]">{g.booking_reference}</span>}
        {g.booking_reference && (
          <button className="inline-flex items-center justify-center w-7 h-7 p-0 bg-transparent border border-[rgba(var(--ink-rgb),0.18)] rounded-pill text-ink cursor-pointer [transition:all_0.2s] shrink-0 hover:border-gold hover:text-gold-dim hover:bg-[rgba(var(--gold-dim-rgb),0.06)]" title="View QR Code" onClick={onQr} type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="3" height="3" />
              <line x1="21" y1="14" x2="21" y2="14.01" />
              <line x1="21" y1="21" x2="21" y2="21.01" />
              <line x1="17" y1="21" x2="17" y2="21.01" />
              <line x1="21" y1="17" x2="21" y2="17.01" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
