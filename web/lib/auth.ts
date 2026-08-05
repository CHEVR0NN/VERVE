// Typed client for the member login endpoint. Matches the response shape
// returned by both the real backend (backend/controllers/authController.js:118-127)
// and its demo-mode mock (public/js/demo-mode.js:216-221) exactly.

const API_BASE = 'https://backend-production-41dc3.up.railway.app';

export interface Member {
  membership_number: string;
  email: string;
  name: string;
  phone: string;
}

export interface LoginSuccess {
  success: true;
  token: string;
  member: Member;
}

export interface LoginFailure {
  success: false;
  message?: string;
}

export type LoginResponse = LoginSuccess | LoginFailure;

export async function login(membershipNumber: string, email: string): Promise<{ ok: true; data: LoginSuccess } | { ok: false; message: string }> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ membership_number: membershipNumber, email }),
  });
  const data = (await res.json()) as LoginResponse;

  if (!res.ok || !data.success) {
    return { ok: false, message: (data as LoginFailure).message || 'Invalid membership number or email.' };
  }
  return { ok: true, data };
}
