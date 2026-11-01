"use client";

import Link from "next/link";
import { ArrowRight, Eye, Globe2, LockKeyhole, ShieldCheck } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { completePasswordResetAction } from "@/app/auth-actions";
import {
  localeNames,
  resolveSupportedLocale,
  SUPPORTED_LOCALES,
  type Locale,
} from "@/lib/i18n/config";
import { localizeAuthStateMessage, userUi } from "@/lib/i18n/user-ui";
import { BrandLogo } from "@/components/brand-logo";

export function PasswordResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(completePasswordResetAction, {});
  const [showPassword, setShowPassword] = useState(false);
  const [locale, setLocale] = useState<Locale>("en");
  const localeHydrated = useRef(false);
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
  return <main className="auth-page">
    <section className="auth-brand"><div className="brand"><BrandLogo tone="light"/></div><div><span className="eyebrow">{t.resetPassword.brandEyebrow}</span><h1>{t.resetPassword.brandTitleLine1}<br/>{t.resetPassword.brandTitleLine2}</h1><p>{t.resetPassword.brandBody}</p></div><footer><ShieldCheck size={18}/>{t.resetPassword.brandFooter}</footer></section>
    <section className="auth-form-wrap"><form action={action} className="auth-form">
      <label className="locale"><Globe2 size={16}/><select aria-label={t.app.language} value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>{SUPPORTED_LOCALES.map((value) => <option key={value} value={value}>{localeNames[value]}</option>)}</select></label>
      <span className="auth-icon"><LockKeyhole size={22}/></span><h2>{t.resetPassword.title}</h2><p>{t.resetPassword.subtitle}</p>
      <input type="hidden" name="token" value={token}/>
      <label>{t.resetPassword.newPassword}<span><LockKeyhole size={17}/><input name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder={t.resetPassword.newPasswordPlaceholder} required minLength={12} maxLength={128}/><button type="button" aria-label={showPassword ? t.auth.hidePassword : t.auth.showPassword} onClick={() => setShowPassword(!showPassword)}><Eye size={17}/></button></span></label>
      {state.error && <p className="auth-message error" role="alert">{localizeAuthStateMessage(locale, state.error)}</p>}
      {state.success && <p className="auth-message success" role="status">{localizeAuthStateMessage(locale, state.success)}</p>}
      <button className="button primary auth-submit" type="submit" disabled={pending || Boolean(state.success)}>{pending ? t.auth.pleaseWait : state.success ? t.resetPassword.passwordReset : t.resetPassword.resetPassword}<ArrowRight size={18}/></button>
      <div className="auth-switch">{t.resetPassword.returnTo} <Link href="/login">{t.resetPassword.signIn}</Link></div>
    </form></section>
  </main>;
}
