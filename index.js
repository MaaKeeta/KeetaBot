// === โค้ดสำหรับรันบน Render.com (ระบบ Log 24 ชม. + สุ่มสถานะ) ===
const { Client, GatewayIntentBits, AuditLogEvent, ActivityType } = require('discord.js'); // เพิ่ม ActivityType
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
    if (member.user.bot) return; // กรองบอทออก

    const dateStr = getDateStr();

    // เข้าห้องว้อยส์
    if (!oldState.channelId && newState.channelId) {
        logChannel.send(`${dateStr} <@${member.id}> เข้าVC **${newState.channel.name}**`);
    }
    // ออกจากห้องว้อยส์
    else if (oldState.channelId && !newState.channelId) {
        logChannel.send(`${dateStr} <@${member.id}> ออกจากVC **${oldState.channel.name}**`);
    }
    // ย้ายห้องว้อยส์
    else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        logChannel.send(`${dateStr} <@${member.id}> ย้ายห้องจาก **${oldState.channel.name}** ไปยัง **${newState.channel.name}**`);
    }

    // ตรวจจับการเปิดกล้อง (Camera)
    if (!oldState.selfVideo && newState.selfVideo) {
        logChannel.send(`${dateStr} 📹 <@${member.id}> เริ่ม **เปิดกล้อง** ในห้อง **${newState.channel.name}**`);
    } else if (oldState.selfVideo && !newState.selfVideo) {
        logChannel.send(`${dateStr} 📴 <@${member.id}> ปิดกล้องในห้อง **${newState.channel.name}**`);
    }

    // ตรวจจับการสตรีมหน้าจอ (Stream)
    if (!oldState.streaming && newState.streaming) {
        logChannel.send(`${dateStr} 💻 <@${member.id}> เริ่ม **สตรีมหน้าจอ** ในห้อง **${newState.channel.name}**`);
    } else if (oldState.streaming && !newState.streaming) {
        logChannel.send(`${dateStr} 🛑 <@${member.id}> หยุดสตรีมหน้าจอในห้อง **${newState.channel.name}**`);
    }
});

// ==========================================
// 2. ระบบ Log ข้อความที่ถูกลบ (พร้อมสืบหาคนลบ)
// ==========================================
client.on('messageDelete', async (message) => {
    if (!message.guild) return;
    if (message.author && message.author.bot) return; // กรองบอทออก

    const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;

    const dateStr = getDateStr();
    const authorTag = message.author ? `<@${message.author.id}>` : 'ไม่ทราบผู้ใช้';
    
    let executorTag = "ผู้ใช้ลบเอง (หรือบอทลบให้)";

    try {
        // เช็กประวัติว่ามีแอดมินคนไหนกดลบข้อความไหม
        const fetchedLogs = await message.guild.fetchAuditLogs({
            limit: 1,
            type: AuditLogEvent.MessageDelete,
        });
        
        const deletionLog = fetchedLogs.entries.first();

        // ถ้าเจอประวัติการลบภายใน 5 วินาทีล่าสุด
        if (deletionLog) {
            const { executor, target, createdTimestamp } = deletionLog;
            if (target.id === message.author.id && createdTimestamp > (Date.now() - 5000)) {
                executorTag = `<@${executor.id}>`; 
            }
        }
    } catch (error) {
        console.log("บอทอ่าน Audit Log ไม่ได้ (อาจจะลืมให้ยศบอท)");
    }

    let contentLog = `🗑️ **[ข้อความถูกลบ]** ${dateStr}\n📝 **ผู้ส่ง:** ${authorTag}\n🕵️ **คนลบ:** ${executorTag} | **ช่อง:** <#${message.channel.id}>`;

    if (message.content) {
        contentLog += `\n💬 ข้อความที่ลบ: "${message.content}"`;
    }

    await logChannel.send(contentLog);

    if (message.attachments.size > 0) {
        let attachmentUrls = [];
        message.attachments.forEach(attachment => {
            attachmentUrls.push(attachment.url);
        });
        await logChannel.send(`📎 **ไฟล์/รูปภาพที่แนบมาด้วย:**\n${attachmentUrls.join('\n')}`);
    }
});

// ==========================================
// 3. ระบบตอบกลับคำศัพท์เฉพาะ (Auto-reply)
// ==========================================
client.on('messageCreate', (message) => {
    if (message.author.bot) return; // กรองบอทออก

    const content = message.content;
    const greetings = ['สวัสดีครับ', 'สวัสดีค่ะ', 'ดีครับ', 'ดีค่ะ', 'ดีจ้า', 'สวัสดีจ้า'];

    if (greetings.some(word => content.includes(word))) {
        return message.reply('โฮ่ง!');
    }

    // เรียงลำดับเงื่อนไขเพื่อไม่ให้บอทสับสน
    if (content.includes('คิดถึงหมาคีตะ') || content.includes('คืดถึงหมาคีตะ')) {
        return message.reply('แห่ะๆ');
    } else if (content.includes('คิดถึงคีตะ')) {
        return message.reply('คิดถึงเหมือนกันครับ');
    } else if (content.includes('หมาคีตะ')) {
        return message.reply('บ๊อกๆ');
    }
});

// ==========================================
// 4. ระบบ Log ข้อความที่ถูกแก้ไข (ส่งเข้าห้อง Log)
// ==========================================
client.on('messageUpdate', (oldMessage, newMessage) => {
    if (!newMessage.guild) return;
    if (newMessage.author && newMessage.author.bot) return; // กรองบอทออก
    
    // ข้ามถ้าไม่มีข้อความเก่าในระบบ หรือข้อความไม่มีอะไรเลย
    if (!oldMessage.content || !newMessage.content) return; 

    // ถ้าข้อความมีการเปลี่ยนแปลงจริงๆ
    if (oldMessage.content !== newMessage.content) {
        const logChannel = newMessage.guild.channels.cache.get(LOG_CHANNEL_ID);
        if (!logChannel) return;

        const dateStr = getDateStr();
        const authorTag = `<@${newMessage.author.id}>`;

        const editLog = `✏️ **[ข้อความถูกแก้ไข]** ${dateStr}\n👤 **ผู้ส่ง:** ${authorTag} | **ช่อง:** <#${newMessage.channel.id}>\n🔴 **ข้อความเดิม:** "${oldMessage.content}"\n🟢 **แก้เป็น:** "${newMessage.content}"`;

        logChannel.send(editLog);
    }
});

// ==========================================
// 5. ระบบสุ่มสเตตัส/สถานะบอท (Status Rotation)
// ==========================================
// รวมรายการประโยคที่ต้องการให้สุ่มโชว์ (สามารถเพิ่ม/ลบประโยคในนี้ได้เลย)
const statusList = [
    { name: 'หมาที่ส่องโปรไฟล์', type: ActivityType.Watching },
    { name: 'คนคุยกันในเซิร์ฟเวอร์', type: ActivityType.Watching },
    { name: 'วิ่งไล่จับหางตัวเอง', type: ActivityType.Playing },
    { name: 'เสียงหัวใจคีตะ', type: ActivityType.Listening },
    { name: 'วันนี้ฉันได้เรียนรู้...', type: ActivityType.Custom }
];

function setRandomStatus() {
    if (!client.user) return;
    
    // สุ่มหยิบประโยคจาก statusList
    const randomStatus = statusList[Math.floor(Math.random() * statusList.length)];
    
    client.user.setPresence({
        activities: [randomStatus],
        status: 'online', // สถานะไฟเขียว (online, idle, dnd)
    });

    console.log(`🎭 เปลี่ยนสถานะบอทเป็น: ${randomStatus.name}`);
}

// ใช้ 'ready' (เมื่อบอทล็อกอินสำเร็จ)
client.once('ready', () => {
    console.log(`🤖 บอท ${client.user.tag} ออนไลน์พร้อมฟีเจอร์ใหม่เพียบ! (Render)`);
    
    // 1. ทำการสุ่มสเตตัสทันทีที่บอทเริ่มทำงาน
    setRandomStatus();

    // 2. ตั้งเวลาสุ่มเปลี่ยนสเตตัสอัตโนมัติ 
    // ตัวอย่าง: 24 * 60 * 60 * 1000 = สุ่มใหม่ทุกๆ 1 วัน (86,400,000 มิลลิวินาที)
    // หากต้องการให้สุ่มทุก 1 ชั่วโมง ให้เปลี่ยนเป็น (60 * 60 * 1000)
    const ONE_DAY_MS = 24 * 60 * 60 * 10000;
    setInterval(setRandomStatus, ONE_DAY_MS);
});

// ดึง Bot Token จากระบบตัวแปรลับ
client.login(process.env.DISCORD_TOKEN);
