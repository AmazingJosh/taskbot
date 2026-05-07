const { removeBackground } = require('../tasks/backgroundRemoval');
const { blurBackground } = require('../tasks/backgroundBlur');
const { swapBackground } = require('../tasks/backgroundSwap');
const { imageTransform } = require('../tasks/imageTransform');
const { generateMeme } = require('../tasks/memeGenerator');
const { imageResize } = require('../tasks/imageResizer');
const { transcribeAudio } = require('../tasks/transcription');
const {
  compressPDF,
  pdfToWord,
  officeToPDF,
  pdfToJPG,
  imageToPDF,
  mergePDFs,
  splitPDF,
  unlockPDF,
  repairPDF,
} = require('../tasks/pdfTools');

// ── Coming soon ───────────────────────────────────────
// const { translateText } = require('../tasks/translation');
// const { textToSpeech } = require('../tasks/textToSpeech');

const routeTask = async (bot, chatId, msg, intent) => {
  const { task, params } = intent;
  console.log(`📌 Routing task: ${task}`, params);

  switch (task) {
    // ── Image background ──────────────────────────────
    case 'background_removal':
      return await removeBackground(bot, chatId, msg);
    case 'background_blur':
      return await blurBackground(bot, chatId, msg);
    case 'background_swap':
      return await swapBackground(bot, chatId, msg, params);

    // ── Image transforms ──────────────────────────────
    case 'cartoonify':
      return await imageTransform(bot, chatId, msg, { ...params, transformType: 'cartoonify' });
    case 'era_transform':
      return await imageTransform(bot, chatId, msg, { ...params, transformType: 'era' });
    case 'outfit_change':
      return await imageTransform(bot, chatId, msg, { ...params, transformType: 'outfit' });
    case 'painting_style':
      return await imageTransform(bot, chatId, msg, { ...params, transformType: 'painting' });
    case 'professional_headshot':
      return await imageTransform(bot, chatId, msg, { ...params, transformType: 'headshot' });
    case 'action_figure':
      return await imageTransform(bot, chatId, msg, { ...params, transformType: 'action_figure' });
    case 'caricature':
      return await imageTransform(bot, chatId, msg, { ...params, transformType: 'caricature' });

    // ── Meme generator ────────────────────────────────
    case 'meme_generator':
      return await generateMeme(bot, chatId, msg, params);

    // ── Transcription ─────────────────────────────────
    case 'image_resize':
      return await imageResize(bot, chatId, msg, params);

    case 'transcription':
      return await transcribeAudio(bot, chatId, msg);

    // ── PDF tools ─────────────────────────────────────
    case 'pdf_compress':
      return await compressPDF(bot, chatId, msg);
    case 'pdf_to_word':
      return await pdfToWord(bot, chatId, msg);
    case 'office_to_pdf':
      return await officeToPDF(bot, chatId, msg);
    case 'pdf_to_jpg':
      return await pdfToJPG(bot, chatId, msg);
    case 'image_to_pdf':
      return await imageToPDF(bot, chatId, msg);
    case 'pdf_merge':
      return await mergePDFs(bot, chatId, msg, params);
    case 'pdf_split':
      return await splitPDF(bot, chatId, msg, params);
    case 'pdf_unlock':
      return await unlockPDF(bot, chatId, msg);
    case 'pdf_repair':
      return await repairPDF(bot, chatId, msg);

    case 'unknown':
    default:
      await bot.sendMessage(
        chatId,
        '🤔 Not sure what you need. Type /menu to see everything I can do!'
      );
      return { success: false, error: 'unknown_intent' };
  }
};

module.exports = { routeTask };