"use client";

import Link from "next/link";
import {
  ArrowRight,
  Eye,
  Globe2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import type { AuthState } from "@/app/auth-actions";
import {
  localeNames,
  resolveSupportedLocale,
  SUPPORTED_LOCALES,
  type Locale,
} from "@/lib/i18n/config";
import { localizeAuthStateMessage, userUi } from "@/lib/i18n/user-ui";
import { CurrencySelector } from "@/components/currency-selector";
import { BrandLogo } from "@/components/brand-logo";

type AuthAction = (state: AuthState, formData: FormData) => Promise<AuthState>;

export function AuthPanel({
  mode,
  action,
  unavailable = false,
}: {
  mode: "login" | "register" | "reset";
  action: AuthAction;
  unavailable?: boolean;
}) {
  const [show, setShow] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [locale, setLocale] = useState<Locale>("en");
  const localeHydrated = useRef(false);
  const [state, formAction, pending] = useActionState(action, {});
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const stored = localStorage.getItem("Citizavrexo-locale");
      localeHydrated.current = true;
      setLocale(stored ? resolveSupportedLocale(stored) : resolveSupportedLocale(navigator.language));
    });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!localeHydrated.current) return;
    localStorage.setItem("Citizavrexo-locale", locale);
    document.documentElement.lang = locale;
  }, [locale]);
  const t = userUi(locale);
  const content = {
    login: [t.auth.loginTitle, t.auth.loginSubtitle, t.auth.signIn],
    register: [t.auth.registerTitle, t.auth.registerSubtitle, t.auth.createAccount],
    reset: [t.auth.resetTitle, t.auth.resetSubtitle, t.auth.sendResetLink],
  }[mode];
  return (
    <main className="auth-page">
      <section className="auth-brand">
        <div className="brand"><BrandLogo tone="light"/></div>
        <div>
          <span className="eyebrow">{t.auth.marketingEyebrow}</span>
          <h1>
            {t.auth.marketingTitleLine1}
            <br />
            {t.auth.marketingTitleLine2}
          </h1>
          <p>{t.auth.marketingBody}</p>
        </div>
        <footer>
          <ShieldCheck size={18} />
          {t.auth.marketingFooter}
        </footer>
      </section>
      <section className="auth-form-wrap">
        <form className="auth-form" action={formAction}>
          <label className="locale">
            <Globe2 size={16} />
            <select
              name="locale"
              aria-label={t.app.language}
              value={locale}
              onChange={(event) => setLocale(event.target.value as Locale)}
            >
              {SUPPORTED_LOCALES.map((value) => (
                <option key={value} value={value}>
                  {localeNames[value]}
                </option>
              ))}
            </select>
          </label>
          <span className="auth-icon">
            <LockKeyhole size={22} />
          </span>
          <h2>{content[0]}</h2>
          <p>{content[1]}</p>
          {mode === "register" && (
            <>
              <label>
                {t.auth.fullName}
                <span>
                  <UserRound size={17} />
                  <input
                    name="name"
                    autoComplete="name"
                    placeholder={t.auth.fullNamePlaceholder}
                    required
                  />
                </span>
              </label>
              <CurrencySelector disabled={pending} />
            </>
          )}
          <label>
            {t.auth.emailAddress}
            <span>
              <Mail size={17} />
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
              />
            </span>
          </label>
          {mode !== "reset" && (
            <label>
              {t.auth.password}
              <span>
                <LockKeyhole size={17} />
                <input
                  name="password"
                  type={show ? "text" : "password"}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  placeholder={t.auth.passwordPlaceholder}
                  required
                  minLength={12}
                />
                <button type="button" aria-label={show ? t.auth.hidePassword : t.auth.showPassword} onClick={() => setShow(!show)}>
                  <Eye size={17} />
                </button>
              </span>
            </label>
          )}
          {mode === "register" && (
            <>
              <label>
                {t.app.securityView.transactionPin}
                <span>
                  <LockKeyhole size={17} />
                  <input
                    name="pin"
                    type={showPin ? "text" : "password"}
                    inputMode="numeric"
                    pattern="[0-9]{4}"
                    minLength={4}
                    maxLength={4}
                    autoComplete="new-password"
                    placeholder="0000"
                    required
                  />
                  <button type="button" aria-label={showPin ? t.auth.hidePassword : t.auth.showPassword} onClick={() => setShowPin(!showPin)}>
                    <Eye size={17} />
                  </button>
                </span>
              </label>
              <label>
                {`Confirm ${t.app.securityView.transactionPin}`}
                <span>
                  <LockKeyhole size={17} />
                  <input
                    name="confirmation"
                    type={showPin ? "text" : "password"}
                    inputMode="numeric"
                    pattern="[0-9]{4}"
                    minLength={4}
                    maxLength={4}
                    autoComplete="new-password"
                    placeholder="0000"
                    required
                  />
                </span>
              </label>
            </>
          )}
          {mode === "login" && (
            <div className="auth-options">
              <label>
                <input name="persistent" type="checkbox" />
                {t.auth.keepSignedIn}
              </label>
              <Link href="/forgot-password">{t.auth.forgotPassword}</Link>
            </div>
          )}
          {state.error && localizeAuthStateMessage(locale, state.error) && (
            <p className="auth-message error" role="alert">
              {localizeAuthStateMessage(locale, state.error)}
            </p>
          )}
          {state.success && localizeAuthStateMessage(locale, state.success) && (
            <p className="auth-message success" role="status">
              {localizeAuthStateMessage(locale, state.success)}
            </p>
          )}
          {unavailable && <p className="auth-message" role="status">{t.auth.registrationUnavailable}</p>}
          <button className="button primary auth-submit" disabled={pending || unavailable} aria-busy={pending}>
            {pending ? mode === "login" ? "Signing in..." : mode === "register" ? "Creating account..." : "Sending recovery email..." : unavailable ? t.auth.registrationUnavailableAction : content[2]}
            <ArrowRight size={18} />
          </button>
          <div className="auth-switch">
            {mode === "login" ? (
              <>
                {t.auth.newToCitizavrexo} <Link href="/register">{t.auth.createAccount}</Link>
              </>
            ) : (
              <>
                {t.auth.alreadyHaveAccount} <Link href="/login">{t.auth.signIn}</Link>
              </>
            )}
          </div>
          {mode === "register" && <div className="auth-switch"><Link href="/verify-email">Resend verification email</Link></div>}
          {mode === "reset" && (
            <div className="recovery-options">
              <b>{t.auth.recoveryOptionsUnavailable}</b>
              <span>{t.auth.recoveryOptionsBody}</span>
              <small>{t.auth.recoveryOptionsHint}</small>
            </div>
          )}
        </form>
      </section>
    </main>
  );
}

