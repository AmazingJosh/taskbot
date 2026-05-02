const axios = require("axios");

const convertCurrency = async (bot, chatId, params) => {
  const { amount, from_currency, to_currency } = params || {};

  if (!amount || !from_currency || !to_currency) {
    await bot.sendMessage(chatId, "💱 Please specify amount and currencies. e.g. 'Convert 500 USD to NGN'");
    return { success: false, error: "missing_params" };
  }

  const from = from_currency.toUpperCase();
  const to = to_currency.toUpperCase();

  const res = await axios.get(
    `https://api.exchangerate-api.com/v4/latest/${from}`
  );

  const rate = res.data.rates[to];

  if (!rate) {
    await bot.sendMessage(chatId, `❌ Couldn't find exchange rate for ${to}.`);
    return { success: false, error: "unknown_currency" };
  }

  const converted = (parseFloat(amount) * rate).toFixed(2);

  await bot.sendMessage(
    chatId,
    `💱 *Currency Conversion*\n\n${amount} ${from} = *${converted} ${to}*\n\n_Rate: 1 ${from} = ${rate} ${to}_`,
    { parse_mode: "Markdown" }
  );

  return { success: true };
};

module.exports = { convertCurrency };