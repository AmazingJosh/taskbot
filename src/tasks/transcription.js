const axios = require("axios");
const { uploadFileFromTelegram, deleteFromCloudinary } = require("../helpers/fileHelper");

const ASSEMBLYAI_KEY = process.env.ASSEMBLYAI_API_KEY;
const BASE_URL = "https://api.assemblyai.com/v2";

const transcribeAudio = async (bot, chatId, msg) => {
  const voice = msg.voice || msg.audio || msg.video_note;

  if (!voice) {
    await bot.sendMessage(chatId, "🎙 Please send a voice note or audio file.");
    return { success: false, error: "no_audio" };
  }

  await bot.sendMessage(chatId, "🎙 Transcribing your audio... this may take a moment.");

  // Step 1: Upload audio to Cloudinary
  const { url, publicId, resourceType } = await uploadFileFromTelegram(voice.file_id, "taskbot/audio");

  // Step 2: Submit transcription job to AssemblyAI
  const submitRes = await axios.post(
    `${BASE_URL}/transcript`,
    { audio_url: url },
    { headers: { authorization: ASSEMBLYAI_KEY } }
  );

  const transcriptId = submitRes.data.id;

  // Step 3: Poll until transcription is complete
  let transcript;
  while (true) {
    await new Promise((r) => setTimeout(r, 3000)); // wait 3s between polls

    const pollRes = await axios.get(`${BASE_URL}/transcript/${transcriptId}`, {
      headers: { authorization: ASSEMBLYAI_KEY },
    });

    if (pollRes.data.status === "completed") {
      transcript = pollRes.data.text;
      break;
    } else if (pollRes.data.status === "error") {
      throw new Error("AssemblyAI transcription failed");
    }
  }

  // Step 4: Send transcript back to user
  await bot.sendMessage(chatId, `📝 *Transcript:*\n\n${transcript}`, {
    parse_mode: "Markdown",
  });

  // Cleanup
  await deleteFromCloudinary(publicId, resourceType);

  return { success: true };
};

module.exports = { transcribeAudio };