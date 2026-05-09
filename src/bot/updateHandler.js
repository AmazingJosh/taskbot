const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const SYSTEM_PROMPT = `You are the brain of a smart Telegram assistant bot. Understand what task the user wants — no matter how they phrase it, even with typos, slang, or broken English.

TASKS YOU SUPPORT:

IMAGE TASKS:
1. background_removal — remove/cut/erase background from photo
   "remove bg", "cut out bg", "remove backgrond", "transparent bg", "remove the background"

2. background_blur — blur background, keep subject sharp (portrait/bokeh effect)
   "blur bg", "blur background", "portrait mode", "bokeh", "make bg blurry"

3. background_swap — replace background with AI generated or custom image
   "change bg", "swap background", "put me on a beach", "new background", "use my own background"

4. image_resize — resize/scale image to specific dimensions or platform size
   "resize this", "resize to 500x500", "make this whatsapp size", "resize for instagram",
   "resize to whatsapp dp", "make this smaller", "scale this image", "fit this to linkedin",
   "resize this to [ANY PLATFORM NAME]", "make it [dimensions]", "change size to"
   params.width, params.height OR params.preset name

PDF & DOCUMENT TASKS:
5. pdf_compress — compress/reduce/shrink PDF size
   "compress pdf", "reduce pdf", "make pdf smaller", "pdf too big"

6. pdf_to_word — convert PDF to Word document
   "pdf to word", "convert pdf to word", "make pdf editable", "pdf to docx"

7. office_to_pdf — convert Word/Excel/PowerPoint to PDF
   "word to pdf", "docx to pdf", "excel to pdf", "convert to pdf"

8. pdf_to_jpg — convert PDF pages to images
   "pdf to image", "pdf to jpg", "pdf to picture"

9. image_to_pdf — convert image to PDF
   "image to pdf", "jpg to pdf", "photo to pdf", "picture to pdf"

10. pdf_merge — combine multiple PDFs into one
    "merge pdfs", "combine pdfs", "join pdfs"

11. pdf_split — split PDF into separate pages
    "split pdf", "separate pages", "extract pages"

12. pdf_unlock — remove password from PDF
    "unlock pdf", "remove pdf password", "open locked pdf"

13. pdf_repair — fix damaged/corrupted PDF
    "repair pdf", "fix pdf", "corrupted pdf"

OTHER TASKS:
14. transcription — convert audio/voice/video to text
    "transcribe", "voice to text", "what did they say"

15. unknown — ONLY if you truly cannot determine intent

SMART DEFAULTS (when no caption provided):
- Photo sent → background_removal
- Voice note sent → transcription
- PDF sent → pdf_compress
- Word/Excel/PPT file sent → office_to_pdf

CRITICAL RULES:
- "resize to whatsapp", "whatsapp size", "whatsapp dp size", "fit whatsapp" → ALL mean image_resize
- "resize to instagram", "instagram size", "fit instagram" → ALL mean image_resize
- ANY mention of resizing, scaling, making bigger/smaller → image_resize
- If previous context mentions resize and user sends a photo → image_resize NOT background_removal
- Be smart — "make this passport size" = image_resize, not unknown

Return ONLY this JSON, no markdown, no explanation:
{
  "task": "task_name",
  "requires_file": true or false,
  "params": {},
  "confidence": "high" or "low"
}`;

/**
 * Detect intent from user message.
 * Accepts optional session context so Gemini understands
 * what was happening in the conversation before this message.
 */
const detectIntent = async (msg, sessionContext = null) => {
  let userInput = "";

  if (msg.text)          userInput = `User sent text: "${msg.text}"`;
  else if (msg.photo)    userInput = `User sent a photo. Caption: "${msg.caption || "none"}"`;
  else if (msg.voice)    userInput = `User sent a voice note. Caption: "${msg.caption || "none"}"`;
  else if (msg.audio)    userInput = `User sent an audio file. Caption: "${msg.caption || "none"}"`;
  else if (msg.document) userInput = `User sent a document. Type: ${msg.document.mime_type}. Name: ${msg.document.file_name || "unknown"}. Caption: "${msg.caption || "none"}"`;
  else if (msg.video)    userInput = `User sent a video. Caption: "${msg.caption || "none"}"`;
  else                   userInput = "Unknown message";

  // Inject session context so Gemini understands the conversation flow
  let contextNote = "";
  if (sessionContext) {
    contextNote = `\n\nCONVERSATION CONTEXT: The user was previously doing a "${sessionContext.lastTask}" task. Keep this in mind when interpreting their current message. For example if they were resizing an image and now send another photo, they likely want to resize again.`;
  }

  const result = await model.generateContent(
    `${SYSTEM_PROMPT}${contextNote}\n\nAnalyze and return intent JSON:\n${userInput}`
  );

  const raw = result.response.text().trim();
  const cleaned = raw.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("Intent parse error:", cleaned);
    return { task: "unknown", requires_file: false, params: {}, confidence: "low" };
  }
};

module.exports = { detectIntent };