import { Mp3Encoder } from "@breezystack/lamejs";

export interface DecodedAudioMetrics {
  peaks: number[];
  duration: number;
  sampleRate: number;
  blobUrl: string;
}

export function base64ToWavBlob(base64: string, mimeType = "audio/wav"): Blob {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

export async function analyzeWavAudio(
  base64: string,
  barCount = 96
): Promise<DecodedAudioMetrics> {
  const blob = base64ToWavBlob(base64, "audio/wav");
  const blobUrl = URL.createObjectURL(blob);

  try {
    const arrayBuffer = await blob.arrayBuffer();
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0);
    const blockSize = Math.max(1, Math.floor(channelData.length / barCount));
    const peaks: number[] = [];

    for (let i = 0; i < barCount; i++) {
      const start = i * blockSize;
      const end = Math.min(channelData.length, start + blockSize);
      let max = 0;
      for (let j = start; j < end; j++) {
        const val = Math.abs(channelData[j]);
        if (val > max) max = val;
      }
      peaks.push(max);
    }

    const maxPeak = Math.max(...peaks, 0.01);
    const normalizedPeaks = peaks.map((p) =>
      Math.max(0.06, Math.min(1, p / maxPeak))
    );

    const duration = audioBuffer.duration;
    const sampleRate = audioBuffer.sampleRate;
    await ctx.close();

    return {
      peaks: normalizedPeaks,
      duration,
      sampleRate,
      blobUrl,
    };
  } catch {
    return {
      peaks: Array.from({ length: barCount }, () => 0.35),
      duration: 0,
      sampleRate: 24000,
      blobUrl,
    };
  }
}

export function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00.0";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(
    2,
    "0"
  )}.${tenths}`;
}

export function estimateDocumentaryDuration(script: string): string {
  const cleaned = script
    .replace(/<[^>]+>/g, " ")
    .replace(/\|[^|]+\|/g, " ")
    .trim();
  if (!cleaned) return "00:00";
  const words = cleaned.split(/\s+/).filter(Boolean).length;
  const breathMatches = script.match(/<breath>/gi)?.length ?? 0;
  const estSeconds = Math.round((words / 125) * 60 + breathMatches * 0.7);
  const mins = Math.floor(estSeconds / 60);
  const secs = estSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function buildTakeFilename(
  takeNumber: number,
  title: string,
  ext: "wav" | "mp3"
): string {
  const safeSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `chronicle-take-${String(takeNumber).padStart(2, "0")}-${
    safeSlug || "narration"
  }.${ext}`;
}

function parseWavPcm(arrayBuffer: ArrayBuffer): {
  channels: number;
  sampleRate: number;
  samples: Int16Array;
} {
  const view = new DataView(arrayBuffer);
  let channels = 1;
  let sampleRate = 24000;
  let dataOffset = 44;
  let dataLength = Math.max(0, arrayBuffer.byteLength - 44);

  if (
    arrayBuffer.byteLength >= 44 &&
    view.getUint32(0, false) === 0x52494646 // "RIFF"
  ) {
    let offset = 12;
    while (offset + 8 <= arrayBuffer.byteLength) {
      const chunkId = view.getUint32(offset, false);
      const chunkSize = view.getUint32(offset + 4, true);
      if (chunkId === 0x666d7420) {
        // "fmt "
        channels = view.getUint16(offset + 10, true) || 1;
        sampleRate = view.getUint32(offset + 12, true) || 24000;
      } else if (chunkId === 0x64617461) {
        // "data"
        dataOffset = offset + 8;
        dataLength = Math.min(
          chunkSize,
          arrayBuffer.byteLength - dataOffset
        );
        break;
      }
      offset += 8 + chunkSize + (chunkSize % 2);
    }
  }

  const sampleCount = Math.floor(dataLength / 2);
  const samples = new Int16Array(arrayBuffer, dataOffset, sampleCount);
  return { channels, sampleRate, samples };
}

function triggerBrowserDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function downloadTakeAudio(
  blobUrl: string,
  takeNumber: number,
  title: string,
  format: "wav" | "mp3"
): Promise<void> {
  const filename = buildTakeFilename(takeNumber, title, format);

  if (format === "wav") {
    triggerBrowserDownload(blobUrl, filename);
    return;
  }

  const res = await fetch(blobUrl);
  const wavBuffer = await res.arrayBuffer();
  const { channels, sampleRate, samples } = parseWavPcm(wavBuffer);

  const encoder = new Mp3Encoder(channels, sampleRate, 192);
  const mp3Parts: BlobPart[] = [];
  const blockSize = 1152;

  if (channels === 1) {
    for (let i = 0; i < samples.length; i += blockSize) {
      const slice = samples.subarray(i, i + blockSize);
      const encoded = encoder.encodeBuffer(slice);
      if (encoded.length > 0) {
        mp3Parts.push(new Uint8Array(encoded));
      }
    }
  } else {
    const half = Math.floor(samples.length / 2);
    const left = new Int16Array(half);
    const right = new Int16Array(half);
    for (let i = 0; i < half; i++) {
      left[i] = samples[i * 2];
      right[i] = samples[i * 2 + 1];
    }
    for (let i = 0; i < half; i += blockSize) {
      const lSlice = left.subarray(i, i + blockSize);
      const rSlice = right.subarray(i, i + blockSize);
      const encoded = encoder.encodeBuffer(lSlice, rSlice);
      if (encoded.length > 0) {
        mp3Parts.push(new Uint8Array(encoded));
      }
    }
  }

  const flushed = encoder.flush();
  if (flushed.length > 0) {
    mp3Parts.push(new Uint8Array(flushed));
  }

  const mp3Blob = new Blob(mp3Parts, { type: "audio/mpeg" });
  const mp3Url = URL.createObjectURL(mp3Blob);
  triggerBrowserDownload(mp3Url, filename);
  window.setTimeout(() => URL.revokeObjectURL(mp3Url), 1000);
}
