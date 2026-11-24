import React, { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  MessageSquarePlus,
  Mic,
  Send,
  Square,
  Trash2,
} from "lucide-react";

interface ChatMessage {
  id: string;
  role: "user" | "model";
  text: string;
  modelUsed?: string;
}

interface ChatPanelProps {
  archetypeTitle: string;
  currentScript: string;
  onUseInScript: (text: string) => void;
}

const CHAT_ROLES = [
  {
    id: "writer",
    label: "Story Writer",
    description: "Draft scenes, opening hooks, and documentary narration",
  },
  {
    id: "interviewer",
    label: "Interview Prep",
    description: "Shape witness questions and archival Q&A arcs",
  },
  {
    id: "director",
    label: "Voice Director",
    description: "Review spoken rhythm, pacing, and <breath> beats",
  },
] as const;

const STARTER_PROMPTS = [
  "Write a 50-word documentary opening hook for this scene",
  "Suggest 3 poignant interview questions for a field witness",
  "Review my current script and tighten its spoken rhythm",
];

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error("Failed to read recorded audio."));
    reader.readAsDataURL(blob);
  });
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  archetypeTitle,
  currentScript,
  onUseInScript,
}) => {
  const [rolePreset, setRolePreset] = useState<
    "writer" | "interviewer" | "director"
  >("writer");
  const [speedMode, setSpeedMode] = useState<"balanced" | "fast">("balanced");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Inline mic dictation for chat using gemini-3.5-transcribe
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);

  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (streamRef.current) {
        for (const t of streamRef.current.getTracks()) t.stop();
      }
    };
  }, []);

  const sendMessage = async (overrideText?: string) => {
    const textToSend = (overrideText ?? input).trim();
    if (!textToSend || isSending) return;

    setErrorMsg(null);
    if (!overrideText) setInput("");

    // Include current script context automatically if user asks to review it
    const payloadMessage =
      textToSend.toLowerCase().includes("current script") &&
      currentScript.trim()
        ? `${textToSend}\n\nCurrent script:\n${currentScript.trim()}`
        : textToSend;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text: textToSend,
    };

    const nextHistory = [...messages];
    setMessages((prev) => [...prev, userMsg]);
    setIsSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: payloadMessage,
          history: nextHistory.map((m) => ({ role: m.role, text: m.text })),
          rolePreset,
          speedMode,
          archetype: archetypeTitle,
        }),
      });

      const data = (await res.json()) as {
        reply?: string;
        model?: string;
        error?: string;
      };

      if (!res.ok || !data.reply) {
        throw new Error(data.error || "Chat request failed.");
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}`,
          role: "model",
          text: data.reply!,
          modelUsed: data.model,
        },
      ]);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Could not send message."
      );
    } finally {
      setIsSending(false);
    }
  };

  const toggleMicInput = async () => {
    setErrorMsg(null);
    if (isRecording) {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsRecording(false);
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const preferred = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg",
      ];
      const mimeType =
        preferred.find((t) => MediaRecorder.isTypeSupported(t)) || "";
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const finalMime = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: finalMime });
        for (const t of stream.getTracks()) t.stop();
        streamRef.current = null;
        if (blob.size === 0) return;

        setIsTranscribing(true);
        try {
          const base64 = await blobToBase64(blob);
          const res = await fetch("/api/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              audioBase64: base64,
              mimeType: finalMime,
              formatAsDocumentary: false,
            }),
          });
          const data = (await res.json()) as {
            transcript?: string;
            error?: string;
          };
          if (!res.ok || !data.transcript) {
            throw new Error(data.error || "Transcription failed.");
          }
          setInput((prev) =>
            prev.trim() ? `${prev.trim()} ${data.transcript}` : data.transcript!
          );
        } catch (err) {
          setErrorMsg(
            err instanceof Error
              ? err.message
              : "Could not transcribe microphone audio."
          );
        } finally {
          setIsTranscribing(false);
        }
      };

      recorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecSeconds(0);
      timerRef.current = window.setInterval(() => {
        setRecSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Microphone access is required for voice input."
      );
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Left: Role & Speed Selector */}
      <div className="lg:col-span-4 border border-[#232329] bg-[#131316] rounded-lg p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-[#F3F1EC]">
            Documentary Script Chat
          </h2>
          <p className="mt-1 text-sm text-[#9A9893] leading-relaxed">
            Multi-turn assistant for your {archetypeTitle} project. Type or
            speak with your microphone to iterate on narration.
          </p>
        </div>

        <div className="space-y-2">
          <span className="block text-xs font-medium text-[#9A9893]">
            Assistant Role
          </span>
          <div className="divide-y divide-[#232329] border border-[#232329] rounded-md bg-[#0B0B0D]">
            {CHAT_ROLES.map((r) => {
              const selected = rolePreset === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRolePreset(r.id)}
                  className={`w-full text-left px-3.5 py-3 transition-colors cursor-pointer ${
                    selected ? "bg-[#1C1A16]" : "hover:bg-[#141418]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-sm font-medium ${
                        selected ? "text-[#D49635]" : "text-[#F3F1EC]"
                      }`}
                    >
                      {r.label}
                    </span>
                    {selected && (
                      <span className="text-xs font-medium text-[#D49635]">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-[#7D7B76]">
                    {r.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className="block text-xs font-medium text-[#9A9893] mb-2">
            Response Mode
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSpeedMode("balanced")}
              className={`min-h-[38px] px-3 py-1.5 rounded-md border text-xs font-medium transition-colors cursor-pointer ${
                speedMode === "balanced"
                  ? "border-[#D49635] bg-[#1C1A16] text-[#F3F1EC]"
                  : "border-[#26262E] bg-[#0B0B0D] text-[#9A9893] hover:text-[#F3F1EC]"
              }`}
            >
              Balanced Writer
            </button>
            <button
              type="button"
              onClick={() => setSpeedMode("fast")}
              className={`min-h-[38px] px-3 py-1.5 rounded-md border text-xs font-medium transition-colors cursor-pointer ${
                speedMode === "fast"
                  ? "border-[#D49635] bg-[#1C1A16] text-[#F3F1EC]"
                  : "border-[#26262E] bg-[#0B0B0D] text-[#9A9893] hover:text-[#F3F1EC]"
              }`}
            >
              Fast Drafts
            </button>
          </div>
        </div>
      </div>

      {/* Right: Scrollable Thread & Composer */}
      <div className="lg:col-span-8 border border-[#232329] bg-[#131316] rounded-lg p-6 flex flex-col min-h-[480px]">
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-[#232329]">
          <div>
            <h3 className="text-sm font-semibold text-[#F3F1EC]">
              Conversation History
            </h3>
            <p className="text-xs text-[#9A9893] mt-0.5">
              {messages.length === 0
                ? "Start a conversation or click a prompt below"
                : `${messages.length} ${
                    messages.length === 1 ? "message" : "messages"
                  } in thread`}
            </p>
          </div>

          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setMessages([]);
                setErrorMsg(null);
              }}
              className="inline-flex items-center gap-1.5 text-xs text-[#9A9893] hover:text-[#F87171] transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Clear Thread</span>
            </button>
          )}
        </div>

        {/* Scrollable Message Thread */}
        <div className="flex-1 py-4 space-y-4 overflow-y-auto max-h-[380px] pr-1">
          {messages.length === 0 ? (
            <div className="py-10 space-y-4">
              <p className="text-sm text-[#C8C5BE] text-center">
                Try one of these prompts, or speak with the mic button below:
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void sendMessage(prompt)}
                    className="min-h-[38px] px-3.5 py-2 rounded-md border border-[#26262E] bg-[#0B0B0D] text-xs text-[#C8C5BE] hover:border-[#D49635] hover:text-[#F3F1EC] transition-colors cursor-pointer text-left"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded-md border px-4 py-3 ${
                  msg.role === "model"
                    ? "border-[#2B2820] bg-[#171510]"
                    : "border-[#232329] bg-[#0B0B0D]"
                }`}
              >
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <span
                    className={`text-xs font-semibold ${
                      msg.role === "model"
                        ? "text-[#D49635]"
                        : "text-[#C8C5BE]"
                    }`}
                  >
                    {msg.role === "model" ? "Script Assistant" : "You"}
                  </span>

                  {msg.role === "model" && (
                    <button
                      type="button"
                      onClick={() => {
                        onUseInScript(msg.text);
                        setCopiedId(msg.id);
                        setTimeout(() => setCopiedId(null), 1800);
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[#D49635] hover:text-[#E5B05A] cursor-pointer"
                    >
                      <MessageSquarePlus
                        className="w-3.5 h-3.5"
                        aria-hidden="true"
                      />
                      <span>
                        {copiedId === msg.id
                          ? "Sent to Voiceover"
                          : "Use as Voiceover Script"}
                      </span>
                    </button>
                  )}
                </div>

                <p className="text-sm text-[#F3F1EC] leading-relaxed whitespace-pre-wrap">
                  {msg.text}
                </p>
              </div>
            ))
          )}

          {isSending && (
            <div className="rounded-md border border-[#2B2820] bg-[#171510] px-4 py-3 text-xs text-[#9A9893]">
              Drafting response...
            </div>
          )}
          <div ref={threadEndRef} />
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="mb-3 flex items-start gap-2.5 rounded-md border border-[#7F2323] bg-[#241112] px-3.5 py-2.5 text-xs text-[#FAD2D2]"
          >
            <AlertCircle
              className="w-4 h-4 text-[#F87171] shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Composer with Mic Input */}
        <div className="pt-4 border-t border-[#232329] flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <button
            type="button"
            disabled={isTranscribing || isSending}
            onClick={() => void toggleMicInput()}
            title="Dictate message with microphone"
            className={`min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              isRecording
                ? "bg-[#7F2323] text-[#FAD2D2] hover:bg-[#992B2B]"
                : "border border-[#34343D] bg-[#18181D] text-[#F3F1EC] hover:border-[#D49635]"
            }`}
          >
            {isRecording ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                <span>Stop ({recSeconds}s)</span>
              </>
            ) : (
              <>
                <Mic className="w-3.5 h-3.5 text-[#D49635]" aria-hidden="true" />
                <span>{isTranscribing ? "Transcribing..." : "Mic"}</span>
              </>
            )}
          </button>

          <label htmlFor="chat-composer-input" className="sr-only">
            Message to documentary script assistant
          </label>
          <input
            id="chat-composer-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void sendMessage();
              }
            }}
            placeholder="Ask for a documentary scene, interview questions, or pacing advice..."
            className="flex-1 min-h-[42px] rounded-md border border-[#26262E] bg-[#0B0B0D] px-3.5 py-2 text-sm text-[#F3F1EC] placeholder:text-[#5E5C58] focus:border-[#D49635] focus:outline-none"
          />

          <button
            type="button"
            disabled={isSending || !input.trim()}
            onClick={() => void sendMessage()}
            className="min-h-[42px] inline-flex items-center justify-center gap-2 px-5 py-2 rounded-md bg-[#D49635] text-[#0B0B0D] text-xs font-semibold hover:bg-[#E0A648] disabled:opacity-45 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Send</span>
          </button>
        </div>
      </div>
    </div>
  );
};
