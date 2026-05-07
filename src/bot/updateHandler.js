
const { detectIntent } = require("../services/intentEngine");
const { routeTask } = require("../routes/taskRouter");
const { findOrCreateUser } = require("../models/userModels");
const { logTask } = require("../models/taskModel");
const { getSession, clearSession } = require("../helpers/sessionStore");
const { handleCallback } = require("./callbackHandler");
const { 
  MAIN_MENU, 
  WELCOME_MESSAGE, 
  MENU_MESSAGE 
} = require("./menu");
/**
 * Smart pre-router — runs BEFORE Gemini.
 * Catches obvious intents purely from file type.
 * Saves Gemini API calls for genuinely ambiguous messages.
 */

const handleUpdate = async (bot, update) => {
  // ── Handle inline keyboard button taps ──────────────
  if (update.callback_query) {
    return handleCallback(bot, update.callback_query);
  }

  if (!update.message) return;

  const msg = update.message;
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || msg.from.first_name;

  await findOrCreateUser({ telegramId: userId, username, platform: "telegram" });

  // ── /start ───────────────────────────────────────────
if (msg.text === "/start") {
  await bot.sendMessage(
    chatId,
    WELCOME_MESSAGE.replace("{name}", username),
    { parse_mode: "Markdown", ...MAIN_MENU }
  );
  return;
}

 if (msg.text === "/menu") {
  await bot.sendMessage(
    chatId,
    MENU_MESSAGE,
    { parse_mode: "Markdown", ...MAIN_MENU }
  );
  return;
}
  // ── /help ────────────────────────────────────────────
  if (msg.text === "/help") {
    await bot.sendMessage(
      chatId,
      `*TaskBot — how to use me* 🛠\n\n*Option 1 — Tap the menu:*\nType /menu and tap any button\n\n*Option 2 — Just tell me:*\n• "Remove background from this photo"\n• "Put me on a beach in Maldives"\n• "Make me look like a Pixar character"\n• "Translate this to Yoruba"\n• "Weather in Lagos"\n• "500 USD to NGN"\n\nI understand natural language — no exact commands needed!`,
      { parse_mode: "Markdown" }
    );
    return;
  }


  const preRoute = (msg) => {
  if (msg.voice || msg.audio) {
    return { task: "transcription", requires_file: true, params: {}, confidence: "high" };
  }
  if (msg.video || msg.video_note) {
    const caption = (msg.caption || "").toLowerCase();
    if (caption.includes("gif") || caption.includes("convert")) return null;
    return { task: "transcription", requires_file: true, params: {}, confidence: "high" };
  }
  if (msg.photo && !msg.caption) {
    return { task: "background_removal", requires_file: true, params: {}, confidence: "high" };
  }
  if (msg.document && msg.document.mime_type === "application/pdf" && !msg.caption) {
    return { task: "pdf_compress", requires_file: true, params: {}, confidence: "high" };
  }
  return null;
};

  // ── Check active session ─────────────────────────────
  const session = getSession(userId);

  /**
   * Session-based routing — user tapped a menu button earlier,
   * now they're sending the input we asked for.
   * Skip Gemini entirely — we already know the task.
   */
  if (session?.step === "waiting_for_task_input") {
    // Validate they sent the right type of input
    const needsPhoto = ["background_removal", "background_blur", "background_swap",
      "cartoonify", "era_transform", "outfit_change", "painting_style",
      "professional_headshot", "action_figure", "caricature", "meme_generator"].includes(session.task);

    const needsDoc = ["pdf_compress", "pdf_convert"].includes(session.task);
    const needsAudio = ["transcription"].includes(session.task);

    if (needsPhoto && !msg.photo) {
      await bot.sendMessage(chatId, "📷 I need a photo for this task. Please send a photo!");
      return;
    }
    if (needsDoc && !msg.document) {
      await bot.sendMessage(chatId, "📄 I need a document for this task. Please send a file!");
      return;
    }
    if (needsAudio && !msg.voice && !msg.audio && !msg.video) {
      await bot.sendMessage(chatId, "🎙 I need an audio file or voice note for this task.");
      return;
    }

    await bot.sendMessage(chatId, "⚙️ Working on it...");

    // Build intent from session task + any caption params
    const intent = {
      task: session.task,
      requires_file: true,
      params: {
        ...session.params,
        // Pass caption as style/description for transform tasks
        style: msg.caption || "",
        description: msg.caption || "",
      },
      confidence: "high",
    };
    // Session: waiting for resize dimensions
// Session: waiting for resize dimensions
if (session?.step === "waiting_for_resize_dimensions" && msg.text) {
  const { handleResizeDimensionsInput } = require("../tasks/imageResizer");
  await handleResizeDimensionsInput(bot, chatId, userId, msg.text);
  return;
}

    clearSession(userId); // Clear before routing (task handler sets new session if needed)

    try {
      const result = await routeTask(bot, chatId, msg, intent);
      await logTask({
        userId,
        platform: "telegram",
        task: intent.task,
        status: result.success ? "success" : "failed",
        errorMessage: result.error || null,
      });
    } catch (err) {
      console.error("❌ Task failed:", err.message);
      await bot.sendMessage(chatId, "😕 Something went wrong. Please try again or type /menu");
    }
    return;
  }

  /**
   * Background swap step 2 — user sending their custom background photo
   */
  if (session?.step === "waiting_for_background" && msg.photo) {
    await bot.sendMessage(chatId, "⚙️ Working on it...");
    const { swapBackground } = require("../tasks/backgroundSwap");
    try {
      const result = await swapBackground(bot, chatId, msg);
      await logTask({ userId, platform: "telegram", task: "background_swap", status: result.success ? "success" : "failed" });
    } catch (err) {
      console.error("❌ Task failed:", err.message);
      await bot.sendMessage(chatId, "😕 Something went wrong. Please try again.");
    }
    return;
  }

  /**
   * Meme step 2 — user sending meme text
   */
  if (session?.step === "waiting_for_meme_text" && msg.text) {
    await bot.sendMessage(chatId, "⚙️ Working on it...");
    const { generateMeme } = require("../tasks/memeGenerator");
    try {
      const result = await generateMeme(bot, chatId, msg);
      await logTask({ userId, platform: "telegram", task: "meme_generator", status: result.success ? "success" : "failed" });
    } catch (err) {
      console.error("❌ Task failed:", err.message);
      await bot.sendMessage(chatId, "😕 Something went wrong. Please try again.");
    }
    return;
  }

  // ── No session — use pre-router then Gemini ──────────
  await bot.sendMessage(chatId, "⚙️ Working on it...");

  try {
    // Pre-router first (instant, no API call)
    let intent = preRoute(msg);

    // Gemini fallback for everything else
    if (!intent) {
      intent = await detectIntent(msg);
    }

    console.log(`📌 Intent: ${intent.task} | confidence: ${intent.confidence}`);

    const result = await routeTask(bot, chatId, msg, intent);

    await logTask({
      userId,
      platform: "telegram",
      task: intent.task,
      status: result.success ? "success" : "failed",
      errorMessage: result.error || null,
    });

  } catch (err) {
    console.error("❌ Task failed:", err.message);
    await bot.sendMessage(chatId, "😕 Something went wrong. Try /menu to pick a task directly.");
  }
};

module.exports = { handleUpdate };