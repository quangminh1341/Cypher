import { Client, GatewayIntentBits } from 'discord.js';
import fetch from 'node-fetch';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import express from 'express';

// Nạp các biến môi trường từ tệp .env
dotenv.config();

// Token của bot Discord và URL Webhook
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const MONGO_URI = process.env.MONGO_URI;

// Tạo client Discord
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences, // Intent để theo dõi trạng thái người dùng
    GatewayIntentBits.MessageContent // Intent để lấy nội dung tin nhắn
  ]
});

// Kết nối đến MongoDB
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Failed to connect to MongoDB:', err));

// Tạo schema và model cho người dùng
const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  playing: { type: Boolean, default: false },
  startTime: { type: Number, default: null },
  totalPlayTime: { type: Number, default: 0 }
});

const User = mongoose.model('User', userSchema);

// Hàm gửi dữ liệu tới Webhook
async function sendToWebhook(message) {
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message })
    });

    if (!response.ok) {
      console.error('Failed to send message to webhook:', response.statusText);
    } else {
      console.log('Message sent successfully to webhook');
    }
  } catch (error) {
    console.error('Error sending webhook:', error);
  }
}

// Khi bot đã sẵn sàng
client.once('ready', () => {
  console.log('Bot is online!');
});

// Hàm tính thời gian chơi (dưới dạng phút)
function calculatePlayTime(startTime) {
  const endTime = Date.now();
  const diff = endTime - startTime; // tính thời gian chơi
  const minutes = Math.floor(diff / 60000); // Chuyển sang phút
  return minutes;
}

// API để lấy thông tin IP người dùng
const app = express();
app.use(express.json());

app.get('/api/ip', (req, res) => {
  // Lấy IP từ header X-Forwarded-For hoặc X-Real-IP
  let user_ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'];

  if (!user_ip) {
    // Dự phòng nếu không có thông tin từ các headers trên
    user_ip = req.connection.remoteAddress || req.socket.remoteAddress;
  }

  res.send({ ip: user_ip }); // Trả về IP dưới dạng JSON
});

// Lắng nghe trên cổng mà Render cung cấp
const PORT = process.env.PORT || 3000;  // Sử dụng cổng Render cung cấp hoặc cổng mặc định 3000
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Đăng nhập bot vào Discord
client.login(DISCORD_TOKEN);

// Xử lý lệnh !verify trong Discord
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;  // Bỏ qua tin nhắn từ bot khác

  if (message.content === '!verify') {
    try {
      // Lấy IP thực của người dùng từ API /api/ip
      const response = await fetch('http://localhost:3000/api/ip');
      const data = await response.json();
      const userIp = data.ip;

      // Kiểm tra IP của người dùng
      if (userIp === '121.151.78.34') {
        message.reply('Hoàn tất');
      } else {
        message.reply(`IP của bạn không khớp. IP hiện tại của bạn là ${userIp}`);
      }
    } catch (error) {
      console.error('Error while fetching IP:', error);
      message.reply('Có lỗi xảy ra khi kiểm tra IP.');
    }
  }
});
