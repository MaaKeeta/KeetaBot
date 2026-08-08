// === โค้ดสำหรับรันบน Render.com (ระบบ Log 24 ชม. แบบเต็มสูบ) ===
const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');

// 📌 ระบบจำลอง Web Server เพื่อให้ Render.com รันผ่าน ไม่เออเร่อ Port
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('ระบบเก็บ Log 24 ชั่วโมงกำลังทำงาน!'));
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ดึง ID ห้องข้อความจากระบบตัวแปรลับ (หรือค่าสำรอง)
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || '1535687188048511036';

// ฟังก์ชันสำหรับจัดรูปแบบ วันที่/เวลา เป็น พ.ศ.
function getDateTimeStr() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const timeStr = `${hours}.${minutes}`;

    const day = now.getDate();
    const month = now.getMonth() + 1;
    const yearBE = now.getFullYear() + 543;
    const dateStr = `${day}/${month}/${yearBE}`;

    return `${timeStr} ${dateStr}`;
}

// ==========================================
// 1. ระบบ Voice, Stream, Camera Log
// ==========================================
client.on('voiceStateUpdate', (oldState, newState) => {
    const logChannel = newState.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;

    const member = newState.member;
    if (member.user.bot) return; // กรองบอทออก

    const timeDateStr = getDateTimeStr();

    // เข้าห้องว้อยส์
    if (!oldState.channelId && newState.channelId) {
        logChannel.send(`${timeDateStr} <@${member.id}> เข้าดิสVC **${newState.channel.name}**`);
    }
    // ออกจากห้องว้อยส์
    else if (oldState.channelId && !newState.channelId) {
        logChannel.send(`${timeDateStr} <@${member.id}> ออกจากดิสห้องว้อยส์ **${oldState.channel.name}**`);
    }
    // ย้ายห้องว้อยส์
    else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        logChannel.send(`${timeDateStr} <@${member.id}> ย้ายห้องจาก **${oldState.channel.name}** ไปยัง **${newState.channel.name}**`);
    }

    // ตรวจจับการเปิดกล้อง (Camera)
    if (!oldState.selfVideo && newState.selfVideo) {
        logChannel.send(`${timeDateStr} 📹 <@${member.id}> เริ่ม **เปิดกล้อง** ในห้อง **${newState.channel.name}**`);
    } else if (oldState.selfVideo && !newState.selfVideo) {
        logChannel.send(`${timeDateStr} 📴 <@${member.id}> ปิดกล้องในห้อง **${newState.channel.name}**`);
    }

    // ตรวจจับการสตรีมหน้าจอ (Stream)
    if (!oldState.streaming && newState.streaming) {
        logChannel.send(`${timeDateStr} 💻 <@${member.id}> เริ่ม **สตรีมหน้าจอ** ในห้อง **${newState.channel.name}**`);
    } else if (oldState.streaming && !newState.streaming) {
        logChannel.send(`${timeDateStr} 🛑 <@${member.id}> หยุดสตรีมหน้าจอในห้อง **${newState.channel.name}**`);
    }
});

// ==========================================
// 2. ระบบ Log ข้อความที่ถูกลบ (รูป, คลิป, ลิงก์, ข้อความ)
// ==========================================
client.on('messageDelete', async (message) => {
    if (!message.guild) return;
    if (message.author && message.author.bot) return; // กรองบอทออก

    const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;

    const timeDateStr = getDateTimeStr();
    const authorTag = message.author ? `<@${message.author.id}>` : 'ไม่ทราบผู้ใช้';

    let contentLog = `🗑️ **[ข้อความถูกลบ]** ${timeDateStr}\n👤 ผู้ส่ง: ${authorTag} | ส่งที่ช่อง: <#${message.channel.id}>`;

    // ถ้ามีข้อความตัวอักษรหรือลิงก์
    if (message.content) {
        contentLog += `\n💬 ข้อความที่ลบ: "${message.content}"`;
    }

    // ส่งข้อความแจ้งเตือนหลักก่อน
    await logChannel.send(contentLog);

    // ถ้ามีรูปภาพหรือไฟล์แนบ (คลิป/รูป) ให้ส่งลิงก์ไฟล์แนบตามไปด้วยเป็นหลักฐาน
    if (message.attachments.size > 0) {
        let attachmentUrls = [];
        message.attachments.forEach(attachment => {
            attachmentUrls.push(attachment.url);
        });
        await logChannel.send(`📎 **ไฟล์/รูปภาพที่แนบมาด้วย:**\n${attachmentUrls.join('\n')}`);
    }
});

client.once('clientReady', () => {
    console.log(`🤖 บอท ${client.user.tag} ออนไลน์พร้อมระบบเก็บ Log 24 ชม.! (Render)`);
});

// ดึง Bot Token จากระบบตัวแปรลับ หรือใส่ Token ตรงๆ ไว้ก็ได้ครับ
client.login(process.env.DISCORD_TOKEN);
