const { Client, GatewayIntentBits, AuditLogEvent, ActivityType, AttachmentBuilder } = require('discord.js');
const express = require('express');
const { createCanvas, loadImage } = require('canvas');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('ระบบเก็บ Log 24 ชั่วโมงกำลังทำงาน!'));
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,      // สำหรับ Welcome, Goodbye, Boost
        GatewayIntentBits.GuildModeration    // เพิ่มสิทธิ์นี้เพื่อให้บอทรู้เวลาคนโดนแบน
    ]
});

// ไอดีห้องสำหรับเก็บ Log วอยซ์/ข้อความ
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || '1535687188048511036';
// ไอดีห้องสำหรับส่งรูปภาพ (เข้า, ออก, แบน, บูสต์)
const EVENT_CHANNEL_ID = '1393842157189730356'; 

function getDateStr() {
    const optionsDate = { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'numeric', year: 'numeric' };
    const dateString = new Intl.DateTimeFormat('en-GB', optionsDate).format(new Date()); 
    const [day, month, yearCE] = dateString.split('/');
    const yearBE = parseInt(yearCE) + 543;
    return `${day}/${month}/${yearBE}`;
}

// ==========================================
// 🛠️ ฟังก์ชันหลักสำหรับสร้างรูปภาพ (ช่วยประหยัด RAM)
// ==========================================
async function generateBanner(user, config) {
    const canvas = createCanvas(1024, 500);
    const ctx = canvas.getContext('2d');

    // 1. ใส่พื้นหลัง
    const background = await loadImage(path.join(__dirname, config.bgFile));
    ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

    // 2. วาดขอบวงกลมรูปโปรไฟล์ (สีตามที่กำหนด)
    ctx.beginPath();
    ctx.arc(512, 190, 130, 0, Math.PI * 2, true); // วงกลมใหญ่สำหรับเส้นขอบ
    ctx.fillStyle = config.borderColor;
    ctx.fill();
    ctx.closePath();

    // 3. ตัดขอบและใส่รูปโปรไฟล์
    ctx.beginPath();
    ctx.arc(512, 190, 120, 0, Math.PI * 2, true); // วงกลมเล็กสำหรับรูป
    ctx.closePath();
    ctx.clip(); 

    // ใช้ avatar ถ้าไม่มีให้ใช้รูปดิสคอร์ดพื้นฐาน
    const avatarURL = user.displayAvatarURL({ extension: 'png', size: 256 }) || user.defaultAvatarURL;
    const avatar = await loadImage(avatarURL);
    ctx.drawImage(avatar, 392, 70, 240, 240); 
    
    ctx.restore(); // ยกเลิกการตัดขอบเพื่อเขียนตัวหนังสือต่อ

    const ctxText = canvas.getContext('2d');

    // 4. เขียนคำบรรทัดแรก (Welcome, Banned, etc.)
    ctxText.font = '900 75px sans-serif'; 
    ctxText.fillStyle = config.titleColor;
    ctxText.textAlign = 'center';
    ctxText.lineWidth = 6;
    ctxText.strokeStyle = '#000000'; // ขอบดำให้ตัวหนังสือเด่น
    ctxText.strokeText(config.title, 512, 380); 
    ctxText.fillText(config.title, 512, 380);

    // 5. เขียนชื่อผู้ใช้บรรทัดล่าง
    ctxText.font = 'bold 45px sans-serif';
    ctxText.fillStyle = '#ffffff';
    ctxText.textAlign = 'center';
    ctxText.lineWidth = 4;
    ctxText.strokeStyle = '#000000';
    ctxText.strokeText(user.username.toUpperCase(), 512, 445);
    ctxText.fillText(user.username.toUpperCase(), 512, 445);

    return new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'event-banner.png' });
}

// ==========================================
// 1. ระบบ Voice, Stream, Camera Log
// ==========================================
client.on('voiceStateUpdate', (oldState, newState) => {
    const logChannel = newState.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;
    const member = newState.member;
    if (member.user.bot) return;

    const dateStr = getDateStr();
    if (!oldState.channelId && newState.channelId) {
        logChannel.send(`${dateStr} <@${member.id}> เข้าฟฟ **${newState.channel.name}**`);
    } else if (oldState.channelId && !newState.channelId) {
        logChannel.send(`${dateStr} <@${member.id}> ออก **${oldState.channel.name}**`);
    } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        logChannel.send(`${dateStr} <@${member.id}> ย้ายจาก **${oldState.channel.name}** ไป **${newState.channel.name}**`);
    }

    if (!oldState.selfVideo && newState.selfVideo) {
        logChannel.send(`${dateStr} 📹 <@${member.id}> เริ่ม **เปิดกล้อง** ในห้อง **${newState.channel.name}**`);
    } else if (oldState.selfVideo && !newState.selfVideo) {
        logChannel.send(`${dateStr} 📹 <@${member.id}> ปิดกล้องในห้อง **${newState.channel.name}**`);
    }

    if (!oldState.streaming && newState.streaming) {
        logChannel.send(`${dateStr} 🛑 <@${member.id}> เริ่ม **สตรีมหน้าจอ** ในห้อง **${newState.channel.name}**`);
    } else if (oldState.streaming && !newState.streaming) {
        logChannel.send(`${dateStr} 🛑 <@${member.id}> หยุดสตรีมหน้าจอในห้อง **${newState.channel.name}**`);
    }
});

// ==========================================
// 2. ระบบ Log ลบและแก้ไขข้อความ
// ==========================================
client.on('messageDelete', async (message) => {
    if (!message.guild) return;
    const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;
    const dateStr = getDateStr();
    const authorTag = message.author ? `<@${message.author.id}>` : 'ไม่ทราบผู้ใช้';
    let executorTag = `${authorTag} ลบเอง`; 

    try {
        const fetchedLogs = await message.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MessageDelete });
        const deletionLog = fetchedLogs.entries.first();
        if (deletionLog) {
            const { executor, target, createdTimestamp } = deletionLog;
            if (message.author && target.id === message.author.id && createdTimestamp > (Date.now() - 5000)) {
                executorTag = `<@${executor.id}>`; 
            }
        }
    } catch (error) {}

    let contentLog = `🗑️  ${dateStr} | ลบข้อความของ ${authorTag}\nคนลบ : ${executorTag} | ช่อง : <#${message.channel.id}>`;
    if (message.content) contentLog += `\n"${message.content}"`;
    await logChannel.send(contentLog);

    if (message.attachments.size > 0) {
        let attachmentUrls = [];
        message.attachments.forEach(attachment => attachmentUrls.push(attachment.url));
        await logChannel.send(attachmentUrls.join('\n'));
    }
});

client.on('messageUpdate', (oldMessage, newMessage) => {
    if (!newMessage.guild) return;
    if (newMessage.author && newMessage.author.bot) return; 
    if (!oldMessage.content || !newMessage.content || oldMessage.content === newMessage.content) return; 
    
    const logChannel = newMessage.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;
    const dateStr = getDateStr();
    logChannel.send(`✏️ ${dateStr} | แก้ไขข้อความ\nผู้ส่ง: <@${newMessage.author.id}> | ช่อง : <#${newMessage.channel.id}>\n"${oldMessage.content}"เป็น : "${newMessage.content}"`);
});

// ==========================================
// 3. ระบบ Auto-Reply
// ==========================================
client.on('messageCreate', (message) => {
    if (message.author.bot) return; 
    const content = message.content;
    const greetings = ['สวัสดีครับ', 'สวัสดีค่ะ', 'ดีครับ', 'ดีค่ะ', 'ดีจ้า', 'สวัสดีจ้า'];
    if (greetings.some(word => content.includes(word))) return message.reply('โฮ่ง!');
    if (content.includes('คิดถึงหมาคีตะ') || content.includes('คืดถึงหมาคีตะ')) return message.reply('แห่ะๆ');
    if (content.includes('คิดถึงคีตะ')) return message.reply('คิดถึงเหมือนกันครับ');
    if (content.includes('หมาคีตะ')) return message.reply('บ๊อกๆ');
});

// ==========================================
// 4. 🎨 ระบบส่งรูปภาพ (Welcome, Goodbye, Banned, Boost)
// ==========================================

// 🟢 4.1 คนเข้าเซิร์ฟเวอร์ (Welcome)
client.on('guildMemberAdd', async member => {
    const channel = member.guild.channels.cache.get(EVENT_CHANNEL_ID);
    if (!channel) return;
    try {
        const attachment = await generateBanner(member.user, {
            bgFile: 'welcome.png',
            title: 'WELCOME',
            titleColor: '#ffffff',
            borderColor: '#ffffff'
        });
        await channel.send({ files: [attachment] });
    } catch (error) { console.error('Error Welcome:', error); }
});

// 🔴 4.2 คนออกเซิร์ฟเวอร์ (Goodbye)
client.on('guildMemberRemove', async member => {
    const channel = member.guild.channels.cache.get(EVENT_CHANNEL_ID);
    if (!channel) return;
    try {
        const attachment = await generateBanner(member.user, {
            bgFile: 'goodbye.png',
            title: 'GOOD BYE',
            titleColor: '#ffffff',
            borderColor: '#ffffff'
        });
        await channel.send({ files: [attachment] });
    } catch (error) { console.error('Error Goodbye:', error); }
});

// 🔨 4.3 คนโดนแบน (Banned)
client.on('guildBanAdd', async ban => {
    const channel = ban.guild.channels.cache.get(EVENT_CHANNEL_ID);
    if (!channel) return;
    try {
        const attachment = await generateBanner(ban.user, {
            bgFile: 'ban.png',
            title: 'BANNED',
            titleColor: '#ff0000', // สีแดง
            borderColor: '#ff0000' // ขอบแดง
        });
        await channel.send({ files: [attachment] });
    } catch (error) { console.error('Error Banned:', error); }
});

// 🚀 4.4 คนบูสต์เซิร์ฟเวอร์ (Thank you)
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    const channel = newMember.guild.channels.cache.get(EVENT_CHANNEL_ID);
    if (!channel) return;
    
    // ตรวจสอบว่าเก่าไม่มีสถานะบูสต์ แต่ใหม่มีสถานะบูสต์ (เพิ่งกดบูสต์)
    if (!oldMember.premiumSince && newMember.premiumSince) {
        try {
            const attachment = await generateBanner(newMember.user, {
                bgFile: 'boost.png',
                title: 'THANK YOU',
                titleColor: '#ff66b2', // สีชมพู
                borderColor: '#ff66b2' // ขอบชมพู
            });
            await channel.send({ files: [attachment] });
        } catch (error) { console.error('Error Boost:', error); }
    }
});

// ==========================================
// 5. ระบบสถานะของบอท
// ==========================================
const statusList = [
    { name: 'custom', type: ActivityType.Custom, state: 'โฮ่ง' },
    { name: 'custom', type: ActivityType.Custom, state: 'หมามองไร' },
    { name: 'custom', type: ActivityType.Custom, state: 'คิดถึงกันมั้ย' },
    { name: 'custom', type: ActivityType.Custom, state: 'คิดถึงอะดิ้' },
    { name: 'custom', type: ActivityType.Custom, state: 'เห่า' },
    { name: 'custom', type: ActivityType.Custom, state: 'หอน' },
    { name: 'custom', type: ActivityType.Custom, state: 'ดีจ้า' },
    { name: 'custom', type: ActivityType.Custom, state: 'คิดถึงนะ' },
    { name: 'custom', type: ActivityType.Custom, state: 'หิววว' },
    { name: 'หมาที่ส่องโปรไฟล์', type: ActivityType.Watching },
    { name: 'หมาที่อยู่ในดิส', type: ActivityType.Watching },
    { name: 'เรื่องข้างบ้าน', type: ActivityType.Listening },
    { name: 'หมาเห่ากัน', type: ActivityType.Listening }
];

function setRandomStatus() {
    if (!client.user) return;
    const randomStatus = statusList[Math.floor(Math.random() * statusList.length)];
    client.user.setPresence({ activities: [randomStatus] });
} 

client.once('ready', () => {
    console.log(`บอท ${client.user.tag} ออนไลน์พร้อมฟีเจอร์ใหม่เพียบ! (Render)`);
    setRandomStatus();
    setInterval(setRandomStatus, 17 * 24 * 60 * 60 * 1000); 
});

client.login(process.env.DISCORD_TOKEN);
