import React from 'react';
import { Download, X } from 'lucide-react';

const InstallPromptCard: React.FC<{
  open: boolean;
  onInstall: () => void;
  onDismiss: () => void;
}> = ({ open, onInstall, onDismiss }) => {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-x-3 bottom-24 z-40 sm:bottom-6 sm:left-auto sm:right-4 sm:w-full sm:max-w-md">
      <div className="overflow-hidden rounded-[30px] border border-slate-700/80 bg-[linear-gradient(135deg,rgba(2,6,23,0.96),rgba(15,23,42,0.96))] p-5 text-slate-100 shadow-[0_30px_80px_rgba(2,6,23,0.55)] backdrop-blur">
        <div className="flex items-start gap-4">
          <div className="rounded-[22px] bg-cyan-500/15 p-3 text-cyan-300">
            <Download className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-lg font-semibold">Install TeachFlow</div>
            <p className="mt-1 text-sm leading-6 text-slate-300">
              Get the app-like experience with offline access, fast launches, and instant updates.
            </p>
            <div className="mt-4 flex gap-3">
              <button
                onClick={onInstall}
                className="min-h-[44px] rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
              >
                Install TeachFlow
              </button>
              <button
                onClick={onDismiss}
                className="min-h-[44px] rounded-2xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-900"
              >
                Not now
              </button>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="rounded-xl p-1 text-slate-500 transition hover:bg-slate-900 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default InstallPromptCard;
