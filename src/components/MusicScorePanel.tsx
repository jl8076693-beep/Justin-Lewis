import React, { useRef, useState } from "react";
import { AlertCircle, Download, Music, Volume2 } from "lucide-react";
import { MUSIC_MOOD_PRESETS } from "../data/documentaryPresets";
import { RecordedTake } from "./WaveformPlayer";

interface MusicScorePanelProps {
  archetypeTitle: string;
  defaultMoodPrompt: string;
  sceneImagePath: string;
  latestVoiceTake: RecordedTake | null;
}

export const MusicScorePanel: React.FC<MusicScorePanelProps> = ({
  archetypeTitle,
  defaultMoodPrompt,
  sceneImagePath,
  latestVoiceTake,
}) => {
  const [prompt, setPrompt] = useState(defaultMoodPrompt);
  const [durationMode, setDurationMode] = useState<"clip" | "full">("clip");
  const [matchScenePhoto, setMatchScenePhoto] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [audioDataUrl, setAudioDataUrl] = useState<string | null>(null);
  const [trackNotes, setTrackNotes] = useState<string>("");
  const [usedModel, setUsedModel] = useState<string>("");
  const [musicVolume, setMusicVolume] = useState<number>(0.35);

  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);

  const handleGenerateMusic = async () => {
    setErrorMsg(null);
    const trimmed = prompt.trim();
    if (!trimmed) {
      setErrorMsg("Describe the mood or instruments for your documentary score.");
      return;
    }

    setIsGenerating(true);
    try {
      const res = await fetch("/api/music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: trimmed,
          durationMode,
          imagePath: matchScenePhoto ? sceneImagePath : undefined,
        }),
      });
      const data = (await res.json()) as {
        audioDataUrl?: string;
        lyrics?: string;
        model?: string;
        error?: string;
      };
      if (!res.ok || !data.audioDataUrl) {
        throw new Error(data.error || "Music generation failed.");
      }

      setAudioDataUrl(data.audioDataUrl);
      setTrackNotes(data.lyrics ?? "");
      setUsedModel(data.model ?? "");
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Could not generate music track."
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePlayMixWithVoice = async () => {
    const musicEl = musicAudioRef.current;
    const voiceEl = voiceAudioRef.current;
    if (!musicEl || !voiceEl) return;

    musicEl.currentTime = 0;
    voiceEl.currentTime = 0;
    musicEl.volume = musicVolume;
    voiceEl.volume = 1;
    try {
      await Promise.all([musicEl.play(), voiceEl.play()]);
    } catch {
      // Ignore autoplay errors
    }
  };

  const handleDownloadMp3 = () => {
    if (!audioDataUrl) return;
    const a = document.createElement("a");
    a.href = audioDataUrl;
    const slug = archetypeTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    a.download = `chronicle-score-${slug}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Left: Music Mood & Length */}
      <div className="lg:col-span-6 border border-[#232329] bg-[#131316] rounded-lg p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-[#F3F1EC]">
            Documentary Background Score
          </h2>
          <p className="mt-1 text-sm text-[#9A9893] leading-relaxed">
            Create original instrumental underscore tailored to your{" "}
            {archetypeTitle} film.
          </p>
        </div>

        {/* Length Switch */}
        <div>
          <span className="block text-xs font-medium text-[#9A9893] mb-2">
            Track Length
          </span>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setDurationMode("clip")}
              className={`min-h-[42px] px-4 py-2 rounded-md text-left border transition-colors cursor-pointer ${
                durationMode === "clip"
                  ? "border-[#D49635] bg-[#1C1A16] text-[#F3F1EC]"
                  : "border-[#26262E] bg-[#0B0B0D] text-[#9A9893] hover:text-[#F3F1EC]"
              }`}
            >
              <span className="block text-xs font-semibold">30-Second Clip</span>
              <span className="block text-[11px] text-[#7D7B76]">
                Quick scene underscore
              </span>
            </button>
            <button
              type="button"
              onClick={() => setDurationMode("full")}
              className={`min-h-[42px] px-4 py-2 rounded-md text-left border transition-colors cursor-pointer ${
                durationMode === "full"
                  ? "border-[#D49635] bg-[#1C1A16] text-[#F3F1EC]"
                  : "border-[#26262E] bg-[#0B0B0D] text-[#9A9893] hover:text-[#F3F1EC]"
              }`}
            >
              <span className="block text-xs font-semibold">Full-Length Track</span>
              <span className="block text-[11px] text-[#7D7B76]">
                Extended documentary bed
              </span>
            </button>
          </div>
        </div>

        {/* Quick Mood Chips */}
        <div>
          <span className="block text-xs font-medium text-[#9A9893] mb-2">
            Quick Mood Presets
          </span>
          <div className="flex flex-wrap gap-2">
            {MUSIC_MOOD_PRESETS.map((mood) => (
              <button
                key={mood.id}
                type="button"
                onClick={() => setPrompt(mood.prompt)}
                className="min-h-[36px] px-3 py-1.5 rounded-md border border-[#26262E] bg-[#0B0B0D] text-xs text-[#C8C5BE] hover:border-[#D49635] hover:text-[#F3F1EC] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                {mood.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor="music-prompt-textarea"
            className="block text-xs font-medium text-[#9A9893] mb-1.5"
          >
            Describe Instruments &amp; Mood
          </label>
          <textarea
            id="music-prompt-textarea"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="e.g., Soft cello and felt piano underscore, slow emotional build, no percussion..."
            className="w-full rounded-md border border-[#26262E] bg-[#0B0B0D] px-3.5 py-2.5 text-sm leading-relaxed text-[#F3F1EC] placeholder:text-[#5E5C58] focus:border-[#D49635] focus:outline-none"
          />
        </div>

        <label className="flex items-center gap-2.5 text-sm text-[#C8C5BE] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={matchScenePhoto}
            onChange={(e) => setMatchScenePhoto(e.target.checked)}
            className="h-4 w-4 rounded border-[#34343D] bg-[#0B0B0D] accent-[#D49635]"
          />
          <span>Match mood to current {archetypeTitle} scene photo</span>
        </label>

        {errorMsg && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-md border border-[#7F2323] bg-[#241112] px-3.5 py-2.5 text-xs text-[#FAD2D2]"
          >
            <AlertCircle className="w-4 h-4 text-[#F87171] shrink-0 mt-0.5" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}

        <button
          type="button"
          disabled={isGenerating || !prompt.trim()}
          onClick={() => void handleGenerateMusic()}
          className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md bg-[#D49635] text-[#0B0B0D] text-sm font-semibold hover:bg-[#E0A648] disabled:opacity-45 transition-colors cursor-pointer"
        >
          <Music className="w-4 h-4" aria-hidden="true" />
          <span>
            {isGenerating
              ? "Composing Score..."
              : durationMode === "full"
              ? "Generate Full Track"
              : "Generate 30s Music Clip"}
          </span>
        </button>
      </div>

      {/* Right: Score Player & Voiceover Mix Preview */}
      <div className="lg:col-span-6 border border-[#232329] bg-[#131316] rounded-lg p-6 space-y-5">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-sm font-semibold text-[#F3F1EC]">
            Generated Score Player
          </h3>
          {usedModel && (
            <span className="font-mono-tabular text-xs text-[#9A9893]">
              {usedModel}
            </span>
          )}
        </div>

        {!audioDataUrl ? (
          <div className="min-h-[240px] rounded-md border border-dashed border-[#2A2A32] bg-[#0B0B0D] flex flex-col items-center justify-center p-6 text-center">
            <Music className="w-6 h-6 text-[#6E6C67] mb-2.5" aria-hidden="true" />
            <p className="text-sm text-[#C8C5BE] font-medium">
              No score generated yet
            </p>
            <p className="mt-1 text-xs text-[#7D7B76] max-w-sm leading-relaxed">
              Pick a mood preset on the left and click Generate to listen and
              preview it underneath your voiceover take.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <audio
              ref={musicAudioRef}
              controls
              src={audioDataUrl}
              className="w-full"
            />

            {trackNotes && (
              <div className="rounded-md border border-[#232329] bg-[#0B0B0D] p-3.5">
                <p className="text-xs font-medium text-[#9A9893] mb-1">
                  Composition Notes
                </p>
                <p className="text-xs text-[#C8C5BE] whitespace-pre-wrap leading-relaxed">
                  {trackNotes}
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#232329]">
              <button
                type="button"
                onClick={handleDownloadMp3}
                className="min-h-[40px] inline-flex items-center gap-2 px-4 py-2 rounded-md border border-[#34343D] bg-[#18181D] text-xs font-medium text-[#F3F1EC] hover:border-[#D49635] transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Download MP3</span>
              </button>

              {latestVoiceTake && (
                <div className="flex items-center gap-3">
                  <audio
                    ref={voiceAudioRef}
                    src={latestVoiceTake.blobUrl}
                    className="hidden"
                  />
                  <label className="flex items-center gap-2 text-xs text-[#9A9893]">
                    <span>Bed Vol</span>
                    <input
                      type="range"
                      min={0.1}
                      max={0.9}
                      step={0.05}
                      value={musicVolume}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setMusicVolume(v);
                        if (musicAudioRef.current) {
                          musicAudioRef.current.volume = v;
                        }
                      }}
                      className="w-20 accent-[#D49635]"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void handlePlayMixWithVoice()}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-[#F3F1EC] text-[#0B0B0D] text-xs font-semibold hover:bg-white transition-colors cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Preview with Voice</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
