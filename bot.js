// Lệnh !ranktime
if (message.content === '!ranktime') {
  try {
    const topUsers = await User.find({}).sort({ totalPlayTime: -1 }).limit(10);

    if (topUsers.length === 0) {
      return message.reply('Không có dữ liệu người dùng.');
    }

    let rankList = ' ';
    topUsers.forEach((user, index) => {
      rankList += `**${index + 1}.** <@${user.userId}> - **${user.totalPlayTime}** phút\n`;
    });

    // Lấy guild (server) và user có số phút cao nhất
    const guild = message.guild;
    const topPlayer = topUsers[0]; // Người có số phút cao nhất

    // Tạo Embed cho bảng xếp hạng
    const embed = {
      embeds: [
        {
          title: 'Top 10 Time Point Rank',
          description: rankList,
          color: 0x00FF00, // Màu xanh lá
          author: {
            name: `Server: ${guild.name}`, // Tên server
            icon_url: guild.iconURL(), // Thêm icon của server vào author
          },
          footer: {
            text: `Cập nhật lúc: ${new Date().toLocaleString('vn-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
            icon_url: guild.iconURL(), // Thêm icon của server vào footer
          },
          thumbnail: {
            url: topPlayer.avatarURL(), // Avatar của người chơi có số phút cao nhất
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

    let rankList = ' ';
    topUsers.forEach((user, index) => {
      rankList += `**${index + 1}.** <@${user.userId}> - **${user.totalPlayTime}** phút\n`;
    });

    // Lấy guild (server) và user có số phút cao nhất
    const guild = message.guild;
    const topPlayer = topUsers[0]; // Người có số phút cao nhất

    // Tạo Embed mới để chỉnh sửa tin nhắn
    const embed = {
      embeds: [
        {
          title: 'Top 10 Time Point Rank',
          description: rankList,
          color: 0x00FF00, // Màu xanh lá
          author: {
            name: `Server: ${guild.name}`, // Tên server
            icon_url: guild.iconURL(), // Thêm icon của server vào author
          },
          footer: {
            text: `Cập nhật lúc: ${new Date().toLocaleString('vn-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
            icon_url: guild.iconURL(), // Thêm icon của server vào footer
          },
          thumbnail: {
            url: topPlayer.avatarURL(), // Avatar của người chơi có số phút cao nhất
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
