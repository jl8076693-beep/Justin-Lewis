import React, { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Copy,
  FileAudio,
  Mic,
  Square,
  Upload,
} from "lucide-react";

interface TranscribePanelProps {
  onSendToScript: (text: string, mode: "replace" | "append") => void;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error("Failed to read audio file."));
    reader.readAsDataURL(blob);
  });
}

export const TranscribePanel: React.FC<TranscribePanelProps> = ({
  onSendToScript,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [cleanForDocumentary, setCleanForDocumentary] = useState(true);
  const [transcript, setTranscript] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (streamRef.current) {
        for (const t of streamRef.current.getTracks()) t.stop();
      }
    };
  }, []);

  const runTranscription = async (blob: Blob, mimeType: string) => {
    setErrorMsg(null);
    setIsTranscribing(true);
    try {
      const base64 = await blobToBase64(blob);
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioBase64: base64,
          mimeType,
          formatAsDocumentary: cleanForDocumentary,
        }),
      });
      const data = (await res.json()) as {
        transcript?: string;
        error?: string;
      };
      if (!res.ok || !data.transcript) {
        throw new Error(data.error || "Transcription failed.");
      }
      setTranscript(data.transcript);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Could not transcribe audio."
      );
    } finally {
      setIsTranscribing(false);
    }
  };

  const startMicRecording = async () => {
    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

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

      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const finalMime = recorder.mimeType || "audio/webm";
        const audioBlob = new Blob(chunksRef.current, { type: finalMime });
        for (const t of stream.getTracks()) t.stop();
        streamRef.current = null;
        if (audioBlob.size > 0) {
          void runTranscription(audioBlob, finalMime);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Microphone permission is required to record audio."
      );
    }
  };

  const stopMicRecording = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void runTranscription(file, file.type || "audio/mp3");
    e.target.value = "";
  };

  const handleCopy = async () => {
    if (!transcript) return;
    try {
      await navigator.clipboard.writeText(transcript);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Left: Record or Upload */}
      <div className="lg:col-span-5 border border-[#232329] bg-[#131316] rounded-lg p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-[#F3F1EC]">
            Transcribe Mic or Field Audio
          </h2>
          <p className="mt-1 text-sm text-[#9A9893] leading-relaxed">
            Speak your thoughts directly or upload an interview clip, then send
            the text straight to your voiceover script.
          </p>
        </div>

        <label className="flex items-center gap-2.5 text-sm text-[#C8C5BE] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={cleanForDocumentary}
            onChange={(e) => setCleanForDocumentary(e.target.checked)}
            className="h-4 w-4 rounded border-[#34343D] bg-[#0B0B0D] accent-[#D49635]"
          />
          <span>Punctuate cleanly for voiceover reading</span>
        </label>

        <div className="space-y-3">
          {!isRecording ? (
            <button
              type="button"
              disabled={isTranscribing}
              onClick={() => void startMicRecording()}
              className="w-full min-h-[46px] inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-md bg-[#D49635] text-[#0B0B0D] text-sm font-semibold hover:bg-[#E0A648] disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Mic className="w-4 h-4" aria-hidden="true" />
              <span>
                {isTranscribing ? "Transcribing Audio..." : "Record Microphone"}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={stopMicRecording}
              className="w-full min-h-[46px] inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-md bg-[#7F2323] text-[#FAD2D2] text-sm font-semibold hover:bg-[#992B2B] transition-colors cursor-pointer"
            >
              <Square className="w-4 h-4 fill-current" aria-hidden="true" />
              <span>
                Stop &amp; Transcribe ({formatDuration(recordingSeconds)})
              </span>
            </button>
          )}

          <div className="relative flex items-center py-1">
            <div className="flex-1 border-t border-[#232329]" />
            <span className="px-3 text-xs text-[#6E6C67]">or</span>
            <div className="flex-1 border-t border-[#232329]" />
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileUpload}
            className="sr-only"
          />
          <button
            type="button"
            disabled={isRecording || isTranscribing}
            onClick={() => fileInputRef.current?.click()}
            className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md border border-[#34343D] bg-[#18181D] text-sm font-medium text-[#F3F1EC] hover:border-[#D49635] disabled:opacity-50 transition-colors cursor-pointer"
          >
            <Upload className="w-4 h-4" aria-hidden="true" />
            <span>Upload Audio File (MP3, WAV, M4A)</span>
          </button>
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
      </div>

      {/* Right: Transcript Result */}
      <div className="lg:col-span-7 border border-[#232329] bg-[#131316] rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <FileAudio className="w-4 h-4 text-[#D49635]" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-[#F3F1EC]">
              Transcript Output
            </h3>
          </div>
          {transcript && (
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#C8C5BE] hover:text-[#F3F1EC] cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#D49635]" aria-hidden="true" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Copy Text</span>
                </>
              )}
            </button>
          )}
        </div>

        <label htmlFor="transcribe-output-textarea" className="sr-only">
          Transcribed text
        </label>
        <textarea
          id="transcribe-output-textarea"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={9}
          placeholder={
            isTranscribing
              ? "Listening and transcribing audio..."
              : "Your transcribed speech will appear here. You can edit it or send it straight into the Voiceover tab."
          }
          className="w-full rounded-md border border-[#26262E] bg-[#0B0B0D] px-4 py-3.5 text-[15px] leading-relaxed text-[#F3F1EC] placeholder:text-[#5E5C58] focus:border-[#D49635] focus:outline-none"
        />

        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            disabled={!transcript.trim()}
            onClick={() => onSendToScript(transcript, "append")}
            className="min-h-[40px] px-4 py-2 rounded-md border border-[#34343D] bg-[#18181D] text-xs font-medium text-[#F3F1EC] hover:border-[#D49635] disabled:opacity-45 transition-colors cursor-pointer"
          >
            Add to Current Script
          </button>
          <button
            type="button"
            disabled={!transcript.trim()}
            onClick={() => onSendToScript(transcript, "replace")}
            className="min-h-[40px] px-4 py-2 rounded-md bg-[#F3F1EC] text-[#0B0B0D] text-xs font-semibold hover:bg-white disabled:opacity-45 transition-colors cursor-pointer"
          >
            Use as Voiceover Script
          </button>
        </div>
      </div>
    </div>
  );
};
