import { Client, GatewayIntentBits } from 'discord.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import express from 'express';


// Nạp các biến môi trường từ tệp .env
dotenv.config();

// Token của bot Discord và URL Webhook
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
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
  totalPlayTime: { type: Number, default: 0 },
  webhookSent: { type: Boolean, default: false }  // Thêm trường webhookSent để theo dõi việc gửi webhook
});

const User = mongoose.model('User', userSchema);

// Khai báo guildId mặc định
let guildId = '747767032186929212'; // ID của máy chủ mặc định

// Khai báo các biến lưu ID của tin nhắn bảng xếp hạng và ID của kênh
let rankMessageId = null;
let rankChannelId = null;

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
  if (!newPresence || !newPresence.activities || !newPresence.guild || newPresence.guild.id !== guildId) {
    return;
  }

  const member = newPresence.member;
  const userId = member.user.id;

  let user = await User.findOne({ userId });

  // Kiểm tra trạng thái chơi Liên Minh Huyền Thoại
  const isPlayingLol = newPresence.activities.some(activity => activity.name === "League of Legends");
  const isInLobby = newPresence.activities.some(activity => activity.state === "In Lobby" || activity.state === "Đang trong sảnh chờ" || activity.state === "Đang tìm trận");
  if (isInLobby) {
    return;
  }

  // Nếu người dùng chưa có bản ghi và bắt đầu chơi Liên Minh Huyền Thoại lần đầu
  if (isPlayingLol && !user) {
    user = new User({ userId, playing: true, startTime: Date.now(), totalPlayTime: 0 });
    await user.save();
    sendToChannel(member, "League of Legends", `**${member.user.tag}** đã bắt đầu chơi.`, 0x00FF00);
  }

  // Nếu người dùng đã chơi Liên Minh Huyền Thoại và đã bắt đầu tính giờ
  if (isPlayingLol && user && !user.playing) {
    user.playing = true;
    user.startTime = Date.now();
    await user.save();
    sendToChannel(member, "League of Legends", `**${member.user.tag}** đã bắt đầu chơi.`, 0x00FF00);
  }

  // Nếu người dùng không còn chơi Liên Minh Huyền Thoại
  if (!isPlayingLol && user && user.playing) {
    const playTime = calculatePlayTime(user.startTime);
    user.totalPlayTime += playTime;
    user.playing = false;
    user.startTime = null;
    await user.save();
    sendToChannel(member, "League of Legends", `**${member.user.tag}** đã chơi **${playTime}** phút, tổng thời gian đã chơi: **${user.totalPlayTime}** phút.`, 0xFF0000);
  }
});

// Hàm gửi Embed vào kênh Discord
async function sendToChannel(member, activityName, description, color) {
  try {
    const channel = await client.channels.fetch('1313481298504978543'); // ID của kênh nơi bạn muốn gửi tin nhắn

    const embed = {
      embeds: [
        {
          title: activityName,
          description: description,
          color: color,
          footer: {
            text: `${new Date().toLocaleString('vn-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`
          },
        }
      ]
    };

    await channel.send(embed);  // Gửi Embed vào kênh
  } catch (error) {
    console.error('Error sending message to channel:', error);
  }
}

// Tạo Express app
const app = express();
app.use(express.json());

// API để lấy thông tin IP người dùng
app.get('/api/ip', (req, res) => {
  let user_ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'];

  if (!user_ip) {
    user_ip = req.connection.remoteAddress || req.socket.remoteAddress;
  }

  if (user_ip.includes(',')) {
    user_ip = user_ip.split(',')[0];
  }

  res.send({ ip: user_ip });
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
// API để thay đổi ID kênh gửi tin nhắn
app.post('/api/set-channel-id', async (req, res) => {
  const { newChannelId } = req.body;

  if (!newChannelId || typeof newChannelId !== 'string') {
    return res.status(400).json({ message: 'Invalid Channel ID' });
  }

  try {
    // Kiểm tra kênh Discord có hợp lệ hay không
    const channel = await client.channels.fetch(newChannelId);
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    // Cập nhật channelId
    channelId = newChannelId;  // Thay đổi giá trị channelId

    return res.json({ message: `Channel ID đã được thay đổi thành ${channelId}` });
  } catch (error) {
    return res.status(500).json({ message: 'Error fetching channel', error });
  }
});

// API để thay đổi ID của máy chủ
app.post('/api/set-guild-id', (req, res) => {
  const { newGuildId } = req.body;

  if (!newGuildId || typeof newGuildId !== 'string') {
    return res.status(400).json({ message: 'Invalid Guild ID' });
  }

  guildId = newGuildId;
  res.json({ message: `Guild ID đã được thay đổi thành ${guildId}` });
});

// Lắng nghe trên cổng mà Render cung cấp
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Đăng nhập bot vào Discord
client.login(DISCORD_TOKEN);

// API để lấy bảng xếp hạng 10 người chơi có tổng thời gian chơi cao nhất
app.get('/api/leaderboard', async (req, res) => {
  try {
    // Lấy danh sách 10 người có tổng thời gian chơi cao nhất
    const topUsers = await User.find({}).sort({ totalPlayTime: -1 }).limit(10);

    if (topUsers.length === 0) {
      return res.status(404).json({ message: "Không có dữ liệu người dùng." });
    }

    // Lấy thông tin người chơi có số phút cao nhất
    const topPlayer = topUsers[0];
    const topPlayerUser = await client.users.fetch(topPlayer.userId);
    const topPlayerAvatar = topPlayerUser.avatarURL();

    // Chuẩn bị dữ liệu bảng xếp hạng dưới dạng Markdown
    const leaderboardText = topUsers
      .map(
        (user, index) => `**${index + 1}.** <@${user.userId}>: **${user.totalPlayTime}** phút`
      )
      .join("\n");

    const updatedTime = new Date().toLocaleString('vn-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

    res.json({
      leaderboard: leaderboardText,
      topPlayerIcon: topPlayerAvatar,
      updatedTime: updatedTime
    });
  } catch (error) {
    res.status(500).json({ message: "Lỗi khi lấy bảng xếp hạng.", error });
  }
});
