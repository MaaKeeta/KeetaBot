const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// ดึง ID ห้องข้อความจากระบบตัวแปรลับของ Railway (หรือค่าสำรอง)
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || '1535687188048511036';

client.on('voiceStateUpdate', (oldState, newState) => {
    const logChannel = newState.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;

    const member = newState.member;
    const now = new Date();

    // จัดฟอร์แมตเวลา (เช่น 19.50)
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const timeStr = `${hours}.${minutes}`;

    // จัดฟอร์แมตวันที่ พ.ศ. (เช่น 8/8/2569)
    const day = now.getDate();
    const month = now.getMonth() + 1;
    const yearBE = now.getFullYear() + 543;
    const dateStr = `${day}/${month}/${yearBE}`;

    // 1. กรณีเข้าห้องว้อยส์
    if (!oldState.channelId && newState.channelId) {
        logChannel.send(`${timeStr} ${dateStr} <@${member.id}> เข้าดิสห้อง **${newState.channel.name}**`);
    }
    // 2. กรณีออกจากห้องว้อยส์
    else if (oldState.channelId && !newState.channelId) {
        logChannel.send(`${timeStr} ${dateStr} <@${member.id}> ออกจากดิสห้อง **${oldState.channel.name}**`);
    }
    // 3. กรณีย้ายห้องว้อยส์
    else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        logChannel.send(`${timeStr} ${dateStr} <@${member.id}> ย้ายจากห้อง **${oldState.channel.name}** ไปยังห้อง **${newState.channel.name}**`);
    }
});

client.once('ready', () => {
    console.log(`บอท ${client.user.tag} ออนไลน์พร้อมใช้งานแล้ว!`);
});

// ดึง Bot Token จากระบบตัวแปรลับของ Railway
client.login(process.env.DISCORD_TOKEN);