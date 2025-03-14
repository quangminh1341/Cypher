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

// Hàm gửi dữ liệu tới Webhook theo dạng Embed
async function sendToWebhook(activityName, description, color) {
  try {
    const embed = {
      embeds: [
        {
          title: activityName,
          description: description,
          color: color,
          footer: {
            text: `${new Date().toLocaleString()}`, // Footer chứa thời gian gửi
          },
        }
      ]
    };

    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(embed),
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

// Khi có sự thay đổi trạng thái của người dùng
client.on('presenceUpdate', async (oldPresence, newPresence) => {
  if (!newPresence || !newPresence.activities) return;

  const member = newPresence.member;
  const userId = member.user.id;

  let user = await User.findOne({ userId });

  // Kiểm tra trạng thái chơi Liên Minh Huyền Thoại
  const isPlayingLol = newPresence.activities.some(activity => activity.name === "League of Legends");
  const isInLobby = newPresence.activities.some(activity => activity.state === "In Lobby" || activity.state === "Đang trong sảnh chờ" || activity.state === "Đang tìm trận");

  // Bỏ qua khi người dùng đang trong trạng thái "In Lobby" hoặc "Đang trong sảnh chờ"
  if (isInLobby) {
    return;
  }

  // Nếu người dùng chưa có bản ghi và bắt đầu chơi Liên Minh Huyền Thoại lần đầu
  if (isPlayingLol && !user) {
    user = new User({ userId, playing: true, startTime: Date.now(), totalPlayTime: 0 });
    await user.save();
    sendToWebhook(
      "League of Legends", // Title là tên trò chơi
      `**${member.user.tag}** đã bắt đầu chơi.`,
      0x00FF00 // Màu xanh lá
    );
  }

  // Nếu người dùng đã chơi Liên Minh Huyền Thoại và đã bắt đầu tính giờ
  if (isPlayingLol && user && !user.playing) {
    user.playing = true;
    user.startTime = Date.now();
    await user.save();
    sendToWebhook(
      "League of Legends", // Title là tên trò chơi
      `**${member.user.tag}** đã bắt đầu chơi.`,
      0x00FF00 // Màu xanh lá
    );
  }

  // Nếu người dùng không còn chơi Liên Minh Huyền Thoại
  if (!isPlayingLol && user && user.playing) {
    // Tính thời gian chơi và lưu lại
    const playTime = calculatePlayTime(user.startTime); // Tính thời gian chơi
    user.totalPlayTime += playTime; // Cộng thêm thời gian chơi vào tổng thời gian

    user.playing = false; // Đánh dấu là không còn chơi nữa
    await user.save();

    // Gửi thông báo ngay lập tức sau khi tính tổng thời gian chơi
    sendToWebhook(
      "League of Legends", // Title là tên trò chơi
      `**${member.user.tag}** đã kết thúc trò chơi. Tổng thời gian đã chơi: **${user.totalPlayTime}** phút.`,
      0xFF0000 // Màu đỏ
    );
  }
});

// Tạo Express app
const app = express();
app.use(express.json());

// API để lấy thông tin IP người dùng
app.get('/api/ip', (req, res) => {
  // Lấy IP từ header X-Forwarded-For hoặc X-Real-IP
  let user_ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'];

  // Nếu không có IP trong các header, lấy từ địa chỉ kết nối hoặc socket
  if (!user_ip) {
    user_ip = req.connection.remoteAddress || req.socket.remoteAddress;
  }

  // Xử lý trường hợp có nhiều IP trong X-Forwarded-For (địa chỉ IP thực là cái đầu tiên)
  if (user_ip.includes(',')) {
    user_ip = user_ip.split(',')[0];
  }

  res.send({ ip: user_ip }); // Trả về IP dưới dạng JSON
});

// API để lấy thông tin người dùng
app.get('/api/user/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({
      userId: user.userId,
      totalPlayTime: user.totalPlayTime,
    });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error', error });
  }
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
      const response = await fetch('https://cypher-omu8.onrender.com/api/ip');  // Cập nhật URL API cho đúng với URL Render
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
