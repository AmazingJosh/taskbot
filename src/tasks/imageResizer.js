const sharp = require('sharp');
const axios = require('axios');
const { uploadFileFromTelegram, deleteFromCloudinary } = require('../helpers/fileHelper');
const { setSession, getSession, clearSession } = require('../helpers/sessionStore');

/**
 * Image Resize — Smart scaling with Sharp.js
 * 
 * Two modes:
 * 
 * 1. SCALE TO FIT — "My Lambo problem"
 *    Shrink/enlarge the ENTIRE image proportionally.
 *    Nothing cut. Nothing distorted. Just smaller or bigger.
 *    Result may not be exact target size but proportions perfect.
 *    e.g. 4000x3000 → 500x375 for WhatsApp
 * 
 * 2. EXACT WITH BLUR FILL — "Website requires exact size"
 *    Scale image to fit, then fill remaining edges with
 *    a blurred version of the same photo.
 *    Result is EXACTLY the target size. Looks professional.
 *    e.g. 4000x3000 → exactly 500x500 with blurred sides
 */

// ─────────────────────────────────────────────────────
// Platform presets
// ─────────────────────────────────────────────────────
const PRESETS = {
  'whatsapp dp':         { width: 500,  height: 500,  label: 'WhatsApp DP'         },
  'whatsapp':            { width: 500,  height: 500,  label: 'WhatsApp DP'         },
  'instagram post':      { width: 1080, height: 1080, label: 'Instagram Post'      },
  'instagram story':     { width: 1080, height: 1920, label: 'Instagram Story'     },
  'instagram landscape': { width: 1080, height: 566,  label: 'Instagram Landscape' },
  'facebook post':       { width: 1200, height: 630,  label: 'Facebook Post'       },
  'facebook cover':      { width: 851,  height: 315,  label: 'Facebook Cover'      },
  'twitter post':        { width: 1024, height: 512,  label: 'Twitter Post'        },
  'twitter header':      { width: 1500, height: 500,  label: 'Twitter Header'      },
  'linkedin post':       { width: 1200, height: 627,  label: 'LinkedIn Post'       },
  'linkedin banner':     { width: 1584, height: 396,  label: 'LinkedIn Banner'     },
  'youtube thumbnail':   { width: 1280, height: 720,  label: 'YouTube Thumbnail'   },
  'tiktok':              { width: 1080, height: 1920, label: 'TikTok'              },
  'passport':            { width: 413,  height: 531,  label: 'Passport Photo'      },
  'cv photo':            { width: 300,  height: 300,  label: 'CV Photo'            },
  'linkedin profile':    { width: 400,  height: 400,  label: 'LinkedIn Profile'    },
  'og image':            { width: 1200, height: 630,  label: 'OG Image'            },
  'banner':              { width: 1200, height: 400,  label: 'Web Banner'          },
};

const parseDimensions = (text = '') => {
  const match = text.match(/(\d+)\s*[xX×*]\s*(\d+)/);
  if (match) return { width: parseInt(match[1]), height: parseInt(match[2]) };
  return null;
};

const detectPreset = (text = '') => {
  const lower = text.toLowerCase();
  for (const [key, val] of Object.entries(PRESETS)) {
    if (lower.includes(key)) return { ...val };
  }
  return null;
};

// ─────────────────────────────────────────────────────
// MODE 1: Scale to fit — entire image visible, proportional
// ─────────────────────────────────────────────────────
const scaleToFit = async (imageBuffer, targetWidth, targetHeight) => {
  return sharp(imageBuffer)
    .resize(targetWidth, targetHeight, {
      fit: 'inside',           // shrink/enlarge to fit within bounds
      withoutEnlargement: false, // allow enlargement if needed
    })
    .jpeg({ quality: 95 })
    .toBuffer();
};

// ─────────────────────────────────────────────────────
// MODE 2: Exact size with blur fill — professional look
// ─────────────────────────────────────────────────────
const exactWithBlurFill = async (imageBuffer, targetWidth, targetHeight) => {
  // Step 1: Create blurred background at exact target size
  const blurredBg = await sharp(imageBuffer)
    .resize(targetWidth, targetHeight, {
      fit: 'cover',   // fill the entire background
      position: 'center',
    })
    .blur(20)         // heavy blur
    .brightness(0.7)  // slightly darken so subject stands out
    .jpeg({ quality: 80 })
    .toBuffer();

  // Step 2: Scale the original image to fit inside target (nothing cut)
  const scaledForeground = await sharp(imageBuffer)
    .resize(targetWidth, targetHeight, {
      fit: 'inside',
      withoutEnlargement: false,
    })
    .toBuffer();

  // Get dimensions of scaled foreground
  const meta = await sharp(scaledForeground).metadata();

  // Step 3: Composite — place scaled image centered on blurred background
  const result = await sharp(blurredBg)
    .composite([{
      input: scaledForeground,
      gravity: 'center',      // center the image on the background
    }])
    .jpeg({ quality: 95 })
    .toBuffer();

  return result;
};

// ─────────────────────────────────────────────────────
// Mode selection keyboard
// ─────────────────────────────────────────────────────
const MODE_KEYBOARD = (width, height) => ({
  reply_markup: {
    inline_keyboard: [
      [{
        text: '🔍 Scale to fit (nothing cut)',
        callback_data: `resize_fit_${width}_${height}`,
      }],
      [{
        text: '🖼 Exact size with blur fill (professional)',
        callback_data: `resize_blur_${width}_${height}`,
      }],
    ],
  },
});

// ─────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────
const imageResize = async (bot, chatId, msg, params = {}) => {
  const userId  = msg.from.id;
  const photo   = msg.photo?.[msg.photo.length - 1] ||
                  (msg.document?.mime_type?.startsWith('image/') ? msg.document : null);
  const caption = (msg.caption || msg.text || params.description || '').trim();

  if (!photo) {
    await bot.sendMessage(
      chatId,
      '🖼 *Image Resize*\n\nSend me the image!\n\nAdd the size in caption:\n• *"whatsapp dp"*\n• *"instagram post"*\n• *"passport"*\n• *"1200x630"* (custom size)',
      { parse_mode: 'Markdown' }
    );
    return { success: true };
  }

  // Detect dimensions or preset
  let width, height, label;

  const dims = parseDimensions(caption);
  if (dims) {
    width = dims.width;
    height = dims.height;
    label = `${width}x${height}`;
  } else {
    const preset = detectPreset(caption);
    if (preset) {
      width  = preset.width;
      height = preset.height;
      label  = preset.label;
    }
  }

  // No dimensions — upload photo, ask for size
  if (!width || !height) {
    const upload = await uploadFileFromTelegram(photo.file_id, 'taskbot/resize');
    setSession(userId, {
      step: 'waiting_for_resize_dimensions',
      imageUrl: upload.url,
      publicId: upload.publicId,
      resourceType: upload.resourceType,
    });

    const presetList = Object.entries(PRESETS)
      .map(([key, val]) => `• *${key}* — ${val.width}×${val.height}`)
      .join('\n');

    await bot.sendMessage(
      chatId,
      `📐 *What size do you need?*\n\n*Presets:*\n${presetList}\n\n*Or type custom:* "586x342"`,
      { parse_mode: 'Markdown' }
    );
    return { success: true };
  }

  // We have dimensions — upload and show mode options
  const upload = await uploadFileFromTelegram(photo.file_id, 'taskbot/resize');
  setSession(userId, {
    step: 'waiting_for_resize_mode',
    imageUrl: upload.url,
    publicId: upload.publicId,
    resourceType: upload.resourceType,
    width,
    height,
    label,
  });

  await bot.sendMessage(
    chatId,
    `📐 *${label}* — how do you want it?\n\n🔍 *Scale to fit* — your whole image stays, just smaller/bigger. Nothing cut.\n\n🖼 *Exact with blur fill* — exact dimensions, edges filled with blurred version of your photo. Looks pro.`,
    { parse_mode: 'Markdown', ...MODE_KEYBOARD(width, height) }
  );

  return { success: true };
};

// ─────────────────────────────────────────────────────
// Handle mode button tap
// ─────────────────────────────────────────────────────
const handleResizeCallback = async (bot, callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const userId = callbackQuery.from.id;
  const data   = callbackQuery.data;

  await bot.answerCallbackQuery(callbackQuery.id);

  // data format: resize_fit_500_500 or resize_blur_500_500
  const parts  = data.split('_');
  const mode   = parts[1];              // fit | blur
  const width  = parseInt(parts[2]);
  const height = parseInt(parts[3]);

  console.log(`📐 Resize: mode=${mode} ${width}x${height}`);

  const session = getSession(userId);
  if (!session?.imageUrl) {
    await bot.sendMessage(chatId, '⏰ Session expired. Please send the image again.');
    return;
  }

  const modeLabel = mode === 'fit'
    ? 'Scale to fit'
    : 'Exact with blur fill';

  await bot.sendMessage(
    chatId,
    `⚙️ Resizing (${modeLabel})... give me a second!`
  );

  try {
    console.log(`📥 Downloading image...`);
    const response = await axios.get(session.imageUrl, { responseType: 'arraybuffer' });
    const inputBuffer = Buffer.from(response.data);

    // Get original dimensions for the caption
    const original = await sharp(inputBuffer).metadata();
    console.log(`✅ Original: ${original.width}x${original.height}`);

    let resized;
    if (mode === 'fit') {
      resized = await scaleToFit(inputBuffer, width, height);
    } else {
      resized = await exactWithBlurFill(inputBuffer, width, height);
    }

    const meta = await sharp(resized).metadata();
    console.log(`✅ Result: ${meta.width}x${meta.height}`);

    const caption = mode === 'fit'
      ? `✅ Done! Scaled from ${original.width}×${original.height} → ${meta.width}×${meta.height}\n\nYour full image, nothing cut! 🎯`
      : `✅ Done! Exactly ${meta.width}×${meta.height} with blur fill 🎯`;

    await bot.sendDocument(chatId, resized, {
      caption,
    }, {
      filename: `resized_${meta.width}x${meta.height}.jpg`,
      contentType: 'image/jpeg',
    });

    await deleteFromCloudinary(session.publicId, session.resourceType);
    clearSession(userId);

  } catch (err) {
    console.error('❌ Resize failed:', err.message);
    await bot.sendMessage(chatId, `😕 Resize failed: ${err.message}`);
    clearSession(userId);
  }
};

// ─────────────────────────────────────────────────────
// Handle text input for dimensions
// ─────────────────────────────────────────────────────
const handleResizeDimensionsInput = async (bot, chatId, userId, text) => {
  const session = getSession(userId);
  if (!session?.imageUrl) {
    await bot.sendMessage(chatId, '⏰ Session expired. Please send the image again.');
    return;
  }

  let width, height, label;

  const dims = parseDimensions(text);
  if (dims) {
    width  = dims.width;
    height = dims.height;
    label  = `${width}x${height}`;
  } else {
    const preset = detectPreset(text);
    if (preset) {
      width  = preset.width;
      height = preset.height;
      label  = preset.label;
    }
  }

  if (!width || !height) {
    await bot.sendMessage(
      chatId,
      `❓ Didn't get that. Try:\n• *"whatsapp dp"*\n• *"instagram post"*\n• *"500x500"*`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  setSession(userId, { ...session, step: 'waiting_for_resize_mode', width, height, label });

  await bot.sendMessage(
    chatId,
    `📐 *${label}* — how do you want it?\n\n🔍 *Scale to fit* — your whole image stays, just smaller/bigger. Nothing cut.\n\n🖼 *Exact with blur fill* — exact dimensions, edges filled with blurred version of your photo. Looks pro.`,
    { parse_mode: 'Markdown', ...MODE_KEYBOARD(width, height) }
  );
};

module.exports = { imageResize, handleResizeCallback, handleResizeDimensionsInput };