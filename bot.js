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
  totalPlayTime: { type: Number, default: 0 },
  webhookSent: { type: Boolean, default: false }  // Thêm trường webhookSent để theo dõi việc gửi webhook
});

const User = mongoose.model('User', userSchema);

// Khai báo guildId mặc định
let guildId = '747767032186929212'; // ID của máy chủ mặc định

// Biến toàn cục lưu ID tin nhắn bảng xếp hạng
let rankMessageId = null;  

// Hàm gửi dữ liệu tới Webhook theo dạng Embed
async function sendToWebhook(activityName, description, color, userId) {
  try {
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

    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(embed),
    });

    if (!response.ok) {
      console.error('Failed to send message to webhook:', response.statusText);
    } else {
      console.log('Message sent successfully to webhook');
      
      // Cập nhật trạng thái webhookSent khi gửi thành công
      const user = await User.findOne({ userId });
      if (user) {
        user.webhookSent = true;
        await user.save();
      }
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
    sendToWebhook(
      "League of Legends", // Title là tên trò chơi
      `**${member.user.tag}** đã bắt đầu chơi.`,
      0x00FF00, // Màu xanh lá
      userId
    );
  }

  // Nếu người dùng đã chơi Liên Minh Huyền Thoại và đã bắt đầu tính giờ
  if (isPlayingLol && user && !user.playing) {
    user.playing = true;
    user.startTime = Date.now();
    await user.save();
    sendToWebhook(
      "League of Legends",
      `**${member.user.tag}** đã bắt đầu chơi.`,
      0x00FF00, // Màu xanh lá
      userId // Truyền userId để kiểm tra trạng thái webhook
    );
  }

  // Nếu người dùng không còn chơi Liên Minh Huyền Thoại
  if (!isPlayingLol && user && user.playing) {
    // Kiểm tra nếu startTime không tồn tại
    if (!user.startTime) {
      console.error(`startTime không được định nghĩa cho người dùng ${userId}`);
      return;
    }

    const playTime = calculatePlayTime(user.startTime);
    user.totalPlayTime += playTime;
    user.playing = false;
    user.startTime = null;
    await user.save();
    sendToWebhook(
      "League of Legends",
      `**${member.user.tag}** đã chơi **${playTime}** phút, tổng thời gian đã chơi: **${user.totalPlayTime}** phút.`,
      0xFF0000, // Màu đỏ
      userId
    );
  }
});

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

// API để thay thế dữ liệu người dùng
app.post('/api/update-user', async (req, res) => {
  const { userId, playing, totalPlayTime, startTime } = req.body;

  if (!userId) {
    return res.status(400).json({ message: 'User ID is required' });
  }

  try {
    // Kiểm tra nếu người dùng tồn tại trong cơ sở dữ liệu
    let user = await User.findOne({ userId });

    if (!user) {
      // Nếu người dùng chưa có, tạo mới người dùng với các giá trị thay thế
      user = new User({
        userId,
        playing: playing || false,
        totalPlayTime: totalPlayTime || 0,
        startTime: startTime || null,
        webhookSent: false
      });
    } else {
      // Cập nhật dữ liệu người dùng với các giá trị mới
      user.playing = playing !== undefined ? playing : user.playing;
      user.totalPlayTime = totalPlayTime !== undefined ? totalPlayTime : user.totalPlayTime;
      user.startTime = startTime !== undefined ? startTime : user.startTime;
    }

    // Lưu thông tin người dùng
    await user.save();
    res.json({ message: 'User data updated successfully', user });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error', error });
  }
});

// Lắng nghe trên cổng mà Render cung cấp
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Đăng nhập bot vào Discord
client.login(DISCORD_TOKEN);

// Xử lý lệnh !verify trong Discord
client.on('messageCreate', async (message) => {
  if (message.author?.bot) return;

  // Lệnh !verify
  if (message.content === '!verify') {
    try {
      const response = await fetch('https://cypher-omu8.onrender.com/api/ip');
      const data = await response.json();
      const userIp = data.ip;

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

  // Lệnh !deltimeall
  if (message.content === '!deltimeall') {
    if (message.author.id !== '389350643090980869') {
      return message.reply('Bạn không có quyền sử dụng lệnh này.');
    }

    try {
      await User.updateMany({}, { $set: { totalPlayTime: 0 } });
      message.reply('Đã xóa tổng thời gian chơi của tất cả người dùng.');
    } catch (error) {
      console.error('Error while clearing total play time:', error);
      message.reply('Có lỗi xảy ra khi xóa dữ liệu.');
    }
  }

  // Lệnh !ranktime
  if (message.content === '!ranktime') {
    try {
      const topUsers = await User.find({}).sort({ totalPlayTime: -1 }).limit(10);

      if (topUsers.length === 0) {
        return message.reply('Không có dữ liệu người dùng.');
      }

      let rankList = '**Top 10 người chơi có tổng thời gian chơi cao nhất:**\n\n';
      topUsers.forEach((user, index) => {
        rankList += `**${index + 1}.** <@${user.userId}> - ${user.totalPlayTime} phút\n`;
      });

      // Tạo Embed cho bảng xếp hạng
      const embed = {
        embeds: [
          {
            title: 'Top 10 Time Point Rank',
            description: rankList,
            color: 0x00FF00, // Màu xanh lá
            footer: {
              text: `Cập nhật lúc: ${new Date().toLocaleString('vn-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
            },
          },
        ],
      };

      // Gửi bảng xếp hạng lần đầu tiên và lưu lại ID tin nhắn
      const rankMessage = await message.channel.send(embed);
      rankMessageId = rankMessage.id;  // Lưu lại ID tin nhắn

    } catch (error) {
      console.error('Error fetching rank:', error);
      message.reply('Có lỗi xảy ra khi lấy bảng xếp hạng.');
    }
  }
});

// Hàm tự động cập nhật bảng xếp hạng mỗi 30 phút
setInterval(async () => {
  if (!rankMessageId) {
    return;  // Nếu chưa có tin nhắn bảng xếp hạng nào thì không làm gì
  }

  try {
    const topUsers = await User.find({}).sort({ totalPlayTime: -1 }).limit(10);

    if (topUsers.length === 0) {
      console.log('Không có dữ liệu người dùng.');
      return;
    }

    let rankList = '**Top 10 người chơi có tổng thời gian chơi cao nhất:**\n\n';
    topUsers.forEach((user, index) => {
      rankList += `**${index + 1}.** <@${user.userId}> - ${user.totalPlayTime} phút\n`;
    });

    // Tạo Embed mới để chỉnh sửa tin nhắn
    const embed = {
      embeds: [
        {
          title: 'Top 10 Time Point Rank',
          description: rankList,
          color: 0x00FF00, // Màu xanh lá
          footer: {
            text: `Cập nhật lúc: ${new Date().toLocaleString('vn-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
          },
        },
      ],
    };

    // Lấy tin nhắn đã lưu ID và chỉnh sửa nó
    const rankMessage = await message.channel.messages.fetch(rankMessageId);
    rankMessage.edit(embed);  // Sửa lại tin nhắn bảng xếp hạng

  } catch (error) {
    console.error('Error fetching rank:', error);
  }
}, 30 * 60 * 1000);  // 30 phút (30 * 60 * 1000 ms)
