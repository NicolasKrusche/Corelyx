"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type UserSuggestion = { id: string; email: string; created_at?: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  /**
   * Accept a comma-separated list. Suggestions apply to the segment being
   * typed, so Cc/Bcc style fields keep working as free-text lists.
   */
  multiple?: boolean;
  /** Called when the admin picks a suggestion, with that single address. */
  onSelect?: (user: UserSuggestion) => void;
  /** Enter with no suggestion highlighted — e.g. "run the search". */
  onSubmit?: () => void;
  placeholder?: string;
  id?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  /** Suggestions start once the typed segment reaches this length. */
  minChars?: number;
  /** Rendered under the field when there is nothing else to show. */
  hint?: string;
};

const DEBOUNCE_MS = 250;

/** Split "a@x.com, b@" into the committed addresses and the one being typed. */
function splitSegments(value: string): { head: string[]; active: string } {
  const parts = value.split(",");
  return {
    head: parts.slice(0, -1).map((p) => p.trim()).filter(Boolean),
    active: parts[parts.length - 1] ?? "",
  };
}

/**
 * Email field backed by the admin user directory.
 *
 * Free text is always allowed — admins legitimately email people who do not
 * have an account, and some fields accept a workspace id instead. Suggestions
 * are an accelerator, never a constraint.
 */
export function UserEmailAutocomplete({
  value,
  onChange,
  multiple = false,
  onSelect,
  onSubmit,
  placeholder,
  id,
  name,
  required,
  disabled,
  autoFocus,
  className,
  minChars = 3,
  hint,
}: Props) {
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Set right after a pick so the resulting value change does not re-search. */
  const skipNextSearch = useRef(false);
  /** Guards against a slow early response overwriting a newer one. */
  const requestSeq = useRef(0);

  const reactId = useId();
  const listboxId = `${id ?? reactId}-listbox`;

  const term = useMemo(() => {
    const raw = multiple ? splitSegments(value).active : value;
    return raw.trim();
  }, [value, multiple]);

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    if (term.length < minChars) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    const seq = ++requestSeq.current;
    const controller = new AbortController();
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/admin/users/search?q=${encodeURIComponent(term)}`,
          { signal: controller.signal },
        );
        if (seq !== requestSeq.current) return;
        if (!res.ok) {
          setSuggestions([]);
          return;
        }
        const data = (await res.json()) as { users?: UserSuggestion[] };
        if (seq !== requestSeq.current) return;
        setSuggestions(data.users ?? []);
        setHighlight(-1);
        setOpen(true);
      } catch {
        // Aborted or offline — leave the previous suggestions in place.
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term, minChars]);

  // Close when focus or a click lands outside the field.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const applySelection = useCallback(
    (user: UserSuggestion) => {
      skipNextSearch.current = true;
      if (multiple) {
        const { head } = splitSegments(value);
        // Trailing separator so the next address can be typed straight away.
        onChange([...head, user.email].join(", ") + ", ");
      } else {
        onChange(user.email);
      }
      onSelect?.(user);
      setOpen(false);
      setSuggestions([]);
      setHighlight(-1);
      inputRef.current?.focus();
    },
    [multiple, onChange, onSelect, value],
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      if (open) {
        e.stopPropagation();
        setOpen(false);
        setHighlight(-1);
      }
      return;
    }

    const canNavigate = open && suggestions.length > 0;

    if (e.key === "ArrowDown" && canNavigate) {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
      return;
    }
    if (e.key === "ArrowUp" && canNavigate) {
      e.preventDefault();
      setHighlight((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
      return;
    }
    if (e.key === "Tab" && canNavigate && highlight >= 0) {
      e.preventDefault();
      applySelection(suggestions[highlight]);
      return;
    }
    if (e.key === "Enter") {
      if (canNavigate && highlight >= 0) {
        // Take the suggestion instead of submitting the surrounding form.
        e.preventDefault();
        applySelection(suggestions[highlight]);
        return;
      }
      if (onSubmit) {
        e.preventDefault();
        setOpen(false);
        onSubmit();
      }
    }
  }

  const showList = open && (loading || suggestions.length > 0);

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        inputMode="email"
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={showList}
        aria-controls={showList ? listboxId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={
          highlight >= 0 && suggestions[highlight]
            ? `${listboxId}-${suggestions[highlight].id}`
            : undefined
        }
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoFocus={autoFocus}
        className={cn(
          "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary",
          className,
        )}
      />

      {showList && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-card shadow-lg"
        >
          {loading && suggestions.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted-foreground">Searching…</li>
          )}
          {suggestions.map((u, i) => (
            <li key={u.id} role="none">
              <button
                id={`${listboxId}-${u.id}`}
                type="button"
                role="option"
                aria-selected={i === highlight}
                // pointerdown fires before the input's blur, so the value is
                // applied instead of the list closing out from under the click.
                onPointerDown={(e) => {
                  e.preventDefault();
                  applySelection(u);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={cn(
                  "block w-full truncate px-3 py-2 text-left text-xs transition-colors",
                  i === highlight ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                )}
              >
                {u.email}
              </button>
            </li>
          ))}
        </ul>
      )}

      {hint && !showList && (
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
