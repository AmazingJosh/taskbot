const sharp = require('sharp');
const axios = require('axios');
const { uploadFileFromTelegram, deleteFromCloudinary } = require('../helpers/fileHelper');
const { setSession, getSession, clearSession } = require('../helpers/sessionStore');

/**
 * Image Resize — powered by Sharp.js
 * 100% free, runs on our server, no API calls, no limits.
 *
 * Three resize modes:
 * - cover  : fill exact dimensions, smart crop center (default)
 * - contain: fit inside dimensions, no crop, adds padding
 * - fit    : fit inside dimensions, no crop, no padding (may not hit exact size)
 *
 * Platform presets — user says the name, we know the dimensions:
 */

const PRESETS = {
  // Social media
  'instagram post':      { width: 1080, height: 1080, label: 'Instagram Post (1080x1080)'      },
  'instagram story':     { width: 1080, height: 1920, label: 'Instagram Story (1080x1920)'     },
  'instagram landscape': { width: 1080, height: 566,  label: 'Instagram Landscape (1080x566)'  },
  'facebook post':       { width: 1200, height: 630,  label: 'Facebook Post (1200x630)'        },
  'facebook cover':      { width: 851,  height: 315,  label: 'Facebook Cover (851x315)'        },
  'twitter post':        { width: 1024, height: 512,  label: 'Twitter Post (1024x512)'         },
  'twitter header':      { width: 1500, height: 500,  label: 'Twitter Header (1500x500)'       },
  'linkedin post':       { width: 1200, height: 627,  label: 'LinkedIn Post (1200x627)'        },
  'linkedin banner':     { width: 1584, height: 396,  label: 'LinkedIn Banner (1584x396)'      },
  'youtube thumbnail':   { width: 1280, height: 720,  label: 'YouTube Thumbnail (1280x720)'    },
  'tiktok':              { width: 1080, height: 1920, label: 'TikTok (1080x1920)'              },
  'whatsapp dp':         { width: 500,  height: 500,  label: 'WhatsApp DP (500x500)'           },
  // Professional
  'passport':            { width: 413,  height: 531,  label: 'Passport Photo (413x531)'        },
  'cv photo':            { width: 300,  height: 300,  label: 'CV Photo (300x300)'              },
  'linkedin profile':    { width: 400,  height: 400,  label: 'LinkedIn Profile (400x400)'      },
  // Web
  'og image':            { width: 1200, height: 630,  label: 'OG Image (1200x630)'             },
  'banner':              { width: 1200, height: 400,  label: 'Web Banner (1200x400)'           },
};

/**
 * Parse dimensions from text like "586x342" or "586 by 342" or "586*342"
 */
const parseDimensions = (text = '') => {
  const match = text.match(/(\d+)\s*[xX×by*]\s*(\d+)/);
  if (match) {
    return { width: parseInt(match[1]), height: parseInt(match[2]) };
  }
  return null;
};

/**
 * Detect preset from text
 */
const detectPreset = (text = '') => {
  const lower = text.toLowerCase();
  for (const [key, val] of Object.entries(PRESETS)) {
    if (lower.includes(key)) return val;
  }
  return null;
};

/**
 * Core resize function — Sharp does the work
 */
const resizeImage = async (imageBuffer, width, height, mode = 'cover') => {
  const fitMap = {
    cover:   'cover',    // fill exact, smart crop
    contain: 'contain',  // fit inside, pad with white
    fit:     'inside',   // fit inside, no pad
  };

  let pipeline = sharp(imageBuffer).resize(width, height, {
    fit: fitMap[mode] || 'cover',
    position: 'center',
    withoutEnlargement: false,
  });

  // Add white background for contain mode
  if (mode === 'contain') {
    pipeline = pipeline.flatten({ background: { r: 255, g: 255, b: 255 } });
  }

  return pipeline.jpeg({ quality: 95, mozjpeg: true }).toBuffer();
};

/**
 * Mode selection keyboard — shown after we know dimensions
 */
const MODE_KEYBOARD = (width, height) => ({
  reply_markup: {
    inline_keyboard: [
      [
        { text: '✂️ Smart Crop (exact size)', callback_data: `resize_cover_${width}_${height}` },
      ],
      [
        { text: '⬜ Pad with white (exact size)', callback_data: `resize_contain_${width}_${height}` },
      ],
      [
        { text: '📐 Fit inside (no crop)', callback_data: `resize_fit_${width}_${height}` },
      ],
    ],
  },
});

/**
 * Main handler
 *
 * Flow A — Custom dimensions: "resize to 586x342"
 *   → ask which mode → resize → send back
 *
 * Flow B — Platform preset: "resize for instagram post"
 *   → auto detect dimensions → ask which mode → resize → send
 *
 * Flow C — No dimensions given
 *   → show preset list + ask for dimensions
 */
const imageResize = async (bot, chatId, msg, params = {}) => {
  const userId = msg.from.id;
  const photo  = msg.photo?.[msg.photo.length - 1] || 
                 (msg.document?.mime_type?.startsWith('image/') ? msg.document : null);
  const caption = (msg.caption || msg.text || params.description || '').trim();

  // ── No photo ──────────────────────────────────────────
  if (!photo) {
    await bot.sendMessage(
      chatId,
      '🖼 *Image Resize*\n\nSend me the image with a caption describing the size!\n\nExamples:\n• Photo + *"resize to 586x342"*\n• Photo + *"instagram post"*\n• Photo + *"passport photo"*\n• Photo + *"linkedin banner"*',
      { parse_mode: 'Markdown' }
    );
    return { success: true };
  }

  // ── Detect dimensions or preset ───────────────────────
  let width, height, label;

  const dims = parseDimensions(caption);
  if (dims) {
    width  = dims.width;
    height = dims.height;
    label  = `${width}x${height}`;
  } else {
    const preset = detectPreset(caption);
    if (preset) {
      width  = preset.width;
      height = preset.height;
      label  = preset.label;
    }
  }

  // ── No dimensions detected — ask user ─────────────────
  if (!width || !height) {
    // Save photo in session
    const upload = await uploadFileFromTelegram(photo.file_id, 'taskbot/resize');
    setSession(userId, {
      step:      'waiting_for_resize_dimensions',
      imageUrl:  upload.url,
      publicId:  upload.publicId,
      resourceType: upload.resourceType,
    });

    const presetList = Object.entries(PRESETS)
      .map(([key, val]) => `• *${key}* — ${val.width}x${val.height}`)
      .join('\n');

    await bot.sendMessage(
      chatId,
      `📐 *What size do you need?*\n\nTell me the dimensions or a platform name:\n\n*Custom:* "586x342" or "1200 by 630"\n\n*Presets:*\n${presetList}`,
      { parse_mode: 'Markdown' }
    );
    return { success: true };
  }

  // ── We have dimensions — upload and ask for mode ──────
  await bot.sendMessage(chatId, `📐 Resizing to *${label}*...\n\nHow should I handle the ratio?`, { parse_mode: 'Markdown' });

  const upload = await uploadFileFromTelegram(photo.file_id, 'taskbot/resize');
  setSession(userId, {
    step:        'waiting_for_resize_mode',
    imageUrl:    upload.url,
    publicId:    upload.publicId,
    resourceType: upload.resourceType,
    width,
    height,
    label,
  });

  await bot.sendMessage(
    chatId,
    `*${label}* — pick a resize mode:`,
    { parse_mode: 'Markdown', ...MODE_KEYBOARD(width, height) }
  );

  return { success: true };
};

/**
 * Handle mode selection from inline keyboard
 * Called from callbackHandler when data starts with "resize_"
 */
const handleResizeCallback = async (bot, callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const userId = callbackQuery.from.id;
  const data   = callbackQuery.data; // resize_cover_586_342

  await bot.answerCallbackQuery(callbackQuery.id);

  const parts  = data.split('_');
  const mode   = parts[1];              // cover | contain | fit
  const width  = parseInt(parts[2]);
  const height = parseInt(parts[3]);

  const session = getSession(userId);
  if (!session?.imageUrl) {
    await bot.sendMessage(chatId, '⏰ Session expired. Please send the image again.');
    return;
  }

  await bot.editMessageText(
    `⚙️ Resizing to *${width}x${height}* (${mode} mode)...`,
    { chat_id: chatId, message_id: callbackQuery.message.message_id, parse_mode: 'Markdown' }
  );

  try {
    // Download from Cloudinary
    const response = await axios.get(session.imageUrl, { responseType: 'arraybuffer' });
    const resized  = await resizeImage(Buffer.from(response.data), width, height, mode);
    const meta     = await sharp(resized).metadata();

    await bot.sendDocument(chatId, resized, {
      caption: `✅ Done! Image resized to *${meta.width}x${meta.height}px*`,
    }, { filename: `resized_${width}x${height}.jpg`, contentType: 'image/jpeg' });

    // Cleanup
    await deleteFromCloudinary(session.publicId, session.resourceType);
    clearSession(userId);

  } catch (err) {
    console.error('❌ Resize failed:', err.message);
    await bot.sendMessage(chatId, '😕 Resize failed. Please try again.');
    clearSession(userId);
  }
};

/**
 * Handle text input for dimensions when in waiting_for_resize_dimensions session
 */
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
      '❓ I couldn\'t read that size. Try something like *"586x342"* or *"instagram post"*',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Update session with dimensions, ask for mode
  setSession(userId, { ...session, step: 'waiting_for_resize_mode', width, height, label });

  await bot.sendMessage(
    chatId,
    `*${label}* — pick a resize mode:`,
    { parse_mode: 'Markdown', ...MODE_KEYBOARD(width, height) }
  );
};

module.exports = { imageResize, handleResizeCallback, handleResizeDimensionsInput };