"use client";

import Link from "next/link";
import {
  ArrowRight,
  AtSign,
  Check,
  ChevronLeft,
  Eye,
  Globe2,
  LockKeyhole,
  Mail,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import type { AuthState } from "@/app/auth-actions";
import {
  localeNames,
  REGISTRATION_LOCALES,
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
  const [registrationStep, setRegistrationStep] = useState(1);
  const [languageQuery, setLanguageQuery] = useState("");
  const [registration, setRegistration] = useState({ name: "", username: "", email: "", password: "", passwordConfirmation: "", pin: "", pinConfirmation: "" });
  const formRef = useRef<HTMLFormElement>(null);
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
  const matchingLocales = REGISTRATION_LOCALES.filter((value) => localeNames[value].toLocaleLowerCase().includes(languageQuery.trim().toLocaleLowerCase()) || value.toLowerCase().includes(languageQuery.trim().toLowerCase()));
  const updateRegistration = (field: keyof typeof registration, value: string) => setRegistration((current) => ({ ...current, [field]: value }));
  const continueRegistration = () => {
    const activeStep = formRef.current?.querySelector<HTMLElement>(`[data-registration-step="${registrationStep}"]`);
    const invalid = activeStep?.querySelector<HTMLInputElement>("input:invalid");
    if (invalid) return invalid.reportValidity();
    setRegistrationStep((step) => Math.min(3, step + 1));
  };
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
        <form className="auth-form" action={formAction} ref={formRef}>
          {mode === "register" ? (
            <input type="hidden" name="locale" value={locale} />
          ) : (
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
          )}
          <span className="auth-icon">
            <LockKeyhole size={22} />
          </span>
          <h2>{content[0]}</h2>
          <p>{content[1]}</p>
          {mode === "register" && <ol className="registration-progress" aria-label="Registration progress">
            {["Your details", "Account security", "Transaction PIN"].map((label, index) => <li key={label} className={registrationStep >= index + 1 ? "active" : ""} aria-current={registrationStep === index + 1 ? "step" : undefined}><span>{registrationStep > index + 1 ? <Check size={14} /> : index + 1}</span><b>{label}</b></li>)}
          </ol>}
          {mode === "register" && (
            <>
              <fieldset className="registration-step" data-registration-step="1" hidden={registrationStep !== 1}>
                <legend className="sr-only">Language and personal information</legend>
                <div className="registration-language-selector">
                  <b><Globe2 size={17} />{t.app.language}</b>
                  <label className="language-search"><Search size={16} /><span className="sr-only">Search languages</span><input value={languageQuery} onChange={(event) => setLanguageQuery(event.target.value)} placeholder="Search languages" autoComplete="off" /></label>
                  <div className="language-options">
                    {matchingLocales.map((value) => <button key={value} type="button" className={locale === value ? "selected" : ""} aria-pressed={locale === value} onClick={() => setLocale(value)}><span aria-hidden="true">{value.split("-")[0].toUpperCase()}</span><b>{localeNames[value]}</b></button>)}
                  </div>
                </div>
                <label>{t.auth.fullName}<span><UserRound size={17} /><input name="name" autoComplete="name" placeholder={t.auth.fullNamePlaceholder} value={registration.name} onChange={(event) => updateRegistration("name", event.target.value)} required minLength={2} maxLength={100} /></span></label>
                <label>Username<span><AtSign size={17} /><input name="username" autoComplete="username" placeholder="your.username" value={registration.username} onChange={(event) => updateRegistration("username", event.target.value)} required minLength={3} maxLength={30} pattern="[A-Za-z0-9](?:[A-Za-z0-9._]*[A-Za-z0-9])?" /></span><small>Use 3–30 letters, numbers, periods, or underscores.</small></label>
                <label>{t.auth.emailAddress}<span><Mail size={17} /><input name="email" type="email" autoComplete="email" placeholder="you@example.com" value={registration.email} onChange={(event) => updateRegistration("email", event.target.value)} required /></span></label>
                <button type="button" className="button primary auth-submit" onClick={continueRegistration}>Continue <ArrowRight size={18} /></button>
              </fieldset>
              <fieldset className="registration-step" data-registration-step="2" hidden={registrationStep !== 2}>
                <legend className="sr-only">Account currency and password</legend>
                <CurrencySelector disabled={pending} />
                <label>{t.auth.password}<span><LockKeyhole size={17} /><input name="password" type={show ? "text" : "password"} autoComplete="new-password" placeholder={t.auth.passwordPlaceholder} value={registration.password} onChange={(event) => updateRegistration("password", event.target.value)} required minLength={8} maxLength={128} /><button type="button" aria-label={show ? t.auth.hidePassword : t.auth.showPassword} onClick={() => setShow(!show)}><Eye size={17} /></button></span><small>Use at least 8 characters. No special format is required.</small></label>
                <label>Confirm password<span><LockKeyhole size={17} /><input name="passwordConfirmation" type={show ? "text" : "password"} autoComplete="new-password" value={registration.passwordConfirmation} onChange={(event) => updateRegistration("passwordConfirmation", event.target.value)} required minLength={8} maxLength={128} /></span></label>
                <div className="registration-actions"><button type="button" className="button secondary" onClick={() => setRegistrationStep(1)}><ChevronLeft size={18} /> Back</button><button type="button" className="button primary" onClick={continueRegistration}>Continue <ArrowRight size={18} /></button></div>
              </fieldset>
              <fieldset className="registration-step" data-registration-step="3" hidden={registrationStep !== 3}>
                <legend className="sr-only">Transaction PIN and review</legend>
                <div className="registration-pin-note"><ShieldCheck size={20} /><span><b>Create a transaction PIN</b><small>This 4-digit PIN protects your transactions. Never share it with anyone.</small></span></div>
                <label>{t.app.securityView.transactionPin}<span><LockKeyhole size={17} /><input name="pin" type={showPin ? "text" : "password"} inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} autoComplete="new-password" placeholder="0000" value={registration.pin} onChange={(event) => updateRegistration("pin", event.target.value)} required /><button type="button" aria-label={showPin ? t.auth.hidePassword : t.auth.showPassword} onClick={() => setShowPin(!showPin)}><Eye size={17} /></button></span></label>
                <label>Confirm {t.app.securityView.transactionPin}<span><LockKeyhole size={17} /><input name="pinConfirmation" type={showPin ? "text" : "password"} inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} autoComplete="new-password" placeholder="0000" value={registration.pinConfirmation} onChange={(event) => updateRegistration("pinConfirmation", event.target.value)} required /></span></label>
                <dl className="registration-review"><div><dt>Name</dt><dd>{registration.name}</dd></div><div><dt>Username</dt><dd>@{registration.username.toLowerCase()}</dd></div><div><dt>Email</dt><dd>{registration.email}</dd></div><div><dt>Language</dt><dd>{localeNames[locale]}</dd></div></dl>
                {state.error && localizeAuthStateMessage(locale, state.error) && <p className="auth-message error" role="alert">{localizeAuthStateMessage(locale, state.error)}</p>}
                {state.success && <p className="auth-message success" role="status">{localizeAuthStateMessage(locale, state.success)}</p>}
                <div className="registration-actions"><button type="button" className="button secondary" disabled={pending} onClick={() => setRegistrationStep(2)}><ChevronLeft size={18} /> Back</button><button className="button primary" disabled={pending || unavailable} aria-busy={pending}>{pending ? "Creating account..." : content[2]} <ArrowRight size={18} /></button></div>
              </fieldset>
            </>
          )}
          {mode !== "register" && <label>
            {mode === "login" ? "Email address or username" : t.auth.emailAddress}
            <span>
              <Mail size={17} />
              <input
                name="email"
                type={mode === "login" ? "text" : "email"}
                autoComplete={mode === "login" ? "username" : "email"}
                placeholder={mode === "login" ? "Email or username" : "you@example.com"}
                required
              />
            </span>
          </label>}
          {mode === "login" && (
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
                  minLength={8}
                  maxLength={128}
                />
                <button type="button" aria-label={show ? t.auth.hidePassword : t.auth.showPassword} onClick={() => setShow(!show)}>
                  <Eye size={17} />
                </button>
              </span>
            </label>
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
          {mode !== "register" && state.error && localizeAuthStateMessage(locale, state.error) && (
            <p className="auth-message error" role="alert">
              {localizeAuthStateMessage(locale, state.error)}
            </p>
          )}
          {mode !== "register" && state.success && localizeAuthStateMessage(locale, state.success) && (
            <p className="auth-message success" role="status">
              {localizeAuthStateMessage(locale, state.success)}
            </p>
          )}
          {unavailable && <p className="auth-message" role="status">{t.auth.registrationUnavailable}</p>}
          {mode !== "register" && <button className="button primary auth-submit" disabled={pending || unavailable} aria-busy={pending}>
            {pending ? mode === "login" ? "Signing in..." : "Sending recovery email..." : unavailable ? t.auth.registrationUnavailableAction : content[2]}
            <ArrowRight size={18} />
          </button>}
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

