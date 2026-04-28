const axios = require("axios");
const FormData = require("form-data");
const { uploadFileFromTelegram, deleteFromCloudinary } = require("../helpers/fileHelper");

const removeBackground = async (bot, chatId, msg) => {
  // Get the highest quality photo Telegram sent
  const photo = msg.photo?.[msg.photo.length - 1];

  if (!photo) {
    await bot.sendMessage(chatId, "📷 Please send a photo with your request.");
    return { success: false, error: "no_image" };
  }

  await bot.sendMessage(chatId, "🖼 Removing background... hang tight!");

  // Step 1: Upload to Cloudinary to get a public URL
  const { url, publicId, resourceType } = await uploadFileFromTelegram(photo.file_id);

  // Step 2: Send to Remove.bg API
  const formData = new FormData();
  formData.append("image_url", url);
  formData.append("size", "auto");

  const response = await axios.post("https://api.remove.bg/v1.0/removebg", formData, {
    headers: {
      ...formData.getHeaders(),
      "X-Api-Key": process.env.REMOVEBG_API_KEY,
    },
    responseType: "arraybuffer",   // returns raw image binary
  });

  // Step 3: Send the result back to user as a PNG document
  await bot.sendDocument(chatId, Buffer.from(response.data), {
    caption: "✅ Background removed! Ready to download.",
  }, {
    filename: "no-background.png",
    contentType: "image/png",
  });

  // Cleanup Cloudinary temp file
  await deleteFromCloudinary(publicId, resourceType);

  return { success: true };
};

module.exports = { removeBackground };