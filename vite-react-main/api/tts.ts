import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";
import { put } from "@vercel/blob";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { ssml, voice } = req.body;

    if (!ssml) {
      return res.status(400).json({ error: "ssml is required" });
    }

    /* =========================
       3種類の声マッピング
       ※ 好みで後から差し替えてOK
    ========================= */
    const VOICE_MAP: Record<string, string> = {
      narration: "shimmer", // 女性ナレーション
      nagata: "onyx",     // 30代男性
      kimura: "echo",     // 50代後半男性
    };

    // デフォルトは narration
    const selectedVoice =
      VOICE_MAP[voice as string] ?? VOICE_MAP.narration;

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const speech = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: selectedVoice,
      input: ssml,
    });

    const buffer = Buffer.from(await speech.arrayBuffer());

    const filename = `tts-${Date.now()}-${selectedVoice}.mp3`;

    const blob = await put(filename, buffer, {
      access: "public",
      contentType: "audio/mpeg",
    });

    return res.status(200).json({
      audioUrl: blob.url,
      voice: selectedVoice,
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
