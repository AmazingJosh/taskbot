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

  // ── Resize mode selected ──────────────────────────
  if (data.startsWith("resize_")) {
    const handleResizeCallback = async (bot, callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const userId = callbackQuery.from.id;
  const data   = callbackQuery.data;

  await bot.answerCallbackQuery(callbackQuery.id);

  const parts  = data.split('_');
  const mode   = parts[1];
  const width  = parseInt(parts[2]);
  const height = parseInt(parts[3]);

  console.log(`📐 Resize callback: mode=${mode} width=${width} height=${height}`);

  const session = getSession(userId);
  console.log(`📐 Session:`, session);

  if (!session?.imageUrl) {
    await bot.sendMessage(chatId, '⏰ Session expired. Please send the image again.');
    return;
  }

  // Use sendMessage instead of editMessageText — more reliable
  await bot.sendMessage(chatId, `⚙️ Resizing to *${width}x${height}* (${mode} mode)...`, { parse_mode: 'Markdown' });

  try {
    console.log(`📥 Downloading image from:`, session.imageUrl);
    const response = await axios.get(session.imageUrl, { responseType: 'arraybuffer' });
    console.log(`✅ Downloaded, size:`, response.data.byteLength);

    const resized = await resizeImage(Buffer.from(response.data), width, height, mode);
    console.log(`✅ Resized successfully`);

    const meta = await sharp(resized).metadata();

    await bot.sendDocument(chatId, resized, {
      caption: `✅ Done! Resized to *${meta.width}x${meta.height}px*`,
    }, { filename: `resized_${width}x${height}.jpg`, contentType: 'image/jpeg' });

    await deleteFromCloudinary(session.publicId, session.resourceType);
    clearSession(userId);

  } catch (err) {
    console.error('❌ Resize failed:', err.message);
    await bot.sendMessage(chatId, `😕 Resize failed: ${err.message}`);
    clearSession(userId);
  }
};
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