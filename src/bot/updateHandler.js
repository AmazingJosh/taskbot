const { detectIntent } = require("../services/intentEngine");
const { routeTask } = require("../routes/taskRouter");
const { findOrCreateUser } = require("../models/userModels");
const { logTask } = require("../models/taskModel");

/**
 * Smart pre-router — runs BEFORE Gemini.
 * Catches obvious intents based on file type alone.
 * Prevents Gemini returning "unknown" on clear cases.
 */
const preRoute = (msg) => {
  // Voice note or audio → always transcription
  if (msg.voice || msg.audio) {
    return { task: "transcription", requires_file: true, params: {}, confidence: "high" };
  }

  // Video → transcription (unless caption hints otherwise)
  if (msg.video || msg.video_note) {
    const caption = (msg.caption || "").toLowerCase();
    if (caption.includes("gif") || caption.includes("convert")) return null;
    return { task: "transcription", requires_file: true, params: {}, confidence: "high" };
  }

  // Photo with no caption → background removal
  if (msg.photo && !msg.caption) {
    return { task: "background_removal", requires_file: true, params: {}, confidence: "high" };
  }

  // PDF with no caption → compress
  if (msg.document && msg.document.mime_type === "application/pdf" && !msg.caption) {
    return { task: "pdf_compress", requires_file: true, params: {}, confidence: "high" };
  }

  // Let Gemini handle everything else
  return null;
};

const handleUpdate = async (bot, update) => {
  if (!update.message) return;

  const msg = update.message;
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || msg.from.first_name;

  await findOrCreateUser({ telegramId: userId, username, platform: "telegram" });

  // /start
  if (msg.text === "/start") {
    return bot.sendMessage(
      chatId,
      `👋 Hey ${username}! I'm *TaskBot* 🤖\n\nSend me a message or file and I'll get it done for you.\n\n*What I can do:*\n• 🖼 Remove image backgrounds\n• 📄 Compress PDFs\n• 🎙 Transcribe voice notes, audio and video\n• 🌍 Translate text\n• 🔊 Text to speech\n• 🌤 Weather lookup\n• 💱 Currency conversion\n• ...and more!\n\nJust tell me what you need.`,
      { parse_mode: "Markdown" }
    );
  }

  // /help
  if (msg.text === "/help") {
    return bot.sendMessage(
      chatId,
      `*TaskBot — what I can do* 🛠\n\n🖼 *Images*\n• Send a photo → I remove the background\n• "Remove background from this"\n\n🎙 *Audio & Video*\n• Send a voice note → I transcribe it\n• Send a video → I extract the text\n\n📄 *Documents*\n• Send a PDF → I compress it\n\n🌍 *Text*\n• "Translate this to Yoruba"\n• "Convert this to speech"\n• "Weather in Lagos"\n• "Convert 500 USD to NGN"`,
      { parse_mode: "Markdown" }
    );
  }

  await bot.sendMessage(chatId, "⚙️ Working on it...");

  try {
    // Step 1: Pre-router (no AI, instant)
    let intent = preRoute(msg);

    // Step 2: Gemini fallback
    if (!intent) {
      intent = await detectIntent(msg);
    }

    console.log(`📌 Intent: ${intent.task} | confidence: ${intent.confidence}`);

    // Step 3: Run the task
    const result = await routeTask(bot, chatId, msg, intent);

    // Step 4: Log
    await logTask({
      userId,
      platform: "telegram",
      task: intent.task,
      status: result.success ? "success" : "failed",
      errorMessage: result.error || null,
    });

  } catch (err) {
    console.error("❌ Task failed:", err.message);
    await bot.sendMessage(chatId, "😕 Something went wrong. Please try again.");
  }
};

module.exports = { handleUpdate };