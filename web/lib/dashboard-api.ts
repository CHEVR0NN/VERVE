// Typed client for the member-dashboard API surface. Field shapes verified
// against both public/js/demo-mode.js's mock routes (what actually answers
// these calls today) and the real backend/controllers/*.js they mirror.

import type { Member } from './auth';

const API_BASE = 'https://backend-production-41dc3.up.railway.app';
const NOTIF_API = `${API_BASE}/api/events`;

export function authHeaders(token: string): HeadersInit {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

export interface Booking {
  booking_reference: string;
  email: string;
  name: string;
  phone: string;
  membership_number: string;
  facility_or_venue: string;
  booking_type: string;
  booking_status: string;
  booking_shift: string;
  slot_date: string;
  slot_date_to?: string;
  slot_start_time: string;
  slot_end_time: string;
  outlet_pax: string;
  pax_size?: string;
  notes: string;
  special_request: string;
  guest_email: string;
  guest_phone: string;
  late_cancellation: boolean;
  fee_waived: boolean;
}

export interface Notification {
  _id: string;
  type: string;
  title: string;
  message: string;
  category: string;
  reference_id: string;
  created_by: string;
  createdAt: string;
  updatedAt: string;
  is_read: boolean;
}

export interface Reply {
  _id: string;
  notification_id: string;
  sender_type: string;
  sender_name: string;
  membership_number: string;
  message: string;
  createdAt: string;
  updatedAt: string;
}

interface ApiResult {
  success: boolean;
  message?: string;
}

export async function fetchBookings(token: string): Promise<Booking[]> {
  const res = await fetch(`${API_BASE}/api/member/bookings`, { headers: authHeaders(token) });
  const data = (await res.json()) as ApiResult & { bookings?: Booking[] };
  return data.success ? data.bookings || [] : [];
}

export interface GuestQuota {
  used: number;
  max: number;
  remaining: number;
}

export async function fetchGuestQuota(token: string): Promise<GuestQuota> {
  try {
    const res = await fetch(`${API_BASE}/api/member/guest-quota`, { headers: authHeaders(token) });
    const data = (await res.json()) as ApiResult & Partial<GuestQuota>;
    if (data.success) {
      return { used: data.used ?? 0, max: data.max ?? 4, remaining: data.remaining ?? 4 };
    }
  } catch {
    // fall through to default
  }
  return { used: 0, max: 4, remaining: 4 };
}

export interface AvailabilitySlot {
  used: number;
  cap: number;
  isFull: boolean;
}

export async function fetchAvailability(token: string, facility: string, date: string): Promise<{ slots: Record<string, AvailabilitySlot>; cap: number | null } | null> {
  if (!facility || !date) return null;
  try {
    const res = await fetch(`${API_BASE}/api/booking/availability?facility=${encodeURIComponent(facility)}&date=${encodeURIComponent(date)}`, {
      headers: authHeaders(token),
    });
    const data = (await res.json()) as ApiResult & { slots?: Record<string, AvailabilitySlot>; cap?: number | null };
    if (!data.success) return null;
    return { slots: data.slots || {}, cap: data.cap ?? null };
  } catch {
    return null;
  }
}

export interface CreateBookingPayload {
  email: string;
  name: string;
  membership_number: string;
  facility_or_venue: string;
  calendar_id: string;
  booking_shift?: string;
  slot_date: string;
  slot_start_time: string;
  slot_end_time: string;
  outlet_pax: string;
  booking_type: 'facility' | 'dining';
  special_request?: string;
}

export async function createBooking(token: string, payload: CreateBookingPayload): Promise<{ ok: true; reference: string } | { ok: false; message: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/booking`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(payload) });
    const data = (await res.json()) as ApiResult & { booking_reference?: string };
    if (!res.ok || !data.success) return { ok: false, message: data.message || 'Booking failed. Please try again.' };
    return { ok: true, reference: data.booking_reference || '' };
  } catch {
    return { ok: false, message: 'Unable to connect to the server. Please try again.' };
  }
}

export interface UpdateBookingPayload {
  slot_date: string;
  slot_start_time: string;
  slot_end_time: string;
  outlet_pax: string;
  notes: string;
}

export async function updateBooking(token: string, ref: string, payload: UpdateBookingPayload): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/member/bookings/${encodeURIComponent(ref)}`, { method: 'PUT', headers: authHeaders(token), body: JSON.stringify(payload) });
    const data = (await res.json()) as ApiResult;
    if (!res.ok || !data.success) return { ok: false, message: data.message || 'Failed to update booking. Please try again.' };
    return { ok: true };
  } catch {
    return { ok: false, message: 'Unable to connect to the server. Please try again.' };
  }
}

export async function cancelBooking(token: string, email: string, ref: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/cancellation`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ email, booking_reference: ref }) });
    const data = (await res.json()) as ApiResult;
    if (!res.ok || !data.success) return { ok: false, message: data.message || 'Cancellation failed. Please try again.' };
    return { ok: true };
  } catch {
    return { ok: false, message: 'Unable to connect to the server. Please try again.' };
  }
}

export interface GuestRegistrationPayload {
  email: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  inviting_member_id: string;
  slot_date: string;
  facility_or_venue: string;
  booking_shift?: string;
}

export async function registerGuest(token: string, payload: GuestRegistrationPayload): Promise<{ success: boolean; message?: string; booking_reference?: string }> {
  const res = await fetch(`${API_BASE}/api/guest-registration`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(payload) });
  return (await res.json()) as { success: boolean; message?: string; booking_reference?: string };
}

export async function updateProfile(token: string, body: { name: string; email: string; phone: string }): Promise<{ ok: true; member: Member } | { ok: false; message: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/member/profile`, { method: 'PUT', headers: authHeaders(token), body: JSON.stringify(body) });
    const data = (await res.json()) as ApiResult & { member?: Member };
    if (!res.ok || !data.success || !data.member) return { ok: false, message: data.message || 'Failed to save profile.' };
    return { ok: true, member: data.member };
  } catch {
    return { ok: false, message: 'Network error. Please try again.' };
  }
}

export async function fetchNotifications(token: string): Promise<Notification[]> {
  const res = await fetch(`${NOTIF_API}/notifications`, { headers: authHeaders(token) });
  const data = (await res.json()) as ApiResult & { notifications?: Notification[] };
  return data.success ? data.notifications || [] : [];
}

export async function markNotificationRead(token: string, id: string): Promise<void> {
  await fetch(`${NOTIF_API}/notifications/${id}/read`, { method: 'PUT', headers: authHeaders(token) }).catch(() => {});
}

export async function markAllNotificationsRead(token: string): Promise<void> {
  await fetch(`${NOTIF_API}/notifications/read-all`, { method: 'PUT', headers: authHeaders(token) }).catch(() => {});
}
