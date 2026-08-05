'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { login } from '@/lib/auth';

const PORTAL_URL = 'dashboard.html';

export default function LoginPage() {
  const [membershipId, setMembershipId] = useState('VRV-0001');
  const [emailAddress, setEmailAddress] = useState('ava.sinclair@vrv.com');
  const [membershipIdError, setMembershipIdError] = useState(false);
  const [emailAddressError, setEmailAddressError] = useState(false);
  const [generalError, setGeneralError] = useState('');
  const [loading, setLoading] = useState(false);
  const accessBtnRef = useRef<HTMLButtonElement>(null);

  // Ported from main.js:19-23 — already-authenticated members skip straight
  // to the dashboard instead of seeing the login form.
  useEffect(() => {
    if (localStorage.getItem('vrv_token')) {
      window.location.href = PORTAL_URL;
    }
  }, []);

  function shakeButton() {
    const btn = accessBtnRef.current;
    if (!btn) return;
    btn.classList.remove('animate-shake');
    void btn.offsetWidth;
    btn.classList.add('animate-shake');
    btn.addEventListener('animationend', () => btn.classList.remove('animate-shake'), { once: true });
  }

  function handleThemeToggle() {
    const root = document.documentElement;
    const current = root.getAttribute('data-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    localStorage.setItem('vrv_theme', next);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setGeneralError('');

    const membership_number = membershipId.trim().toUpperCase();
    const email = emailAddress.trim();

    let hasError = false;
    if (!membership_number) {
      setMembershipIdError(true);
      hasError = true;
    }
    if (!email) {
      setEmailAddressError(true);
      hasError = true;
    }
    if (hasError) {
      shakeButton();
      return;
    }

    setLoading(true);
    try {
      const result = await login(membership_number, email);
      if (!result.ok) {
        setGeneralError(result.message);
        shakeButton();
        return;
      }
      localStorage.setItem('vrv_token', result.data.token);
      localStorage.setItem('src_member', JSON.stringify(result.data.member));
      window.location.href = PORTAL_URL;
    } catch {
      setGeneralError('Unable to connect to the server. Please try again.');
      shakeButton();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen w-screen max-[700px]:h-auto max-[700px]:flex-col max-[700px]:overflow-y-auto">
      {/* LEFT PANEL — 30% LOGIN */}
      <aside
        className="relative z-2 flex w-[30%] min-w-[320px] shrink-0 animate-panel-reveal items-center justify-center bg-[linear-gradient(170deg,var(--panel-grad-1)_0%,var(--panel-grad-2)_100%)] shadow-[inset_-1px_0_0_rgba(var(--ink-rgb),0.03),26px_0_70px_-40px_rgba(0,0,0,0.35)] [transition:background_0.3s_ease] max-[700px]:w-full max-[700px]:min-w-0 max-[700px]:px-0 max-[700px]:py-12"
      >
        <div className="flex w-full max-w-[340px] flex-col gap-9 pt-12 pr-10 pb-10 pl-10">
          <div className="flex animate-fade-up flex-col items-center gap-3 [animation-delay:0.05s]">
            <div className="relative flex h-20 w-20 items-center justify-center before:absolute before:-inset-[18px] before:z-0 before:rounded-full before:bg-[radial-gradient(circle,rgba(var(--gold-rgb),0.22),transparent_70%)] before:content-['']">
              <Image src="/asset/logo.png" alt="Verve" width={72} height={72} className="relative z-10 h-[72px] w-[72px] object-contain" priority />
            </div>
            <div className="h-px w-10 bg-[linear-gradient(to_right,transparent,var(--gold),transparent)]" />
            <p className="font-display text-[10px] tracking-[0.12em] text-gold-dim uppercase italic">Est. 1983 · Nevada</p>
          </div>

          <div className="animate-fade-up flex flex-col [animation-delay:0.15s]">
            <span className="font-display text-[17px] font-medium tracking-[0.25em] text-gold-dim uppercase">Member</span>
            <h1 className="font-display text-4xl leading-none font-light tracking-[0.08em] text-ink">LOGIN</h1>
          </div>

          <form className="animate-fade-up flex flex-col gap-7 [animation-delay:0.28s]" noValidate onSubmit={handleSubmit}>
            <div className="flex flex-col gap-2">
              <label className="font-display text-[15px] font-bold tracking-[0.18em] text-muted uppercase" htmlFor="membershipId">
                Membership ID
              </label>
              <div className="relative">
                <input
                  className={`peer w-full rounded-xl border border-transparent bg-[rgba(var(--ink-rgb),0.045)] px-4 pt-3 pb-[13px] font-ui text-[15px] tracking-[0.02em] text-ink uppercase caret-gold outline-none [transition:border-color_0.3s_ease,box-shadow_0.3s_ease,background_0.3s_ease] placeholder:font-display placeholder:text-[17px] placeholder:text-[#6c6c74] placeholder:italic focus:border-gold focus:bg-[rgba(var(--ink-rgb),0.065)] focus:shadow-[0_0_0_3px_rgba(var(--gold-rgb),0.14),0_6px_22px_-8px_rgba(var(--gold-rgb),0.35)] ${membershipIdError ? 'border-b-[#c96a5e]' : ''}`}
                  type="text"
                  id="membershipId"
                  name="membershipId"
                  placeholder="e.g. VRV-0001"
                  autoComplete="off"
                  value={membershipId}
                  required
                  onChange={(e) => {
                    setMembershipId(e.target.value.toUpperCase());
                    setMembershipIdError(false);
                  }}
                />
                <span
                  className={`absolute bottom-1 left-4 h-[1.5px] rounded-pill [transition:width_0.4s_cubic-bezier(0.4,0,0.2,1)] ${
                    membershipIdError ? 'w-full bg-[#c96a5e]' : 'w-0 bg-gold peer-focus:w-[calc(100%-32px)]'
                  }`}
                />
              </div>
              <span className={`min-h-[1em] text-[11.5px] tracking-[0.06em] text-[#c96a5e] ${membershipIdError ? 'block' : 'hidden'}`}>
                Please enter your Membership ID.
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <label className="font-display text-[15px] font-bold tracking-[0.18em] text-muted uppercase" htmlFor="emailAddress">
                Email Address
              </label>
              <div className="relative">
                <input
                  className={`peer w-full rounded-xl border border-transparent bg-[rgba(var(--ink-rgb),0.045)] px-4 pt-3 pb-[13px] font-ui text-[15px] tracking-[0.02em] text-ink caret-gold outline-none [transition:border-color_0.3s_ease,box-shadow_0.3s_ease,background_0.3s_ease] placeholder:font-display placeholder:text-[17px] placeholder:text-[#6c6c74] placeholder:italic focus:border-gold focus:bg-[rgba(var(--ink-rgb),0.065)] focus:shadow-[0_0_0_3px_rgba(var(--gold-rgb),0.14),0_6px_22px_-8px_rgba(var(--gold-rgb),0.35)] ${emailAddressError ? 'border-b-[#c96a5e]' : ''}`}
                  type="email"
                  id="emailAddress"
                  name="emailAddress"
                  placeholder="you@example.com"
                  autoComplete="email"
                  value={emailAddress}
                  required
                  onChange={(e) => {
                    setEmailAddress(e.target.value);
                    setEmailAddressError(false);
                  }}
                />
                <span
                  className={`absolute bottom-1 left-4 h-[1.5px] rounded-pill [transition:width_0.4s_cubic-bezier(0.4,0,0.2,1)] ${
                    emailAddressError ? 'w-full bg-[#c96a5e]' : 'w-0 bg-gold peer-focus:w-[calc(100%-32px)]'
                  }`}
                />
              </div>
              <span className={`min-h-[1em] text-[11.5px] tracking-[0.06em] text-[#c96a5e] ${emailAddressError ? 'block' : 'hidden'}`}>
                Please enter your Email Address.
              </span>
            </div>

            {/* Ported from main.js:32-38 — this <p> is unconditionally
                present in the DOM (inserted once on load), not just when
                there's an error, so it always reserves its layout space. */}
            <p className="-mt-2 mb-3.5 min-h-[1.1em] text-center text-[0.78rem] tracking-[0.08em] text-[#c96a5e]">{generalError}</p>

            <button
              ref={accessBtnRef}
              className={`relative mt-2 flex w-full items-center justify-center overflow-hidden rounded-pill bg-[linear-gradient(135deg,var(--gold)_0%,var(--gold-light)_100%)] px-6 py-[15px] text-center font-display text-[13px] font-medium tracking-[0.18em] text-[#1a191f] uppercase shadow-[0_0_0_1px_rgba(var(--gold-rgb),0.35),0_12px_30px_-14px_rgba(0,0,0,0.35)] [transition:box-shadow_0.3s_ease,filter_0.3s_ease,transform_0.2s_ease] hover:scale-[1.02] hover:-translate-y-px hover:shadow-[0_0_0_1px_rgba(var(--gold-rgb),0.6),0_0_34px_rgba(var(--gold-rgb),0.35),0_8px_28px_-8px_rgba(0,0,0,0.35)] hover:brightness-[1.05] ${
                loading ? 'opacity-75' : 'opacity-100'
              }`}
              type="submit"
              disabled={loading}
            >
              {loading ? 'Verifying…' : 'Access Portal'}
            </button>
          </form>

          <footer className="animate-fade-up mt-1 flex items-center justify-center gap-2.5 [animation-delay:0.42s]">
            <a href="#" className="font-display text-xs tracking-[0.06em] text-muted no-underline transition-colors duration-200 hover:text-gold-dim">
              Need help?
            </a>
            <span className="text-xs text-[rgba(var(--ink-rgb),0.16)]">·</span>
            <a href="#" className="font-display text-xs tracking-[0.06em] text-muted no-underline transition-colors duration-200 hover:text-gold-dim">
              Privacy Policy
            </a>
            <span className="text-xs text-[rgba(var(--ink-rgb),0.16)]">·</span>
            <button
              className="flex h-[18px] w-[18px] items-center justify-center border-none bg-transparent p-0 text-muted [transition:color_0.2s,transform_0.15s] hover:scale-[1.06] hover:text-gold-dim"
              aria-label="Switch to light mode"
              title="Switch theme"
              onClick={handleThemeToggle}
              type="button"
            >
              <svg className="theme-icon theme-icon--sun" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="4.5" />
                <path d="M12 2.5v2.5M12 19v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12h2.5M19 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" />
              </svg>
              <svg className="theme-icon theme-icon--moon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 14.2A8.5 8.5 0 1 1 9.8 4a6.7 6.7 0 0 0 10.2 10.2z" />
              </svg>
            </button>
          </footer>
        </div>
      </aside>

      {/* RIGHT PANEL — 70% IMAGE */}
      <div className="group animate-img-reveal relative flex-1 overflow-hidden [animation-delay:0.1s] max-[700px]:h-[40vh] max-[700px]:w-full max-[700px]:flex-none">
        <Image
          src="/asset/login-bg.png"
          alt="Verve Est. 1983, Nevada"
          fill
          sizes="70vw"
          priority
          className="object-cover object-center [filter:saturate(0.88)_brightness(0.9)] [transition:transform_8s_ease] group-hover:scale-[1.03]"
        />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(10,10,12,0.72)_0%,rgba(10,10,12,0.08)_40%,transparent_100%),linear-gradient(to_top,rgba(0,0,0,0.55)_0%,transparent_45%),radial-gradient(65%_65%_at_100%_0%,rgba(212,154,143,0.4),transparent_72%),linear-gradient(200deg,rgba(212,154,143,0.22),transparent_60%)]" />
        <div className="animate-fade-up absolute top-9 right-10 flex flex-col gap-1 text-right [animation-delay:0.45s]">
          <span className="font-display text-[17px] font-extrabold tracking-[0.08em] text-gold-dim italic">Greenhills, Nevada</span>
          <span className="font-display text-[17px] tracking-[0.22em] text-white-token uppercase opacity-85">Since 1983</span>
          <span className="mt-2.5 self-end rounded-pill border border-[rgba(255,255,255,0.14)] bg-[rgba(20,20,24,0.4)] px-4 py-1.5 font-ui text-[10.5px] font-semibold tracking-[0.14em] text-[rgba(255,255,255,0.8)] uppercase backdrop-blur-[8px]">
            Private Members Club
          </span>
        </div>
      </div>
    </div>
  );
}
