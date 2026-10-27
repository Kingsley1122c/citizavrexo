"use client";

import { Check, Download, Printer } from "lucide-react";
import { useEffect, useRef } from "react";
import type { TransferReceipt } from "@/lib/domain";
import type { Locale } from "@/lib/i18n/config";
import { localizeAccountName, userUi } from "@/lib/i18n/user-ui";
import { formatCurrencyAmount } from "@/lib/currency";

const money = (amount: number, currency: string, locale: string) => {
  return formatCurrencyAmount(amount, currency, locale);
};
const dateTime = (value: string, locale: string) => new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" }).format(new Date(value));

function downloadReceipt(receipt: TransferReceipt, locale: Locale) {
  const copy = userUi(locale).receipt;
  const content = [
    `NIVORA CORE - ${copy.title}`,
    `${copy.successful}: ${copy.successful.toUpperCase()}`,
    `${copy.amountTransferred}: ${money(receipt.sourceAmount ?? receipt.amount, receipt.sourceCurrency ?? receipt.currency, locale)} ${receipt.sourceCurrency ?? receipt.currency}`,
    `Recipient received: ${money(receipt.recipientAmount ?? receipt.amount, receipt.recipientCurrency ?? receipt.currency, locale)} ${receipt.recipientCurrency ?? receipt.currency}`,
    `Exchange rate: 1 ${receipt.sourceCurrency ?? receipt.currency} = ${receipt.exchangeRate ?? "1"} ${receipt.recipientCurrency ?? receipt.currency}`,
    `Rate date: ${receipt.rateDate ?? receipt.occurredAt.slice(0, 10)} | Provider: ${receipt.rateProvider ?? "same_currency"}`,
    `${copy.reference}: ${receipt.reference}`,
    `${copy.date}: ${dateTime(receipt.occurredAt, locale)}`,
    `${copy.from}: ${receipt.senderName} | ${localizeAccountName(locale, receipt.senderAccountName)} | ${receipt.senderAccountNumber}`,
    `${copy.to}: ${receipt.recipientName} | ${localizeAccountName(locale, receipt.recipientAccountName)} | ${receipt.recipientAccountNumber}`,
    copy.note,
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${receipt.reference}.txt`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function TransferReceiptCard({ receipt, locale, actions = true }: { receipt: TransferReceipt; locale: Locale; actions?: boolean }) {
  const receiptRef = useRef<HTMLElement>(null);
  const text = userUi(locale).receipt;
  useEffect(() => { receiptRef.current?.closest(".modal")?.scrollTo({ top: 0 }); }, [receipt.reference]);
  return <article className="transfer-receipt" ref={receiptRef}>
    <header><div className="receipt-brand"><span className="brand-mark"><i/></span><span>Nivora <b>Core</b></span></div><span className="receipt-status"><Check size={16}/>{text.successful}</span></header>
    <div className="receipt-amount"><small>Sender paid</small><strong>{money(receipt.sourceAmount ?? receipt.amount, receipt.sourceCurrency ?? receipt.currency, locale)}</strong><span>{receipt.sourceCurrency ?? receipt.currency}</span><small>Recipient received</small><strong>{money(receipt.recipientAmount ?? receipt.amount, receipt.recipientCurrency ?? receipt.currency, locale)}</strong><span>{receipt.recipientCurrency ?? receipt.currency}</span></div>
    <dl className="receipt-details"><div><dt>{text.sender}</dt><dd>{receipt.senderName}<small>{localizeAccountName(locale, receipt.senderAccountName)} · ••••{receipt.senderAccountNumber.slice(-4)}</small></dd></div><div><dt>{text.recipient}</dt><dd>{receipt.recipientName}<small>{localizeAccountName(locale, receipt.recipientAccountName)} · ••••{receipt.recipientAccountNumber.slice(-4)}</small></dd></div><div><dt>Exchange rate</dt><dd>1 {receipt.sourceCurrency ?? receipt.currency} = {receipt.exchangeRate ?? "1"} {receipt.recipientCurrency ?? receipt.currency}<small>{receipt.rateProvider === "same_currency" ? "Nivora 1:1" : receipt.rateProvider?.replaceAll("_", " ")} · {receipt.rateDate}</small></dd></div><div><dt>{text.date}</dt><dd>{dateTime(receipt.occurredAt, locale)}</dd></div><div><dt>{text.reference}</dt><dd className="receipt-reference">{receipt.reference}</dd></div><div><dt>{userUi(locale).app.accountsView.status}</dt><dd><span className="status status-completed">{text.successful}</span></dd></div></dl>
    {actions && <div className="receipt-actions"><button className="button secondary" type="button" onClick={() => window.print()}><Printer size={17}/>{text.print}</button><button className="button secondary" type="button" onClick={() => downloadReceipt(receipt, locale)}><Download size={17}/>{text.download}</button></div>}
  </article>;
}
