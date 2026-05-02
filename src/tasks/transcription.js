const { AssemblyAI } = require("assemblyai");
const { uploadFileFromTelegram, deleteFromCloudinary } = require("../helpers/fileHelper");

const client = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY });

const transcribeAudio = async (bot, chatId, msg) => {
  const voice = msg.voice || msg.audio || msg.video_note || msg.video;

  if (!voice) {
    await bot.sendMessage(chatId, "🎙 Please send a voice note, audio file, or video.");
    return { success: false, error: "no_audio" };
  }

  await bot.sendMessage(chatId, "🎙 Transcribing... this takes ~15 seconds.");

  const { url, publicId, resourceType } = await uploadFileFromTelegram(
    voice.file_id,
    "taskbot/audio"
  );

  // Minimal params — no speech_models, no extras
  // AssemblyAI default model handles everything
  const transcript = await client.transcripts.transcribe({
    audio: url,
  });

  if (transcript.status === "error") {
    throw new Error(`AssemblyAI error: ${transcript.error}`);
  }

  const text = transcript.text?.trim();

  if (!text) {
    await bot.sendMessage(chatId, "🤔 Couldn't detect any speech. Please try with a clearer recording.");
    return { success: false, error: "no_speech_detected" };
  }

  await bot.sendMessage(chatId, `📝 *Transcript:*\n\n${text}`, { parse_mode: "Markdown" });

  await deleteFromCloudinary(publicId, resourceType);
  return { success: true };
};

module.exports = { transcribeAudio };