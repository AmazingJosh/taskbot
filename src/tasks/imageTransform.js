const { uploadFileFromTelegram, deleteFromCloudinary } = require("../helpers/fileHelper");
const { transformImage } = require("../helpers/pollination");
const cloudinary = require("../config/cloudinary");

/**
 * Image Transform — powered by Pollinations Kontext (image-to-image)
 * 
 * IMPORTANT: Kontext needs a clean, publicly accessible image URL.
 * We generate a Cloudinary URL with f_jpg (forces JPEG, no special chars)
 * to ensure Pollinations can fetch it reliably.
 */

const TRANSFORM_PROMPTS = {
  cartoonify: (style = "pixar") => {
    const styles = {
      pixar:   "Transform this person into a Pixar 3D animated character, vibrant colors, smooth skin, big expressive eyes, cinematic lighting, keep the person recognizable",
      anime:   "Transform this person into Japanese anime art style, large expressive eyes, clean line art, vibrant colors, keep the person recognizable",
      disney:  "Transform this person into classic Disney 2D animation style, warm colors, magical atmosphere, keep the person recognizable",
      simpson: "Transform this person into The Simpsons animation style, yellow skin, overbite, flat 2D cartoon style",
    };
    const key = Object.keys(styles).find(k => style.toLowerCase().includes(k));
    return styles[key] || styles.pixar;
  },

  era: (period = "1920s") => {
    const map = {
      "1920": "Transform this person to look like they are from the 1920s, black and white portrait, art deco style, vintage film grain",
      "1960": "Transform this person to look like they are from the 1960s, retro colors, mod style, vintage photography",
      "1980": "Transform this person to look like they are from the 1980s, vivid neon colors, big hair, vintage camera quality",
      "mediev": "Transform this person into a medieval portrait painting, oil paint texture, royal attire, renaissance style",
      "victor": "Transform this person into a Victorian era portrait, formal attire, sepia tones, vintage photography",
      "futur":  "Transform this person into a futuristic sci-fi portrait, cyberpunk aesthetic, neon lighting, advanced technology",
      "ancien": "Transform this person into an ancient Egyptian style portrait, hieroglyphic style, royal attire",
    };
    const key = Object.keys(map).find(k => period.toLowerCase().includes(k));
    return key ? map[key] : `Transform this person to look like they are from ${period}, historically accurate clothing and style`;
  },

  outfit: (description = "a stylish suit") =>
    `Change this person's outfit to ${description}, keep the face and body position exactly the same, photorealistic`,

  painting: (style = "oil") => {
    const map = {
      oil:        "Transform this photo into an oil painting, thick brushstrokes, rich textures, classical painting style",
      watercolor: "Transform this photo into a watercolor painting, soft edges, transparent washes, artistic",
      sketch:     "Transform this photo into a detailed pencil sketch, graphite shading, artistic line work",
      "van gogh": "Transform this photo in Van Gogh's style, swirling brushstrokes, bold colors, post-impressionist",
      "pop art":  "Transform this photo into pop art like Andy Warhol, bold flat colors, halftone dots, vivid",
    };
    const key = Object.keys(map).find(k => style.toLowerCase().includes(k));
    return map[key] || `Transform this photo into a ${style} painting, artistic, high quality`;
  },

  headshot: () =>
    "Transform this photo into a professional LinkedIn headshot, clean light grey background, smart business attire, studio lighting, sharp focus, professional corporate photography",

  action_figure: (brand = "action figure") =>
    `Transform this person into a ${brand} toy still in retail packaging box, plastic collectible figure, character name label, professional product photography`,

  caricature: () =>
    "Transform this photo into a funny caricature, humorously exaggerate the facial features, cartoon style, expressive and fun",
};

const imageTransform = async (bot, chatId, msg, params = {}) => {
  const photo = msg.photo?.[msg.photo.length - 1];

  if (!photo) {
    await bot.sendMessage(chatId, "📷 Please send a photo with your request.");
    return { success: false, error: "no_image" };
  }

  const { transformType, style, description } = params;
  const styleInput = style || description || "";

  // Build prompt
  let prompt = "";
  let statusMsg = "";

  switch (transformType) {
    case "cartoonify":
      prompt = TRANSFORM_PROMPTS.cartoonify(styleInput);
      statusMsg = `🎭 Turning you into a ${styleInput || "Pixar"} character...`;
      break;
    case "era":
      prompt = TRANSFORM_PROMPTS.era(styleInput);
      statusMsg = `⏳ Transporting you to ${styleInput || "the 1920s"}...`;
      break;
    case "outfit":
      prompt = TRANSFORM_PROMPTS.outfit(styleInput);
      statusMsg = `👔 Changing your outfit...`;
      break;
    case "painting":
      prompt = TRANSFORM_PROMPTS.painting(styleInput);
      statusMsg = `🖼 Painting you in ${styleInput || "oil paint"} style...`;
      break;
    case "headshot":
      prompt = TRANSFORM_PROMPTS.headshot();
      statusMsg = "💼 Creating your professional headshot...";
      break;
    case "action_figure":
      prompt = TRANSFORM_PROMPTS.action_figure(styleInput);
      statusMsg = "🧸 Turning you into an action figure...";
      break;
    case "caricature":
      prompt = TRANSFORM_PROMPTS.caricature();
      statusMsg = "😄 Drawing your caricature...";
      break;
    default:
      prompt = styleInput || "Transform this photo into a creative artistic style";
      statusMsg = "🎨 Transforming your photo...";
  }

  await bot.sendMessage(chatId, `${statusMsg} (~20–40 seconds)`);

  // Upload photo to Cloudinary
  const upload = await uploadFileFromTelegram(photo.file_id, "taskbot/transform");

  // Generate a clean JPEG URL — ensures Pollinations can fetch it
  const cleanUrl = cloudinary.url(upload.publicId, {
    format: "jpg",
    quality: "auto",
    secure: true,
  });

  console.log(`🎨 Transforming image: ${transformType} | prompt length: ${prompt.length}`);

  // Send to Pollinations Kontext
  const resultBuffer = await transformImage(cleanUrl, prompt, { width: 1024, height: 1024 });

  const captions = {
    cartoonify:            `✅ ${styleInput || "Pixar"} version done! 🎬`,
    era:                   `✅ Welcome to ${styleInput || "the past"}! ⏳`,
    outfit:                "✅ New outfit applied! 👔",
    painting:              `✅ Painted in ${styleInput || "oil"} style! 🖼`,
    headshot:              "✅ Professional headshot ready! 💼",
    action_figure:         "✅ You're now a collectible! 🧸",
    caricature:            "✅ Caricature done! 😄",
  };

  await bot.sendDocument(chatId, resultBuffer, {
    caption: captions[transformType] || "✅ Done!",
  }, { filename: `${transformType}.jpg`, contentType: "image/jpeg" });

  await deleteFromCloudinary(upload.publicId, "image");
  return { success: true };
};

module.exports = { imageTransform };