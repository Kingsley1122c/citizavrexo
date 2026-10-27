"use client";

import { CheckCircle2, Eye, Mail, Send, X } from "lucide-react";
import { useActionState, useState } from "react";
import { sendAdminMessageAction } from "@/app/admin-actions";
import type { AdminMessage, User } from "@/lib/domain";

const dateTime = (value: string) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));

export function AdminMessagePanel({ user, messages, close }: { user: User; messages: AdminMessage[]; close: () => void }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(false);
  const [state, action, pending] = useActionState(sendAdminMessageAction, {});
  const history = state.message && !messages.some((item) => item.id === state.message?.id) ? [state.message, ...messages] : messages;
  const submit = (formData: FormData) => { formData.set("idempotencyKey", `admin-message-${crypto.randomUUID()}`); action(formData); };

  return <>
    <div className="panel-title"><div><span className="eyebrow">CUSTOMER MESSAGE</span><h2 id="admin-message-title">Send Message</h2></div><button className="icon-button" type="button" aria-label="Close message panel" onClick={close}><X size={18}/></button></div>
    <div className="message-recipient"><span className="round-icon"><Mail size={18}/></span><span><small>RECIPIENT</small><b>{user.name}</b><span>{user.email}</span></span></div>
    {pending ? <div className="workflow-pending" role="status"><span className="loading-mark"/><b>Sending message...</b><small>Please keep this window open.</small></div> : state.success ? <div className="workflow-success" role="status"><CheckCircle2 size={34}/><h3>Message sent</h3><p>{state.success}</p><button className="button secondary" type="button" onClick={close}>Return to customer</button></div> : <form action={submit} className="message-compose">
      <input type="hidden" name="recipientUserId" value={user.id}/>
      <label>Subject<input name="subject" value={subject} onChange={(event) => setSubject(event.target.value)} minLength={2} maxLength={120} required placeholder="Message subject"/></label>
      <label>Message body<textarea name="message" value={message} onChange={(event) => setMessage(event.target.value)} minLength={2} maxLength={4000} required rows={8} placeholder="Write a clear message for this customer."/><small className="character-count">{message.length} / 4000</small></label>
      <button className="preview-toggle" type="button" aria-pressed={preview} onClick={() => setPreview((value) => !value)}><Eye size={16}/>{preview ? "Hide preview" : "Preview message"}</button>
      {preview && <article className="message-preview" aria-label="Message preview"><small>NIVORA CORE MESSAGE</small><h3>{subject || "Message subject"}</h3><p>{message || "Your message will appear here."}</p><span className="button primary">Open Nivora Core</span></article>}
      <div className="modal-actions"><button className="button secondary" type="button" onClick={close}>Cancel</button><button className="button primary" type="submit" disabled={pending || subject.trim().length < 2 || message.trim().length < 2}><Send size={16}/>Send Message</button></div>
    </form>}
    {state.error && <p className="auth-message error" role="alert">{state.error}</p>}
    <section className="message-history" aria-labelledby="message-history-title"><div><span className="eyebrow">MESSAGE HISTORY</span><h3 id="message-history-title">Customer messages</h3></div>{history.length ? history.map((item) => <div className="message-history-row" key={item.id}><span><b>{item.subject}</b><small>{item.recipientName} · {item.recipientEmail}</small></span><span><span className={`status status-${item.deliveryStatus}`}>{item.deliveryStatus}</span><small>{dateTime(item.deliveredAt ?? item.createdAt)}</small></span></div>) : <p className="note">No messages have been sent to this customer.</p>}</section>
  </>;
}