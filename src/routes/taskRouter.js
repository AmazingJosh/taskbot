const { removeBackground } = require("../tasks/backgroundRemoval");
const { blurBackground } = require("../tasks/backgroundBlur");
const { swapBackground } = require("../tasks/backgroundSwap");
const { imageTransform } = require("../tasks/imageTransform");
const { generateMeme } = require("../tasks/memeGenerator");
const { transcribeAudio } = require("../tasks/transcription");

// ── Coming soon (uncomment as you set up each API) ────
// const { compressPDF } = require("../tasks/pdfCompress");
// const { translateText } = require("../tasks/translation");
// const { textToSpeech } = require("../tasks/textToSpeech");
// const { getWeather } = require("../tasks/weather");
// const { convertCurrency } = require("../tasks/currencyConvert");

const routeTask = async (bot, chatId, msg, intent) => {
  const { task, params } = intent;
  console.log(`📌 Routing task: ${task}`, params);

  switch (task) {
    // ── Image background ──────────────────────────────
    case "background_removal":
      return await removeBackground(bot, chatId, msg);
    case "background_blur":
      return await blurBackground(bot, chatId, msg);
    case "background_swap":
      return await swapBackground(bot, chatId, msg, params);

    // ── Image transforms ──────────────────────────────
    case "cartoonify":
      return await imageTransform(bot, chatId, msg, { ...params, transformType: "cartoonify" });
    case "era_transform":
      return await imageTransform(bot, chatId, msg, { ...params, transformType: "era" });
    case "outfit_change":
      return await imageTransform(bot, chatId, msg, { ...params, transformType: "outfit" });
    case "painting_style":
      return await imageTransform(bot, chatId, msg, { ...params, transformType: "painting" });
    case "professional_headshot":
      return await imageTransform(bot, chatId, msg, { ...params, transformType: "headshot" });
    case "action_figure":
      return await imageTransform(bot, chatId, msg, { ...params, transformType: "action_figure" });
    case "caricature":
      return await imageTransform(bot, chatId, msg, { ...params, transformType: "caricature" });

    // ── Meme generator ────────────────────────────────
    case "meme_generator":
      return await generateMeme(bot, chatId, msg, params);

    // ── Transcription ─────────────────────────────────
    case "transcription":
      return await transcribeAudio(bot, chatId, msg);

    // ── Coming soon ───────────────────────────────────
    // case "pdf_compress":
    //   return await compressPDF(bot, chatId, msg);
    // case "translation":
    //   return await translateText(bot, chatId, msg, params);
    // case "text_to_speech":
    //   return await textToSpeech(bot, chatId, msg, params);
    // case "weather":
    //   return await getWeather(bot, chatId, params);
    // case "currency_convert":
    //   return await convertCurrency(bot, chatId, params);

    case "unknown":
    default:
      await bot.sendMessage(
        chatId,
        "🤔 I'm not sure what you need. Type /menu to see everything I can do!"
      );
      return { success: false, error: "unknown_intent" };
  }
};

module.exports = { routeTask };