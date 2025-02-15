const {
  addCallbackButton,
  listCallbackButtons,
  editCallbackResponse,
} = require("./callback");
const { createClient } = require("@supabase/supabase-js");
const TelegramBot = require("node-telegram-bot-api");
const { tambahPesanHandler } = require("./tambah_pesan");

const supabase = createClient(
  "https://gtftsindekhywtwmoeie.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZnRzaW5kZWtoeXd0d21vZWllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjQxMjM0MTgsImV4cCI6MjAzOTY5OTQxOH0.t8z_I35XrHpdHz3QzLo05HS4THlOefcPf8rZElC6P9o"
);

const bot = new TelegramBot("6479315189:AAFeJP48GZRF9saJ7bCu52c0NIel76X9T8U", {
  polling: true,
});

const runBots = async () => {
  const { data: bots, error } = await supabase
    .from("user_bots")
    .select("id, token, bot_name, start_message");

  if (error) {
    console.error("Terjadi kesalahan saat mengambil daftar bot:", error);
    return;
  }

  bots.forEach((botData) => {
    const telegramBot = new TelegramBot(botData.token, { polling: true });

    telegramBot.on("message", async (msg) => {
      const chatId = msg.chat.id;
      const userMessage = msg.text && msg.text.trim().toLowerCase(); // Pastikan tidak null atau undefined

      if (!userMessage) {
        telegramBot.sendMessage(chatId, "Pesan tidak boleh kosong.");
        return;
      }

      // Periksa apakah ada pesan balasan yang sesuai di database
      const { data: messages, error: msgError } = await supabase
        .from("bot_messages")
        .select("message, callback_data, response, button_name")
        .eq("bot_id", botData.id);

      if (msgError) {
        console.error("Kesalahan saat mengambil pesan balasan:", msgError);
        telegramBot.sendMessage(
          chatId,
          "Terjadi kesalahan saat memproses pesan."
        );
        return;
      }

      const message = messages.find(
        (m) => m.message.toLowerCase() === userMessage
      );

      if (message) {
        if (!message.response) {
          telegramBot.sendMessage(chatId, "Balasan belum tersedia.");
          return;
        }

        if (message.callback_data && message.button_name) {
          const options = {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: message.button_name,
                    callback_data: message.callback_data,
                  },
                ],
              ],
            },
          };
          telegramBot.sendMessage(chatId, message.response, options);
        } else {
          telegramBot.sendMessage(chatId, message.response);
        }
      } else {
        telegramBot.sendMessage(chatId, "Perintah tidak dikenali.");
      }
    });

    telegramBot.on("callback_query", async (callbackQuery) => {
      const chatId = callbackQuery.message.chat.id;
      const callbackData = callbackQuery.data;

      const { data: callbackButtons, error: cbError } = await supabase
        .from("bot_messages")
        .select("response_button")
        .eq("callback_data", callbackData)
        .eq("bot_id", botData.id);

      if (cbError) {
        console.error("Kesalahan saat mengambil balasan callback:", cbError);
        telegramBot.sendMessage(
          chatId,
          "Terjadi kesalahan saat memproses callback."
        );
        return;
      }

      if (callbackButtons.length > 0) {
        const responseText = callbackButtons[0].response_button;
        if (!responseText) {
          telegramBot.sendMessage(
            chatId,
            "Balasan untuk callback tidak tersedia."
          );
          return;
        }
        telegramBot.sendMessage(chatId, responseText);
      } else {
        telegramBot.sendMessage(chatId, "Callback tidak dikenali.");
      }
    });
  });
};

// Fungsi untuk membuat bot baru dengan token API
module.exports = (bot) => {
  // Menambahkan bot dengan perintah /add <token_bot>
  bot.onText(/\/add (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const tokenApi = match[1].trim();

    try {
      // Membuat instance bot baru dengan token yang diberikan
      const newBot = new TelegramBot(tokenApi);

      // Mengambil informasi bot menggunakan getMe
      const botInfo = await newBot.getMe();

      if (!botInfo.username) {
        bot.sendMessage(
          chatId,
          "❌ Token tidak valid atau bot tidak ditemukan."
        );
        return;
      }

      const botName = botInfo.username;

      // Simpan bot ke database
      const { data, error } = await supabase.from("user_bots").insert([
        {
          user_id: chatId,
          token: tokenApi,
          bot_name: botName,
          start_message: "Selamat datang di bot baru Anda!",
        },
      ]);

      if (error) {
        console.error("Gagal menyimpan bot ke database:", error);
        bot.sendMessage(chatId, "❌ Terjadi kesalahan saat menyimpan bot.");
        return;
      }

      bot.sendMessage(chatId, `✅ Bot @${botName} berhasil ditambahkan!`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🤖 Setting Bot 🔧", callback_data: "buat_bot" }],
          ],
        },
      });
    } catch (error) {
      console.error("Gagal mengambil data bot:", error);
      bot.sendMessage(
        chatId,
        "❌ Token tidak valid atau tidak dapat mengambil data bot."
      );
    }
  });

  // Menampilkan daftar bot
  bot.on("callback_query", async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (data === "buat_bot") {
      const { data: bots, error } = await supabase
        .from("user_bots")
        .select("*")
        .eq("user_id", chatId);

      if (error) {
        console.error("Terjadi kesalahan saat mengambil daftar bot:", error);
        bot.sendMessage(
          chatId,
          "❌ Terjadi kesalahan dalam mengambil daftar bot."
        );
        return;
      }

      if (bots.length === 0) {
        bot.sendMessage(
          chatId,
          "Anda belum memiliki bot. Tambahkan bot dengan perintah: \n\n`/add token_bot` \n\nJika belum memiliki bot silahkan buat terlrbih dahulu di @BotFather dan ikuti instrusi nya.",
          { parse_mode: "Markdown" }
        );
      } else {
        const currentTime = new Date().toLocaleString();

        let botListMessage = `🌟 *Daftar Bot Anda:* 🌟\n\n`;
        botListMessage += `📅 *Waktu saat ini:* ${currentTime}\n\n`;

        bots.forEach((botItem, index) => {
          botListMessage += `\n${index + 1}. 🤖 *@${
            botItem.bot_name
          }* (✅ Aktif)\nTekan tombol di bawah untuk pengaturan bot.\n\n`;
        });

        const options = {
          reply_markup: {
            inline_keyboard: bots.map((botItem) => [
              {
                text: `⚙️ Kelola @${botItem.bot_name}`,
                callback_data: `bot_${botItem.id}`,
              },
            ]),
          },
        };

        bot.sendMessage(chatId, botListMessage, {
          parse_mode: "Markdown",
          reply_markup: options.reply_markup,
        });
      }
    } else if (data.startsWith("bot_")) {
      const botId = data.split("_")[1];
      const { data: botInfo, error } = await supabase
        .from("user_bots")
        .select("*")
        .eq("id", botId)
        .single();

      if (error || !botInfo) {
        console.error("Bot tidak ditemukan atau error:", error);
        bot.sendMessage(chatId, "❌ *Bot tidak ditemukan.*");
        return;
      }

      const userName = callbackQuery.message.chat.first_name;
      const currentTime = new Date().toLocaleString();
      const userId = callbackQuery.from.id;

      const commandListMessage = `
🌟 *Selamat datang, ${userName}!* 🌟

⚙️ *Bot: @${botInfo.bot_name}*  

🕒 *Waktu Saat Ini: ${currentTime}*  

📜 *Pengaturan Bot:*
1️⃣ Tambahkan atau ubah pesan balasan bot.

🔧 Pilih pengaturan bot melalui tombol di bawah ini.
`;

      const options = {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "📝 Atur Pesan Balasan",
                url: `http://xcreate.rf.gd/telegram/bot/tambah_pesan.php?id_user=${userId}`,
              },
            ],
            [
              {
                text: "🗑️ Hapus Bot",
                callback_data: `hapus_bot_${botInfo.id}`,
              },
            ],
            [
              {
                text: "🔙 Kembali ke Menu Utama",
                callback_data: "menu",
              },
            ],
          ],
        },
      };

      bot.sendMessage(chatId, commandListMessage, {
        parse_mode: "Markdown",
        reply_markup: options.reply_markup,
      });

      bot.on("callback_query", async (callbackQuery) => {
        const chatId = callbackQuery.message.chat.id;
        const callbackData = callbackQuery.data;

        const messageId = callbackQuery.message.message_id;

        // Memeriksa jika callback_data adalah untuk menambahkan pesan balasan
        if (callbackData.startsWith("add_message_")) {
          const userId = callbackQuery.from.id; // ID pengguna yang menekan tombol

          bot.sendMessage(
            userId,
            "Klik tombol di bawah untuk menambahkan pesan:",
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "Tambah Pesan",
                      url: `http://xcreate.rf.gd/telegram/bot/tambah_pesan.php?id_user=${userId}`,
                    },
                  ],
                ],
              },
            }
          );
        }

        // Memeriksa apakah callback_data adalah untuk menghapus bot
        if (callbackData.startsWith("hapus_bot_")) {
          const botId = callbackData.split("_")[2]; // Mendapatkan botId dari callback_data

          try {
            // Menghapus bot dari database berdasarkan botId
            const { data, error } = await supabase
              .from("user_bots")
              .delete()
              .eq("id", botId);

            if (error) {
              console.error("Gagal menghapus bot:", error);
              return bot.sendMessage(
                chatId,
                "❌ Terjadi kesalahan saat menghapus bot."
              );
            }

            // Menghapus pesan callback untuk konfirmasi
            bot.answerCallbackQuery(callbackQuery.id, {
              text: "Bot berhasil dihapus.",
            });

            // Mengirimkan pesan konfirmasi kepada pengguna
            bot.sendMessage(chatId, `✅ Bot berhasil dihapus!`);
          } catch (err) {
            console.error("Error saat menghapus bot:", err);
            bot.sendMessage(
              chatId,
              "❌ Terjadi kesalahan yang tidak terduga saat menghapus bot."
            );
          }
        }
      });
    } else if (data.startsWith("setting_callback_")) {
      const botId = data.split("_")[2];

      // Menampilkan daftar tombol callback yang sudah ada
      const buttonsMessage = await listCallbackButtons(botId);
      const options = {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "➕ Tambah Tombol Callback",
                callback_data: `add_callback_${botId}`,
              },
            ],
            [
              {
                text: "✏️ Edit Balasan Tombol Callback",
                callback_data: `edit_callback_${botId}`,
              },
            ],
            [{ text: "🔙 Kembali", callback_data: `bot_${botId}` }],
          ],
        },
      };
      bot.sendMessage(chatId, buttonsMessage, options);
      // Menangani callback dari tombol "➕ Tambah Pesan Balasan"
    } // Fungsi untuk menambahkan tombol callback
    else if (data.startsWith("add_callback_")) {
      const botId = data.split("_")[2];

      // Proses untuk menambahkan tombol callback
      bot.sendMessage(
        chatId,
        "Masukkan nama tombol callback yang akan ditambahkan."
      );

      // Listener sementara untuk memproses pesan dari pengguna yang sesuai chatId
      const messageListener = async (msg) => {
        if (msg.chat.id !== chatId) return; // Hanya memproses pesan dari pengguna yang sesuai

        const buttonName = msg.text.trim();
        bot.sendMessage(chatId, "Masukkan data callback untuk tombol ini.");

        // Menghapus listener setelah menerima pesan pertama
        bot.removeListener("message", messageListener);

        // Listener kedua untuk data callback
        const secondMessageListener = async (msg) => {
          if (msg.chat.id !== chatId) return;

          const callbackData = msg.text.trim();
          bot.sendMessage(chatId, "Masukkan balasan untuk tombol ini.");

          // Menghapus listener kedua setelah menerima data callback
          bot.removeListener("message", secondMessageListener);

          // Listener ketiga untuk balasan tombol
          const thirdMessageListener = async (msg) => {
            if (msg.chat.id !== chatId) return;

            const response = msg.text.trim();
            const result = await addCallbackButton(
              botId,
              buttonName,
              callbackData,
              response
            );
            bot.sendMessage(chatId, result);

            // Menghapus listener ketiga setelah selesai
            bot.removeListener("message", thirdMessageListener);
          };

          // Menunggu balasan untuk tombol
          bot.on("message", thirdMessageListener);
        };

        // Menunggu data callback
        bot.on("message", secondMessageListener);
      };

      // Menunggu nama tombol callback
      bot.on("message", messageListener);
    }

    // Fungsi untuk mengedit tombol callback
    else if (data.startsWith("edit_callback_")) {
      const botId = data.split("_")[2];

      // Menampilkan daftar tombol callback yang sudah ada
      const { data: callbacks, error } = await supabase
        .from("callback_buttons")
        .select("*")
        .eq("bot_id", botId);

      if (error || !callbacks.length) {
        bot.sendMessage(chatId, "Tidak ada tombol callback yang tersedia.");
        return;
      }

      let callbackListMessage = "🚀 *Daftar Tombol Callback:*\n\n";
      callbacks.forEach((callback, index) => {
        callbackListMessage += `${index + 1}. ${callback.button_name} - ${
          callback.response
        }\n`;
      });

      const options = {
        reply_markup: {
          inline_keyboard: callbacks.map((callback) => [
            {
              text: callback.button_name,
              callback_data: `edit_response_${callback.id}`,
            },
          ]),
        },
      };

      bot.sendMessage(chatId, callbackListMessage, options);
    }

    // Fungsi untuk mengedit balasan tombol callback
    else if (data.startsWith("edit_response_")) {
      const callbackId = data.split("_")[2];
      bot.sendMessage(chatId, "Masukkan balasan baru untuk tombol ini.");

      // Listener sementara untuk mengedit balasan
      const editListener = async (msg) => {
        if (msg.chat.id !== chatId) return; // Hanya memproses pesan dari pengguna yang sesuai

        const newResponse = msg.text.trim();
        const result = await editCallbackResponse(callbackId, newResponse);
        bot.sendMessage(chatId, result);

        // Menghapus listener setelah selesai
        bot.removeListener("message", editListener);
      };

      // Menunggu balasan untuk edit
      bot.on("message", editListener);
    }
  }),
    bot.on("callback_query", async (callbackQuery) => {
      const chatId = callbackQuery.message.chat.id;
      const callbackData = callbackQuery.data;

      // Mengedit pesan start
      if (callbackData.startsWith("edit_start_message_")) {
        const botId = callbackData.split("_")[3];
        await editStartMessage(bot, chatId, botId); // Panggil fungsi edit pesan start
      }

      // Menghapus bot
      if (callbackData.startsWith("hapus_bot_")) {
        const botId = callbackData.split("_")[2];
        await hapusBot(bot, chatId, botId); // Panggil fungsi hapus bot
      }
    });

  const editStartMessage = async (bot, chatId, botId) => {
    try {
      // Pastikan botId adalah integer
      botId = parseInt(botId, 10);

      // Meminta input pesan start baru dari pengguna
      bot.sendMessage(chatId, "Silakan masukkan pesan Start baru:");

      const messageListener = async (msg) => {
        if (msg.chat.id !== chatId) return; // Hanya memproses pesan dari pengguna yang mengirim perintah

        const newStartMessage = msg.text.trim();

        // Update pesan start di database
        const { error } = await supabase
          .from("user_bots")
          .update({ start_message: newStartMessage })
          .eq("id", botId);

        if (error) {
          console.error("Gagal mengupdate pesan start:", error);
          return bot.sendMessage(
            chatId,
            "❌ Terjadi kesalahan saat memperbarui pesan Start."
          );
        }

        bot.sendMessage(chatId, "✅ Pesan Start berhasil diperbarui!");
        bot.removeListener("message", messageListener); // Hapus listener setelah pesan diterima
      };

      bot.on("message", messageListener);
    } catch (err) {
      console.error("Error saat edit pesan start:", err);
      bot.sendMessage(chatId, "❌ Terjadi kesalahan yang tidak terduga.");
    }
  };

  // Fungsi untuk menghapus bot
  const hapusBot = async (bot, chatId, botId) => {
    try {
      // Menghapus bot dari database berdasarkan botId
      const { data, error } = await supabase
        .from("user_bots")
        .delete()
        .eq("id", botId);

      if (error) {
        console.error("Gagal menghapus bot:", error);
        return bot.sendMessage(
          chatId,
          "❌ Terjadi kesalahan saat menghapus bot."
        );
      }

      // Mengirimkan pesan konfirmasi kepada pengguna
      bot.sendMessage(chatId, "✅ Bot berhasil dihapus!");
    } catch (err) {
      console.error("Error saat menghapus bot:", err);
      bot.sendMessage(
        chatId,
        "❌ Terjadi kesalahan yang tidak terduga saat menghapus bot."
      );
    }
  };

  // Menjalankan bot dengan client Supabase
  runBots();
};
