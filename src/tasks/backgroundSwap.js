const axios = require("axios");
const FormData = require("form-data");
const cloudinary = require("../config/cloudinary");
const { uploadFileFromTelegram, deleteFromCloudinary } = require("../helpers/fileHelper");
const { setSession, getSession, clearSession } = require("../helpers/sessionStore");
const { generateImage } = require("../helpers/pollination");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

/**
 * Remove background from subject using REMBG microservice.
 * Falls back to Remove.bg if REMBG_URL not set.
 */
const removeSubjectBg = async (imageUrl) => {
  if (process.env.REMBG_URL) {
    const res = await axios.post(process.env.REMBG_URL, 
      { url: imageUrl },
      { responseType: "arraybuffer", timeout: 30000 }
    );
    return Buffer.from(res.data);
  }

  // Fallback: Remove.bg
  const formData = new FormData();
  formData.append("image_url", imageUrl);
  formData.append("size", "auto");
  const res = await axios.post("https://api.remove.bg/v1.0/removebg", formData, {
    headers: { ...formData.getHeaders(), "X-Api-Key": process.env.REMOVEBG_API_KEY },
    responseType: "arraybuffer",
  });
  return Buffer.from(res.data);
};

/**
 * Composite clean subject PNG onto a background buffer using Cloudinary.
 * Returns final composited image as Buffer.
 */
const compositeOnBackground = async (subjectBuffer, backgroundBuffer) => {
  // Upload both to Cloudinary
  const [subjectUpload, bgUpload] = await Promise.all([
    new Promise((res, rej) => {
      const s = cloudinary.uploader.upload_stream(
        { folder: "taskbot/swap/subjects", resource_type: "image" },
        (e, r) => e ? rej(e) : res(r)
      );
      s.end(subjectBuffer);
    }),
    new Promise((res, rej) => {
      const s = cloudinary.uploader.upload_stream(
        { folder: "taskbot/swap/backgrounds", resource_type: "image" },
        (e, r) => e ? rej(e) : res(r)
      );
      s.end(backgroundBuffer);
    }),
  ]);

  // Cloudinary composite: background + subject overlay centered
  const compositeUrl = cloudinary.url(bgUpload.public_id, {
    transformation: [
      { width: 1024, height: 1024, crop: "fill", gravity: "center" },
      {
        overlay: subjectUpload.public_id.replace(/\//g, ":"),
        width: "0.85",
        flags: "relative",
        gravity: "south",
        crop: "scale",
        y: 0,
      },
      { flags: "layer_apply" },
    ],
    format: "jpg",
    quality: "auto:best",
  });

  const result = await axios.get(compositeUrl, { responseType: "arraybuffer" });

  // Cleanup
  await Promise.all([
    deleteFromCloudinary(subjectUpload.public_id, "image"),
    deleteFromCloudinary(bgUpload.public_id, "image"),
  ]);

  return Buffer.from(result.data);
};

/**
 * Main background swap handler.
 *
 * Flow A — Custom upload:
 *   "use my own background" + selfie → save session → ask for bg photo → composite
 *
 * Flow B — AI generated:
 *   "put me in Times Square" + selfie → FLUX generates bg → composite
 *
 * Flow C — Session step 2:
 *   User sends background photo after Flow A step 1
 */
const swapBackground = async (bot, chatId, msg, params = {}) => {
  const userId = msg.from.id;
  const photo = msg.photo?.[msg.photo.length - 1];
  const caption = (msg.caption || msg.text || "").trim();

  // ── Session step 2: user sending their custom background ──
  const session = getSession(userId);
  if (session?.step === "waiting_for_background" && photo) {
    await bot.sendMessage(chatId, "🎨 Got your background! Compositing now...");

    try {
      const bgUpload = await uploadFileFromTelegram(photo.file_id, "taskbot/swap/bg");

      // Get subject from session, remove its bg
      const subjectUpload = await uploadFileFromTelegram(session.subjectFileId, "taskbot/swap/subject");
      const cleanSubject = await removeSubjectBg(subjectUpload.url);
      const bgBuffer = (await axios.get(bgUpload.url, { responseType: "arraybuffer" })).data;

      const result = await compositeOnBackground(cleanSubject, Buffer.from(bgBuffer));

      await bot.sendDocument(chatId, result, {
        caption: "✅ Done! You've been placed on your custom background.",
      }, { filename: "custom-background.jpg", contentType: "image/jpeg" });

      await Promise.all([
        deleteFromCloudinary(subjectUpload.publicId, "image"),
        deleteFromCloudinary(bgUpload.publicId, "image"),
      ]);
      clearSession(userId);
      return { success: true };
    } catch (err) {
      clearSession(userId);
      throw err;
    }
  }

  // ── Subject photo must exist ──
  if (!photo) {
    await bot.sendMessage(
      chatId,
      "📷 Send me your photo with a description of the background you want!\n\nExamples:\n• Photo + \"Put me on a beach in Maldives\"\n• Photo + \"Put me in outer space\"\n• Photo + \"Use my own background\""
    );
    return { success: false, error: "no_image" };
  }

  // ── Flow A: custom upload ──
  const wantsCustom = /my (own|background|image|photo)|custom|upload|i have/i.test(caption);
  if (wantsCustom || params?.custom_background) {
    setSession(userId, { step: "waiting_for_background", subjectFileId: photo.file_id });
    await bot.sendMessage(chatId, "📤 Got your photo! Now send me the background image you want to use.");
    return { success: true };
  }

  // ── Flow B: AI generated background ──
  // Clean up the caption to extract just the background description
  const bgDescription = caption
    .replace(/put me (on|in|at|into|inside|on a|in a)?/gi, "")
    .replace(/change (my |the )?background (to)?/gi, "")
    .replace(/swap (my |the )?background (to|with)?/gi, "")
    .replace(/new background/gi, "")
    .replace(/background/gi, "")
    .trim();

  if (!bgDescription || bgDescription.length < 3) {
    // No description — ask what they want
    setSession(userId, { step: "waiting_for_background", subjectFileId: photo.file_id });
    await bot.sendMessage(
      chatId,
      "🎨 What background do you want?\n\nDescribe it (e.g. \"beach in Maldives\", \"Times Square at night\", \"outer space\") or send me a background photo now."
    );
    return { success: true };
  }

  await bot.sendMessage(chatId, `🎨 Generating "${bgDescription}" background... give me ~20 seconds!`);

  // Upload subject and remove bg in parallel with FLUX generating the background
  const subjectUpload = await uploadFileFromTelegram(photo.file_id, "taskbot/swap/subjects");
  const [cleanSubject, bgBuffer] = await Promise.all([
    removeSubjectBg(subjectUpload.url),
    generateImage(
      `${bgDescription}, photorealistic, high quality, 4K, wide establishing shot, no people, no text`,
      { width: 1024, height: 1024 }
    ),
  ]);

  await bot.sendMessage(chatId, "✂️ Background ready! Placing you in now...");

  const result = await compositeOnBackground(cleanSubject, bgBuffer);

  await bot.sendDocument(chatId, result, {
    caption: `✅ Done! You're now in: "${bgDescription}"\n\nWant to try a different background? Just send another photo!`,
  }, { filename: "ai-background.jpg", contentType: "image/jpeg" });

  await deleteFromCloudinary(subjectUpload.publicId, "image");
  return { success: true };
};

module.exports = { swapBackground };