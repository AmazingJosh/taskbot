const sharp = require('sharp');
const axios = require('axios');
const { uploadFileFromTelegram, deleteFromCloudinary } = require('../helpers/fileHelper');
const { setSession, getSession, clearSession } = require('../helpers/sessionStore');

const PRESETS = {
  'whatsapp dp':         { width: 500,  height: 500,  label: 'WhatsApp DP'         },
  'whatsapp':            { width: 500,  height: 500,  label: 'WhatsApp DP'         },
  'instagram post':      { width: 1080, height: 1080, label: 'Instagram Post'      },
  'instagram story':     { width: 1080, height: 1920, label: 'Instagram Story'     },
  'instagram landscape': { width: 1080, height: 566,  label: 'Instagram Landscape' },
  'facebook post':       { width: 1200, height: 630,  label: 'Facebook Post'       },
  'facebook cover':      { width: 851,  height: 315,  label: 'Facebook Cover'      },
  'twitter post':        { width: 1024, height: 512,  label: 'Twitter/X Post'      },
  'x post':              { width: 1024, height: 512,  label: 'Twitter/X Post'      },
  'twitter header':      { width: 1500, height: 500,  label: 'Twitter/X Header'    },
  'x header':            { width: 1500, height: 500,  label: 'Twitter/X Header'    },
  'twitter':             { width: 1024, height: 512,  label: 'Twitter/X Post'      },
  'linkedin post':       { width: 1200, height: 627,  label: 'LinkedIn Post'       },
  'linkedin banner':     { width: 1584, height: 396,  label: 'LinkedIn Banner'     },
  'linkedin profile':    { width: 400,  height: 400,  label: 'LinkedIn Profile'    },
  'youtube thumbnail':   { width: 1280, height: 720,  label: 'YouTube Thumbnail'   },
  'youtube':             { width: 1280, height: 720,  label: 'YouTube Thumbnail'   },
  'tiktok':              { width: 1080, height: 1920, label: 'TikTok'              },
  'passport':            { width: 413,  height: 531,  label: 'Passport Photo'      },
  'cv photo':            { width: 300,  height: 300,  label: 'CV Photo'            },
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

/**
 * Platform selection keyboard — shown when user sends photo with no caption.
 * User taps platform → instant resize. No typing needed.
 * Custom size button → bot asks for dimensions.
 */
const PLATFORM_KEYBOARD = {
  reply_markup: {
    inline_keyboard: [
      // ── Profile Pictures ─────────────────────────────
      [
        { text: '📱 WhatsApp DP',       callback_data: 'rz_500_500_WhatsApp DP'          },
        { text: '📸 Instagram DP',      callback_data: 'rz_320_320_Instagram DP'         },
      ],
      [
        { text: '💼 LinkedIn DP',       callback_data: 'rz_400_400_LinkedIn DP'          },
        { text: '🐦 Twitter/X DP',      callback_data: 'rz_400_400_Twitter/X DP'         },
      ],
      // ── Stories ──────────────────────────────────────
      [
        { text: '📲 Instagram Story',   callback_data: 'rz_1080_1920_Instagram Story'    },
        { text: '🎵 TikTok',            callback_data: 'rz_1080_1920_TikTok'             },
      ],
      // ── Covers & Banners ─────────────────────────────
      [
        { text: '🎭 Facebook Cover',    callback_data: 'rz_851_315_Facebook Cover'       },
        { text: '🐦 Twitter/X Header',  callback_data: 'rz_1500_500_Twitter/X Header'    },
      ],
      [
        { text: '🏷 LinkedIn Banner',   callback_data: 'rz_1584_396_LinkedIn Banner'     },
        { text: '▶️ YouTube Thumbnail', callback_data: 'rz_1280_720_YouTube Thumbnail'   },
      ],
      // ── Professional ─────────────────────────────────
      [
        { text: '🪪 Passport Photo',    callback_data: 'rz_413_531_Passport Photo'       },
        { text: '📄 CV Photo',          callback_data: 'rz_300_300_CV Photo'             },
      ],
      // ── Custom ───────────────────────────────────────
      [
        { text: '✏️ Custom size...',    callback_data: 'rz_custom'                       },
      ],
    ],
  },
};

/**
 * Core resize — full image visible, exact target size.
 * Blurred version of same photo fills remaining edges.
 */
const resizeWithBlurFill = async (imageBuffer, targetWidth, targetHeight) => {
  const blurredBg = await sharp(imageBuffer)
    .resize(targetWidth, targetHeight, { fit: 'cover', position: 'center' })
    .blur(25)
    .modulate({ brightness: 0.6 })
    .jpeg({ quality: 80 })
    .toBuffer();

  const scaledFg = await sharp(imageBuffer)
    .resize(targetWidth, targetHeight, { fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();

  return sharp(blurredBg)
    .composite([{ input: scaledFg, gravity: 'center' }])
    .jpeg({ quality: 95 })
    .toBuffer();
};

/**
 * Execute resize and send to user
 */
const executeResize = async (bot, chatId, userId, imageUrl, publicId, resourceType, width, height, label) => {
  await bot.sendMessage(chatId, `⚙️ Resizing to ${label}...`);

  const response    = await axios.get(imageUrl, { responseType: 'arraybuffer' });
  const inputBuffer = Buffer.from(response.data);
  const original    = await sharp(inputBuffer).metadata();
  const resized     = await resizeWithBlurFill(inputBuffer, width, height);
  const meta        = await sharp(resized).metadata();

  await bot.sendDocument(chatId, resized, {
    caption: `✅ ${label} ready!\n${original.width}×${original.height} → ${meta.width}×${meta.height} — full image, nothing cut! 🎯`,
  }, { filename: `${label.replace(/\s/g, '_')}_${width}x${height}.jpg`, contentType: 'image/jpeg' });

  await deleteFromCloudinary(publicId, resourceType);
  await clearSession(userId);
};

/**
 * Main handler
 */
const imageResize = async (bot, chatId, msg, params = {}) => {
  const userId  = msg.from.id;
  const photo   = msg.photo?.[msg.photo.length - 1] ||
                  (msg.document?.mime_type?.startsWith('image/') ? msg.document : null);
  const caption = (msg.caption || msg.text || params.description || '').trim();

  if (!photo) {
    await bot.sendMessage(
      chatId,
      '🖼 *Image Resize*\n\nSend me the image with the platform name or size in caption!\n\nExamples:\n• Photo + *"whatsapp dp"*\n• Photo + *"instagram post"*\n• Photo + *"1200x630"*',
      { parse_mode: 'Markdown' }
    );
    return { success: true };
  }

  // Upload photo first — we need it regardless
  const upload = await uploadFileFromTelegram(photo.file_id, 'taskbot/resize');

  // Check if caption has size info
  let width, height, label;
  const dims = parseDimensions(caption);
  if (dims) {
    width = dims.width; height = dims.height; label = `${width}×${height}`;
  } else {
    const preset = detectPreset(caption);
    if (preset) { width = preset.width; height = preset.height; label = preset.label; }
  }

  // Size found in caption — resize immediately
  if (width && height) {
    try {
      await executeResize(bot, chatId, userId, upload.url, upload.publicId, upload.resourceType, width, height, label);
    } catch (err) {
      console.error('❌ Resize failed:', err.message);
      await bot.sendMessage(chatId, `😕 Resize failed: ${err.message}`);
    }
    return { success: true };
  }

  // No caption or unrecognized caption — save photo, show platform buttons
  await setSession(userId, {
    step:         'waiting_for_resize_platform',
    imageUrl:     upload.url,
    publicId:     upload.publicId,
    resourceType: upload.resourceType,
  });

  await bot.sendMessage(
    chatId,
    '📐 *What platform is this for?*\n\nTap a platform or choose custom size:',
    { parse_mode: 'Markdown', ...PLATFORM_KEYBOARD }
  );

  return { success: true };
};

/**
 * Handle platform button tap or custom size callback
 * callback_data formats:
 * - "rz_500_500_WhatsApp DP"  → instant resize
 * - "rz_custom"               → ask for custom dimensions
 */
const handleResizeCallback = async (bot, callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const userId = callbackQuery.from.id;
  const data   = callbackQuery.data;

  await bot.answerCallbackQuery(callbackQuery.id);

  const session = await getSession(userId);
  if (!session?.imageUrl) {
    await bot.sendMessage(chatId, '⏰ Session expired. Please send the image again.');
    return;
  }

  // Custom size — ask user to type dimensions
  if (data === 'rz_custom') {
    await setSession(userId, { ...session, step: 'waiting_for_resize_dimensions' });
    await bot.sendMessage(
      chatId,
      '✏️ Type your custom dimensions:\n\nExample: *586x342* or *1200x630*',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Platform selected — parse callback data
  // format: rz_WIDTH_HEIGHT_LABEL
  const withoutPrefix = data.replace('rz_', '');
  const firstUnderscore  = withoutPrefix.indexOf('_');
  const secondUnderscore = withoutPrefix.indexOf('_', firstUnderscore + 1);

  const width  = parseInt(withoutPrefix.substring(0, firstUnderscore));
  const height = parseInt(withoutPrefix.substring(firstUnderscore + 1, secondUnderscore));
  const label  = withoutPrefix.substring(secondUnderscore + 1);

  try {
    await executeResize(
      bot, chatId, userId,
      session.imageUrl, session.publicId, session.resourceType,
      width, height, label
    );
  } catch (err) {
    console.error('❌ Resize failed:', err.message);
    await bot.sendMessage(chatId, `😕 Resize failed: ${err.message}`);
    await clearSession(userId);
  }
};

/**
 * Handle typed custom dimensions
 */
const handleResizeDimensionsInput = async (bot, chatId, userId, text) => {
  const session = await getSession(userId);
  if (!session?.imageUrl) {
    await bot.sendMessage(chatId, '⏰ Session expired. Please send the image again.');
    return;
  }

  let width, height, label;
  const dims = parseDimensions(text);
  if (dims) {
    width = dims.width; height = dims.height; label = `${width}×${height}`;
  } else {
    const preset = detectPreset(text);
    if (preset) { width = preset.width; height = preset.height; label = preset.label; }
  }

  if (!width || !height) {
    await bot.sendMessage(
      chatId,
      '❓ Please type dimensions like *586x342* or *1200x630*',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  try {
    await executeResize(
      bot, chatId, userId,
      session.imageUrl, session.publicId, session.resourceType,
      width, height, label
    );
  } catch (err) {
    console.error('❌ Resize failed:', err.message);
    await bot.sendMessage(chatId, `😕 Resize failed: ${err.message}`);
    await clearSession(userId);
  }
};

module.exports = { imageResize, handleResizeCallback, handleResizeDimensionsInput };