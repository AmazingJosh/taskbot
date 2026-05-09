const { handleResizeCallback } = require('../tasks/imageResizer');
const {
  MAIN_MENU,
  DOCS_MENU,
  MENU_MESSAGE,
  DOCS_MESSAGE,
  COMING_SOON_MESSAGE,
  TASK_PROMPTS,
} = require("./menu");
const { setSession } = require("../helpers/sessionStore");

const handleCallback = async (bot, callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;

  await bot.answerCallbackQuery(callbackQuery.id);

  // ── Coming soon ───────────────────────────────────
  if (data === "coming_soon") {
    return bot.sendMessage(chatId, COMING_SOON_MESSAGE, { parse_mode: "Markdown" });
  }

  // ── Menu navigation ───────────────────────────────
  if (data === "menu_main") {
    return bot.editMessageText(MENU_MESSAGE, {
      chat_id: chatId,
      message_id: callbackQuery.message.message_id,
      parse_mode: "Markdown",
      ...MAIN_MENU,
    });
  }

  if (data === "menu_docs") {
    return bot.editMessageText(DOCS_MESSAGE, {
      chat_id: chatId,
      message_id: callbackQuery.message.message_id,
      parse_mode: "Markdown",
      ...DOCS_MENU,
    });
  }

  // ── Resize mode selected
// ── Resize callbacks (platform tap or custom size)
if (data.startsWith('rz_')) {
  return handleResizeCallback(bot, callbackQuery);
}

  // ── Task selected ─────────────────────────────────
  if (data.startsWith("task_")) {
    const taskName = data.replace("task_", "");
    const prompt = TASK_PROMPTS[taskName];
    if (!prompt) return;

    setSession(userId, {
      step: "waiting_for_task_input",
      task: taskName,
      params: {},
    });

    await bot.sendMessage(chatId, prompt, { parse_mode: "Markdown" });
  }
};

module.exports = { handleCallback };