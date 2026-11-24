import React, { useState } from "react";
import { Check, Clock } from "lucide-react";

export interface AudioPackTier {
  id: string;
  audience: string;
  name: string;
  priceLabel: string;
  minutes: number;
  rateLabel: string;
  formatSpec: string;
  modesSpec: string;
  toolsSpec: string;
  isFeatured?: boolean;
}

export const AUDIO_PACK_TIERS: AudioPackTier[] = [
  {
    id: "starter",
    audience: "For quick tests & short trailers",
    name: "Starter Sample",
    priceLabel: "$0",
    minutes: 2,
    rateLabel: "Free trial allowance",
    formatSpec: "24 kHz 16-bit mono WAV",
    modesSpec: "Solo narrator (5 voices)",
    toolsSpec: "Script editor & inline mic dictation",
  },
  {
    id: "creator-20",
    audience: "For short documentaries & essays",
    name: "20-Minute Audio Pack",
    priceLabel: "$2",
    minutes: 20,
    rateLabel: "$0.10 per minute",
    formatSpec: "24 kHz 16-bit WAV + MP3 score",
    modesSpec: "Solo narrator & 2-speaker interviews",
    toolsSpec: "Breath cues, script polish & transcription",
    isFeatured: true,
  },
  {
    id: "feature-120",
    audience: "For multi-part series & production teams",
    name: "120-Minute Studio Pack",
    priceLabel: "$9",
    minutes: 120,
    rateLabel: "$0.075 per minute",
    formatSpec: "24 kHz 16-bit WAV + MP3 score",
    modesSpec: "Unlimited solo & 2-speaker takes",
    toolsSpec: "Live voice coaching, transcription & scoring",
  },
];

interface PricingPanelProps {
  activePackId: string;
  usedSeconds: number;
  onSelectPack: (pack: AudioPackTier) => void;
}

export const PricingPanel: React.FC<PricingPanelProps> = ({
  activePackId,
  usedSeconds,
  onSelectPack,
}) => {
  const [estimateMinutes, setEstimateMinutes] = useState<number>(20);
  const estimatedCost = ((estimateMinutes / 20) * 2).toFixed(2);
  const estimatedWords = estimateMinutes * 125;

  const activePack =
    AUDIO_PACK_TIERS.find((p) => p.id === activePackId) ?? AUDIO_PACK_TIERS[1];
  const totalPackSeconds = activePack.minutes * 60;
  const remainingSeconds = Math.max(0, totalPackSeconds - usedSeconds);
  const remainingMins = Math.floor(remainingSeconds / 60);
  const remainingSecs = Math.floor(remainingSeconds % 60);

  return (
    <div className="space-y-8">
      {/* Header & Active Allowance Summary */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#232329] pb-6">
        <div>
          <h2 className="font-display text-2xl sm:text-3xl font-medium tracking-tight text-[#F3F1EC]">
            Simple audio pricing — $2 for 20 minutes
          </h2>
          <p className="mt-2 text-sm text-[#9A9893] max-w-2xl leading-relaxed">
            Pay only for finished documentary audio minutes with no monthly
            subscription. Every pack includes uncompressed 24 kHz WAV downloads.
          </p>
        </div>

        <div className="flex items-center gap-3 border border-[#232329] bg-[#131316] rounded-md px-4 py-3 shrink-0">
          <Clock className="w-4 h-4 text-[#D49635] shrink-0" aria-hidden="true" />
          <div className="text-xs">
            <span className="text-[#9A9893] block">Current Studio Balance</span>
            <span className="font-mono-tabular text-sm font-semibold text-[#F3F1EC]">
              {String(remainingMins).padStart(2, "0")}:
              {String(remainingSecs).padStart(2, "0")} left · {activePack.name}
            </span>
          </div>
        </div>
      </div>

      {/* 3-Column Tier Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
        {AUDIO_PACK_TIERS.map((tier) => {
          const isSelected = tier.id === activePackId;
          return (
            <div
              key={tier.id}
              className={`flex flex-col justify-between rounded-lg border p-6 transition-colors ${
                tier.isFeatured
                  ? "border-[#D49635] bg-[#161512]"
                  : "border-[#232329] bg-[#131316]"
              }`}
            >
              <div>
                <p className="text-xs text-[#9A9893]">{tier.audience}</p>
                <h3 className="mt-1.5 font-display text-xl font-medium text-[#F3F1EC]">
                  {tier.name}
                </h3>

                <div className="mt-4 flex items-baseline gap-2.5">
                  <span className="font-mono-tabular text-4xl font-semibold tracking-tight text-[#F3F1EC]">
                    {tier.priceLabel}
                  </span>
                  <span className="text-sm text-[#9A9893]">
                    for {tier.minutes} minutes of audio
                  </span>
                </div>
                <p className="mt-1 font-mono-tabular text-xs text-[#D49635]">
                  {tier.rateLabel}
                </p>

                <dl className="mt-6 pt-5 border-t border-[#232329] space-y-3 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#9A9893]">Audio allowance</dt>
                    <dd className="font-mono-tabular text-[#F3F1EC] font-medium text-right">
                      {tier.minutes} minutes
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#9A9893]">Export quality</dt>
                    <dd className="text-[#F3F1EC] text-right">
                      {tier.formatSpec}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#9A9893]">Voice modes</dt>
                    <dd className="text-[#F3F1EC] text-right">
                      {tier.modesSpec}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#9A9893]">Included tools</dt>
                    <dd className="text-[#F3F1EC] text-right">
                      {tier.toolsSpec}
                    </dd>
                  </div>
                </dl>
              </div>

              <button
                type="button"
                onClick={() => onSelectPack(tier)}
                className={`mt-6 w-full min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? "border border-[#D49635] bg-[#1F1B14] text-[#D49635]"
                    : tier.isFeatured
                    ? "bg-[#D49635] text-[#0B0B0D] hover:bg-[#E0A648]"
                    : "border border-[#34343D] bg-[#18181D] text-[#F3F1EC] hover:border-[#D49635]"
                }`}
              >
                {isSelected ? (
                  <>
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Active in Studio</span>
                  </>
                ) : (
                  <span>
                    Select {tier.priceLabel} · {tier.minutes} Min Pack
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Interactive Audio Minute & Cost Estimator */}
      <div className="border border-[#232329] bg-[#131316] rounded-lg p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1.5 max-w-md">
          <h3 className="text-sm font-semibold text-[#F3F1EC]">
            Documentary Runtime Estimator
          </h3>
          <p className="text-xs text-[#9A9893] leading-relaxed">
            At the standard 125 words-per-minute documentary pace, calculate how
            many minutes of finished audio your script requires at the $2 / 20
            min rate.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-5 flex-1 md:max-w-lg justify-end">
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="runtime-slider" className="text-[#9A9893]">
                Project audio length
              </label>
              <span className="font-mono-tabular text-[#F3F1EC] font-medium">
                {estimateMinutes} min (~{estimatedWords.toLocaleString()} words)
              </span>
            </div>
            <input
              id="runtime-slider"
              type="range"
              min={5}
              max={120}
              step={5}
              value={estimateMinutes}
              onChange={(e) => setEstimateMinutes(Number(e.target.value))}
              className="w-full accent-[#D49635] cursor-pointer"
            />
          </div>

          <div className="border border-[#26262E] bg-[#0B0B0D] rounded-md px-4 py-2.5 text-right shrink-0">
            <span className="block text-[11px] text-[#9A9893]">
              Estimated Audio Cost
            </span>
            <span className="font-mono-tabular text-xl font-semibold text-[#D49635]">
              ${estimatedCost}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
