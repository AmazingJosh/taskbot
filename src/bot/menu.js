/**
 * menu.js — single source of truth for ALL menu content.
 * Text, buttons, prompts — all lives here.
 * callbackHandler just imports and uses these, never defines its own text.
 */

// ─────────────────────────────────────────────────────────────
// MESSAGES
// ─────────────────────────────────────────────────────────────

const WELCOME_MESSAGE = `🌟 *Welcome to LifeBot — Life Made Easy!*

Hey {name}! 👋

Tired of opening 10 different websites just to get simple things done?

*Not anymore.* I handle it all — right here in one chat. No logins. No uploads. No stress. Just tap and it's done. ✅

Here's what I can do for you *right now:*

✂️ Remove image backgrounds
🌀 Blur backgrounds instantly  
📦 Compress oversized PDFs
📝 Convert PDF ↔ Word, JPG & more
🔀 Merge, split, unlock & repair PDFs

_🍳 And trust me... what's cooking in the kitchen is going to blow your mind. Stay close._

👇 *Tap a task below to get started!*`;

const MENU_MESSAGE = `🌟 *LifeBot — Life Made Easy*
_One tap. Task done. Simple._

👇 What are we doing today?`;

const DOCS_MESSAGE = `📄 *PDF & Documents*
_All your file headaches, solved in one tap._

👇 Pick a task:`;

const COMING_SOON_MESSAGE = `🍳 Something amazing is cooking...

We're working on powerful new features that'll make your jaw drop. 

Stay close — it's dropping soon! 🚀`;

// ─────────────────────────────────────────────────────────────
// KEYBOARDS
// ─────────────────────────────────────────────────────────────

const MAIN_MENU = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: "✂️ Remove Background", callback_data: "task_background_removal" },
        { text: "🌀 Blur Background",   callback_data: "task_background_blur"    },
      ],
      [
        { text: "📄 PDF Tools",         callback_data: "menu_docs"               },
      ],
      [
        { text: "🔜 More coming soon...", callback_data: "coming_soon"           },
      ],
    ],
  },
};

const DOCS_MENU = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: "📦 Compress PDF",         callback_data: "task_pdf_compress"   },
      ],
      [
        { text: "📄 Word/Excel/PPT → PDF", callback_data: "task_office_to_pdf"  },
        { text: "🖼 PDF → JPG",            callback_data: "task_pdf_to_jpg"     },
      ],
      [
        { text: "📄 Image → PDF",          callback_data: "task_image_to_pdf"   },
        { text: "🔀 Merge PDFs",           callback_data: "task_pdf_merge"      },
      ],
      [
        { text: "✂️ Split PDF",            callback_data: "task_pdf_split"      },
        { text: "🔓 Unlock PDF",           callback_data: "task_pdf_unlock"     },
      ],
      [
        { text: "🔧 Repair PDF",           callback_data: "task_pdf_repair"     },
      ],
      [
        { text: "⬅️ Back",                 callback_data: "menu_main"           },
      ],
    ],
  },
};

// ─────────────────────────────────────────────────────────────
// TASK PROMPTS — shown after user taps a task button
// ─────────────────────────────────────────────────────────────

const TASK_PROMPTS = {
  background_removal: "✂️ *Remove Background*\n\nSend me the photo!",
  background_blur:    "🌀 *Blur Background*\n\nSend me the photo and I'll blur the background keeping you sharp!",
  image_resize: '📐 *Resize Image*\n\nSend me the image!\n\nAdd the size in caption:\n• "whatsapp dp"\n• "instagram post"\n• "passport"\n• "1200x630" (custom size)',
  pdf_compress:       "📦 *Compress PDF*\n\nSend me the PDF file!",
  office_to_pdf:      "📄 *Office → PDF*\n\nSend me a Word (.docx), Excel (.xlsx) or PowerPoint (.pptx) file!",
  pdf_to_jpg:         "🖼 *PDF → JPG*\n\nSend me the PDF to convert to images!",
  image_to_pdf:       "📄 *Image → PDF*\n\nSend me the image or photo to convert to PDF!",
  pdf_merge:          "🔀 *Merge PDFs*\n\nSend me the first PDF!\n\nKeep sending PDFs one by one, then type *\"merge now\"* when ready.",
  pdf_split:          "✂️ *Split PDF*\n\nSend me the PDF to split into separate pages!",
  pdf_unlock:         "🔓 *Unlock PDF*\n\nSend me the password-protected PDF to unlock!",
  pdf_repair:         "🔧 *Repair PDF*\n\nSend me the damaged or corrupted PDF to repair!",
};

module.exports = {
  WELCOME_MESSAGE,
  MENU_MESSAGE,
  DOCS_MESSAGE,
  COMING_SOON_MESSAGE,
  MAIN_MENU,
  DOCS_MENU,
  TASK_PROMPTS,
};