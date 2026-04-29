const { removeBackground } = require("../tasks/backgroundRemoval");
// const { compressPDF } = require("../tasks/pdfCompress");
const { transcribeAudio } = require("../tasks/transcription");
// const { translateText } = require("../../tasks/translation");
// const { textToSpeech } = require("../../tasks/textToSpeech");
// const { getWeather } = require("../../tasks/weather");
// const { convertCurrency } = require("../../tasks/currencyConvert");

/**
 * Routes the detected intent to the correct task handler.
 * Each handler receives (bot, chatId, msg, params) and
 * returns { success: true } or { success: false, error: string }
 */
const routeTask = async (bot, chatId, msg, intent) => {
  const { task, params } = intent;

  console.log(`📌 Routing task: ${task}`, params);

  switch (task) {
    case "background_removal":
      return await removeBackground(bot, chatId, msg);

    // case "pdf_compress":
    //   return await compressPDF(bot, chatId, msg);

    // case "transcription":
    //   return await transcribeAudio(bot, chatId, msg);

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
        "🤔 I'm not sure what you need. Try rephrasing or type /help to see what I can do."
      );
      return { success: false, error: "unknown_intent" };
  }
};

module.exports = { routeTask };