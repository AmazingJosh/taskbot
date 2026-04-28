const { detectIntent } = require("../services/intentEngine");
const { routeTask } = require("../routes/taskRouter");
const { findOrCreateUser } = require("../models/userModels");
const { logTask } = require("../models/taskModel");

const handleUpdate = async (bot, update) => {
  // Only handle messages for now
  if (!update.message) return;

  const msg = update.message;
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || msg.from.first_name;

  // Save/find user in DB
  await findOrCreateUser({ telegramId: userId, username, platform: "telegram" });

  // Handle /start command
  if (msg.text === "/start") {
    return bot.sendMessage(
      chatId,
      `👋 Hey ${username}! I'm *TaskBot* 🤖\n\nSend me a message or file and I'll get it done for you.\n\n*What I can do:*\n• 🖼 Remove image backgrounds\n• 📄 Compress & convert PDFs\n• 🎙 Transcribe voice notes\n• 🌍 Translate text\n• 🔊 Text to speech\n• 🌤 Weather lookup\n• 💱 Currency conversion\n• ...and more!\n\nJust tell me what you need.`,
      { parse_mode: "Markdown" }
    );
  }

  // Handle /help command
  if (msg.text === "/help") {
    return bot.sendMessage(
      chatId,
      `*TaskBot Commands & Examples* 🛠\n\n• "Remove the background from this photo"\n• "Compress this PDF"\n• "Transcribe this voice note"\n• "Translate this to French"\n• "Convert this text to speech"\n• "What's the weather in Lagos?"\n• "Convert 500 USD to NGN"\n\nJust send your request naturally — I'll figure it out!`,
      { parse_mode: "Markdown" }
    );
  }

  // Let user know we're working on it
  await bot.sendMessage(chatId, "⚙️ Working on it...");

  try {
    // Step 1: Detect what the user wants
    const intent = await detectIntent(msg);

    // Step 2: Route to the right handler
    const result = await routeTask(bot, chatId, msg, intent);

    // Step 3: Log the task
    await logTask({
      userId,
      platform: "telegram",
      task: intent.task,
      status: result.success ? "success" : "failed",
      errorMessage: result.error || null,
    });

  } catch (err) {
    console.error("❌ Task failed:", err.message);
    await bot.sendMessage(
      chatId,
      "😕 Something went wrong. Please try again or rephrase your request."
    );
  }
};

module.exports = { handleUpdate };