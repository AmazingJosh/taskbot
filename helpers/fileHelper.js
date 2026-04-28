const axios = require("axios");
const cloudinary = require("../src/config/cloudinary");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

/**
 * Downloads a file from Telegram servers and uploads it to Cloudinary.
 * Returns the Cloudinary URL for use with 3rd party APIs.
 */
const uploadFileFromTelegram = async (fileId, folder = "taskbot") => {
  // Step 1: Get the file path from Telegram
  const fileInfoRes = await axios.get(
    `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`
  );
  const filePath = fileInfoRes.data.result.file_path;

  // Step 2: Build the download URL
  const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

  // Step 3: Upload directly to Cloudinary via URL
  const uploadResult = await cloudinary.uploader.upload(fileUrl, {
    folder,
    resource_type: "auto",   // handles images, audio, video, docs
    use_filename: true,
  });

  return {
    url: uploadResult.secure_url,
    publicId: uploadResult.public_id,
    format: uploadResult.format,
    resourceType: uploadResult.resource_type,
  };
};

/**
 * Deletes a file from Cloudinary after task is done.
 */
const deleteFromCloudinary = async (publicId, resourceType = "image") => {
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (err) {
    console.warn("⚠️ Cloudinary cleanup failed:", err.message);
  }
};

module.exports = { uploadFileFromTelegram, deleteFromCloudinary };