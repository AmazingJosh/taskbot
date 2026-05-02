const axios = require("axios");
const FormData = require("form-data");
const cloudinary = require("../config/cloudinary");
const { uploadFileFromTelegram, deleteFromCloudinary } = require("../helpers/fileHelper");

/**
 * Blur Background
 * 
 * Flow:
 * 1. Upload original photo to Cloudinary → get publicId
 * 2. Send to Remove.bg → get subject mask (foreground only, transparent bg)
 * 3. Upload the clean subject PNG to Cloudinary
 * 4. Use Cloudinary transformations:
 *    - Blur the original image heavily
 *    - Overlay the sharp subject on top
 * 5. Return the composited result
 */
const blurBackground = async (bot, chatId, msg) => {
  const photo = msg.photo?.[msg.photo.length - 1];

  if (!photo) {
    await bot.sendMessage(chatId, "📷 Please send a photo to blur its background.");
    return { success: false, error: "no_image" };
  }

  await bot.sendMessage(chatId, "🌀 Blurring the background... give me a sec!");

  // Step 1: Upload original to Cloudinary
  const original = await uploadFileFromTelegram(photo.file_id, "taskbot/blur");

  // Step 2: Remove background → get clean subject PNG
  const formData = new FormData();
  formData.append("image_url", original.url);
  formData.append("size", "auto");

  const removeBgRes = await axios.post("https://api.remove.bg/v1.0/removebg", formData, {
    headers: {
      ...formData.getHeaders(),
      "X-Api-Key": process.env.REMOVEBG_API_KEY,
    },
    responseType: "arraybuffer",
  });

  // Step 3: Upload clean subject PNG to Cloudinary
  const subjectUpload = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: "taskbot/blur/subjects", resource_type: "image" },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    uploadStream.end(Buffer.from(removeBgRes.data));
  });

  // Step 4: Cloudinary transformation — blur original + overlay sharp subject
  // e_blur:800 = heavy blur on base image
  // l_ = layer the subject on top at full size
  const blurredUrl = cloudinary.url(original.publicId, {
    transformation: [
      { effect: "blur:800" },                          // blur the background
      {
        overlay: subjectUpload.public_id.replace(/\//g, ":"), // overlay subject
        width: "1.0",
        flags: "relative",
        crop: "scale",
      },
      { flags: "layer_apply" },
    ],
    format: "jpg",
    quality: "auto",
  });

  // Step 5: Download and send result
  const resultRes = await axios.get(blurredUrl, { responseType: "arraybuffer" });

  await bot.sendDocument(chatId, Buffer.from(resultRes.data), {
    caption: "✅ Background blurred! Portrait mode effect applied.",
  }, {
    filename: "blurred-background.jpg",
    contentType: "image/jpeg",
  });

  // Cleanup
  await deleteFromCloudinary(original.publicId, "image");
  await deleteFromCloudinary(subjectUpload.public_id, "image");

  return { success: true };
};

module.exports = { blurBackground };