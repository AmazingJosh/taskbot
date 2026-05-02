const { MAIN_MENU, IMAGE_MENU, DOCS_MENU, LANGUAGE_MENU, INFO_MENU, TASK_PROMPTS } = require("./menu");
const { setSession } = require("../helpers/sessionStore");

/**
 * Handles all Telegram inline keyboard button taps.
 * 
 * callback_data format:
 * - "menu_X"  → navigate to a submenu
 * - "task_X"  → user selected a specific task
 */
const handleCallback = async (bot, callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;

  // Always acknowledge the button tap (removes loading spinner)
  await bot.answerCallbackQuery(callbackQuery.id);

  // ── Menu navigation ────────────────────────────────
  if (data === "menu_main") {
    return bot.editMessageText(
      "🤖 *TaskBot Menu* — what do you need?",
      { chat_id: chatId, message_id: callbackQuery.message.message_id, parse_mode: "Markdown", ...MAIN_MENU }
    );
  }

  if (data === "menu_image") {
    return bot.editMessageText(
      "🖼 *Image Magic* — pick a task:",
      { chat_id: chatId, message_id: callbackQuery.message.message_id, parse_mode: "Markdown", ...IMAGE_MENU }
    );
  }

  if (data === "menu_docs") {
    return bot.editMessageText(
      "📄 *Documents* — pick a task:",
      { chat_id: chatId, message_id: callbackQuery.message.message_id, parse_mode: "Markdown", ...DOCS_MENU }
    );
  }

  if (data === "menu_language") {
    return bot.editMessageText(
      "🌍 *Language & Text* — pick a task:",
      { chat_id: chatId, message_id: callbackQuery.message.message_id, parse_mode: "Markdown", ...LANGUAGE_MENU }
    );
  }

  if (data === "menu_info") {
    return bot.editMessageText(
      "🌤 *Info & Tools* — pick a task:",
      { chat_id: chatId, message_id: callbackQuery.message.message_id, parse_mode: "Markdown", ...INFO_MENU }
    );
  }

  // ── Task selected ──────────────────────────────────
  if (data.startsWith("task_")) {
    const taskName = data.replace("task_", "");
    const prompt = TASK_PROMPTS[taskName];

    if (!prompt) return;

    // Save session so when user sends next message/file
    // we know exactly what task to run — no AI needed
    setSession(userId, {
      step: "waiting_for_task_input",
      task: taskName,
      params: {},
    });

    await bot.sendMessage(chatId, prompt, { parse_mode: "Markdown" });
  }
};

module.exports = { handleCallback };