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

let guildId = '747767032186929212';
let channelId = '1313481298504978543';

client.once('ready', () => {
  console.log('Bot is online!');
});

function calculatePlayTime(startTime) {
  const endTime = Date.now();
  return Math.floor((endTime - startTime) / 60000);
}

client.on('presenceUpdate', async (oldPresence, newPresence) => {
  if (!newPresence || !newPresence.activities || !newPresence.guild || newPresence.guild.id !== guildId) return;

  const member = newPresence.member;
  const userId = member.user.id;

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
      totalPlayTime: 0
    });
    sendToChannel(member, "League of Legends", `**${member.user.tag}** đã bắt đầu chơi.`, 0x00FF00);
  }

  if (isPlayingLol && user && !user.playing) {
    await axios.post(SHEET_API, {
      userId,
      playing: true,
      startTime: Date.now(),
      totalPlayTime: user.totalPlayTime
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
      totalPlayTime: total
    });

    sendToChannel(member, "League of Legends", `**${member.user.tag}** đã chơi **${playTime}** phút, tổng: **${total}** phút.`, 0xFF0000);
  }
});

async function sendToChannel(member, activityName, description, color) {
  try {
    const channel = await client.channels.fetch(channelId);
    const embed = {
      embeds: [
        {
          title: activityName,
          description,
          color,
          footer: {
            text: `${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`
          }
        }
      ]
    };
    await channel.send(embed);
  } catch (error) {
    console.error('Error sending to channel:', error);
  }
}

const app = express();
app.use(express.json());

app.post('/api/set-channel-id', async (req, res) => {
  const { newChannelId } = req.body;
  try {
    const channel = await client.channels.fetch(newChannelId);
    channelId = newChannelId;

    await axios.post(SHEET_API, {
      action: 'updateConfig',
      channelId
    });

    res.json({ message: 'Đã cập nhật channelId' });
  } catch (error) {
    res.status(500).json({ message: 'Channel không tồn tại', error });
  }
});

app.post('/api/set-guild-id', async (req, res) => {
  const { newGuildId } = req.body;
  guildId = newGuildId;

  await axios.post(SHEET_API, {
    action: 'updateConfig',
    guildId
  });

  res.json({ message: 'Đã cập nhật guildId' });
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const response = await axios.get(`${SHEET_API}?action=leaderboard`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy bảng xếp hạng', error });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot API đang chạy trên port ${PORT}`));

client.login(DISCORD_TOKEN);
