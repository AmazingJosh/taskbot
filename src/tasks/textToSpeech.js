const axios = require("axios");

const textToSpeech = async (bot, chatId, msg, params) => {
  const text = msg.text || msg.caption;

  if (!text) {
    await bot.sendMessage(chatId, "✍️ Please send text you want converted to speech.");
    return { success: false, error: "no_text" };
  }

  await bot.sendMessage(chatId, "🔊 Converting to speech...");

  // ElevenLabs default voice ID (Rachel - neutral, clear)
  const voiceId = "21m00Tcm4TlvDq8ikWAM";

  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      text,
      model_id: "eleven_monolingual_v1",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    },
    {
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      responseType: "arraybuffer",
    }
  );

  await bot.sendAudio(chatId, Buffer.from(response.data), {
    caption: "🔊 Here's your audio!",
  }, {
    filename: "speech.mp3",
    contentType: "audio/mpeg",
  });

  return { success: true };
};

module.exports = { textToSpeech };