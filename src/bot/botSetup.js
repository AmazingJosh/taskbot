const TelegramBot = require("node-telegram-bot-api");

let bot;

const initBot = async () => {
  bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);

  // Register webhook with Telegram
  const webhookUrl = `${process.env.WEBHOOK_URL}/webhook`;
  await bot.setWebHook(webhookUrl);
  console.log(`✅ Telegram webhook set → ${webhookUrl}`);
};

const getBot = () => {
  if (!bot) throw new Error("Bot not initialized yet");
  return bot;
};

module.exports = { initBot, getBot };