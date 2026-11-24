import React, { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  MessageSquarePlus,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Send,
} from "lucide-react";
import { PREBUILT_VOICES } from "../data/documentaryPresets";

interface LiveConversationPanelProps {
  archetypeTitle: string;
  onAddToScript: (text: string) => void;
}

interface TranscriptEntry {
  id: string;
  speaker: "You" | "Director";
  text: string;
}

const ROLES = [
  {
    id: "coach",
    label: "Story Coach",
    description: "Brainstorm hooks, pacing, and narrative structure together",
  },
  {
    id: "interview",
    label: "Interview Practice",
    description: "Rehearse documentary Q&A with a responsive witness",
  },
  {
    id: "critic",
    label: "Delivery Feedback",
    description: "Read a line aloud and get spoken pacing advice",
  },
] as const;

function float32ToBase64Pcm16(float32: Float32Array): string {
  const buffer = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(
      i * 2,
      clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff,
      true
    );
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64Pcm16ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const byteLen = binary.length;
  const bytes = new Uint8Array(byteLen);
  for (let i = 0; i < byteLen; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const sampleCount = Math.floor(byteLen / 2);
  const out = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    out[i] = view.getInt16(i * 2, true) / 32768;
  }
  return out;
}

export const LiveConversationPanel: React.FC<LiveConversationPanelProps> = ({
  archetypeTitle,
  onAddToScript,
}) => {
  const [role, setRole] = useState<string>("coach");
  const [voice, setVoice] = useState<string>("Zephyr");
  const [status, setStatus] = useState<
    "idle" | "connecting" | "connected" | "error"
  >("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [quickPrompt, setQuickPrompt] = useState("");
  const [addedNoticeId, setAddedNoticeId] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const isMutedRef = useRef<boolean>(false);

  isMutedRef.current = isMuted;

  const stopAllPlayback = () => {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {
        // Ignore already stopped nodes
      }
    }
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  };

  const cleanupSession = () => {
    stopAllPlayback();

    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {
        // Ignore
      }
      processorRef.current = null;
    }

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }

    if (inputCtxRef.current) {
      void inputCtxRef.current.close().catch(() => undefined);
      inputCtxRef.current = null;
    }

    if (outputCtxRef.current) {
      void outputCtxRef.current.close().catch(() => undefined);
      outputCtxRef.current = null;
    }

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // Ignore
      }
      wsRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      cleanupSession();
    };
  }, []);

  const appendTranscript = (speaker: "You" | "Director", chunkText: string) => {
    const clean = chunkText;
    if (!clean) return;
    setEntries((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.speaker === speaker) {
        return [
          ...prev.slice(0, -1),
          { ...last, text: `${last.text}${clean}` },
        ];
      }
      return [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          speaker,
          text: clean.trimStart(),
        },
      ];
    });
  };

  const playPcm24k = (base64Audio: string) => {
    const ctx = outputCtxRef.current;
    if (!ctx) return;

    const floatSamples = base64Pcm16ToFloat32(base64Audio);
    if (floatSamples.length === 0) return;

    const buffer = ctx.createBuffer(1, floatSamples.length, 24000);
    buffer.getChannelData(0).set(floatSamples);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime, nextStartTimeRef.current);
    source.start(startAt);
    nextStartTimeRef.current = startAt + buffer.duration;

    activeSourcesRef.current.add(source);
    source.onended = () => {
      activeSourcesRef.current.delete(source);
    };
  };

  const startConversation = async () => {
    setErrorMsg(null);
    setStatus("connecting");
    setIsMuted(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;

      const inputCtx = new AudioCtx({ sampleRate: 16000 });
      const outputCtx = new AudioCtx({ sampleRate: 24000 });
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;

      const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const params = new URLSearchParams({
        voice,
        role,
        archetype: archetypeTitle,
      });
      const ws = new WebSocket(`${wsProto}//${window.location.host}/live?${params}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("connected");

        const source = inputCtx.createMediaStreamSource(stream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        const silentGain = inputCtx.createGain();
        silentGain.gain.value = 0;

        processor.onaudioprocess = (e) => {
          if (
            isMutedRef.current ||
            !wsRef.current ||
            wsRef.current.readyState !== WebSocket.OPEN
          ) {
            return;
          }
          const base64 = float32ToBase64Pcm16(
            e.inputBuffer.getChannelData(0)
          );
          wsRef.current.send(JSON.stringify({ type: "audio", audio: base64 }));
        };

        source.connect(processor);
        processor.connect(silentGain);
        silentGain.connect(inputCtx.destination);
        processorRef.current = processor;
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            type?: string;
            data?: string;
            text?: string;
            message?: string;
          };
          if (msg.type === "audio" && msg.data) {
            playPcm24k(msg.data);
          } else if (msg.type === "inputTranscript" && msg.text) {
            appendTranscript("You", msg.text);
          } else if (msg.type === "outputTranscript" && msg.text) {
            appendTranscript("Director", msg.text);
          } else if (msg.type === "interrupted") {
            stopAllPlayback();
          } else if (msg.type === "error") {
            setErrorMsg(msg.message || "Live voice session error.");
            setStatus("error");
            cleanupSession();
          } else if (msg.type === "closed") {
            setStatus("idle");
            cleanupSession();
          }
        } catch {
          // Ignore invalid JSON
        }
      };

      ws.onerror = () => {
        setErrorMsg("Unable to open real-time voice connection.");
        setStatus("error");
        cleanupSession();
      };

      ws.onclose = () => {
        setStatus((prev) => (prev === "error" ? "error" : "idle"));
      };
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Microphone access is required for live voice conversations."
      );
      setStatus("error");
      cleanupSession();
    }
  };

  const endConversation = () => {
    cleanupSession();
    setStatus("idle");
  };

  const sendTextNote = () => {
    const trimmed = quickPrompt.trim();
    if (!trimmed || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }
    wsRef.current.send(JSON.stringify({ type: "text", text: trimmed }));
    appendTranscript("You", trimmed);
    setQuickPrompt("");
  };

  const isLive = status === "connected" || status === "connecting";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Left: Simple Setup & Start Call */}
      <div className="lg:col-span-5 border border-[#232329] bg-[#131316] rounded-lg p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-[#F3F1EC]">
            Live Voice Conversation
          </h2>
          <p className="mt-1 text-sm text-[#9A9893] leading-relaxed">
            Talk in real time to brainstorm documentary lines, rehearse delivery,
            or practice an interview.
          </p>
        </div>

        <div className="space-y-2">
          <span className="block text-xs font-medium text-[#9A9893]">
            1. Pick Conversation Mode
          </span>
          <div className="divide-y divide-[#232329] border border-[#232329] rounded-md bg-[#0B0B0D]">
            {ROLES.map((item) => {
              const selected = role === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={isLive}
                  onClick={() => setRole(item.id)}
                  className={`w-full text-left px-3.5 py-3 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                    selected ? "bg-[#1C1A16]" : "hover:bg-[#141418]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-sm font-medium ${
                        selected ? "text-[#D49635]" : "text-[#F3F1EC]"
                      }`}
                    >
                      {item.label}
                    </span>
                    {selected && (
                      <span className="text-xs font-medium text-[#D49635]">
                        Selected
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-[#7D7B76]">
                    {item.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label
            htmlFor="live-voice-select"
            className="block text-xs font-medium text-[#9A9893] mb-1.5"
          >
            2. Partner Voice
          </label>
          <select
            id="live-voice-select"
            value={voice}
            disabled={isLive}
            onChange={(e) => setVoice(e.target.value)}
            className="w-full min-h-[42px] rounded-md border border-[#26262E] bg-[#0B0B0D] px-3 py-2 text-sm text-[#F3F1EC] focus:border-[#D49635] focus:outline-none disabled:opacity-60"
          >
            {PREBUILT_VOICES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.friendlyLabel} ({v.name})
              </option>
            ))}
          </select>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-md border border-[#7F2323] bg-[#241112] px-3.5 py-2.5 text-xs text-[#FAD2D2]"
          >
            <AlertCircle className="w-4 h-4 text-[#F87171] shrink-0 mt-0.5" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="pt-1 flex flex-wrap items-center gap-3">
          {!isLive ? (
            <button
              type="button"
              onClick={() => void startConversation()}
              className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md bg-[#D49635] text-[#0B0B0D] text-sm font-semibold hover:bg-[#E0A648] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F3F1EC]"
            >
              <PhoneCall className="w-4 h-4" aria-hidden="true" />
              <span>Start Voice Chat</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setIsMuted((prev) => !prev)}
                className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md border border-[#34343D] bg-[#18181D] text-sm font-medium text-[#F3F1EC] hover:border-[#D49635] transition-colors cursor-pointer"
              >
                {isMuted ? (
                  <>
                    <MicOff className="w-4 h-4 text-[#F87171]" aria-hidden="true" />
                    <span>Unmute</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4 text-[#D49635]" aria-hidden="true" />
                    <span>Mute Mic</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={endConversation}
                className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md bg-[#7F2323] text-[#FAD2D2] text-sm font-semibold hover:bg-[#992B2B] transition-colors cursor-pointer"
              >
                <PhoneOff className="w-4 h-4" aria-hidden="true" />
                <span>End Chat</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Right: Live Conversation Transcript & Script Capture */}
      <div className="lg:col-span-7 border border-[#232329] bg-[#131316] rounded-lg p-6 flex flex-col min-h-[440px]">
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-[#232329]">
          <div>
            <h3 className="text-sm font-semibold text-[#F3F1EC]">
              Live Conversation Feed
            </h3>
            <p className="text-xs text-[#9A9893] mt-0.5">
              {status === "connected"
                ? isMuted
                  ? "Connected · Microphone muted"
                  : "Connected · Listening for your voice"
                : status === "connecting"
                ? "Opening voice session..."
                : "Press Start Voice Chat and speak naturally"}
            </p>
          </div>
          {entries.length > 0 && (
            <button
              type="button"
              onClick={() => setEntries([])}
              className="text-xs text-[#9A9893] hover:text-[#F3F1EC] underline underline-offset-4 cursor-pointer"
            >
              Clear Feed
            </button>
          )}
        </div>

        <div className="flex-1 py-4 space-y-4 overflow-y-auto max-h-[340px]">
          {entries.length === 0 ? (
            <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center px-6">
              <p className="text-sm text-[#C8C5BE] font-medium">
                Ready when you are
              </p>
              <p className="mt-1.5 text-xs text-[#7D7B76] max-w-md leading-relaxed">
                Start a voice chat to speak directly with your documentary
                partner. Any lines they suggest can be added to your Voiceover
                script in one click.
              </p>
            </div>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.id}
                className={`rounded-md border px-4 py-3 ${
                  entry.speaker === "Director"
                    ? "border-[#2B2820] bg-[#171510]"
                    : "border-[#232329] bg-[#0B0B0D]"
                }`}
              >
                <div className="flex items-center justify-between gap-3 mb-1">
                  <span
                    className={`text-xs font-semibold ${
                      entry.speaker === "Director"
                        ? "text-[#D49635]"
                        : "text-[#C8C5BE]"
                    }`}
                  >
                    {entry.speaker}
                  </span>
                  {entry.speaker === "Director" && (
                    <button
                      type="button"
                      onClick={() => {
                        onAddToScript(entry.text);
                        setAddedNoticeId(entry.id);
                        setTimeout(() => setAddedNoticeId(null), 1800);
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[#D49635] hover:text-[#E5B05A] cursor-pointer"
                    >
                      <MessageSquarePlus className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>
                        {addedNoticeId === entry.id
                          ? "Added to Script"
                          : "Use in Script"}
                      </span>
                    </button>
                  )}
                </div>
                <p className="text-sm text-[#F3F1EC] leading-relaxed">
                  {entry.text}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Optional text prompt while live */}
        <div className="pt-4 border-t border-[#232329] flex items-center gap-2.5">
          <label htmlFor="live-text-input" className="sr-only">
            Send a text note to live voice session
          </label>
          <input
            id="live-text-input"
            type="text"
            value={quickPrompt}
            disabled={status !== "connected"}
            onChange={(e) => setQuickPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                sendTextNote();
              }
            }}
            placeholder={
              status === "connected"
                ? "Or type a quick question during the call..."
                : "Start voice chat to send live messages..."
            }
            className="flex-1 min-h-[40px] rounded-md border border-[#26262E] bg-[#0B0B0D] px-3.5 py-2 text-sm text-[#F3F1EC] placeholder:text-[#5E5C58] focus:border-[#D49635] focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            disabled={status !== "connected" || !quickPrompt.trim()}
            onClick={sendTextNote}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-[#34343D] bg-[#18181D] text-xs font-medium text-[#F3F1EC] hover:border-[#D49635] disabled:opacity-45 transition-colors cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Send</span>
          </button>
        </div>
      </div>
    </div>
  );
};
