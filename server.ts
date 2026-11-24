import "dotenv/config";
import express, { type Request, type Response } from "express";
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, type WebSocket } from "ws";
import {
  GoogleGenAI,
  Modality,
  ThinkingLevel,
  type LiveServerMessage,
} from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const TTS_MODEL = "gemini-3.8-flash-tts";
const TEXT_MODEL = "gemini-4-hydrogen";
const FAST_TEXT_MODEL = "gemini-3.1-flash-lite";
const TRANSCRIBE_MODEL = "gemini-3.5-transcribe";
const LIVE_MODEL = "gemini-3.8-live";
const LYRIA_CLIP_MODEL = "lyria-3-clip-preview";
const LYRIA_PRO_MODEL = "lyria-3-pro-preview";

function getGeminiClient(apiVersion: "v1beta" | "v1alpha" = "v1beta"): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured. Please check your environment secrets in Settings > Secrets."
    );
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

interface SpeakerConfigPayload {
  name: string;
  voiceName: string;
  styleDirection: string;
}

interface TtsRequestBody {
  mode: "solo" | "dialogue";
  script: string;
  voiceName?: string;
  styleDirection?: string;
  speakerOne?: SpeakerConfigPayload;
  speakerTwo?: SpeakerConfigPayload;
}

interface RefineRequestBody {
  action: "polish" | "add_beats" | "draft";
  script?: string;
  topic?: string;
  archetype?: string;
  mode?: "solo" | "dialogue";
  speakerOneName?: string;
  speakerTwoName?: string;
}

interface TranscribeRequestBody {
  audioBase64: string;
  mimeType: string;
  formatAsDocumentary?: boolean;
}

interface MusicRequestBody {
  prompt: string;
  durationMode?: "clip" | "full";
  imagePath?: string;
}

interface ChatHistoryMessage {
  role: "user" | "model";
  text: string;
}

interface ChatRequestBody {
  message: string;
  history?: ChatHistoryMessage[];
  rolePreset?: "writer" | "interviewer" | "director";
  speedMode?: "balanced" | "fast";
  archetype?: string;
}

function parseDialogueTurns(
  rawScript: string,
  speakerOne: SpeakerConfigPayload,
  speakerTwo: SpeakerConfigPayload
) {
  const s1Name = speakerOne.name.trim() || "Narrator";
  const s2Name = speakerTwo.name.trim() || "Witness";
  const s1Lower = s1Name.toLowerCase();
  const s2Lower = s2Name.toLowerCase();

  const lines = rawScript
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const turns: Array<{
    text: string;
    speechMetadata: { speaker: string; style: string };
  }> = [];

  let activeSpeaker = s1Name;

  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0 && colonIdx < 40) {
      const candidate = line.slice(0, colonIdx).trim();
      const candidateLower = candidate.toLowerCase();
      const content = line.slice(colonIdx + 1).trim();

      if (candidateLower === s1Lower) {
        activeSpeaker = s1Name;
        if (content) {
          turns.push({
            text: `${s1Name}: ${content}`,
            speechMetadata: {
              speaker: s1Name,
              style:
                speakerOne.styleDirection.trim() ||
                "Measured, authentic documentary narrator.",
            },
          });
        }
        continue;
      }

      if (candidateLower === s2Lower) {
        activeSpeaker = s2Name;
        if (content) {
          turns.push({
            text: `${s2Name}: ${content}`,
            speechMetadata: {
              speaker: s2Name,
              style:
                speakerTwo.styleDirection.trim() ||
                "Grounded, natural documentary interview subject.",
            },
          });
        }
        continue;
      }
    }

    const activeConfig = activeSpeaker === s1Name ? speakerOne : speakerTwo;
    turns.push({
      text: `${activeSpeaker}: ${line}`,
      speechMetadata: {
        speaker: activeSpeaker,
        style:
          activeConfig.styleDirection.trim() ||
          "Natural, measured documentary tone.",
      },
    });
  }

  return { s1Name, s2Name, turns };
}

function extractApiErrorMessage(err: unknown): { status: number; message: string } {
  if (err instanceof Error) {
    let msg = err.message || "Unexpected server error.";
    try {
      const parsed = JSON.parse(msg) as {
        error?: { code?: number; message?: string };
      };
      if (parsed?.error?.message) {
        msg = parsed.error.message;
      }
    } catch {
      // Message is plain text
    }

    if (msg.includes("GEMINI_API_KEY")) {
      return { status: 400, message: msg };
    }
    if (msg.includes("403") || msg.includes("PERMISSION_DENIED")) {
      return {
        status: 403,
        message:
          "Permission denied by Gemini API. Verify your API key (or select a paid key for music models) in Settings > Secrets.",
      };
    }
    if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
      return {
        status: 429,
        message:
          "Rate limit or quota reached on the Gemini API. If using music generation, ensure a paid API key is configured in Settings > Secrets.",
      };
    }
    if (msg.includes("404") || msg.includes("NOT_FOUND")) {
      return {
        status: 404,
        message: "Requested model was not found or is unavailable for your key.",
      };
    }
    return { status: 500, message: msg };
  }
  return { status: 500, message: "Failed to process Gemini request." };
}

function buildLiveSystemInstruction(role: string, archetype: string): string {
  if (role === "interview") {
    return `You are a thoughtful documentary interview subject speaking in a ${archetype} film. Respond in concise, evocative, natural spoken sentences (2-4 sentences per turn) so the filmmaker can practice documentary Q&A and pacing.`;
  }
  if (role === "critic") {
    return `You are a seasoned documentary voice director listening to the user rehearse narration for a ${archetype} film. Give warm, practical, specific feedback on pacing, pauses, and tone in 2-3 short spoken sentences.`;
  }
  return `You are a collaborative documentary story coach helping the user brainstorm and shape narration for a ${archetype} film. Speak warmly, ask one sharp follow-up question or suggest a vivid opening line in 2-3 short sentences.`;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "25mb" }));

  // 1. Documentary Text-to-Speech (gemini-3.8-flash-tts)
  app.post("/api/tts", async (req: Request, res: Response) => {
    try {
      const body = req.body as TtsRequestBody;
      const mode = body.mode === "dialogue" ? "dialogue" : "solo";
      const script = (body.script ?? "").trim();

      if (!script) {
        res.status(400).json({ error: "Narration script cannot be empty." });
        return;
      }

      if (script.length > 6000) {
        res.status(400).json({
          error: "Script exceeds the 6,000-character limit for a single take.",
        });
        return;
      }

      const runTtsWithVersion = async (apiVersion: "v1beta" | "v1alpha") => {
        const ai = getGeminiClient(apiVersion);

        if (mode === "solo") {
          const voiceName = body.voiceName?.trim() || "Charon";
          const styleDirection = body.styleDirection?.trim() || "";

          const part: { text: string; speechMetadata?: { style: string } } = {
            text: script,
          };
          if (styleDirection) {
            part.speechMetadata = { style: styleDirection };
          }

          return ai.models.generateContent({
            model: TTS_MODEL,
            contents: [
              {
                role: "user",
                parts: [part],
              },
            ],
            config: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName },
                },
              },
            },
          });
        }

        const speakerOne: SpeakerConfigPayload = {
          name: body.speakerOne?.name?.trim() || "Narrator",
          voiceName: body.speakerOne?.voiceName?.trim() || "Charon",
          styleDirection:
            body.speakerOne?.styleDirection?.trim() ||
            "Measured, authoritative documentary narrator.",
        };
        const speakerTwo: SpeakerConfigPayload = {
          name: body.speakerTwo?.name?.trim() || "Witness",
          voiceName: body.speakerTwo?.voiceName?.trim() || "Kore",
          styleDirection:
            body.speakerTwo?.styleDirection?.trim() ||
            "Grounded, reflective documentary subject.",
        };

        if (speakerOne.name.toLowerCase() === speakerTwo.name.toLowerCase()) {
          speakerTwo.name = `${speakerTwo.name} 2`;
        }

        const { s1Name, s2Name, turns } = parseDialogueTurns(
          script,
          speakerOne,
          speakerTwo
        );

        if (turns.length === 0) {
          throw new Error("No speakable lines found in dialogue script.");
        }

        return ai.models.generateContent({
          model: TTS_MODEL,
          contents: [
            {
              role: "user",
              parts: turns,
            },
          ],
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              multiSpeakerVoiceConfig: {
                speakerVoiceConfigs: [
                  {
                    speaker: s1Name,
                    voiceConfig: {
                      prebuiltVoiceConfig: { voiceName: speakerOne.voiceName },
                    },
                  },
                  {
                    speaker: s2Name,
                    voiceConfig: {
                      prebuiltVoiceConfig: { voiceName: speakerTwo.voiceName },
                    },
                  },
                ],
              },
            },
          },
        });
      };

      let response;
      try {
        response = await runTtsWithVersion("v1beta");
      } catch (firstErr) {
        const msg = firstErr instanceof Error ? firstErr.message : "";
        if (msg.includes("speechMetadata") || msg.includes("INVALID_ARGUMENT")) {
          response = await runTtsWithVersion("v1alpha");
        } else {
          throw firstErr;
        }
      }

      const base64Audio =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (!base64Audio) {
        res.status(502).json({
          error:
            "Gemini TTS completed without returning audio data. Try simplifying the script.",
        });
        return;
      }

      res.json({
        audioBase64: base64Audio,
        mimeType: "audio/wav",
        model: TTS_MODEL,
      });

    } catch (err) {
      const { status, message } = extractApiErrorMessage(err);
      res.status(status).json({ error: message });
    }
  });

  // 2. Script Drafting & Cadence Polish (gemini-4-hydrogen)
  app.post("/api/script/refine", async (req: Request, res: Response) => {
    try {
      const body = req.body as RefineRequestBody;
      const action = body.action || "polish";
      const mode = body.mode === "dialogue" ? "dialogue" : "solo";
      const archetype = body.archetype?.trim() || "Documentary";
      const s1 = body.speakerOneName?.trim() || "Narrator";
      const s2 = body.speakerTwoName?.trim() || "Witness";
      const ai = getGeminiClient();

      let systemInstruction =
        "You are an acclaimed documentary script editor. Return ONLY the narration script text with no title, preamble, markdown fences, or commentary.";

      if (mode === "dialogue") {
        systemInstruction += ` Format every spoken line strictly as "${s1}: ..." or "${s2}: ..." on its own line. You may naturally include subtle cues like <breath> or backchannels like |mhm| or |yeah| only where realistic.`;
      } else {
        systemInstruction +=
          " Write evocative, clear spoken-word documentary prose meant to be read aloud at ~125 words per minute. Place subtle <breath> pauses at natural turning points.";
      }

      let prompt = "";
      if (action === "draft") {
        const topic = (body.topic ?? "").trim();
        if (!topic) {
          res.status(400).json({ error: "Please provide a topic to draft from." });
          return;
        }
        prompt = `Write a concise 45–65 word ${archetype} documentary narration script about: ${topic}.`;
      } else if (action === "add_beats") {
        const script = (body.script ?? "").trim();
        if (!script) {
          res.status(400).json({ error: "Enter a script first to place pauses." });
          return;
        }
        prompt = `Preserve the exact words of this ${archetype} script, and insert 2 to 4 natural <breath> pauses where a documentary narrator would pause for emphasis:\n\n${script}`;
      } else {
        const script = (body.script ?? "").trim();
        if (!script) {
          res.status(400).json({ error: "Enter a script first to polish." });
          return;
        }
        prompt = `Polish the clarity and natural spoken rhythm of this ${archetype} documentary script so every sentence sounds smooth aloud:\n\n${script}`;
      }

      const response = await ai.models.generateContent({
        model: TEXT_MODEL,
        contents: prompt,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const refined = (response.text ?? "").trim();
      if (!refined) {
        res.status(502).json({ error: "Script editor returned an empty response." });
        return;
      }

      res.json({ script: refined });
    } catch (err) {
      const { status, message } = extractApiErrorMessage(err);
      res.status(status).json({ error: message });
    }
  });

  // 3. Microphone / Audio File Transcription (gemini-3.5-transcribe)
  app.post("/api/transcribe", async (req: Request, res: Response) => {
    try {
      const body = req.body as TranscribeRequestBody;
      const audioBase64 = (body.audioBase64 ?? "").trim();
      const mimeType = (body.mimeType ?? "audio/webm").split(";")[0].trim() || "audio/webm";

      if (!audioBase64) {
        res.status(400).json({ error: "No audio data received for transcription." });
        return;
      }

      const ai = getGeminiClient();

      const instructionText = body.formatAsDocumentary
        ? "Transcribe this spoken audio accurately, cleaning up filler hesitation only minimally while keeping the speaker's exact words and natural punctuation."
        : "Transcribe this audio accurately with clear punctuation.";

      const response = await ai.models.generateContent({
        model: TRANSCRIBE_MODEL,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: audioBase64,
              },
            },
            { text: instructionText },
          ],
        },
      });

      const transcript = (response.text ?? "").trim();
      if (!transcript) {
        res.status(502).json({
          error: "Transcription completed but no speech was detected.",
        });
        return;
      }

      res.json({ transcript, model: TRANSCRIBE_MODEL });
    } catch (err) {
      const { status, message } = extractApiErrorMessage(err);
      res.status(status).json({ error: message });
    }
  });

  // 3b. Multi-Turn Documentary Script & Story Chatbot (gemini-4-hydrogen / gemini-3.1-flash-lite)
  app.post("/api/chat", async (req: Request, res: Response) => {
    try {
      const body = req.body as ChatRequestBody;
      const message = (body.message ?? "").trim();
      if (!message) {
        res.status(400).json({ error: "Message cannot be empty." });
        return;
      }

      const archetype = body.archetype?.trim() || "Documentary";
      const rolePreset = body.rolePreset || "writer";
      const model =
        body.speedMode === "fast" ? FAST_TEXT_MODEL : TEXT_MODEL;

      let systemInstruction = "";
      if (rolePreset === "interviewer") {
        systemInstruction = `You are a veteran documentary field producer and interview strategist working on a ${archetype} film. Help the user craft sharp, empathetic interview questions, prepare witness follow-ups, and structure Q&A beats cleanly.`;
      } else if (rolePreset === "director") {
        systemInstruction = `You are an experienced documentary voice director working on a ${archetype} film. Critique narration drafts for spoken rhythm, suggest where to place <breath> pauses, and advise on vocal pacing and emotional restraint.`;
      } else {
        systemInstruction = `You are an acclaimed documentary scriptwriter collaborating on a ${archetype} film. Write vivid, grounded spoken-word narration, develop scene arcs, and keep prose natural when read aloud. When offering sample narration lines, keep them concise and ready to paste into a voiceover booth.`;
      }

      const history = (body.history ?? [])
        .filter(
          (item) =>
            (item.role === "user" || item.role === "model") &&
            typeof item.text === "string" &&
            item.text.trim().length > 0
        )
        .map((item) => ({
          role: item.role,
          parts: [{ text: item.text.trim() }],
        }));

      const ai = getGeminiClient("v1beta");
      const chat = ai.chats.create({
        model,
        history,
        config: {
          systemInstruction,
        },
      });

      const response = await chat.sendMessage({ message });
      const reply = (response.text ?? "").trim();

      if (!reply) {
        res.status(502).json({
          error: "Assistant returned an empty response. Please try again.",
        });
        return;
      }

      res.json({ reply, model });
    } catch (err) {
      const { status, message } = extractApiErrorMessage(err);
      res.status(status).json({ error: message });
    }
  });

  // 4. Documentary Music Generation (lyria-3-clip-preview / lyria-3-pro-preview)
  app.post("/api/music", async (req: Request, res: Response) => {
    try {
      const body = req.body as MusicRequestBody;
      const prompt = (body.prompt ?? "").trim();
      if (!prompt) {
        res.status(400).json({ error: "Describe the music mood before generating." });
        return;
      }

      const model =
        body.durationMode === "full" ? LYRIA_PRO_MODEL : LYRIA_CLIP_MODEL;
      const ai = getGeminiClient();

      const parts: Array<
        { text: string } | { inlineData: { data: string; mimeType: string } }
      > = [{ text: prompt }];

      // Optional safe local scene plate reference
      if (body.imagePath && body.imagePath.startsWith("/src/assets/images/")) {
        const safeFilename = path.basename(body.imagePath);
        const resolvedImg = path.resolve(
          __dirname,
          "src",
          "assets",
          "images",
          safeFilename
        );
        if (fs.existsSync(resolvedImg)) {
          const imgBytes = fs.readFileSync(resolvedImg);
          parts.push({
            inlineData: {
              data: imgBytes.toString("base64"),
              mimeType: "image/jpeg",
            },
          });
        }
      }

      const responseStream = await ai.models.generateContentStream({
        model,
        contents: parts.length === 1 ? prompt : { parts },
      });

      const audioChunks: Buffer[] = [];
      let lyrics = "";
      let mimeType = "audio/mpeg";

      for await (const chunk of responseStream) {
        const chunkParts = chunk.candidates?.[0]?.content?.parts;
        if (!chunkParts) continue;
        for (const part of chunkParts) {
          if (part.inlineData?.data) {
            if (audioChunks.length === 0 && part.inlineData.mimeType) {
              mimeType = part.inlineData.mimeType;
            }
            audioChunks.push(Buffer.from(part.inlineData.data, "base64"));
          }
          if (part.text) {
            lyrics += part.text;
          }
        }
      }

      if (audioChunks.length === 0) {
        res.status(502).json({
          error: "Music generation completed without returning audio.",
        });
        return;
      }

      const audioBase64 = Buffer.concat(audioChunks).toString("base64");
      res.json({
        audioDataUrl: `data:${mimeType};base64,${audioBase64}`,
        mimeType,
        lyrics: lyrics.trim(),
        model,
      });
    } catch (err) {
      const { status, message } = extractApiErrorMessage(err);
      res.status(status).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, "dist");
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get("/{*splat}", (_req: Request, res: Response) => {
        res.sendFile(path.join(distDir, "index.html"));
      });
    }
  }

  const server = http.createServer(app);

  // 5. Real-Time Live Voice Conversations (gemini-3.8-live via WebSocket /live)
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const reqUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (reqUrl.pathname === "/live") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, reqUrl);
      });
    }
  });

  wss.on("connection", async (clientWs: WebSocket, reqUrl: URL) => {
    const voiceName = reqUrl.searchParams.get("voice") || "Zephyr";
    const role = reqUrl.searchParams.get("role") || "coach";
    const archetype = reqUrl.searchParams.get("archetype") || "Documentary";

    let session: Awaited<ReturnType<GoogleGenAI["live"]["connect"]>> | null =
      null;

    try {
      const ai = getGeminiClient();
      session = await ai.live.connect({
        model: LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
          systemInstruction: buildLiveSystemInstruction(role, archetype),
        },
        callbacks: {
          onopen: () => {
            if (clientWs.readyState === clientWs.OPEN) {
              clientWs.send(JSON.stringify({ type: "ready" }));
            }
          },
          onmessage: (message: LiveServerMessage) => {
            if (clientWs.readyState !== clientWs.OPEN) return;
            const content = message.serverContent;

            if (content?.inputTranscription?.text) {
              clientWs.send(
                JSON.stringify({
                  type: "inputTranscript",
                  text: content.inputTranscription.text,
                })
              );
            }
            if (content?.outputTranscription?.text) {
              clientWs.send(
                JSON.stringify({
                  type: "outputTranscript",
                  text: content.outputTranscription.text,
                })
              );
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                clientWs.send(
                  JSON.stringify({
                    type: "audio",
                    data: part.inlineData.data,
                  })
                );
              }
            }
            if (content?.interrupted) {
              clientWs.send(JSON.stringify({ type: "interrupted" }));
            }
            if (content?.turnComplete) {
              clientWs.send(JSON.stringify({ type: "turnComplete" }));
            }
          },
          onerror: (err: unknown) => {
            if (clientWs.readyState === clientWs.OPEN) {
              const msg =
                err instanceof Error
                  ? err.message
                  : "Live voice connection encountered an error.";
              clientWs.send(JSON.stringify({ type: "error", message: msg }));
            }
          },
          onclose: () => {
            if (clientWs.readyState === clientWs.OPEN) {
              clientWs.send(JSON.stringify({ type: "closed" }));
            }
          },
        },
      });
    } catch (err) {
      const { message } = extractApiErrorMessage(err);
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify({ type: "error", message }));
        clientWs.close();
      }
      return;
    }

    clientWs.on("message", (rawData) => {
      if (!session) return;
      try {
        const msg = JSON.parse(rawData.toString()) as {
          type?: string;
          audio?: string;
          text?: string;
        };
        if (msg.type === "audio" && msg.audio) {
          session.sendRealtimeInput({
            audio: { data: msg.audio, mimeType: "audio/pcm;rate=16000" },
          });
        } else if (msg.type === "text" && msg.text) {
          session.sendRealtimeInput({ text: msg.text });
        }
      } catch {
        // Ignore malformed client frames
      }
    });

    clientWs.on("close", () => {
      try {
        session?.close();
      } catch {
        // Ignore close errors
      }
      session = null;
    });
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Chronicle Booth listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start Chronicle Booth server:", err);
  process.exit(1);
});
