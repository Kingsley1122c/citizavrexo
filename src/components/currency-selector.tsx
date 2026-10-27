"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { currencyFlag, currencyName, currencySymbol, SUPPORTED_CURRENCIES, type Currency } from "@/lib/currency";

export function CurrencySelector({ disabled = false }: { disabled?: boolean }) {
  const [selected, setSelected] = useState<Currency>("USD");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const labelId = useId();
  const descriptionId = useId();
  const valueId = useId();
  const normalized = query.trim().toLowerCase();
  const options = SUPPORTED_CURRENCIES.filter((currency) => !normalized || currency.toLowerCase().includes(normalized) || currencyName(currency).toLowerCase().includes(normalized) || currencySymbol(currency).toLowerCase().includes(normalized));
  const flag = currencyFlag(selected);
  const focusOption = (index: number) => {
    const elements = root.current?.querySelectorAll<HTMLButtonElement>("[role='option']");
    if (!elements?.length) return;
    elements[Math.max(0, Math.min(index, elements.length - 1))]?.focus();
  };

  useEffect(() => {
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, []);

  return (
    <div className="currency-registration-field" ref={root}>
      <span id={labelId}>Account base currency</span>
      <small id={descriptionId}>This becomes the currency of your new account. It cannot be changed instantly after registration.</small>
      <input type="hidden" name="currency" value={selected} />
      <button className="currency-trigger" type="button" aria-labelledby={`${labelId} ${valueId}`} aria-describedby={descriptionId} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} disabled={disabled} onClick={() => setOpen((value) => !value)} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); } }}>
        <span className="currency-flag" aria-hidden="true">{flag ?? currencySymbol(selected)}</span>
        <span><b id={valueId}>{currencyName(selected)}</b><small>{selected} · {currencySymbol(selected)}</small></span>
        <span className="currency-selected">Base currency</span>
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      {open && (
        <div className="currency-popover">
          <label className="currency-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Search currencies</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); focusOption(0); } }} placeholder="Search by name, code, or symbol" autoComplete="off" /></label>
          <div className="currency-options" id={listId} role="listbox" aria-label="Account base currency">
            {options.map((currency) => {
              const optionFlag = currencyFlag(currency);
              return <button type="button" role="option" aria-selected={currency === selected} key={currency} onClick={() => { setSelected(currency); setOpen(false); setQuery(""); }} onKeyDown={(event) => { const index = options.indexOf(currency); if (event.key === "ArrowDown") { event.preventDefault(); focusOption(index + 1); } else if (event.key === "ArrowUp") { event.preventDefault(); focusOption(index - 1); } else if (event.key === "Home") { event.preventDefault(); focusOption(0); } else if (event.key === "End") { event.preventDefault(); focusOption(options.length - 1); } }}>
                <span className="currency-flag" aria-hidden="true">{optionFlag ?? currencySymbol(currency)}</span>
                <span><b>{currencyName(currency)}</b><small>{currency} · {currencySymbol(currency)}</small></span>
                {currency === selected && <Check size={18} aria-hidden="true" />}
              </button>;
            })}
            {!options.length && <p className="currency-empty">No matching currency</p>}
          </div>
        </div>
      )}
    </div>
  );
}