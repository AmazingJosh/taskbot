const {
  detectIntent,
  conversationalResponse,
  featureRequestResponse,
  getWhatNextMessage,
  SUGGESTION_PROMPT,
} = require("../services/intentEngine");
const { routeTask }       = require("../routes/taskRouter");
const { findOrCreateUser } = require("../models/userModels");
const { logTask }          = require("../models/taskModel");
const {
  getSession, clearSession,
  setLastTask, getLastTask,
} = require("../helpers/sessionStore");
const { addMessage, getHistory, clearHistory } = require("../helpers/conversationHistory");
const { notifyAdmin }     = require("../helpers/adminNotifier");
const { handleCallback }  = require("./callbackHandler");
const { MAIN_MENU, WELCOME_MESSAGE, MENU_MESSAGE } = require("./menu");

// Track how many tasks a user has done this session
// Used to decide when to show the suggestion prompt
const taskCounts = new Map();

const getTaskCount = (userId) => taskCounts.get(String(userId)) || 0;
const incrementTaskCount = (userId) => {
  const count = getTaskCount(userId) + 1;
  taskCounts.set(String(userId), count);
  return count;
};

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

const describeMessage = (msg) => {
  if (msg.text)     return msg.text;
  if (msg.photo)    return `[sent a photo${msg.caption ? `: "${msg.caption}"` : ''}]`;
  if (msg.voice)    return '[sent a voice note]';
  if (msg.audio)    return '[sent an audio file]';
  if (msg.document) return `[sent: ${msg.document.file_name || msg.document.mime_type}]`;
  if (msg.video)    return '[sent a video]';
  return '[sent a message]';
};

/**
 * Send "what next?" after every completed task.
 * Every 3rd task, also show the suggestion prompt.
 */
const sendWhatNext = async (bot, chatId, userId) => {
  const count = incrementTaskCount(userId);
  let message = getWhatNextMessage();

  // Every 3rd completed task — invite suggestions
  if (count % 3 === 0) {
    message += SUGGESTION_PROMPT;
  }

  await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
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
    await clearHistory(userId);
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
      `*How to use Taskify* 🛠\n\n*Just talk to me naturally:*\n• "Remove the background from this photo"\n• "Resize this for WhatsApp"\n• "Compress this PDF"\n• "I need to convert a Word doc to PDF"\n\n*Or tap the menu:* /menu\n\n*Or just send a file* — I'll figure out what to do!\n\n💡 Have a feature idea? Just tell me — I'm always building!`,
      { parse_mode: 'Markdown' }
    );
  }

  // ── Session check ─────────────────────────────────────
  const session         = await getSession(userId);
  const lastTaskContext = await getLastTask(userId);

  if (session?.step === 'waiting_for_resize_dimensions' && msg.text) {
    const { handleResizeDimensionsInput } = require('../tasks/imageResizer');
    await handleResizeDimensionsInput(bot, chatId, userId, msg.text);
    return;
  }

  if (session?.step === 'waiting_for_resize_platform' && msg.text) {
    const { handleResizeDimensionsInput } = require('../tasks/imageResizer');
    await handleResizeDimensionsInput(bot, chatId, userId, msg.text);
    return;
  }

  if ((session?.step === 'waiting_for_resize_dimensions' ||
       session?.step === 'waiting_for_resize_platform') && msg.photo) {
    const { imageResize } = require('../tasks/imageResizer');
    await imageResize(bot, chatId, msg, {});
    return;
  }

  if (session?.step === 'waiting_for_merge_files') {
    const { mergePDFs } = require('../tasks/pdfTools');
    await bot.sendMessage(chatId, '⚙️ On it...');
    try {
      const result = await mergePDFs(bot, chatId, msg);
      if (result?.success) await sendWhatNext(bot, chatId, userId);
    } catch (err) {
      console.error('❌ Merge failed:', err.message);
      await bot.sendMessage(chatId, '😕 Something went wrong. Please try again.');
    }
    return;
  }

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

  if (session?.step === 'waiting_for_task_input') {
    const needsPhoto = ['background_removal', 'background_blur', 'image_resize'].includes(session.task);
    const needsDoc   = ['pdf_compress', 'pdf_to_word', 'office_to_pdf', 'pdf_to_jpg',
                        'pdf_split', 'pdf_unlock', 'pdf_repair'].includes(session.task);
    const needsImage = ['image_to_pdf'].includes(session.task);
    const isMerge    = session.task === 'pdf_merge';

    if (needsPhoto && !msg.photo) return bot.sendMessage(chatId, '📷 I need a photo for this. Please send one!');
    if (needsDoc && !msg.document) return bot.sendMessage(chatId, '📄 I need a document for this. Please send a file!');
    if (needsImage && !msg.photo && !msg.document) return bot.sendMessage(chatId, '🖼 I need an image for this. Please send one!');

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
      if (result?.success) await sendWhatNext(bot, chatId, userId);
      await logTask({
        userId, platform: 'telegram', task: intent.task,
        status: result?.success ? 'success' : 'failed',
        errorMessage: result?.error || null,
      });
    } catch (err) {
      console.error('❌ Task failed:', err.message);
      await bot.sendMessage(chatId, '😕 Something went wrong. Please try again or type /menu');
    }
    return;
  }

  // ── No session — detect intent ────────────────────────
  try {
    let intent = preRoute(msg, lastTaskContext);
    if (!intent) intent = await detectIntent(msg, lastTaskContext);

    console.log(`📌 Intent: ${intent.task} | confidence: ${intent.confidence}`);

    // ── FEATURE REQUEST ───────────────────────────────
    if (intent.task === 'feature_request') {
      const userText  = msg.text || msg.caption || describeMessage(msg);
      const response  = await featureRequestResponse(userText);
      await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });

      // Notify admin silently
      await notifyAdmin(bot, 'feature_request', {
        userId,
        username,
        text: userText,
      });

      await addMessage(userId, 'user', userText);
      await addMessage(userId, 'assistant', response);
      return;
    }

    // ── SUGGESTION ────────────────────────────────────
    if (intent.task === 'suggestion') {
      const userText = msg.text || describeMessage(msg);
      const response = `🌟 Love that idea! I've noted it — the builder will see this and it might just become the next feature! 🍳\n\nAnything else I can help you with right now?`;
      await bot.sendMessage(chatId, response);

      // Notify admin
      await notifyAdmin(bot, 'suggestion', { userId, username, text: userText });

      await addMessage(userId, 'user', userText);
      await addMessage(userId, 'assistant', response);
      return;
    }

    // ── CONVERSATION ──────────────────────────────────
    if (intent.task === 'converse') {
      const userText = describeMessage(msg);
      await addMessage(userId, 'user', userText);
      const history  = await getHistory(userId);
      const response = await conversationalResponse(userText, history);
      await addMessage(userId, 'assistant', response);
      await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
      return;
    }

    // ── TASK ──────────────────────────────────────────
    await bot.sendMessage(chatId, '⚙️ On it...');
    await addMessage(userId, 'user', describeMessage(msg));

    const result = await routeTask(bot, chatId, msg, intent);
    await setLastTask(userId, intent.task);
    await addMessage(userId, 'assistant', `[completed: ${intent.task}]`);

    // Show "what next?" after every successful task
    if (result?.success) await sendWhatNext(bot, chatId, userId);

    await logTask({
      userId, platform: 'telegram', task: intent.task,
      status: result?.success ? 'success' : 'failed',
      errorMessage: result?.error || null,
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