const axios = require("axios");

const getWeather = async (bot, chatId, params) => {
  const city = params?.city;

  if (!city) {
    await bot.sendMessage(chatId, "🌍 Which city do you want the weather for?");
    return { success: false, error: "no_city" };
  }

  const res = await axios.get("https://api.openweathermap.org/data/2.5/weather", {
    params: {
      q: city,
      appid: process.env.OPENWEATHER_API_KEY,
      units: "metric",
    },
  });

  const { main, weather, wind, name, sys } = res.data;
  const emoji = weatherEmoji(weather[0].main);

  await bot.sendMessage(
    chatId,
    `${emoji} *Weather in ${name}, ${sys.country}*\n\n` +
    `🌡 Temperature: ${main.temp}°C (feels like ${main.feels_like}°C)\n` +
    `💧 Humidity: ${main.humidity}%\n` +
    `💨 Wind: ${wind.speed} m/s\n` +
    `☁️ Condition: ${weather[0].description}`,
    { parse_mode: "Markdown" }
  );

  return { success: true };
};

const weatherEmoji = (condition) => {
  const map = {
    Clear: "☀️", Clouds: "☁️", Rain: "🌧", Drizzle: "🌦",
    Thunderstorm: "⛈", Snow: "❄️", Mist: "🌫", Fog: "🌫",
  };
  return map[condition] || "🌤";
};

module.exports = { getWeather };