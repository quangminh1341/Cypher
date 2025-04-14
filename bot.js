import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import axios from 'axios';
import express from 'express';

dotenv.config();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const SHEET_API = process.env.SHEET_API_URL;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.MessageContent
  ]
});

let guildId = '1311497270319124520';
let channelId = '1313481298504978543';

client.once('ready', () => {
  console.log('Bot is online!');
});

// Hàm tính thời gian chơi (phút)
function calculatePlayTime(startTime) {
  const endTime = Date.now();
  return Math.floor((endTime - startTime) / 60000);
}

// Xử lý khi trạng thái người dùng thay đổi
client.on('presenceUpdate', async (oldPresence, newPresence) => {
  if (!newPresence || !newPresence.activities || !newPresence.guild || newPresence.guild.id !== guildId) return;

  const member = newPresence.member;
  const userId = member.user.id;
  const displayName = member.displayName;

  console.log('Member Info:', member);
  console.log('Display Name:', displayName);

  const isPlayingLol = newPresence.activities.some(act => act.name === "League of Legends");
  const isInLobby = newPresence.activities.some(act => ["In Lobby", "Đang trong sảnh chờ", "Đang tìm trận"].includes(act.state));
  if (isInLobby) return;

  let user;
  try {
    const res = await axios.get(`${SHEET_API}?action=getUser&userId=${userId}`);
    user = res.data;
  } catch (err) {
    user = null;
  }

  if (isPlayingLol && !user?.userId) {
    await axios.post(SHEET_API, {
      userId,
      playing: true,
      startTime: Date.now(),
      totalPlayTime: 0,
      guildId,
      channelId,
      displayName
    });
    sendToChannel(member, "League of Legends", `**${member.user.tag}** đã bắt đầu chơi.`, 0x00FF00);
  }

  if (isPlayingLol && user && !user.playing) {
    await axios.post(SHEET_API, {
      userId,
      playing: true,
      startTime: Date.now(),
      totalPlayTime: user.totalPlayTime,
      guildId,
      channelId,
      displayName
    });
    sendToChannel(member, "League of Legends", `**${member.user.tag}** đã bắt đầu chơi.`, 0x00FF00);
  }

  if (!isPlayingLol && user && user.playing) {
    const playTime = calculatePlayTime(user.startTime);
    const total = user.totalPlayTime + playTime;

    await axios.post(SHEET_API, {
      userId,
      playing: false,
      startTime: null,
      totalPlayTime: total,
      guildId,
      channelId,
      displayName
    });

    sendToChannel(member, "League of Legends", `**${member.user.tag}** đã chơi **${playTime}** phút, tổng: **${total}** phút.`, 0xFF0000);
  }
});

// Hàm gửi thông báo vào kênh
async function sendToChannel(member, activityName, description, color) {
  try {
    const channel = await client.channels.fetch(channelId);
    const embed = {
      embeds: [
        {
          title: activityName,
          description: `${description} - **Tên hiển thị**: ${member.displayName}`, // Đảm bảo displayName được đưa vào
          color,
          footer: {
            text: `${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`
          }
        }
      ]
    };
    await channel.send(embed);
  } catch (error) {
    console.error('Lỗi gửi tin nhắn vào kênh:', error);
  }
}

// Khởi tạo Express app
const app = express();
app.use(express.json());

// API lấy bảng xếp hạng
app.get('/api/leaderboard', async (req, res) => {
  try {
    const response = await axios.get(`${SHEET_API}?action=leaderboard`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy bảng xếp hạng', error });
  }
});

// API lấy thông tin người dùng
app.get('/api/user/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const response = await axios.get(`${SHEET_API}?action=getUser&userId=${userId}`);
    if (response.data?.userId) {
      res.json({
        userId: response.data.userId,
        totalPlayTime: response.data.totalPlayTime,
        playing: response.data.playing,
        startTime: response.data.startTime,
        displayName: response.data.displayName || ""
      });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server khi lấy thông tin người dùng', error });
  }
});

// API lưu thông tin người dùng (nếu bạn muốn dùng thủ công)
app.post('/api/save-user', async (req, res) => {
  const { userId, playing, startTime, totalPlayTime, displayName } = req.body;

  if (!userId) {
    return res.status(400).json({ message: 'Thiếu userId' });
  }

  try {
    await axios.post(SHEET_API, {
      userId,
      playing,
      startTime,
      totalPlayTime,
      guildId,
      channelId,
      displayName
    });
    res.json({ message: 'Đã lưu thông tin người dùng' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server khi lưu thông tin người dùng', error });
  }
});

// API cập nhật Guild ID
app.post('/api/update-guild-id', (req, res) => {
  const { newGuildId } = req.body;

  if (!newGuildId) {
    return res.status(400).json({ message: 'Guild ID không được để trống' });
  }

  guildId = newGuildId;

  res.json({ message: `Cập nhật thành công Guild ID: ${guildId}` });
});

// API cập nhật Channel ID
app.post('/api/update-channel-id', (req, res) => {
  const { newChannelId } = req.body;

  if (!newChannelId) {
    return res.status(400).json({ message: 'Channel ID không được để trống' });
  }

  channelId = newChannelId;

  res.json({ message: `Cập nhật thành công Channel ID: ${channelId}` });
});

// Lệnh kiểm tra Guild ID và Channel ID
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  if (message.content === '!checkid') {
    return message.channel.send(
      `**Guild ID:** ${guildId}\n**Channel ID:** ${channelId}`
    );
  }
});

// Server chạy trên Render hoặc localhost
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot API đang chạy trên port ${PORT}`));

client.login(DISCORD_TOKEN);
