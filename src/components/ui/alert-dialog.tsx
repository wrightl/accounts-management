"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";

export type AlertOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
};

type AlertMode = "alert" | "confirm";

type OpenAlertState = AlertOptions & {
  mode: AlertMode;
};

type AlertContextValue = {
  /** Single-action acknowledgement dialog. */
  alert: (options: AlertOptions) => Promise<void>;
  /** Two-action confirmation dialog; resolves true when confirmed. */
  confirm: (options: AlertOptions) => Promise<boolean>;
};

const AlertContext = createContext<AlertContextValue | null>(null);

export function useAlert(): AlertContextValue {
  const ctx = useContext(AlertContext);
  if (!ctx) {
    throw new Error("useAlert must be used within AlertProvider");
  }
  return ctx;
}

export function AlertProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<OpenAlertState | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const settle = useCallback((value: boolean) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setOpen(false);
    setState(null);
  }, []);

  const alert = useCallback((options: AlertOptions) => {
    return new Promise<void>((resolve) => {
      resolveRef.current = () => resolve();
      setState({ ...options, mode: "alert" });
      setOpen(true);
    });
  }, []);

  const confirm = useCallback((options: AlertOptions) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setState({ ...options, mode: "confirm" });
      setOpen(true);
    });
  }, []);

  const isConfirm = state?.mode === "confirm";

  return (
    <AlertContext.Provider value={{ alert, confirm }}>
      {children}
      {state ? (
        <Dialog
          open={open}
          onClose={() => settle(isConfirm ? false : true)}
          title={state.title}
        >
          <p className="text-sm leading-relaxed text-muted">{state.message}</p>
          <DialogActions>
            {isConfirm ? (
              <button
                type="button"
                className={buttonClasses("ghost")}
                onClick={() => settle(false)}
              >
                {state.cancelLabel ?? "Cancel"}
              </button>
            ) : null}
            <Button
              type="button"
              variant={state.variant === "destructive" ? "secondary" : "primary"}
              onClick={() => settle(true)}
            >
              {state.confirmLabel ?? (isConfirm ? "Confirm" : "OK")}
            </Button>
          </DialogActions>
        </Dialog>
      ) : null}
    </AlertContext.Provider>
  );
}
