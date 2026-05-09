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

/**
 * CORE LOGIC: Exact size with blur fill
 * Keeps original image fully visible, fills gaps with blurred background.
 */
const processBlurFill = async (imageBuffer, targetWidth, targetHeight) => {
  // 1. Create blurred background (Cover)
  const blurredBg = await sharp(imageBuffer)
    .resize(targetWidth, targetHeight, { fit: 'cover', position: 'center' })
    .blur(25)
    .modulate({ brightness: 0.5 }) 
    .jpeg({ quality: 80 })
    .toBuffer();

  // 2. Scale original image (Inside)
  const scaledFg = await sharp(imageBuffer)
    .resize(targetWidth, targetHeight, { fit: 'inside', withoutEnlargement: false })
    .png() // PNG preserves edge quality for compositing
    .toBuffer();

  // 3. Merge
  return await sharp(blurredBg)
    .composite([{ input: scaledFg, gravity: 'center' }])
    .jpeg({ quality: 95 })
    .toBuffer();
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
 * MAIN ENTRY POINT
 */
const imageResize = async (bot, chatId, msg, params = {}) => {
  const userId = msg.from.id;
  const photo = msg.photo?.[msg.photo.length - 1] || 
                (msg.document?.mime_type?.startsWith('image/') ? msg.document : null);
  const caption = (msg.caption || msg.text || params.description || '').trim();

  if (!photo) {
    return bot.sendMessage(chatId, "🖼 *Image Resize*\n\nSend an image with a size or preset in the caption.\n\nExample: *\"1080x1080\"* or *\"whatsapp dp\"*", { parse_mode: 'Markdown' });
  }

  const dims = parseDimensions(caption) || detectPreset(caption);

  // Instant visual feedback in Telegram header
  await bot.sendChatAction(chatId, 'upload_photo');
  const upload = await uploadFileFromTelegram(photo.file_id, 'taskbot/resize');

  // If no size detected, save image to session and ask the user
  if (!dims) {
    setSession(userId, { 
      step: 'waiting_for_resize_dimensions', 
      imageUrl: upload.url, 
      publicId: upload.publicId 
    });
    return bot.sendMessage(chatId, "📐 *Image received!*\n\nWhat size do you need? Type dimensions like `1080x1080` or a preset name like `instagram story`.", { parse_mode: 'Markdown' });
  }

  // AUTO-PROCESS: Dimensions found in caption
  try {
    await bot.sendChatAction(chatId, 'upload_photo');
    
    const response = await axios.get(upload.url, { responseType: 'arraybuffer' });
    const resizedBuffer = await processBlurFill(Buffer.from(response.data), dims.width, dims.height);

    await bot.sendPhoto(chatId, resizedBuffer, { 
      caption: `✅ *${dims.label || 'Custom'}*: ${dims.width}x${dims.height}`,
      parse_mode: 'Markdown'
    });
    
    await deleteFromCloudinary(upload.publicId);
  } catch (err) {
    console.error("Resize Error:", err);
    await bot.sendMessage(chatId, "❌ Sorry, I failed to process that image.");
  }

  return { success: true };
};

/**
 * SECONDARY HANDLER: If user sends size via text AFTER sending photo
 */
const handleDimensionMessage = async (bot, chatId, userId, text) => {
  const session = getSession(userId);
  if (!session?.imageUrl) return;

  const dims = parseDimensions(text) || detectPreset(text);
  if (!dims) return bot.sendMessage(chatId, "❌ I didn't recognize that size. Try something like `1200x630`.");

  await bot.sendChatAction(chatId, 'upload_photo');
  
  try {
    const response = await axios.get(session.imageUrl, { responseType: 'arraybuffer' });
    const resized = await processBlurFill(Buffer.from(response.data), dims.width, dims.height);
    
    await bot.sendPhoto(chatId, resized, { 
      caption: `✅ *${dims.label || 'Custom'}*: ${dims.width}x${dims.height}`,
      parse_mode: 'Markdown'
    });
    
    await deleteFromCloudinary(session.publicId);
    clearSession(userId);
  } catch (e) {
    await bot.sendMessage(chatId, "❌ Error processing image.");
  }
};

module.exports = { imageResize, handleDimensionMessage };
