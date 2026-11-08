import { useEffect, useRef } from "react";
import { create } from "zustand";

type Ask = {
  title: string;
  body: string;
  confirm: string;
  danger?: boolean;
  resolve(ok: boolean): void;
};

const useConfirm = create<{ ask: Ask | null }>(() => ({ ask: null }));

/** Shows an in-app confirmation and resolves true when the user agrees. */
export function confirmAction(opts: Omit<Ask, "resolve">): Promise<boolean> {
  return new Promise((resolve) => useConfirm.setState({ ask: { ...opts, resolve } }));
}

export function ConfirmDialog() {
  const ask = useConfirm((s) => s.ask);
  const ref = useRef<HTMLDivElement>(null);

  const close = (ok: boolean) => {
    ask?.resolve(ok);
    useConfirm.setState({ ask: null });
  };

  useEffect(() => {
    if (!ask) return;
    ref.current?.querySelector<HTMLButtonElement>("button.ghost")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      ask.resolve(false);
      useConfirm.setState({ ask: null });
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [ask]);

  if (!ask) return null;
  return (
    <>
      <div className="scrim top" onClick={() => close(false)} />
      <div
        ref={ref}
        className="dialog confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
      >
        <h2 id="confirm-title">{ask.title}</h2>
        <p id="confirm-body">{ask.body}</p>
        <div className="form-actions">
          <button className="pill ghost" onClick={() => close(false)}>
            Cancel
          </button>
          <button className={`pill ${ask.danger ? "danger" : "primary"}`} onClick={() => close(true)}>
            {ask.confirm}
          </button>
        </div>
      </div>
    </>
  );
}
