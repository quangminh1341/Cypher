import { Client, GatewayIntentBits } from 'discord.js';
import fetch from 'node-fetch';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import http from 'http';

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

// Khi có sự thay đổi trạng thái của người dùng
client.on('presenceUpdate', async (oldPresence, newPresence) => {
  if (!newPresence || !newPresence.activities) return;

  const member = newPresence.member;
  const userId = member.user.id;

  let user = await User.findOne({ userId });

  // Kiểm tra trạng thái chơi Liên Minh Huyền Thoại
  const isPlayingLol = newPresence.activities.some(activity => activity.name === "League of Legends");
  const isInLobby = newPresence.activities.some(activity => activity.state === "In Lobby" || activity.state === "Đang trong sảnh chờ");

  // Bỏ qua khi người dùng đang trong trạng thái "In Lobby" hoặc "Đang trong sảnh chờ"
  if (isInLobby) {
    return;
  }

  // Nếu người dùng chưa có bản ghi và bắt đầu chơi Liên Minh Huyền Thoại lần đầu
  if (isPlayingLol && !user) {
    user = new User({ userId, playing: true, startTime: Date.now(), totalPlayTime: 0 });
    await user.save();
    sendToWebhook(`**${member.user.tag}** đã bắt đầu chơi Liên Minh Huyền Thoại lần đầu tiên.`);
  }

  // Nếu người dùng đã chơi Liên Minh Huyền Thoại và đã bắt đầu tính giờ
  if (isPlayingLol && user && !user.playing) {
    user.playing = true;
    user.startTime = Date.now();
    await user.save();
    sendToWebhook(`**${member.user.tag}** đã bắt đầu chơi Liên Minh Huyền Thoại.`);
  }

  // Nếu người dùng không còn chơi Liên Minh Huyền Thoại
  if (!isPlayingLol && user && user.playing) {
    // Tính thời gian chơi và lưu lại
    const playTime = calculatePlayTime(user.startTime); // Tính thời gian chơi
    user.totalPlayTime += playTime; // Cộng thêm thời gian chơi vào tổng thời gian

    user.playing = false; // Đánh dấu là không còn chơi nữa
    await user.save();

    // Gửi thông báo ngay lập tức sau khi tính tổng thời gian chơi
    sendToWebhook(`**${member.user.tag}** đã kết thúc trò chơi Liên Minh Huyền Thoại. Tổng thời gian đã chơi: **${user.totalPlayTime}** phút.`);
  }
});

// Lệnh để kiểm tra tổng thời gian chơi của người dùng theo mention (@user)
client.on('messageCreate', async (message) => {
  if (message.content.startsWith('!time')) {
    const mentionedUser = message.mentions.users.first(); // Lấy người dùng đầu tiên được mention

    if (!mentionedUser) {
      message.channel.send('Vui lòng mention người dùng mà bạn muốn kiểm tra thời gian chơi!');
      return;
    }

    const userId = mentionedUser.id;
    const user = await User.findOne({ userId });

    if (user) {
      message.channel.send(`Tổng thời gian chơi của **${mentionedUser.tag}** là: **${user.totalPlayTime}** phút.`);
    } else {
      message.channel.send(`Người dùng này chưa có dữ liệu trò chơi.`);
    }
  }

  // Lệnh xóa dữ liệu tổng giờ chơi của một người dùng
  if (message.content.startsWith('!deltime')) {
    const mentionedUser = message.mentions.users.first();

    if (!mentionedUser) {
      message.channel.send('Vui lòng mention người dùng mà bạn muốn xóa dữ liệu!');
      return;
    }

    const userId = mentionedUser.id;
    const user = await User.findOne({ userId });

    if (user) {
      await User.deleteOne({ userId });  // Xóa dữ liệu của người dùng
      message.channel.send(`Đã xóa dữ liệu tổng thời gian chơi của **${mentionedUser.tag}**.`);
    } else {
      message.channel.send(`Người dùng này không có dữ liệu tổng thời gian chơi.`);
    }
  }

  // Lệnh xóa tất cả dữ liệu tổng giờ chơi
  if (message.content.startsWith('!deltimeall')) {
    await User.deleteMany({});  // Xóa tất cả dữ liệu
    message.channel.send('Đã xóa tất cả dữ liệu tổng thời gian chơi.');
  }
});

// Đăng nhập bot vào Discord
client.login(DISCORD_TOKEN);

// Tạo server HTTP để tránh lỗi Port Binding của Render
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is running');
});

// Lắng nghe trên cổng mà Render cung cấp
const PORT = process.env.PORT || 3000;  // Sử dụng cổng Render cung cấp hoặc cổng mặc định 3000
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
