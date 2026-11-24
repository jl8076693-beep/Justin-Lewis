import React, { useEffect, useRef, useState } from "react";
import { Download, Pause, Play, RotateCcw, Volume2 } from "lucide-react";
import { downloadTakeAudio, formatTimecode } from "../utils/audio";

export interface RecordedTake {
  id: string;
  takeNumber: number;
  title: string;
  mode: "solo" | "dialogue";
  voiceSummary: string;
  createdAt: string;
  blobUrl: string;
  peaks: number[];
  duration: number;
  sampleRate: number;
  scriptPreview: string;
}

interface WaveformPlayerProps {
  activeTake: RecordedTake | null;
  isRendering: boolean;
  onQuickRender: () => void;
}

const SPEED_OPTIONS = [0.85, 1, 1.15] as const;

export const WaveformPlayer: React.FC<WaveformPlayerProps> = ({
  activeTake,
  isRendering,
  onQuickRender,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isExportingMp3, setIsExportingMp3] = useState(false);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(activeTake?.duration ?? 0);

    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    audio.playbackRate = playbackRate;
  }, [activeTake?.id]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || !activeTake) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    }
  };

  const handleRewind = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const next = Math.max(0, audio.currentTime - 5);
    audio.currentTime = next;
    setCurrentTime(next);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const targetDuration = duration || activeTake?.duration || 0;
    if (!audio || targetDuration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const nextTime = ratio * targetDuration;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const handleDownload = async (format: "wav" | "mp3") => {
    if (!activeTake) return;
    if (format === "mp3") {
      setIsExportingMp3(true);
    }
    try {
      await downloadTakeAudio(
        activeTake.blobUrl,
        activeTake.takeNumber,
        activeTake.title,
        format
      );
    } finally {
      setIsExportingMp3(false);
    }
  };

  const effectiveDuration = duration || activeTake?.duration || 0;
  const progressRatio =
    effectiveDuration > 0 ? Math.min(1, currentTime / effectiveDuration) : 0;

  if (isRendering) {
    return (
      <div className="border border-[#232329] bg-[#131316] rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-[#F3F1EC]">
            Synthesizing Master Audio
          </span>
          <span className="font-mono-tabular text-xs text-[#9A9893]">
            24.0 kHz WAV
          </span>
        </div>
        <div className="h-20 flex items-center gap-[3px] px-1">
          {Array.from({ length: 64 }).map((_, idx) => (
            <div
              key={idx}
              className="flex-1 rounded-full bg-[#26262E] animate-pulse"
              style={{
                height: `${22 + ((idx * 17) % 52)}%`,
                animationDelay: `${(idx % 8) * 90}ms`,
              }}
            />
          ))}
        </div>
        <p className="mt-3 text-xs text-[#9A9893]">
          Directing voice cadence and rendering uncompressed mono waveform...
        </p>
      </div>
    );
  }

  if (!activeTake) {
    return (
      <div className="border border-[#232329] bg-[#131316] rounded-lg p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-[#F3F1EC]">
              Master Tape Monitor
            </h3>
            <p className="mt-1.5 text-sm text-[#9A9893] leading-relaxed">
              Rendered documentary takes appear here with a scrubbable 24 kHz
              waveform, speed auditioning, and direct WAV download.
            </p>
          </div>
          <Volume2 className="w-5 h-5 text-[#6E6C67] shrink-0 mt-0.5" aria-hidden="true" />
        </div>
        <div className="mt-5 pt-4 border-t border-[#232329] flex items-center justify-between gap-4">
          <span className="font-mono-tabular text-xs text-[#6E6C67]">
            00:00.0 / 00:00.0
          </span>
          <button
            type="button"
            onClick={onQuickRender}
            className="min-h-[40px] px-4 py-2 rounded-md border border-[#34343D] bg-[#1B1B20] text-xs font-medium text-[#F3F1EC] hover:border-[#D49635] hover:text-[#D49635] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D49635]"
          >
            Render Opening Take
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-[#232329] bg-[#131316] rounded-lg p-5">
      <audio
        ref={audioRef}
        src={activeTake.blobUrl}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onTimeUpdate={(e) => {
          setCurrentTime(e.currentTarget.currentTime);
        }}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
      />

      <div className="flex items-baseline justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[#F3F1EC] truncate">
            Take {String(activeTake.takeNumber).padStart(2, "0")} — {activeTake.title}
          </h3>
          <p className="mt-0.5 text-xs text-[#9A9893] truncate">
            {activeTake.voiceSummary} · {(activeTake.sampleRate / 1000).toFixed(1)} kHz WAV
          </p>
        </div>
        <span className="font-mono-tabular text-xs text-[#D49635] whitespace-nowrap shrink-0">
          {formatTimecode(currentTime)} / {formatTimecode(effectiveDuration)}
        </span>
      </div>

      {/* Scrubbable real-amplitude waveform */}
      <div
        role="slider"
        tabIndex={0}
        aria-label="Audio waveform scrubber"
        aria-valuemin={0}
        aria-valuemax={Math.round(effectiveDuration)}
        aria-valuenow={Math.round(currentTime)}
        onClick={handleSeek}
        onKeyDown={(e) => {
          const audio = audioRef.current;
          if (!audio) return;
          if (e.key === "ArrowRight") {
            const next = Math.min(effectiveDuration, audio.currentTime + 2);
            audio.currentTime = next;
            setCurrentTime(next);
          } else if (e.key === "ArrowLeft") {
            const next = Math.max(0, audio.currentTime - 2);
            audio.currentTime = next;
            setCurrentTime(next);
          } else if (e.key === " ") {
            e.preventDefault();
            void togglePlay();
          }
        }}
        className="group relative h-20 flex items-center gap-[2px] px-1 cursor-pointer select-none rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D49635]"
      >
        {activeTake.peaks.map((peak, idx) => {
          const barRatio = idx / activeTake.peaks.length;
          const isPlayed = barRatio <= progressRatio;
          return (
            <div
              key={idx}
              className={`flex-1 rounded-full transition-colors duration-100 ${
                isPlayed
                  ? "bg-[#D49635]"
                  : "bg-[#303038] group-hover:bg-[#3F3F4A]"
              }`}
              style={{
                height: `${Math.max(10, Math.round(peak * 96))}%`,
              }}
            />
          );
        })}
      </div>

      {/* Transport & Export controls */}
      <div className="mt-4 pt-4 border-t border-[#232329] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void togglePlay()}
            aria-label={isPlaying ? "Pause playback" : "Play take"}
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-[#F3F1EC] text-[#0B0B0D] text-xs font-semibold hover:bg-white transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D49635]"
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                <span>Play</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleRewind}
            aria-label="Rewind 5 seconds"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center px-3 py-2 rounded-md border border-[#2A2A32] text-[#9A9893] hover:text-[#F3F1EC] hover:border-[#3D3D47] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D49635]"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          </button>

          <div
            className="flex items-center rounded-md border border-[#232329] bg-[#0E0E11] p-0.5"
            role="group"
            aria-label="Playback speed"
          >
            {SPEED_OPTIONS.map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => setPlaybackRate(rate)}
                className={`min-h-[34px] px-2.5 py-1 text-xs font-mono-tabular rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D49635] ${
                  playbackRate === rate
                    ? "bg-[#23232B] text-[#F3F1EC]"
                    : "text-[#9A9893] hover:text-[#F3F1EC]"
                }`}
              >
                {rate}×
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void handleDownload("wav")}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-[#34343D] bg-[#18181D] text-xs font-medium text-[#F3F1EC] hover:border-[#D49635] hover:text-[#D49635] transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D49635]"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>WAV</span>
          </button>

          <button
            type="button"
            disabled={isExportingMp3}
            onClick={() => void handleDownload("mp3")}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-[#34343D] bg-[#18181D] text-xs font-medium text-[#F3F1EC] hover:border-[#D49635] hover:text-[#D49635] disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D49635]"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{isExportingMp3 ? "Encoding..." : "MP3"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
