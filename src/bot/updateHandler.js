const { detectIntent, conversationalResponse } = require("../services/intentEngine");
const { routeTask } = require("../routes/taskRouter");
const { findOrCreateUser } = require("../models/userModels");
const { logTask } = require("../models/taskModel");
const { getSession, clearSession, setLastTask, getLastTask } = require("../helpers/sessionStore");
const { addMessage, getHistory, clearHistory } = require("../helpers/conversationHistory");
const { handleCallback } = require("./callbackHandler");
const { MAIN_MENU, WELCOME_MESSAGE, MENU_MESSAGE } = require("./menu");

const preRoute = (msg, lastTaskContext) => {
  const lastTask = lastTaskContext?.lastTask;
  if (lastTask === 'image_resize' && msg.photo) {
    return { task: 'image_resize', requires_file: true, params: {}, confidence: 'high' };
  }
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

/**
 * Describe what the user sent for conversation history
 */
const describeMessage = (msg) => {
  if (msg.text)     return msg.text;
  if (msg.photo)    return `[sent a photo${msg.caption ? `: "${msg.caption}"` : ''}]`;
  if (msg.voice)    return '[sent a voice note]';
  if (msg.audio)    return '[sent an audio file]';
  if (msg.document) return `[sent a document: ${msg.document.file_name || msg.document.mime_type}]`;
  if (msg.video)    return '[sent a video]';
  return '[sent a message]';
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
    await clearHistory(userId); // fresh start
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
      `*How to use Taskify* 🛠\n\n*Option 1 — Just talk to me:*\nTell me what you need in plain English!\n• "Remove the background from this photo"\n• "Resize this for WhatsApp"\n• "Compress this PDF"\n\n*Option 2 — Tap the menu:*\nType /menu and tap any button\n\n*Option 3 — Just send a file:*\n• Send a photo → I remove the background\n• Send a PDF → I compress it\n• Send a Word file → I convert to PDF\n\nI understand natural language — just talk to me! 😊`,
      { parse_mode: 'Markdown' }
    );
  }

  // ── Session check ─────────────────────────────────────
  const session         = await getSession(userId);
  const lastTaskContext = await getLastTask(userId);

  // Resize: waiting for dimensions
  if (session?.step === 'waiting_for_resize_dimensions' && msg.text) {
    const { handleResizeDimensionsInput } = require('../tasks/imageResize');
    await handleResizeDimensionsInput(bot, chatId, userId, msg.text);
    return;
  }

  // Resize: waiting for platform selection, user types instead of tapping
  if (session?.step === 'waiting_for_resize_platform' && msg.text) {
    const { handleResizeDimensionsInput } = require('../tasks/imageResize');
    await handleResizeDimensionsInput(bot, chatId, userId, msg.text);
    return;
  }

  // Resize: user sends new photo while in resize session
  if ((session?.step === 'waiting_for_resize_dimensions' ||
       session?.step === 'waiting_for_resize_platform') && msg.photo) {
    const { imageResize } = require('../tasks/imageResize');
    await imageResize(bot, chatId, msg, {});
    return;
  }

  // PDF merge
  if (session?.step === 'waiting_for_merge_files') {
    const { mergePDFs } = require('../tasks/pdfTools');
    await bot.sendMessage(chatId, '⚙️ On it...');
    try { await mergePDFs(bot, chatId, msg); }
    catch (err) {
      console.error('❌ Merge failed:', err.message);
      await bot.sendMessage(chatId, '😕 Something went wrong. Please try again.');
    }
    return;
  }

  // Background swap step 2
  if (session?.step === 'waiting_for_background' && msg.photo) {
    await bot.sendMessage(chatId, '⚙️ On it...');
    const { swapBackground } = require('../tasks/backgroundSwap');
    try { await swapBackground(bot, chatId, msg); }
    catch (err) {
      console.error('❌ Task failed:', err.message);
      await bot.sendMessage(chatId, '😕 Something went wrong. Please try again.');
    }
    return;
  }

  // Meme step 2
  if (session?.step === 'waiting_for_meme_text' && msg.text) {
    await bot.sendMessage(chatId, '⚙️ On it...');
    const { generateMeme } = require('../tasks/memeGenerator');
    try { await generateMeme(bot, chatId, msg); }
    catch (err) {
      console.error('❌ Task failed:', err.message);
      await bot.sendMessage(chatId, '😕 Something went wrong. Please try again.');
    }
    return;
  }

  // Menu tap: waiting for file input
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

    if (!isMerge) await clearSession(userId);

    try {
      const result = await routeTask(bot, chatId, msg, intent);
      await setLastTask(userId, intent.task);
      await logTask({
        userId, platform: 'telegram', task: intent.task,
        status: result.success ? 'success' : 'failed',
        errorMessage: result.error || null,
      });
    } catch (err) {
      console.error('❌ Task failed:', err.message);
      await bot.sendMessage(chatId, '😕 Something went wrong. Please try again or type /menu');
    }
    return;
  }

  // ── No session — detect intent ────────────────────────
  try {
    // Pre-router first (instant, no API)
    let intent = preRoute(msg, lastTaskContext);

    // Gemini router fallback
    if (!intent) {
      intent = await detectIntent(msg, lastTaskContext);
    }

    console.log(`📌 Intent: ${intent.task} | confidence: ${intent.confidence}`);

    // ── CONVERSATION MODE ─────────────────────────────
    if (intent.task === 'converse') {
      // Save user message to history
      const userText = describeMessage(msg);
      await addMessage(userId, 'user', userText);

      // Get conversation history for context
      const history = await getHistory(userId);

      // Let Taskify respond naturally
      const response = await conversationalResponse(userText, history);

      // Save Taskify's response to history
      await addMessage(userId, 'assistant', response);

      await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
      return;
    }

    // ── TASK MODE ────────────────────────────────────
    await bot.sendMessage(chatId, '⚙️ On it...');

    // Save to conversation history
    await addMessage(userId, 'user', describeMessage(msg));

    const result = await routeTask(bot, chatId, msg, intent);
    await setLastTask(userId, intent.task);

    // Save task completion to history
    await addMessage(userId, 'assistant', `[completed task: ${intent.task}]`);

    await logTask({
      userId, platform: 'telegram', task: intent.task,
      status: result.success ? 'success' : 'failed',
      errorMessage: result.error || null,
    });

  } catch (err) {
    console.error('❌ Failed:', err.message);
    await bot.sendMessage(
      chatId,
      '😕 Something went wrong on my end. Try again or type /menu to pick a task directly.'
    );
  }
};

module.exports = { handleUpdate };