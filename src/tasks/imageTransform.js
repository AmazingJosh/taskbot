const { uploadFileFromTelegram, deleteFromCloudinary } = require("../helpers/fileHelper");
const { transformImage, generateImage } = require("../helpers/pollination");

/**
 * Image Transform — powered by Pollinations Kontext model (image-to-image)
 * 
 * Handles: cartoonify, style transfer, era transform, outfit change,
 *          action figure, caricature, painting, headshot, and more.
 * 
 * All tasks follow the same pattern:
 *   1. Upload photo to Cloudinary → get URL
 *   2. Send URL + prompt to Pollinations Kontext
 *   3. Return transformed image to user
 */

const TRANSFORM_PROMPTS = {
  cartoonify: (style) => {
    const styles = {
      pixar: "Transform this photo into a Pixar 3D animated character style, vibrant colors, smooth skin, big expressive eyes, cinematic lighting",
      anime: "Transform this photo into Japanese anime art style, large expressive eyes, clean line art, vibrant colors, manga style",
      disney: "Transform this photo into classic Disney 2D animation style, expressive features, warm colors, magical atmosphere",
      simpson: "Transform this photo into The Simpsons animation style, yellow skin, overbite, flat 2D style",
    };
    return styles[style] || styles.pixar;
  },

  era: (period) => {
    const eras = {
      "1920s": "Transform this photo to look like a 1920s black and white portrait, art deco style, vintage film grain, sepia tones",
      "1960s": "Transform this photo to look like a 1960s retro photo, faded colors, vintage filter, mod style",
      "1980s": "Transform this photo to look like a 1980s photo, vivid neon colors, big hair, vintage camera quality",
      "medieval": "Transform this person into a medieval portrait painting, oil paint texture, royal attire, renaissance style",
      "victorian": "Transform this photo into a Victorian era portrait, formal attire, sepia tones, vintage photography style",
      "future": "Transform this photo into a futuristic sci-fi portrait, cyberpunk aesthetic, neon lighting, advanced technology",
    };
    // Find closest match
    for (const [key, val] of Object.entries(eras)) {
      if (period.toLowerCase().includes(key)) return val;
    }
    return `Transform this photo to look like it was taken in the ${period}, historically accurate clothing and style, vintage aesthetic`;
  },

  outfit: (description) =>
    `Change the person's outfit to ${description}, keep the face and body exactly the same, photorealistic, high quality`,

  painting: (style) => {
    const styles = {
      oil: "Transform this photo into an oil painting, thick brushstrokes, rich textures, classical painting style",
      watercolor: "Transform this photo into a watercolor painting, soft edges, transparent layers, artistic style",
      sketch: "Transform this photo into a pencil sketch drawing, detailed line work, graphite shading, artistic",
      "van gogh": "Transform this photo in the style of Van Gogh, swirling brushstrokes, bold colors, post-impressionist",
      "pop art": "Transform this photo into pop art style like Andy Warhol, bold flat colors, halftone dots, vibrant",
    };
    for (const [key, val] of Object.entries(styles)) {
      if (style.toLowerCase().includes(key)) return val;
    }
    return `Transform this photo into a ${style} painting style, artistic, high quality`;
  },

  headshot: () =>
    "Transform this photo into a professional LinkedIn headshot, clean white or grey background, formal business attire, studio lighting, sharp focus, professional photography quality",

  actionFigure: (brand) =>
    `Transform this person into a ${brand || "action figure"} toy still in its packaging box, plastic toy aesthetic, collectible figure, retail packaging with character name`,

  caricature: () =>
    "Transform this photo into a caricature, exaggerate facial features humorously, cartoon style, fun and expressive",
};

/**
 * Main image transform handler
 * Called with a specific transformType and optional style parameter
 */
const imageTransform = async (bot, chatId, msg, params = {}) => {
  const photo = msg.photo?.[msg.photo.length - 1];

  if (!photo) {
    await bot.sendMessage(chatId, "📷 Please send a photo with your request.");
    return { success: false, error: "no_image" };
  }

  const { transformType, style, description } = params;

  // Build the transformation prompt
  let prompt = "";
  let statusMessage = "";

  switch (transformType) {
    case "cartoonify":
      prompt = TRANSFORM_PROMPTS.cartoonify(style || "pixar");
      statusMessage = `🎨 Turning you into a ${style || "Pixar"} character...`;
      break;
    case "era":
      prompt = TRANSFORM_PROMPTS.era(style || description || "1920s");
      statusMessage = `⏳ Transporting you to ${style || description || "the 1920s"}...`;
      break;
    case "outfit":
      prompt = TRANSFORM_PROMPTS.outfit(description || style || "a stylish suit");
      statusMessage = `👔 Changing your outfit to ${description || style}...`;
      break;
    case "painting":
      prompt = TRANSFORM_PROMPTS.painting(style || description || "oil");
      statusMessage = `🖼 Painting you in ${style || "oil paint"} style...`;
      break;
    case "headshot":
      prompt = TRANSFORM_PROMPTS.headshot();
      statusMessage = "💼 Creating your professional headshot...";
      break;
    case "action_figure":
      prompt = TRANSFORM_PROMPTS.actionFigure(style || description);
      statusMessage = "🧸 Turning you into an action figure...";
      break;
    case "caricature":
      prompt = TRANSFORM_PROMPTS.caricature();
      statusMessage = "😄 Drawing your caricature...";
      break;
    default:
      // Generic transform — use description directly
      prompt = description || style || "Transform this photo into a creative artistic style";
      statusMessage = "🎨 Transforming your photo...";
  }

  await bot.sendMessage(chatId, `${statusMessage} this takes ~20 seconds!`);

  // Upload photo to Cloudinary to get a public URL
  const upload = await uploadFileFromTelegram(photo.file_id, "taskbot/transform");

  // Send to Pollinations Kontext for image-to-image transformation
  const resultBuffer = await transformImage(upload.url, prompt, { width: 1024, height: 1024 });

  // Send result back
  const captions = {
    cartoonify: `✅ ${style || "Pixar"} version done! 🎬`,
    era: `✅ Welcome to ${style || description || "the past"}! ⏳`,
    outfit: `✅ New outfit applied! 👔`,
    painting: `✅ Painted in ${style || "oil"} style! 🖼`,
    headshot: "✅ Professional headshot ready! 💼",
    action_figure: "✅ You're now a collectible! 🧸",
    caricature: "✅ Caricature done! 😄",
  };

  await bot.sendDocument(chatId, resultBuffer, {
    caption: captions[transformType] || "✅ Transformation complete!",
  }, { filename: `${transformType || "transform"}.jpg`, contentType: "image/jpeg" });

  // Cleanup
  await deleteFromCloudinary(upload.publicId, "image");

  return { success: true };
};

module.exports = { imageTransform };