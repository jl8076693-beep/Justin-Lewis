import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Download,
  Film,
  MessageSquare,
  Mic,
  Music,
  PenLine,
  PhoneCall,
  Sliders,
  Sparkles,
  Square,
  Trash2,
  Wand2,
} from "lucide-react";
import { ChatPanel } from "./components/ChatPanel";
import { HeaderBar, StudioTab } from "./components/HeaderBar";
import { LiveConversationPanel } from "./components/LiveConversationPanel";
import { MusicScorePanel } from "./components/MusicScorePanel";
import {
  AUDIO_PACK_TIERS,
  AudioPackTier,
  PricingPanel,
} from "./components/PricingPanel";
import { TranscribePanel } from "./components/TranscribePanel";
import { RecordedTake, WaveformPlayer } from "./components/WaveformPlayer";
import {
  DOCUMENTARY_PRESETS,
  DocumentaryPreset,
  PREBUILT_VOICES,
  SpeakerPreset,
  TONE_PRESETS,
  VOCAL_CUES,
} from "./data/documentaryPresets";
import {
  analyzeWavAudio,
  downloadTakeAudio,
  estimateDocumentaryDuration,
  formatTimecode,
} from "./utils/audio";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error("Failed to read microphone audio."));
    reader.readAsDataURL(blob);
  });
}

export default function App() {
  const initialPreset = DOCUMENTARY_PRESETS[0];

  const [activeTab, setActiveTab] = useState<StudioTab>("voiceover");
  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    initialPreset.id
  );
  const [mode, setMode] = useState<"solo" | "dialogue">("solo");

  // Solo state
  const [soloScript, setSoloScript] = useState<string>(initialPreset.soloScript);
  const [soloVoice, setSoloVoice] = useState<string>(
    initialPreset.recommendedVoice
  );
  const [soloStyle, setSoloStyle] = useState<string>(
    initialPreset.styleDirection
  );
  const [showCustomTone, setShowCustomTone] = useState<boolean>(false);

  // Dual-speaker documentary interview state
  const [dialogueScript, setDialogueScript] = useState<string>(
    initialPreset.dialogueScript
  );
  const [speakerOne, setSpeakerOne] = useState<SpeakerPreset>(
    initialPreset.dialogueSpeakers[0]
  );
  const [speakerTwo, setSpeakerTwo] = useState<SpeakerPreset>(
    initialPreset.dialogueSpeakers[1]
  );

  // Quick topic draft disclosure
  const [showTopicDraft, setShowTopicDraft] = useState<boolean>(false);
  const [draftTopic, setDraftTopic] = useState<string>("");
  const [isRefining, setIsRefining] = useState<boolean>(false);

  // Inline quick mic dictation inside script desk
  const [isDictating, setIsDictating] = useState<boolean>(false);
  const [isTranscribingInline, setIsTranscribingInline] =
    useState<boolean>(false);
  const [dictationSeconds, setDictationSeconds] = useState<number>(0);

  // Synthesis & take reel state
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [takes, setTakes] = useState<RecordedTake[]>([]);
  const [activeTakeId, setActiveTakeId] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [activePackId, setActivePackId] = useState<string>("creator-20");
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  const scriptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const takesRef = useRef<RecordedTake[]>([]);
  takesRef.current = takes;

  const dictationRecorderRef = useRef<MediaRecorder | null>(null);
  const dictationChunksRef = useRef<Blob[]>([]);
  const dictationStreamRef = useRef<MediaStream | null>(null);
  const dictationTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      for (const take of takesRef.current) {
        URL.revokeObjectURL(take.blobUrl);
      }
      if (dictationTimerRef.current) {
        window.clearInterval(dictationTimerRef.current);
      }
      if (dictationStreamRef.current) {
        for (const t of dictationStreamRef.current.getTracks()) t.stop();
      }
    };
  }, []);

  const currentPreset: DocumentaryPreset = useMemo(
    () =>
      DOCUMENTARY_PRESETS.find((p) => p.id === selectedPresetId) ??
      DOCUMENTARY_PRESETS[0],
    [selectedPresetId]
  );

  const activeScript = mode === "solo" ? soloScript : dialogueScript;
  const setActiveScript = mode === "solo" ? setSoloScript : setDialogueScript;

  const activeTake = useMemo(
    () => takes.find((t) => t.id === activeTakeId) ?? takes[0] ?? null,
    [takes, activeTakeId]
  );

  const usedSeconds = useMemo(
    () => takes.reduce((sum, take) => sum + (take.duration || 0), 0),
    [takes]
  );

  const activePack = useMemo(
    () =>
      AUDIO_PACK_TIERS.find((p) => p.id === activePackId) ??
      AUDIO_PACK_TIERS[1],
    [activePackId]
  );

  const scriptMetrics = useMemo(() => {
    const cleaned = activeScript
      .replace(/<[^>]+>/g, " ")
      .replace(/\|[^|]+\|/g, " ")
      .trim();
    const words = cleaned ? cleaned.split(/\s+/).filter(Boolean).length : 0;
    const estDuration = estimateDocumentaryDuration(activeScript);
    return {
      words,
      estDuration,
    };
  }, [activeScript]);

  const handleSelectPreset = (preset: DocumentaryPreset) => {
    setSelectedPresetId(preset.id);
    setSoloVoice(preset.recommendedVoice);
    setSoloStyle(preset.styleDirection);
    setSoloScript(preset.soloScript);
    setSpeakerOne(preset.dialogueSpeakers[0]);
    setSpeakerTwo(preset.dialogueSpeakers[1]);
    setDialogueScript(preset.dialogueScript);
    setErrorMessage(null);
  };

  const handleInsertCue = (cueTag: string) => {
    const textarea = scriptTextareaRef.current;
    if (!textarea) {
      setActiveScript((prev) => `${prev}${prev.endsWith(" ") ? "" : " "}${cueTag} `);
      return;
    }

    const start = textarea.selectionStart ?? activeScript.length;
    const end = textarea.selectionEnd ?? activeScript.length;
    const before = activeScript.slice(0, start);
    const after = activeScript.slice(end);
    const needsLeadingSpace = before.length > 0 && !/\s$/.test(before);
    const needsTrailingSpace = after.length > 0 && !/^\s/.test(after);
    const insertion = `${needsLeadingSpace ? " " : ""}${cueTag}${
      needsTrailingSpace ? " " : ""
    }`;

    const nextValue = `${before}${insertion}${after}`;
    setActiveScript(nextValue);

    requestAnimationFrame(() => {
      textarea.focus();
      const nextCursor = start + insertion.length;
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const handleRefineScript = async (
    action: "polish" | "add_beats" | "draft"
  ) => {
    setErrorMessage(null);
    if (action === "draft" && !draftTopic.trim()) {
      setErrorMessage("Enter a short topic or scene idea to write a draft.");
      return;
    }
    if (action !== "draft" && !activeScript.trim()) {
      setErrorMessage("Write or dictate a script first before polishing.");
      return;
    }

    setIsRefining(true);
    try {
      const res = await fetch("/api/script/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          script: activeScript,
          topic: draftTopic,
          archetype: currentPreset.title,
          mode,
          speakerOneName: speakerOne.name,
          speakerTwoName: speakerTwo.name,
        }),
      });

      const data = (await res.json()) as { script?: string; error?: string };
      if (!res.ok || !data.script) {
        throw new Error(data.error || "Unable to update script.");
      }

      setActiveScript(data.script);
      if (action === "draft") {
        setDraftTopic("");
        setShowTopicDraft(false);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Script update failed."
      );
    } finally {
      setIsRefining(false);
    }
  };

  const toggleInlineDictation = async () => {
    setErrorMessage(null);

    if (isDictating) {
      if (dictationTimerRef.current) {
        window.clearInterval(dictationTimerRef.current);
        dictationTimerRef.current = null;
      }
      setIsDictating(false);
      if (
        dictationRecorderRef.current &&
        dictationRecorderRef.current.state !== "inactive"
      ) {
        dictationRecorderRef.current.stop();
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      dictationStreamRef.current = stream;

      const preferredTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg",
      ];
      const supportedMime =
        preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) || "";

      const recorder = supportedMime
        ? new MediaRecorder(stream, { mimeType: supportedMime })
        : new MediaRecorder(stream);

      dictationChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) dictationChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const finalMime = recorder.mimeType || "audio/webm";
        const audioBlob = new Blob(dictationChunksRef.current, {
          type: finalMime,
        });
        for (const t of stream.getTracks()) t.stop();
        dictationStreamRef.current = null;

        if (audioBlob.size === 0) return;

        setIsTranscribingInline(true);
        try {
          const base64 = await blobToBase64(audioBlob);
          const res = await fetch("/api/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              audioBase64: base64,
              mimeType: finalMime,
              formatAsDocumentary: true,
            }),
          });
          const data = (await res.json()) as {
            transcript?: string;
            error?: string;
          };
          if (!res.ok || !data.transcript) {
            throw new Error(data.error || "Could not transcribe microphone audio.");
          }
          setActiveScript((prev) =>
            prev.trim() ? `${prev.trim()} ${data.transcript}` : data.transcript!
          );
        } catch (err) {
          setErrorMessage(
            err instanceof Error ? err.message : "Microphone transcription failed."
          );
        } finally {
          setIsTranscribingInline(false);
        }
      };

      dictationRecorderRef.current = recorder;
      recorder.start();
      setIsDictating(true);
      setDictationSeconds(0);
      dictationTimerRef.current = window.setInterval(() => {
        setDictationSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Microphone access is required to dictate your script."
      );
    }
  };

  const handleRenderVoiceover = async () => {
    setErrorMessage(null);
    const trimmed = activeScript.trim();
    if (!trimmed) {
      setErrorMessage("Enter or dictate a script before creating a voiceover.");
      return;
    }

    setIsRendering(true);
    try {
      const payload =
        mode === "solo"
          ? {
              mode: "solo",
              script: trimmed,
              voiceName: soloVoice,
              styleDirection: soloStyle,
            }
          : {
              mode: "dialogue",
              script: trimmed,
              speakerOne,
              speakerTwo,
            };

      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as {
        audioBase64?: string;
        mimeType?: string;
        error?: string;
      };

      if (!res.ok || !data.audioBase64) {
        throw new Error(data.error || "Voice generation failed.");
      }

      const analyzed = await analyzeWavAudio(data.audioBase64, 96);
      const nextTakeNumber =
        takes.length > 0 ? Math.max(...takes.map((t) => t.takeNumber)) + 1 : 1;

      const now = new Date();
      const timeLabel = now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      const voiceObj = PREBUILT_VOICES.find((v) => v.id === soloVoice);
      const newTake: RecordedTake = {
        id: `take-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        takeNumber: nextTakeNumber,
        title: currentPreset.title,
        mode,
        voiceSummary:
          mode === "solo"
            ? `${voiceObj?.friendlyLabel ?? soloVoice} (${soloVoice})`
            : `${speakerOne.name} + ${speakerTwo.name}`,
        createdAt: timeLabel,
        blobUrl: analyzed.blobUrl,
        peaks: analyzed.peaks,
        duration: analyzed.duration,
        sampleRate: analyzed.sampleRate,
        scriptPreview: trimmed.slice(0, 96) + (trimmed.length > 96 ? "…" : ""),
      };

      setTakes((prev) => [newTake, ...prev]);
      setActiveTakeId(newTake.id);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to create voiceover."
      );
    } finally {
      setIsRendering(false);
    }
  };

  const handleDeleteTake = (id: string) => {
    setTakes((prev) => {
      const target = prev.find((t) => t.id === id);
      if (target) {
        URL.revokeObjectURL(target.blobUrl);
      }
      const remaining = prev.filter((t) => t.id !== id);
      if (activeTakeId === id) {
        setActiveTakeId(remaining[0]?.id ?? null);
      }
      return remaining;
    });
  };

  const handleDownloadTake = async (
    take: RecordedTake,
    format: "wav" | "mp3"
  ) => {
    const key = `${take.id}-${format}`;
    setDownloadingKey(key);
    setErrorMessage(null);
    try {
      await downloadTakeAudio(
        take.blobUrl,
        take.takeNumber,
        take.title,
        format
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : `Failed to export ${format.toUpperCase()} audio file.`
      );
    } finally {
      setDownloadingKey(null);
    }
  };

  const handleSendTranscriptToScript = (
    text: string,
    insertMode: "replace" | "append"
  ) => {
    const clean = text.trim();
    if (!clean) return;
    if (insertMode === "replace") {
      setActiveScript(clean);
    } else {
      setActiveScript((prev) =>
        prev.trim() ? `${prev.trim()}\n\n${clean}` : clean
      );
    }
    setActiveTab("voiceover");
  };

  const imageFailed = Boolean(failedImages[currentPreset.image]);

  return (
    <div id="top" className="min-h-screen bg-[#0B0B0D] text-[#F3F1EC]">
      <HeaderBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onRender={() => void handleRenderVoiceover()}
        isRendering={isRendering}
        canRender={activeScript.trim().length > 0}
      />

      <main className="mx-auto max-w-[1360px] px-6 py-8 space-y-8">
        {/* Compact Studio Header + Scene Reference */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-8 flex flex-col justify-between gap-5">
            <div>
              <h1 className="font-display text-3xl sm:text-4xl font-medium tracking-tight text-[#F3F1EC] leading-[1.15] text-balance max-w-2xl">
                Create documentary voiceovers in three simple steps.
              </h1>
              <p className="mt-2.5 text-[15px] text-[#9A9893] leading-relaxed max-w-2xl">
                Pick a documentary style, type or speak your script, and listen
                instantly—or brainstorm aloud in Live Voice and add background
                music.
              </p>
            </div>

            {/* Primary Workspace Tool Switcher */}
            <div
              className="flex flex-wrap items-center gap-2"
              role="tablist"
              aria-label="Studio workspace"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "voiceover"}
                onClick={() => setActiveTab("voiceover")}
                className={`min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === "voiceover"
                    ? "bg-[#F3F1EC] text-[#0B0B0D]"
                    : "border border-[#232329] bg-[#131316] text-[#C8C5BE] hover:border-[#3A3A44] hover:text-[#F3F1EC]"
                }`}
              >
                <PenLine className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Voiceover Studio</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "chat"}
                onClick={() => setActiveTab("chat")}
                className={`min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === "chat"
                    ? "bg-[#F3F1EC] text-[#0B0B0D]"
                    : "border border-[#232329] bg-[#131316] text-[#C8C5BE] hover:border-[#3A3A44] hover:text-[#F3F1EC]"
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Script Chat</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "live"}
                onClick={() => setActiveTab("live")}
                className={`min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === "live"
                    ? "bg-[#F3F1EC] text-[#0B0B0D]"
                    : "border border-[#232329] bg-[#131316] text-[#C8C5BE] hover:border-[#3A3A44] hover:text-[#F3F1EC]"
                }`}
              >
                <PhoneCall className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Live Voice</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "transcribe"}
                onClick={() => setActiveTab("transcribe")}
                className={`min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === "transcribe"
                    ? "bg-[#F3F1EC] text-[#0B0B0D]"
                    : "border border-[#232329] bg-[#131316] text-[#C8C5BE] hover:border-[#3A3A44] hover:text-[#F3F1EC]"
                }`}
              >
                <Mic className="w-3.5 h-3.5" aria-hidden="true" />
                <span>3. Transcribe Audio</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "music"}
                onClick={() => setActiveTab("music")}
                className={`min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === "music"
                    ? "bg-[#F3F1EC] text-[#0B0B0D]"
                    : "border border-[#232329] bg-[#131316] text-[#C8C5BE] hover:border-[#3A3A44] hover:text-[#F3F1EC]"
                }`}
              >
                <Music className="w-3.5 h-3.5" aria-hidden="true" />
                <span>4. Background Music</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "pricing"}
                onClick={() => setActiveTab("pricing")}
                className={`min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === "pricing"
                    ? "bg-[#F3F1EC] text-[#0B0B0D]"
                    : "border border-[#232329] bg-[#131316] text-[#C8C5BE] hover:border-[#3A3A44] hover:text-[#F3F1EC]"
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Pricing · $2 / 20m</span>
              </button>
            </div>
          </div>

          {/* Scene Reference Plate */}
          <div className="lg:col-span-4">
            <figure className="relative h-full min-h-[175px] overflow-hidden rounded-lg border border-[#232329] bg-[#131316]">
              {!imageFailed ? (
                <img
                  src={currentPreset.image}
                  alt={`${currentPreset.title} visual reference: ${currentPreset.subtitle}`}
                  referrerPolicy="no-referrer"
                  onError={() =>
                    setFailedImages((prev) => ({
                      ...prev,
                      [currentPreset.image]: true,
                    }))
                  }
                  className="h-full w-full object-cover lg:h-full"
                />
              ) : (
                <div className="h-full min-h-[175px] w-full bg-gradient-to-br from-[#19191E] via-[#131316] to-[#0E0E11] flex flex-col items-center justify-center p-6 text-center">
                  <Film className="w-7 h-7 text-[#6E6C67] mb-2" aria-hidden="true" />
                  <span className="font-display text-sm text-[#C8C5BE]">
                    {currentPreset.title}
                  </span>
                </div>
              )}
              <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-4 py-3">
                <p className="text-xs font-medium text-[#F3F1EC]">
                  {currentPreset.title} · {currentPreset.subtitle}
                </p>
              </figcaption>
            </figure>
          </div>
        </section>

        {/* Global Error Banner */}
        {errorMessage && (
          <div
            role="alert"
            className="flex items-start justify-between gap-4 rounded-lg border border-[#7F2323] bg-[#241112] px-4 py-3 text-sm text-[#FAD2D2]"
          >
            <div className="flex items-start gap-3">
              <AlertCircle
                className="w-4 h-4 text-[#F87171] shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-xs font-medium text-[#FAD2D2] hover:text-white underline underline-offset-4 shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* TAB 1: VOICEOVER STUDIO */}
        {activeTab === "voiceover" && (
          <div className="space-y-6">
            {/* Step 1: Documentary Style Presets */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-[#9A9893] mr-2">
                Step 1 · Pick Style:
              </span>
              {DOCUMENTARY_PRESETS.map((preset) => {
                const isActive = preset.id === selectedPresetId;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`min-h-[38px] px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isActive
                        ? "border border-[#D49635] bg-[#1C1A16] text-[#F3F1EC]"
                        : "border border-[#232329] bg-[#131316] text-[#C8C5BE] hover:border-[#3A3A44] hover:text-[#F3F1EC]"
                    }`}
                  >
                    {preset.title}
                  </button>
                );
              })}
            </div>

            <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Step 2: Script Editor with Inline Mic Dictation */}
              <div className="lg:col-span-7 border border-[#232329] bg-[#131316] rounded-lg p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-[#F3F1EC]">
                      Step 2 · Write or Speak Your Script
                    </h2>
                  </div>

                  {/* Single vs 2-Speaker Toggle */}
                  <div
                    className="flex items-center rounded-md border border-[#232329] bg-[#0B0B0D] p-1"
                    role="tablist"
                    aria-label="Narration format"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === "solo"}
                      onClick={() => setMode("solo")}
                      className={`min-h-[32px] px-3 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        mode === "solo"
                          ? "bg-[#23232B] text-[#F3F1EC]"
                          : "text-[#9A9893] hover:text-[#F3F1EC]"
                      }`}
                    >
                      Single Narrator
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === "dialogue"}
                      onClick={() => setMode("dialogue")}
                      className={`min-h-[32px] px-3 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        mode === "dialogue"
                          ? "bg-[#23232B] text-[#F3F1EC]"
                          : "text-[#9A9893] hover:text-[#F3F1EC]"
                      }`}
                    >
                      2-Speaker Interview
                    </button>
                  </div>
                </div>

                {/* Quick Action Bar: Speak with Mic + Polish */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 pb-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={isTranscribingInline}
                      onClick={() => void toggleInlineDictation()}
                      className={`min-h-[38px] inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        isDictating
                          ? "bg-[#7F2323] text-[#FAD2D2] hover:bg-[#992B2B]"
                          : "border border-[#34343D] bg-[#18181D] text-[#F3F1EC] hover:border-[#D49635]"
                      }`}
                    >
                      {isDictating ? (
                        <>
                          <Square className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                          <span>Stop Mic ({dictationSeconds}s)</span>
                        </>
                      ) : (
                        <>
                          <Mic className="w-3.5 h-3.5 text-[#D49635]" aria-hidden="true" />
                          <span>
                            {isTranscribingInline
                              ? "Transcribing..."
                              : "Speak Script (Mic)"}
                          </span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={isRefining || !activeScript.trim()}
                      onClick={() => void handleRefineScript("polish")}
                      className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md border border-[#26262E] bg-[#0B0B0D] text-xs font-medium text-[#C8C5BE] hover:border-[#3D3D47] hover:text-[#F3F1EC] disabled:opacity-45 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[#D49635]" aria-hidden="true" />
                      <span>{isRefining ? "Polishing..." : "Polish Writing"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowTopicDraft((v) => !v)}
                      className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-[#9A9893] hover:text-[#F3F1EC] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Wand2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Write from Topic</span>
                    </button>
                  </div>

                  <span className="font-mono-tabular text-xs text-[#9A9893]">
                    {scriptMetrics.words} words · ~{scriptMetrics.estDuration}
                  </span>
                </div>

                {/* Collapsible Quick Topic Drafter */}
                {showTopicDraft && (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 rounded-md border border-[#26262E] bg-[#0B0B0D] p-2.5">
                    <label htmlFor="quick-topic-input" className="sr-only">
                      Topic to draft script from
                    </label>
                    <input
                      id="quick-topic-input"
                      type="text"
                      value={draftTopic}
                      onChange={(e) => setDraftTopic(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleRefineScript("draft");
                        }
                      }}
                      placeholder="Enter a topic (e.g., an abandoned lighthouse in winter, 1924)..."
                      className="flex-1 min-h-[36px] bg-transparent px-2 text-sm text-[#F3F1EC] placeholder:text-[#5E5C58] focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={isRefining}
                      onClick={() => void handleRefineScript("draft")}
                      className="min-h-[36px] px-4 py-1.5 rounded bg-[#F3F1EC] text-[#0B0B0D] text-xs font-semibold hover:bg-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {isRefining ? "Writing..." : "Generate Draft"}
                    </button>
                  </div>
                )}

                {mode === "dialogue" && (
                  <p className="text-xs text-[#9A9893]">
                    Start each line with{" "}
                    <span className="font-mono-tabular text-[#F3F1EC]">
                      {speakerOne.name}:
                    </span>{" "}
                    or{" "}
                    <span className="font-mono-tabular text-[#F3F1EC]">
                      {speakerTwo.name}:
                    </span>
                  </p>
                )}

                <div>
                  <label htmlFor="narration-script-input" className="sr-only">
                    Documentary narration script
                  </label>
                  <textarea
                    id="narration-script-input"
                    ref={scriptTextareaRef}
                    value={activeScript}
                    onChange={(e) => setActiveScript(e.target.value)}
                    rows={8}
                    placeholder="Type or click 'Speak Script (Mic)' to record your narration..."
                    className="w-full rounded-md border border-[#26262E] bg-[#0B0B0D] px-4 py-3.5 text-[15px] leading-relaxed text-[#F3F1EC] placeholder:text-[#5E5C58] focus:border-[#D49635] focus:outline-none focus:ring-1 focus:ring-[#D49635] resize-y"
                  />
                </div>

                {/* Friendly Pause / Expression Cue Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {VOCAL_CUES.filter(
                      (cue) => !cue.dialogueOnly || mode === "dialogue"
                    ).map((cue) => (
                      <button
                        key={cue.tag}
                        type="button"
                        title={cue.hint}
                        onClick={() => handleInsertCue(cue.tag)}
                        className="min-h-[34px] px-2.5 py-1 rounded border border-[#26262E] bg-[#0E0E11] text-xs text-[#C8C5BE] hover:border-[#D49635] hover:text-[#F3F1EC] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {cue.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setActiveScript(
                        mode === "solo"
                          ? currentPreset.soloScript
                          : currentPreset.dialogueScript
                      )
                    }
                    className="text-xs text-[#9A9893] hover:text-[#F3F1EC] underline underline-offset-4 cursor-pointer"
                  >
                    Load Sample Script
                  </button>
                </div>
              </div>

              {/* Step 3: Simple Voice Picker + Master Player */}
              <div className="lg:col-span-5 space-y-6">
                <div className="border border-[#232329] bg-[#131316] rounded-lg p-6 space-y-5">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-[#D49635]" aria-hidden="true" />
                    <h2 className="text-base font-semibold text-[#F3F1EC]">
                      Step 3 · Choose Voice &amp; Listen
                    </h2>
                  </div>

                  {mode === "solo" ? (
                    <div className="space-y-4">
                      <div>
                        <span className="block text-xs font-medium text-[#9A9893] mb-2">
                          Narrator Voice
                        </span>
                        <div className="divide-y divide-[#232329] border border-[#232329] rounded-md bg-[#0B0B0D]">
                          {PREBUILT_VOICES.map((voice) => {
                            const isSelected = soloVoice === voice.id;
                            return (
                              <button
                                key={voice.id}
                                type="button"
                                onClick={() => setSoloVoice(voice.id)}
                                className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                                  isSelected
                                    ? "bg-[#1C1A16] text-[#F3F1EC]"
                                    : "hover:bg-[#141418] text-[#C8C5BE]"
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 text-sm font-medium">
                                    <span
                                      className={
                                        isSelected
                                          ? "text-[#D49635]"
                                          : "text-[#F3F1EC]"
                                      }
                                    >
                                      {voice.friendlyLabel}
                                    </span>
                                    <span className="text-xs text-[#7D7B76]">
                                      · {voice.register}
                                    </span>
                                  </div>
                                  <p className="text-xs text-[#7D7B76] truncate">
                                    {voice.character}
                                  </p>
                                </div>
                                <span
                                  className={`text-xs font-medium shrink-0 ${
                                    isSelected
                                      ? "text-[#D49635]"
                                      : "text-transparent"
                                  }`}
                                >
                                  Active
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Simple 1-Click Tone Style */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-[#9A9893]">
                            Delivery Tone
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowCustomTone((v) => !v)}
                            className="inline-flex items-center gap-1 text-xs text-[#9A9893] hover:text-[#F3F1EC] cursor-pointer"
                          >
                            <span>Customize</span>
                            {showCustomTone ? (
                              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          {TONE_PRESETS.map((tone) => {
                            const active = soloStyle === tone.direction;
                            return (
                              <button
                                key={tone.id}
                                type="button"
                                onClick={() => setSoloStyle(tone.direction)}
                                className={`min-h-[36px] px-3 py-1.5 rounded-md text-xs font-medium border text-left transition-colors cursor-pointer ${
                                  active
                                    ? "border-[#D49635] bg-[#1C1A16] text-[#F3F1EC]"
                                    : "border-[#26262E] bg-[#0B0B0D] text-[#C8C5BE] hover:border-[#3A3A44]"
                                }`}
                              >
                                {tone.label}
                              </button>
                            );
                          })}
                        </div>

                        {showCustomTone && (
                          <textarea
                            value={soloStyle}
                            onChange={(e) => setSoloStyle(e.target.value)}
                            rows={2}
                            aria-label="Custom tone instructions"
                            placeholder="Describe custom pacing or mood..."
                            className="mt-2.5 w-full rounded-md border border-[#26262E] bg-[#0B0B0D] px-3 py-2 text-xs leading-relaxed text-[#F3F1EC] focus:border-[#D49635] focus:outline-none"
                          />
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Speaker 1 */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label
                            htmlFor="s1-name"
                            className="block text-xs font-medium text-[#9A9893] mb-1"
                          >
                            Speaker 1 Name
                          </label>
                          <input
                            id="s1-name"
                            type="text"
                            value={speakerOne.name}
                            onChange={(e) =>
                              setSpeakerOne((p) => ({
                                ...p,
                                name: e.target.value,
                              }))
                            }
                            className="w-full min-h-[38px] rounded-md border border-[#26262E] bg-[#0B0B0D] px-3 py-1.5 text-sm text-[#F3F1EC] focus:border-[#D49635] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="s1-voice"
                            className="block text-xs font-medium text-[#9A9893] mb-1"
                          >
                            Voice
                          </label>
                          <select
                            id="s1-voice"
                            value={speakerOne.voiceName}
                            onChange={(e) =>
                              setSpeakerOne((p) => ({
                                ...p,
                                voiceName: e.target.value,
                              }))
                            }
                            className="w-full min-h-[38px] rounded-md border border-[#26262E] bg-[#0B0B0D] px-3 py-1.5 text-sm text-[#F3F1EC] focus:border-[#D49635] focus:outline-none"
                          >
                            {PREBUILT_VOICES.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.friendlyLabel}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Speaker 2 */}
                      <div className="pt-4 border-t border-[#232329] grid grid-cols-2 gap-3">
                        <div>
                          <label
                            htmlFor="s2-name"
                            className="block text-xs font-medium text-[#9A9893] mb-1"
                          >
                            Speaker 2 Name
                          </label>
                          <input
                            id="s2-name"
                            type="text"
                            value={speakerTwo.name}
                            onChange={(e) =>
                              setSpeakerTwo((p) => ({
                                ...p,
                                name: e.target.value,
                              }))
                            }
                            className="w-full min-h-[38px] rounded-md border border-[#26262E] bg-[#0B0B0D] px-3 py-1.5 text-sm text-[#F3F1EC] focus:border-[#D49635] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="s2-voice"
                            className="block text-xs font-medium text-[#9A9893] mb-1"
                          >
                            Voice
                          </label>
                          <select
                            id="s2-voice"
                            value={speakerTwo.voiceName}
                            onChange={(e) =>
                              setSpeakerTwo((p) => ({
                                ...p,
                                voiceName: e.target.value,
                              }))
                            }
                            className="w-full min-h-[38px] rounded-md border border-[#26262E] bg-[#0B0B0D] px-3 py-1.5 text-sm text-[#F3F1EC] focus:border-[#D49635] focus:outline-none"
                          >
                            {PREBUILT_VOICES.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.friendlyLabel}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={isRendering || activeScript.trim().length === 0}
                    onClick={() => void handleRenderVoiceover()}
                    className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md bg-[#D49635] text-[#0B0B0D] text-sm font-semibold hover:bg-[#E0A648] disabled:opacity-45 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    <Mic className="w-4 h-4" aria-hidden="true" />
                    <span>
                      {isRendering
                        ? "Creating Documentary Voiceover..."
                        : "Create Voiceover"}
                    </span>
                  </button>
                </div>

                {/* Audio Player & Take Reel */}
                <WaveformPlayer
                  activeTake={activeTake}
                  isRendering={isRendering}
                  onQuickRender={() => void handleRenderVoiceover()}
                />

                {takes.length > 0 && (
                  <div className="border border-[#232329] bg-[#131316] rounded-lg divide-y divide-[#232329]">
                    <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-semibold text-[#F3F1EC]">
                          Saved Takes
                        </h3>
                        <span className="font-mono-tabular text-xs text-[#9A9893]">
                          · {takes.length} {takes.length === 1 ? "take" : "takes"}
                        </span>
                      </div>

                      {activeTake && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-[#9A9893] mr-1">
                            Selected Take{" "}
                            {String(activeTake.takeNumber).padStart(2, "0")}:
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              void handleDownloadTake(activeTake, "wav")
                            }
                            className="min-h-[32px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#34343D] bg-[#18181D] text-xs font-medium text-[#F3F1EC] hover:border-[#D49635] hover:text-[#D49635] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <Download className="w-3 h-3" aria-hidden="true" />
                            <span>.WAV</span>
                          </button>
                          <button
                            type="button"
                            disabled={
                              downloadingKey === `${activeTake.id}-mp3`
                            }
                            onClick={() =>
                              void handleDownloadTake(activeTake, "mp3")
                            }
                            className="min-h-[32px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#34343D] bg-[#18181D] text-xs font-medium text-[#F3F1EC] hover:border-[#D49635] hover:text-[#D49635] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <Download className="w-3 h-3" aria-hidden="true" />
                            <span>
                              {downloadingKey === `${activeTake.id}-mp3`
                                ? "Encoding..."
                                : ".MP3"}
                            </span>
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="max-h-56 overflow-y-auto divide-y divide-[#232329]">
                      {takes.map((take) => {
                        const isCurrent = activeTake?.id === take.id;
                        return (
                          <div
                            key={take.id}
                            className={`px-4 py-3 flex items-center justify-between gap-2 transition-colors ${
                              isCurrent ? "bg-[#1B1915]" : "hover:bg-[#17171B]"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setActiveTakeId(take.id)}
                              className="flex-1 min-w-0 text-left cursor-pointer"
                            >
                              <div className="flex items-center gap-2 text-xs font-medium">
                                <span
                                  className={`font-mono-tabular ${
                                    isCurrent
                                      ? "text-[#D49635]"
                                      : "text-[#F3F1EC]"
                                  }`}
                                >
                                  Take {String(take.takeNumber).padStart(2, "0")}
                                </span>
                                <span className="text-[#5E5C58]">·</span>
                                <span className="text-[#F3F1EC] truncate">
                                  {take.title}
                                </span>
                              </div>
                              <p className="mt-0.5 text-xs text-[#9A9893] truncate">
                                {take.voiceSummary} ·{" "}
                                <span className="font-mono-tabular">
                                  {formatTimecode(take.duration)}
                                </span>{" "}
                                · {take.createdAt}
                              </p>
                            </button>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  void handleDownloadTake(take, "wav")
                                }
                                aria-label={`Download Take ${take.takeNumber} as WAV`}
                                title="Download WAV"
                                className="min-h-[34px] px-2 py-1 rounded text-[11px] font-mono-tabular text-[#C8C5BE] hover:text-[#D49635] hover:bg-[#23232B] transition-colors cursor-pointer"
                              >
                                WAV
                              </button>
                              <button
                                type="button"
                                disabled={downloadingKey === `${take.id}-mp3`}
                                onClick={() =>
                                  void handleDownloadTake(take, "mp3")
                                }
                                aria-label={`Download Take ${take.takeNumber} as MP3`}
                                title="Download MP3"
                                className="min-h-[34px] px-2 py-1 rounded text-[11px] font-mono-tabular text-[#C8C5BE] hover:text-[#D49635] hover:bg-[#23232B] disabled:opacity-50 transition-colors cursor-pointer"
                              >
                                {downloadingKey === `${take.id}-mp3`
                                  ? "..."
                                  : "MP3"}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTake(take.id)}
                                aria-label={`Delete Take ${take.takeNumber}`}
                                className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded text-[#6E6C67] hover:text-[#F87171] transition-colors shrink-0 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {/* TAB 1B: MULTI-TURN SCRIPT CHATBOT */}
        {activeTab === "chat" && (
          <ChatPanel
            archetypeTitle={currentPreset.title}
            currentScript={activeScript}
            onUseInScript={(text) =>
              handleSendTranscriptToScript(text, "replace")
            }
          />
        )}

        {/* TAB 2: LIVE VOICE CONVERSATION */}
        {activeTab === "live" && (
          <LiveConversationPanel
            archetypeTitle={currentPreset.title}
            onAddToScript={(line) =>
              handleSendTranscriptToScript(line, "append")
            }
          />
        )}

        {/* TAB 3: TRANSCRIBE AUDIO */}
        {activeTab === "transcribe" && (
          <TranscribePanel onSendToScript={handleSendTranscriptToScript} />
        )}

        {/* TAB 4: BACKGROUND MUSIC */}
        {activeTab === "music" && (
          <MusicScorePanel
            key={currentPreset.id}
            archetypeTitle={currentPreset.title}
            defaultMoodPrompt={currentPreset.musicMood}
            sceneImagePath={currentPreset.image}
            latestVoiceTake={activeTake}
          />
        )}

        {/* TAB 5: PRICING ($2 FOR 20 MINUTES) */}
        {activeTab === "pricing" && (
          <PricingPanel
            activePackId={activePackId}
            usedSeconds={usedSeconds}
            onSelectPack={(pack: AudioPackTier) => {
              setActivePackId(pack.id);
            }}
          />
        )}
      </main>

      <footer className="border-t border-[#232329] mt-12">
        <div className="mx-auto max-w-[1360px] px-6 py-6 flex flex-wrap items-center justify-between gap-4 text-xs text-[#6E6C67]">
          <span>Chronicle Booth · Documentary Voice &amp; Audio Studio</span>
          <span>
            Active Plan: {activePack.name} ({activePack.priceLabel} /{" "}
            {activePack.minutes} min)
          </span>
        </div>
      </footer>
    </div>
  );
}
