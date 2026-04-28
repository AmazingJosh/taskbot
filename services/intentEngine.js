const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Gemini 1.5 Flash — fast, free tier, multimodal
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const SYSTEM_PROMPT = `You are an intent detection engine for a Telegram task bot.

Your job is to read a user's message and return ONLY a JSON object identifying what task they want done.

Supported tasks:
- background_removal (requires: image)
- pdf_compress (requires: pdf file)
- pdf_convert (requires: file, specify target format)
- transcription (requires: audio or video)
- translation (requires: text or file, specify target_language)
- text_to_speech (requires: text)
- weather (requires: city name)
- currency_convert (requires: amount, from_currency, to_currency)
- image_generate (requires: text prompt)
- summarize (requires: text or document)
- unknown (if you cannot match any task)

Return ONLY this JSON format, no extra text, no markdown:
{
  "task": "task_name",
  "requires_file": true or false,
  "params": {},
  "confidence": "high" or "low"
}`;

/**
 * Reads the user's Telegram message and returns a structured intent object.
 * Uses Gemini 1.5 Flash — free tier, multimodal.
 */
const detectIntent = async (msg) => {
  // Build a plain text description of what the user sent
  let userInput = "";

  if (msg.text)          userInput = `Text message: "${msg.text}"`;
  else if (msg.photo)    userInput = `User sent a photo. Caption: "${msg.caption || "none"}"`;
  else if (msg.voice)    userInput = `User sent a voice note. Caption: "${msg.caption || "none"}"`;
  else if (msg.document) userInput = `User sent a document (${msg.document.mime_type}). Caption: "${msg.caption || "none"}"`;
  else if (msg.video)    userInput = `User sent a video. Caption: "${msg.caption || "none"}"`;
  else                   userInput = "Unknown message type";

  const result = await model.generateContent(`${SYSTEM_PROMPT}\n\nUser input: ${userInput}`);
  const raw = result.response.text().trim();

  // Strip markdown code fences if Gemini adds them
  const cleaned = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
};

module.exports = { detectIntent };