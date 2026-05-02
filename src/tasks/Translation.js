const axios = require("axios");

const translateText = async (bot, chatId, msg, params) => {
  const text = msg.text || msg.caption;

  if (!text) {
    await bot.sendMessage(chatId, "✍️ Please send some text to translate.");
    return { success: false, error: "no_text" };
  }

  const targetLang = params?.target_language?.toUpperCase() || "EN";

  await bot.sendMessage(chatId, `🌍 Translating to ${targetLang}...`);

  const response = await axios.post(
    "https://api-free.deepl.com/v2/translate",
    new URLSearchParams({
      auth_key: process.env.DEEPL_API_KEY,
      text,
      target_lang: targetLang,
    })
  );

  const translated = response.data.translations[0].text;
  const detectedLang = response.data.translations[0].detected_source_language;

  await bot.sendMessage(
    chatId,
    `🌍 *Translation* (${detectedLang} → ${targetLang}):\n\n${translated}`,
    { parse_mode: "Markdown" }
  );

  return { success: true };
};

module.exports = { translateText };