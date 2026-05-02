const axios = require("axios");
const cloudinary = require("../config/cloudinary");
const { uploadFileFromTelegram, deleteFromCloudinary } = require("../helpers/fileHelper");
const { generateImage } = require("../helpers/pollination");
const { setSession, getSession, clearSession } = require("../helpers/sessionStore");

/**
 * Meme Generator
 * 
 * Two flows:
 * Flow A — User sends a photo + top/bottom text
 *   → Upload to Cloudinary → use Cloudinary text overlay transformation
 *
 * Flow B — User wants a meme template generated
 *   → Pollinations generates the base image → add text overlay
 */

/**
 * Add meme text to an image using Cloudinary overlays.
 * Returns final meme as Buffer.
 */
const addMemeText = async (imagePublicId, topText, bottomText) => {
  const transformations = [
    { width: 800, height: 800, crop: "fill" },
  ];

  // Top text
  if (topText) {
    transformations.push({
      overlay: {
        font_family: "Impact",
        font_size: 60,
        font_weight: "bold",
        text: topText.toUpperCase(),
        text_align: "center",
      },
      color: "white",
      gravity: "north",
      y: 20,
      width: 760,
      crop: "fit",
      effect: "outline:3",
      border: "3px_solid_black",
    });
    transformations.push({ flags: "layer_apply", gravity: "north", y: 20 });
  }

  // Bottom text
  if (bottomText) {
    transformations.push({
      overlay: {
        font_family: "Impact",
        font_size: 60,
        font_weight: "bold",
        text: bottomText.toUpperCase(),
        text_align: "center",
      },
      color: "white",
      gravity: "south",
      y: 20,
      width: 760,
      crop: "fit",
      effect: "outline:3",
      border: "3px_solid_black",
    });
    transformations.push({ flags: "layer_apply", gravity: "south", y: 20 });
  }

  const memeUrl = cloudinary.url(imagePublicId, {
    transformation: transformations,
    format: "jpg",
    quality: "auto",
  });

  const result = await axios.get(memeUrl, { responseType: "arraybuffer" });
  return Buffer.from(result.data);
};

/**
 * Main meme handler
 */
const generateMeme = async (bot, chatId, msg, params = {}) => {
  const userId = msg.from.id;
  const photo = msg.photo?.[msg.photo.length - 1];
  const caption = (msg.caption || msg.text || "").trim();

  // Check session — waiting for meme text
  const session = getSession(userId);
  if (session?.step === "waiting_for_meme_text") {
    // Parse top/bottom text from message
    // Format: "top text | bottom text" or just "text"
    const parts = caption.split("|").map(s => s.trim());
    const topText = parts[0] || "";
    const bottomText = parts[1] || "";

    await bot.sendMessage(chatId, "😂 Adding text to your meme...");

    try {
      const memeBuffer = await addMemeText(session.imagePublicId, topText, bottomText);
      await bot.sendDocument(chatId, memeBuffer, {
        caption: "✅ Meme ready! Share it with the world 😂",
      }, { filename: "meme.jpg", contentType: "image/jpeg" });

      await deleteFromCloudinary(session.imagePublicId, "image");
      clearSession(userId);
      return { success: true };
    } catch (err) {
      clearSession(userId);
      throw err;
    }
  }

  // Extract top/bottom from params or caption
  const { topText, bottomText, templateDescription } = params;

  // Flow A — User sent a photo
  if (photo) {
    if (topText || bottomText) {
      // Has text — make meme immediately
      await bot.sendMessage(chatId, "😂 Creating your meme...");
      const upload = await uploadFileFromTelegram(photo.file_id, "taskbot/memes");
      const memeBuffer = await addMemeText(upload.publicId, topText, bottomText);
      await bot.sendDocument(chatId, memeBuffer, {
        caption: "✅ Meme ready! 😂",
      }, { filename: "meme.jpg", contentType: "image/jpeg" });
      await deleteFromCloudinary(upload.publicId, "image");
      return { success: true };
    }

    // No text — save image, ask for text
    const upload = await uploadFileFromTelegram(photo.file_id, "taskbot/memes");
    setSession(userId, { step: "waiting_for_meme_text", imagePublicId: upload.publicId });
    await bot.sendMessage(
      chatId,
      "✍️ Got your image! Now send me the meme text.\n\nFormat: *top text | bottom text*\n\nExample: \"When you finally fix the bug | But introduce 3 more\"",
      { parse_mode: "Markdown" }
    );
    return { success: true };
  }

  // Flow B — Generate meme template from description
  if (templateDescription) {
    await bot.sendMessage(chatId, `🎨 Generating meme template: "${templateDescription}"...`);
    const bgBuffer = await generateImage(
      `${templateDescription}, meme format, funny, expressive, high quality`,
      { width: 800, height: 800 }
    );

    // Upload generated image to Cloudinary
    const upload = await new Promise((res, rej) => {
      const s = cloudinary.uploader.upload_stream(
        { folder: "taskbot/memes", resource_type: "image" },
        (e, r) => e ? rej(e) : res(r)
      );
      s.end(bgBuffer);
    });

    if (topText || bottomText) {
      const memeBuffer = await addMemeText(upload.public_id, topText, bottomText);
      await bot.sendDocument(chatId, memeBuffer, {
        caption: "✅ Meme ready! 😂",
      }, { filename: "meme.jpg", contentType: "image/jpeg" });
      await deleteFromCloudinary(upload.public_id, "image");
    } else {
      setSession(userId, { step: "waiting_for_meme_text", imagePublicId: upload.public_id });
      await bot.sendMessage(
        chatId,
        "✅ Template generated! Now send me the text:\n\n*top text | bottom text*",
        { parse_mode: "Markdown" }
      );
    }
    return { success: true };
  }

  // No photo, no description — ask for one
  await bot.sendMessage(
    chatId,
    "😂 *Meme Generator*\n\nSend me:\n• A photo to turn into a meme\n• Or describe a meme template e.g. \"Drake meme\" or \"Distracted boyfriend\"\n\nThen I'll ask for your top and bottom text!",
    { parse_mode: "Markdown" }
  );
  return { success: true };
};

module.exports = { generateMeme };