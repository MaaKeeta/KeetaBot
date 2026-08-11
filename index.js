// === โค้ดสำหรับรันบน Render.com (ระบบ Log 24 ชม. + สุ่มสถานะ) ===
const { Client, GatewayIntentBits, AuditLogEvent, ActivityType } = require('discord.js');
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

// ฟังก์ชันสำหรับจัดรูปแบบ วันที่ เป็น พ.ศ. (บังคับโซนเวลาไทย ป้องกันวันที่เพี้ยนตอนหลังเที่ยงคืน)
function getDateStr() {
    const optionsDate = { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'numeric', year: 'numeric' };
    const dateString = new Intl.DateTimeFormat('en-GB', optionsDate).format(new Date()); 
    
    // จะได้รูปแบบ DD/MM/YYYY
    const [day, month, yearCE] = dateString.split('/');
    const yearBE = parseInt(yearCE) + 543;

    return `${day}/${month}/${yearBE}`;
}

// ==========================================
// 1. ระบบ Voice, Stream, Camera Log
// ==========================================
client.on('voiceStateUpdate', (oldState, newState) => {
    const logChannel = newState.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;

    const member = newState.member;
    if (member.user.bot) return; // กรองบอทออกเฉพาะระบบ Voice

    const dateStr = getDateStr();

    if (!oldState.channelId && newState.channelId) {
        logChannel.send(`${dateStr} <@${member.id}> เข้าVC **${newState.channel.name}**`);
    }
    else if (oldState.channelId && !newState.channelId) {
        logChannel.send(`${dateStr} <@${member.id}> ออกจากVC **${oldState.channel.name}**`);
    }
    else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        logChannel.send(`${dateStr} <@${member.id}> ย้ายห้องจาก **${oldState.channel.name}** ไปยัง **${newState.channel.name}**`);
    }

    if (!oldState.selfVideo && newState.selfVideo) {
        logChannel.send(`${dateStr} 📹 <@${member.id}> เริ่ม **เปิดกล้อง** ในห้อง **${newState.channel.name}**`);
    } else if (oldState.selfVideo && !newState.selfVideo) {
        logChannel.send(`${dateStr} 📴 <@${member.id}> ปิดกล้องในห้อง **${newState.channel.name}**`);
    }

    if (!oldState.streaming && newState.streaming) {
        logChannel.send(`${dateStr} 💻 <@${member.id}> เริ่ม **สตรีมหน้าจอ** ในห้อง **${newState.channel.name}**`);
    } else if (oldState.streaming && !newState.streaming) {
        logChannel.send(`${dateStr} 🛑 <@${member.id}> หยุดสตรีมหน้าจอในห้อง **${newState.channel.name}**`);
    }
});

// ==========================================
// 2. ระบบ Log ข้อความที่ถูกลบ (พร้อมสืบหาคนลบ) - ฟอร์แมตใหม่
// ==========================================
client.on('messageDelete', async (message) => {
    if (!message.guild) return;
    // เอาที่กรองบอทออกแล้ว ตามที่ขอครับ

    const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;

    const dateStr = getDateStr();
    const authorTag = message.author ? `<@${message.author.id}>` : 'ไม่ทราบผู้ใช้';
    
    // ตั้งค่าเริ่มต้นเป็นการลบเอง
    let executorTag = `${authorTag} ลบเอง`; 

    try {
        const fetchedLogs = await message.guild.fetchAuditLogs({
            limit: 1,
            type: AuditLogEvent.MessageDelete,
        });
        
        const deletionLog = fetchedLogs.entries.first();

        // ถ้าเจอประวัติการลบภายใน 5 วินาทีล่าสุด โดยคนลบไม่ใช่เจ้าของข้อความ
        if (deletionLog) {
            const { executor, target, createdTimestamp } = deletionLog;
            if (message.author && target.id === message.author.id && createdTimestamp > (Date.now() - 5000)) {
                executorTag = `<@${executor.id}>`; 
            }
        }
    } catch (error) {
        console.log("บอทอ่าน Audit Log ไม่ได้ หรือไม่มีสิทธิ์");
    }

    // จัดรูปแบบข้อความลบตามที่ขอ
    let contentLog = `🗑️  ${dateStr} | ลบข้อความของ ${authorTag}\nคนลบ : ${executorTag} | ช่อง : <#${message.channel.id}>`;

    if (message.content) {
        contentLog += `\n"${message.content}"`;
    }

    await logChannel.send(contentLog);

    // กรณีมีรูปแนบ ให้ส่งแค่ Link รูป (ไม่มีข้อความนำหน้า)
    if (message.attachments.size > 0) {
        let attachmentUrls = [];
        message.attachments.forEach(attachment => {
            attachmentUrls.push(attachment.url);
        });
        await logChannel.send(attachmentUrls.join('\n'));
    }
});

// ==========================================
// 3. ระบบ Auto-Reply
// ==========================================
client.on('messageCreate', (message) => {
    if (message.author.bot) return; 

    const content = message.content;
    const greetings = ['สวัสดีครับ', 'สวัสดีค่ะ', 'ดีครับ', 'ดีค่ะ', 'ดีจ้า', 'สวัสดีจ้า'];

    if (greetings.some(word => content.includes(word))) {
        return message.reply('โฮ่ง!');
    }

    if (content.includes('คิดถึงหมาคีตะ') || content.includes('คืดถึงหมาคีตะ')) {
        return message.reply('แห่ะๆ');
    } else if (content.includes('คิดถึงคีตะ')) {
        return message.reply('คิดถึงเหมือนกันครับ');
    } else if (content.includes('หมาคีตะ')) {
        return message.reply('บ๊อกๆ');
    }
});

// ==========================================
// 4. ระบบ Log แก้ไขข้อความ - ฟอร์แมตใหม่
// ==========================================
client.on('messageUpdate', (oldMessage, newMessage) => {
    if (!newMessage.guild) return;
    if (newMessage.author && newMessage.author.bot) return; 
    
    if (!oldMessage.content || !newMessage.content) return; 
    if (oldMessage.content !== newMessage.content) {
        const logChannel = newMessage.guild.channels.cache.get(LOG_CHANNEL_ID);
        if (!logChannel) return;

        const dateStr = getDateStr();
        const authorTag = `<@${newMessage.author.id}>`;

        // จัดรูปแบบข้อความแก้ไขตามที่ขอ
        const editLog = `✏️ ${dateStr} | แก้ไขข้อความ\nผู้ส่ง: ${authorTag} | ช่อง : <#${newMessage.channel.id}>\n"${oldMessage.content}"เป็น : "${newMessage.content}"`;

        logChannel.send(editLog);
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
    
    // เพิ่มบรรทัดนี้เพื่อตั้งค่า Status บอทจริงๆ (โค้ดเก่าตกหล่นไป)
    client.user.setPresence({ activities: [randomStatus] });
} // เพิ่มปีกกาปิดฟังก์ชันที่หายไปให้แล้ว

client.once('ready', () => {
    console.log(`🤖 บอท ${client.user.tag} ออนไลน์พร้อมฟีเจอร์ใหม่เพียบ! (Render)`);
    
    setRandomStatus();
    const SEVENTEEN_DAYS_MS = 17 * 24 * 60 * 60 * 1000; 
    setInterval(setRandomStatus, SEVENTEEN_DAYS_MS);
});

client.login(process.env.DISCORD_TOKEN);
