import React from 'react';
import { Lock, Rocket } from 'lucide-react';

interface UpgradeCardProps {
  title: string;
  description: string;
  requiredPlan: string;
  currentPlan?: string;
  actionLabel?: string;
  loadingLabel?: string;
  onUpgradeClick?: () => void | Promise<void>;
  isLoading?: boolean;
}

const UpgradeCard: React.FC<UpgradeCardProps> = ({
  title,
  description,
  requiredPlan,
  currentPlan,
  actionLabel = 'Upgrade Now',
  loadingLabel = 'Processing payment...',
  onUpgradeClick,
  isLoading = false,
}) => (
  <div className="rounded-3xl border border-amber-400/30 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.18),_transparent_30%),radial-gradient(circle_at_right,_rgba(249,115,22,0.14),_transparent_28%),linear-gradient(135deg,_rgba(15,23,42,0.98),_rgba(30,41,59,0.94))] p-6 shadow-[0_24px_60px_rgba(15,23,42,0.24)]">
    <div className="flex items-start gap-4">
      <div className="rounded-2xl border border-amber-400/20 bg-amber-500/15 p-3 text-amber-300">
        <Lock className="h-6 w-6" />
      </div>
      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          <span className="rounded-full border border-amber-400/20 bg-amber-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-300">
            {requiredPlan} Plan
          </span>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-300">{description}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {currentPlan ? (
            <span className="rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1 text-xs font-medium text-slate-200">
              Current plan: {currentPlan}
            </span>
          ) : null}
          {onUpgradeClick ? (
            <button
              onClick={() => void onUpgradeClick()}
              disabled={isLoading}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-400/30 bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(249,115,22,0.22)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Rocket className="h-4 w-4" />
              <span>{isLoading ? loadingLabel : actionLabel}</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  </div>
);

export default UpgradeCard;
