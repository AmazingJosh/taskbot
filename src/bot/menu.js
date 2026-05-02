/**
 * Telegram Inline Keyboard Menu System
 * 
 * Only shows tasks that are currently built and working.
 * Uncomment items as you add each feature.
 */

const MAIN_MENU = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: "🖼 Image Magic", callback_data: "menu_image" },
        { text: "🎙 Transcription", callback_data: "task_transcription" },
      ],
      [
        // Uncomment as you build each section:
        // { text: "📄 Documents", callback_data: "menu_docs" },
        // { text: "🌍 Language & Text", callback_data: "menu_language" },
        // { text: "🌤 Info & Tools", callback_data: "menu_info" },
      ],
    ],
  },
};

const IMAGE_MENU = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: "✂️ Remove Background", callback_data: "task_background_removal" },
        { text: "🌀 Blur Background", callback_data: "task_background_blur" },
      ],
      [
        { text: "🎨 Swap Background", callback_data: "task_background_swap" },
        { text: "🎭 Cartoonify Me", callback_data: "task_cartoonify" },
      ],
      [
        { text: "⏳ Era Transform", callback_data: "task_era_transform" },
        { text: "👔 Change Outfit", callback_data: "task_outfit_change" },
      ],
      [
        { text: "🖼 Painting Style", callback_data: "task_painting_style" },
        { text: "💼 Pro Headshot", callback_data: "task_professional_headshot" },
      ],
      [
        { text: "🧸 Action Figure", callback_data: "task_action_figure" },
        { text: "😄 Caricature", callback_data: "task_caricature" },
      ],
      [
        { text: "😂 Meme Generator", callback_data: "task_meme_generator" },
      ],
      [{ text: "⬅️ Back", callback_data: "menu_main" }],
    ],
  },
};

// ── Coming soon menus (uncomment as you build) ────────
const DOCS_MENU = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: "📦 Compress PDF", callback_data: "task_pdf_compress" },
        { text: "🔄 Convert File", callback_data: "task_pdf_convert" },
      ],
      [{ text: "⬅️ Back", callback_data: "menu_main" }],
    ],
  },
};

const LANGUAGE_MENU = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: "🌍 Translate Text", callback_data: "task_translation" },
        { text: "🔊 Text to Speech", callback_data: "task_text_to_speech" },
      ],
      [
        { text: "📝 Summarize", callback_data: "task_summarize" },
      ],
      [{ text: "⬅️ Back", callback_data: "menu_main" }],
    ],
  },
};

const INFO_MENU = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: "🌤 Weather", callback_data: "task_weather" },
        { text: "💱 Currency Convert", callback_data: "task_currency_convert" },
      ],
      [{ text: "⬅️ Back", callback_data: "menu_main" }],
    ],
  },
};

const TASK_PROMPTS = {
  background_removal: "✂️ *Remove Background*\n\nSend me the photo!",
  background_blur: "🌀 *Blur Background*\n\nSend me the photo and I'll blur the background!",
  background_swap: "🎨 *Swap Background*\n\nSend me your photo + describe the background you want!\n\nExample: photo + caption *\"beach in Maldives\"*\n\nOr caption *\"use my own background\"* to upload yours!",
  cartoonify: "🎭 *Cartoonify Me*\n\nSend your photo! Add a style in the caption:\n• *Pixar* (default)\n• *Anime*\n• *Disney*\n• *Simpson*",
  era_transform: "⏳ *Era Transform*\n\nSend your photo + the era in the caption!\n\nExamples: *1920s, medieval, victorian, futuristic*",
  outfit_change: "👔 *Change Outfit*\n\nSend your photo + describe the outfit in the caption!\n\nExample: *suit and tie* or *traditional Nigerian attire*",
  painting_style: "🖼 *Painting Style*\n\nSend your photo + style in caption!\n\nStyles: *oil paint, watercolor, sketch, van gogh, pop art*",
  professional_headshot: "💼 *Professional Headshot*\n\nSend your photo and I'll make it look professional!",
  action_figure: "🧸 *Action Figure*\n\nSend your photo + style in caption!\n\nExamples: *Marvel, Barbie, LEGO*",
  caricature: "😄 *Caricature*\n\nSend your photo and I'll create a fun caricature!",
  meme_generator: "😂 *Meme Generator*\n\nSend a photo to turn into a meme!\n\nAfter sending I'll ask for your top and bottom text.",
  transcription: "🎙 *Transcribe Audio*\n\nSend me a voice note, audio file, or video!",
  // Coming soon:
  pdf_compress: "📦 *Compress PDF*\n\nSend me the PDF file!",
  pdf_convert: "🔄 *Convert File*\n\nSend the file + target format in caption!\n\nExample: PDF + *\"convert to Word\"*",
  translation: "🌍 *Translate*\n\nSend the text + target language!\n\nExample: *\"Translate to Yoruba: Hello\"*",
  text_to_speech: "🔊 *Text to Speech*\n\nSend me the text to convert to audio!",
  weather: "🌤 *Weather*\n\nWhich city?\n\nExample: *\"Weather in Lagos\"*",
  currency_convert: "💱 *Currency*\n\nExample: *\"500 USD to NGN\"*",
};

module.exports = { MAIN_MENU, IMAGE_MENU, DOCS_MENU, LANGUAGE_MENU, INFO_MENU, TASK_PROMPTS };