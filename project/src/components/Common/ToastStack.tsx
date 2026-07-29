import React from 'react';
import { Bell, WifiOff, RefreshCw, X } from 'lucide-react';

export interface AppToast {
  id: string;
  title: string;
  description?: string;
  kind?: 'notification' | 'offline' | 'update';
  actionLabel?: string;
  onAction?: () => void;
}

const iconMap = {
  notification: Bell,
  offline: WifiOff,
  update: RefreshCw,
} as const;

const ToastStack: React.FC<{
  toasts: AppToast[];
  onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-3 top-20 z-50 flex flex-col gap-3 sm:left-auto sm:right-4 sm:w-full sm:max-w-sm">
      {toasts.map((toast) => {
        const Icon = iconMap[toast.kind ?? 'notification'];

        return (
          <div
            key={toast.id}
            className="pointer-events-auto overflow-hidden rounded-[24px] border border-slate-700/80 bg-slate-950/95 p-4 text-slate-100 shadow-[0_20px_60px_rgba(2,6,23,0.45)] backdrop-blur animate-[toast-in_180ms_ease-out]"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-cyan-500/15 p-2 text-cyan-300">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{toast.title}</div>
                {toast.description ? <div className="mt-1 text-sm text-slate-300">{toast.description}</div> : null}
                {toast.actionLabel && toast.onAction ? (
                  <button
                    onClick={toast.onAction}
                    className="mt-3 min-h-[44px] rounded-xl bg-cyan-500/15 px-3 py-2 text-sm font-medium text-cyan-300 transition hover:bg-cyan-500/25"
                  >
                    {toast.actionLabel}
                  </button>
                ) : null}
              </div>
              <button
                onClick={() => onDismiss(toast.id)}
                className="rounded-xl p-1 text-slate-500 transition hover:bg-slate-900 hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ToastStack;
