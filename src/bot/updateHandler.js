const { detectIntent } = require("../services/intentEngine");
const { routeTask } = require("../routes/taskRouter");
const { findOrCreateUser } = require("../models/userModels");
const { logTask } = require("../models/taskModel");
const { getSession, clearSession, setLastTask, getLastTask } = require("../helpers/sessionStore");
const { handleCallback } = require("./callbackHandler");
const { MAIN_MENU, WELCOME_MESSAGE, MENU_MESSAGE } = require("./menu");

/**
 * Pre-router — catches obvious intents from file type alone.
 * BUT respects last task context — if user was resizing,
 * sending another photo means resize again, not remove bg.
 */
const preRoute = (msg, lastTaskContext) => {
  const lastTask = lastTaskContext?.lastTask;

  // If last task was resize and user sends photo → resize again
  if (lastTask === 'image_resize' && msg.photo) {
    return { task: 'image_resize', requires_file: true, params: {}, confidence: 'high' };
  }

  // Standard pre-routing
  if (msg.voice || msg.audio) {
    return { task: 'transcription', requires_file: true, params: {}, confidence: 'high' };
  }
  if (msg.video || msg.video_note) {
    const caption = (msg.caption || '').toLowerCase();
    if (caption.includes('gif') || caption.includes('convert')) return null;
    return { task: 'transcription', requires_file: true, params: {}, confidence: 'high' };
  }
  if (msg.photo && !msg.caption) {
    return { task: 'background_removal', requires_file: true, params: {}, confidence: 'high' };
  }
  if (msg.document && msg.document.mime_type === 'application/pdf' && !msg.caption) {
    return { task: 'pdf_compress', requires_file: true, params: {}, confidence: 'high' };
  }
  return null;
};

const handleUpdate = async (bot, update) => {
  if (update.callback_query) {
    return handleCallback(bot, update.callback_query);
  }

  if (!update.message) return;

  const msg      = update.message;
  const chatId   = msg.chat.id;
  const userId   = msg.from.id;
  const username = msg.from.first_name || msg.from.username || 'there';

  await findOrCreateUser({ telegramId: userId, username, platform: 'telegram' });

  // ── Commands ─────────────────────────────────────────
  if (msg.text === '/start') {
    return bot.sendMessage(
      chatId,
      WELCOME_MESSAGE.replace('{name}', username),
      { parse_mode: 'Markdown', ...MAIN_MENU }
    );
  }

  if (msg.text === '/menu') {
    return bot.sendMessage(chatId, MENU_MESSAGE, { parse_mode: 'Markdown', ...MAIN_MENU });
  }

  if (msg.text === '/help') {
    return bot.sendMessage(
      chatId,
      `*How to use LifeBot* 🛠\n\n*Option 1 — Tap the menu:*\nType /menu and tap any button\n\n*Option 2 — Just send a file:*\n• Send a photo → removes background\n• Send a PDF → compresses it\n• Send a Word file → converts to PDF\n\n*Option 3 — Tell me what you need:*\n• "Remove the background from this"\n• "Resize this to whatsapp dp"\n• "Compress this PDF"\n\nNo exact commands needed!`,
      { parse_mode: 'Markdown' }
    );
  }

  // ── Session check ─────────────────────────────────────
  const session = getSession(userId);
  const lastTaskContext = getLastTask(userId);

  // Resize: waiting for dimensions text input
  if (session?.step === 'waiting_for_resize_dimensions' && msg.text) {
    const { handleResizeDimensionsInput } = require('../tasks/imageResize');
    await handleResizeDimensionsInput(bot, chatId, userId, msg.text);
    return;
  }

  // Resize: user sends another photo while in resize context — start resize flow
  if (session?.step === 'waiting_for_resize_dimensions' && msg.photo) {
    const { imageResize } = require('../tasks/imageResize');
    await imageResize(bot, chatId, msg, {});
    return;
  }

  // PDF merge: collecting files
  if (session?.step === 'waiting_for_merge_files') {
    const { mergePDFs } = require('../tasks/pdfTools');
    await bot.sendMessage(chatId, '⚙️ On it...');
    try {
      await mergePDFs(bot, chatId, msg);
    } catch (err) {
      console.error('❌ Merge failed:', err.message);
      await bot.sendMessage(chatId, '😕 Something went wrong. Please try again.');
    }
    return;
  }

  // Background swap: step 2
  if (session?.step === 'waiting_for_background' && msg.photo) {
    await bot.sendMessage(chatId, '⚙️ On it...');
    const { swapBackground } = require('../tasks/backgroundSwap');
    try {
      await swapBackground(bot, chatId, msg);
    } catch (err) {
      console.error('❌ Task failed:', err.message);
      await bot.sendMessage(chatId, '😕 Something went wrong. Please try again.');
    }
    return;
  }

  // Meme: step 2
  if (session?.step === 'waiting_for_meme_text' && msg.text) {
    await bot.sendMessage(chatId, '⚙️ On it...');
    const { generateMeme } = require('../tasks/memeGenerator');
    try {
      await generateMeme(bot, chatId, msg);
    } catch (err) {
      console.error('❌ Task failed:', err.message);
      await bot.sendMessage(chatId, '😕 Something went wrong. Please try again.');
    }
    return;
  }

  // Menu tap: waiting for task input
  if (session?.step === 'waiting_for_task_input') {
    const needsPhoto = ['background_removal', 'background_blur', 'image_resize'].includes(session.task);
    const needsDoc   = ['pdf_compress', 'pdf_to_word', 'office_to_pdf', 'pdf_to_jpg',
                        'pdf_split', 'pdf_unlock', 'pdf_repair'].includes(session.task);
    const needsImage = ['image_to_pdf'].includes(session.task);
    const isMerge    = session.task === 'pdf_merge';

    if (needsPhoto && !msg.photo) {
      return bot.sendMessage(chatId, '📷 I need a photo for this. Please send a photo!');
    }
    if (needsDoc && !msg.document) {
      return bot.sendMessage(chatId, '📄 I need a document for this. Please send a file!');
    }
    if (needsImage && !msg.photo && !msg.document) {
      return bot.sendMessage(chatId, '🖼 I need an image for this. Please send one!');
    }

    await bot.sendMessage(chatId, '⚙️ On it...');

    const intent = {
      task: session.task,
      requires_file: true,
      params: { style: msg.caption || '', description: msg.caption || '' },
      confidence: 'high',
    };

    if (!isMerge) clearSession(userId);

    try {
      const result = await routeTask(bot, chatId, msg, intent);
      // Save last task context for smarter future routing
      setLastTask(userId, intent.task);
      await logTask({
        userId,
        platform: 'telegram',
        task: intent.task,
        status: result.success ? 'success' : 'failed',
        errorMessage: result.error || null,
      });
    } catch (err) {
      console.error('❌ Task failed:', err.message);
      await bot.sendMessage(chatId, '😕 Something went wrong. Please try again or type /menu');
    }
    return;
  }

  // ── No session — pre-route then Gemini ───────────────
  await bot.sendMessage(chatId, '⚙️ On it...');

  try {
    // Pre-router uses last task context for smarter defaults
    let intent = preRoute(msg, lastTaskContext);

    // Gemini fallback — pass last task context so it understands the flow
    if (!intent) {
      intent = await detectIntent(msg, lastTaskContext);
    }

    console.log(`📌 Intent: ${intent.task} | confidence: ${intent.confidence}`);

    const result = await routeTask(bot, chatId, msg, intent);

    // Save last task so next message has context
    setLastTask(userId, intent.task);

    await logTask({
      userId,
      platform: 'telegram',
      task: intent.task,
      status: result.success ? 'success' : 'failed',
      errorMessage: result.error || null,
    });

  } catch (err) {
    console.error('❌ Task failed:', err.message);
    await bot.sendMessage(chatId, '😕 Something went wrong. Try /menu to pick a task directly.');
  }
};

module.exports = { handleUpdate };