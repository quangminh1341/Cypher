import { Client, GatewayIntentBits } from 'discord.js';
import fetch from 'node-fetch';
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
let notificationChannelId = '1313481298504978543'; // ID của kênh mặc định gửi thông báo

// Khi bot đã sẵn sàng
client.once('ready', () => {
  console.log('Bot is online!');
  autoUpdateRankList();  // Gọi hàm tự động cập nhật bảng xếp hạng
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
    const channel = await client.channels.fetch(notificationChannelId); // Lấy ID kênh từ biến notificationChannelId

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

// API để thay đổi ID của máy chủ
app.post('/api/set-guild-id', (req, res) => {
  const { newGuildId } = req.body;

  if (!newGuildId || typeof newGuildId !== 'string') {
    return res.status(400).json({ message: 'Invalid Guild ID' });
  }

  guildId = newGuildId;
  res.json({ message: `Guild ID đã được thay đổi thành ${guildId}` });
});

// API để thay đổi ID kênh gửi thông báo khi bắt đầu hoặc kết thúc trò chơi
app.post('/api/set-notification-channel', (req, res) => {
  const { newChannelId } = req.body;

  if (!newChannelId || typeof newChannelId !== 'string') {
    return res.status(400).json({ message: 'Invalid Channel ID' });
  }

  notificationChannelId = newChannelId;
  res.json({ message: `ID kênh gửi thông báo đã được thay đổi thành ${notificationChannelId}` });
});

// Lắng nghe trên cổng mà Render cung cấp
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Đăng nhập bot vào Discord
client.login(DISCORD_TOKEN);

// Khai báo biến lưu ID của tin nhắn bảng xếp hạng
let rankMessageId = null;

// Hàm tự động cập nhật bảng xếp hạng mỗi 10 phút
async function autoUpdateRankList() {
  const channelId = '1313481298504978543'; // ID của kênh nơi bảng xếp hạng sẽ được gửi vào
  const channel = await client.channels.fetch(channelId);

  setInterval(async () => {
    console.log("Cập nhật bảng xếp hạng...");
    await sendRankList(channel);
  }, 10 * 60 * 1000); // 10 phút = 10 * 60 * 1000 ms
}

// Hàm gửi bảng xếp hạng
async function sendRankList(channel) {
  try {
    // Tìm kiếm 10 người dùng có tổng thời gian chơi cao nhất
    const topUsers = await User.find({}).sort({ totalPlayTime: -1 }).limit(10);

    if (topUsers.length === 0) {
      console.log('Không có dữ liệu người dùng.');
      return;
    }

    // Tạo danh sách bảng xếp hạng
    let rankList = '';
    topUsers.forEach((user, index) => {
      rankList += `**${index + 1}.** <@${user.userId}> - **${user.totalPlayTime}** phút\n`;
    });

    // Lấy thông tin guild (server) từ Discord
    const guild = await client.guilds.fetch(guildId);

    // Lấy thông tin người chơi có số phút cao nhất
    const topPlayer = topUsers[0];

    // Lấy thông tin người dùng (User) từ Discord để lấy avatar
    const topPlayerUser = await client.users.fetch(topPlayer.userId);  // Fetch user object

    // Lấy avatar của server (guild) và bot
    const guildIcon = guild.iconURL();  // Icon của server
    const botAvatar = client.user.avatarURL();  // Icon của bot
    const topPlayerAvatar = topPlayerUser.avatarURL(); // Icon của người chơi có số điểm cao nhất

    // Tạo Embed cho bảng xếp hạng
    const embed = {
      embeds: [
        {
          description: rankList,
          color: 0x90f5e7, // Màu xanh lá
          author: {
            name: `Top Rank 10 Time Points`,
            icon_url: guildIcon,  // Icon của server
          },
          thumbnail: {
            url: topPlayerAvatar, // Thêm ảnh đại diện của người chơi có số điểm cao nhất
          },
          footer: {
            text: `Cập nhật lúc: ${new Date().toLocaleString('vn-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
            icon_url: botAvatar,  // Icon của bot
          },
        },
      ],
    };

    await channel.send(embed);  // Gửi bảng xếp hạng vào kênh
  } catch (error) {
    console.error('Error fetching rank:', error);
  }
}

// Lắng nghe tin nhắn mới để thực hiện các lệnh
client.on('messageCreate', async (message) => {
  // Lệnh !ranktime
  if (message.content === '!ranktime') {
    const channel = message.channel;  // Lấy channel của tin nhắn đang được gửi
    await sendRankList(channel);  // Gửi bảng xếp hạng hoặc chỉnh sửa tin nhắn đã gửi
  }

  // Lệnh !deltimeall
  if (message.content === '!deltimeall') {
    // Kiểm tra xem người gửi có ID là 389350643090980869 hay không
    if (message.author.id !== '389350643090980869') {
      return message.reply('Bạn không có quyền sử dụng lệnh này.');
    }

    try {
      // Xóa dữ liệu tổng thời gian chơi của tất cả người dùng
      await User.updateMany({}, { $set: { totalPlayTime: 0 } });

      // Gửi thông báo đã xóa thành công
      message.reply('Đã xóa tổng thời gian chơi của tất cả người dùng.');
    } catch (error) {
      console.error('Error while clearing total play time:', error);
      message.reply('Có lỗi xảy ra khi xóa dữ liệu.');
    }
  }
});
