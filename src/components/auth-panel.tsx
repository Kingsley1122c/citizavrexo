"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  AtSign,
  Check,
  ChevronDown,
  ChevronLeft,
  Eye,
  Globe2,
  LockKeyhole,
  Mail,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  X,
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
import { BrandedStatus } from "@/components/branded-status";

type AuthAction = (state: AuthState, formData: FormData) => Promise<AuthState>;
type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid" | "unavailable";
const usernamePattern = /^[A-Za-z0-9](?:[A-Za-z0-9._]*[A-Za-z0-9])?$/;
const normalizeSearch = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
const localeFlags: Record<Locale, string> = {
  en: "🇬🇧", fr: "🇫🇷", es: "🇪🇸", pt: "🇵🇹", ja: "🇯🇵", ko: "🇰🇷", "zh-CN": "🇨🇳", "zh-TW": "🇹🇼",
  th: "🇹🇭", vi: "🇻🇳", id: "🇮🇩", ms: "🇲🇾", hi: "🇮🇳", bn: "🇧🇩",
};

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
  const [languageOpen, setLanguageOpen] = useState(false);
  const [registration, setRegistration] = useState({ name: "", username: "", email: "", password: "", passwordConfirmation: "", pin: "", pinConfirmation: "" });
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [suggestionHistory, setSuggestionHistory] = useState<string[]>([]);
  const usernameRequestId = useRef(0);
  const usernameInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [locale, setLocale] = useState<Locale>("en");
  const [localeReady, setLocaleReady] = useState(false);
  const localeHydrated = useRef(false);
  const [state, formAction, pending] = useActionState(action, {});
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const stored = localStorage.getItem("Citizavrexo-locale");
      localeHydrated.current = true;
      setLocale(stored ? resolveSupportedLocale(stored) : resolveSupportedLocale(navigator.language));
      setLocaleReady(true);
    });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!localeHydrated.current) return;
    localStorage.setItem("Citizavrexo-locale", locale);
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    if (!languageOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLanguageOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [languageOpen]);
  useEffect(() => {
    if (mode !== "register" || usernameEdited || registration.name.trim().length < 2) return;
    const requestId = ++usernameRequestId.current;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setUsernameStatus("checking");
      try {
        const response = await fetch("/api/username", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "suggest", name: registration.name, exclude: [] }), signal: controller.signal });
        const result = await response.json() as { suggestion?: string | null };
        if (requestId !== usernameRequestId.current) return;
        if (!response.ok || !result.suggestion) return setUsernameStatus("unavailable");
        setRegistration((current) => ({ ...current, username: result.suggestion! }));
        setSuggestionHistory([result.suggestion]);
        setUsernameStatus("available");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (requestId === usernameRequestId.current) setUsernameStatus("unavailable");
      }
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [mode, registration.name, usernameEdited]);
  useEffect(() => {
    if (mode !== "register" || !usernameEdited) return;
    const username = registration.username.trim();
    if (!username) return;
    if (username.length < 3 || username.length > 30 || !usernamePattern.test(username)) return;
    const requestId = ++usernameRequestId.current;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setUsernameStatus("checking");
      try {
        const response = await fetch("/api/username", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "check", username }), signal: controller.signal });
        const result = await response.json() as { valid?: boolean; available?: boolean };
        if (requestId !== usernameRequestId.current) return;
        setUsernameStatus(response.ok && result.valid ? result.available ? "available" : "taken" : "unavailable");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (requestId === usernameRequestId.current) setUsernameStatus("unavailable");
      }
    }, 450);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [mode, registration.username, usernameEdited]);
  useEffect(() => {
    const input = usernameInputRef.current;
    if (!input || !registration.username) return;
    input.setCustomValidity(usernameStatus === "available" ? "" : usernameStatus === "taken" ? "Choose a different username." : usernameStatus === "invalid" ? "Use a valid username." : "Wait for the username availability check.");
  }, [registration.username, usernameStatus]);
  const t = userUi(locale);
  const content = {
    login: [t.auth.loginTitle, t.auth.loginSubtitle, t.auth.signIn],
    register: [t.auth.registerTitle, t.auth.registerSubtitle, t.auth.createAccount],
    reset: [t.auth.resetTitle, t.auth.resetSubtitle, t.auth.sendResetLink],
  }[mode];
  const normalizedLanguageQuery = normalizeSearch(languageQuery.trim());
  const matchingLocales = REGISTRATION_LOCALES.filter((value) => normalizeSearch(localeNames[value]).includes(normalizedLanguageQuery) || value.toLowerCase().includes(normalizedLanguageQuery));
  const updateRegistration = (field: keyof typeof registration, value: string) => setRegistration((current) => ({ ...current, [field]: value }));
  const generateAnotherUsername = async () => {
    if (registration.name.trim().length < 2) return;
    const requestId = ++usernameRequestId.current;
    setUsernameStatus("checking");
    try {
      const exclude = [...new Set([...suggestionHistory, registration.username].filter(Boolean))].slice(-10);
      const response = await fetch("/api/username", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "suggest", name: registration.name, exclude }) });
      const result = await response.json() as { suggestion?: string | null };
      if (requestId !== usernameRequestId.current) return;
      if (!response.ok || !result.suggestion) return setUsernameStatus("unavailable");
      setRegistration((current) => ({ ...current, username: result.suggestion! }));
      setSuggestionHistory((current) => [...current, result.suggestion!].slice(-10));
      setUsernameStatus("available");
    } catch {
      if (requestId === usernameRequestId.current) setUsernameStatus("unavailable");
    }
  };
  const usernameStatusText = {
    idle: "A readable username will be suggested from your name.",
    checking: "Checking availability...",
    available: "Username is available.",
    taken: "That username is already taken. Generate another or edit it.",
    invalid: "Use 3–30 letters, numbers, periods, or underscores.",
    unavailable: "Availability could not be checked. Please try again.",
  }[usernameStatus];
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
                  <button className="language-trigger" type="button" aria-haspopup="dialog" aria-expanded={languageOpen} aria-busy={!localeReady} disabled={!localeReady} onClick={() => setLanguageOpen(true)}>
                    {!localeReady ? <BrandedStatus compact message="Loading language preferences..." /> : <><span className="language-flag" aria-hidden="true">{localeFlags[locale]}</span><span><b>{localeNames[locale]}</b><small>{locale}</small></span><ChevronDown size={18} aria-hidden="true" /></>}
                  </button>
                  {languageOpen && createPortal(<div className="language-popup-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setLanguageOpen(false); }}>
                    <section className="language-popup" role="dialog" aria-modal="true" aria-labelledby="language-popup-title">
                      <header><div><span className="eyebrow">PREFERRED LANGUAGE</span><h3 id="language-popup-title">{t.app.language}</h3></div><button className="icon-button" type="button" aria-label="Close language selector" onClick={() => setLanguageOpen(false)}><X size={18} /></button></header>
                      <label className="language-search"><Search size={16} /><span className="sr-only">Search languages</span><input autoFocus value={languageQuery} onChange={(event) => setLanguageQuery(event.target.value)} placeholder="Search languages" autoComplete="off" /></label>
                      <div className="language-options" role="listbox" aria-label={t.app.language}>
                        {matchingLocales.map((value) => <button key={value} type="button" role="option" aria-selected={locale === value} className={locale === value ? "selected" : ""} onClick={() => { setLocale(value); setLanguageOpen(false); setLanguageQuery(""); }}><span className="language-flag" aria-hidden="true">{localeFlags[value]}</span><span><b>{localeNames[value]}</b><small>{value}</small></span>{locale === value && <Check size={18} aria-hidden="true" />}</button>)}
                        {!matchingLocales.length && <p className="language-empty">No matching language</p>}
                      </div>
                    </section>
                  </div>, document.body)}
                </div>
                <label>{t.auth.fullName}<span><UserRound size={17} /><input name="name" autoComplete="name" placeholder={t.auth.fullNamePlaceholder} value={registration.name} onChange={(event) => { updateRegistration("name", event.target.value); if (!usernameEdited) setSuggestionHistory([]); }} required minLength={2} maxLength={100} /></span></label>
                <div className="registration-username-field">
                  <div className="registration-field-heading"><label htmlFor="registration-username">Username</label><button type="button" disabled={registration.name.trim().length < 2 || usernameStatus === "checking"} onClick={generateAnotherUsername}><RefreshCw size={13} />Generate another</button></div>
                  <span className={`registration-input username-${usernameStatus}`}><AtSign size={17} /><input ref={usernameInputRef} id="registration-username" name="username" autoComplete="username" placeholder="Suggested from your name" value={registration.username} onChange={(event) => { const value = event.target.value; setUsernameEdited(true); updateRegistration("username", value); setUsernameStatus(!value ? "idle" : value.length < 3 || value.length > 30 || !usernamePattern.test(value) ? "invalid" : "checking"); }} aria-describedby="username-availability" required minLength={3} maxLength={30} pattern="[A-Za-z0-9](?:[A-Za-z0-9._]*[A-Za-z0-9])?" /></span>
                  <div id="username-availability" className={`username-status username-status-${usernameStatus}`}>{usernameStatus === "checking" ? <BrandedStatus compact message="Checking username availability..." /> : usernameStatus === "available" ? <BrandedStatus compact variant="success" message={usernameStatusText} /> : usernameStatus === "taken" || usernameStatus === "invalid" || usernameStatus === "unavailable" ? <BrandedStatus compact variant="error" message={usernameStatusText} /> : usernameStatusText}</div>
                </div>
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
                {pending && <div className="registration-loading-overlay"><BrandLogo tone="light" /><BrandedStatus message="Creating your account..." detail="Setting up your account. Securing your account. Preparing your dashboard. Almost ready..." /></div>}
                {state.error && localizeAuthStateMessage(locale, state.error) && <BrandedStatus variant="error" message="Account creation paused" detail={localizeAuthStateMessage(locale, state.error)} />}
                {state.success && <BrandedStatus variant="success" message="Account created" detail={localizeAuthStateMessage(locale, state.success)} />}
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
          {mode !== "register" && pending && <BrandedStatus message={mode === "login" ? "Signing you in..." : "Processing your request..."} detail={mode === "login" ? "Preparing your dashboard..." : "Almost ready..."} />}
          {mode !== "register" && state.error && localizeAuthStateMessage(locale, state.error) && <BrandedStatus variant="error" message={mode === "login" ? "Sign-in unsuccessful" : "Request unsuccessful"} detail={localizeAuthStateMessage(locale, state.error)} />}
          {mode !== "register" && state.success && localizeAuthStateMessage(locale, state.success) && <BrandedStatus variant="success" message="Request completed" detail={localizeAuthStateMessage(locale, state.success)} />}
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

