const { Client, GatewayIntentBits, AuditLogEvent, ActivityType, EmbedBuilder } = require('discord.js');
const express = require('express');

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

const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || '1535687188048511036';
const allowedChannels = ['1394626249149780089', '1394633403403337858'];
const IG_PROXY_DOMAIN = process.env.IG_PROXY_DOMAIN || 'oginstagram.com';
const FB_PROXY_DOMAIN = process.env.FB_PROXY_DOMAIN || 'facebed.com';

function getDateStr() {
    const optionsDate = { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'numeric', year: 'numeric' };
    const dateString = new Intl.DateTimeFormat('en-GB', optionsDate).format(new Date());
    const [day, month, yearCE] = dateString.split('/');
    return `${day}/${month}/${parseInt(yearCE) + 543}`;
}

function cleanUrl(url) {
    return url.replace(/[),.!?;:'"]+$/g, '');
}

function getSocialType(url) {
    try {
        const hostname = new URL(cleanUrl(url)).hostname.toLowerCase();
        if (['instagram.com', 'www.instagram.com'].includes(hostname)) return 'instagram';
        if (['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.watch'].includes(hostname)) return 'facebook';
        return null;
    } catch {
        return null;
    }
}

function convertSocialUrl(originalUrl) {
    try {
        const url = new URL(cleanUrl(originalUrl));
        const hostname = url.hostname.toLowerCase();

        if (['instagram.com', 'www.instagram.com'].includes(hostname)) {
            return `https://${IG_PROXY_DOMAIN}${url.pathname}${url.search}${url.hash}`;
        }

        if (['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.watch'].includes(hostname)) {
            return `https://${FB_PROXY_DOMAIN}${url.pathname}${url.search}${url.hash}`;
        }

        return null;
    } catch {
        return null;
    }
}

function decodeHtml(text = '') {
    return text
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&#x27;/gi, "'")
        .replace(/&#x2F;/gi, '/');
}

function stripHtml(text = '') {
    return decodeHtml(
        text
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<[^>]*>/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim()
    );
}

function getMeta(html, property) {
    const patterns = [
        new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
        new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${property}["'][^>]*>`, 'i'),
        new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
        new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${property}["'][^>]*>`, 'i')
    ];

    for (const regex of patterns) {
        const match = html.match(regex);
        if (match?.[1]) return decodeHtml(match[1].trim());
    }

    return null;
}

function absoluteUrl(url, baseUrl) {
    if (!url) return null;
    try {
        return new URL(url, baseUrl).href;
    } catch {
        return null;
    }
}

function limitText(text, max) {
    if (!text) return '';
    return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function extractAuthor(title = '') {
    const match = title.match(/^(.+?)\s*\(@([^)]+)\)/);

    if (match) {
        return {
            name: match[1].trim(),
            username: `@${match[2].trim()}`
        };
    }

    return {
        name: title.trim(),
        username: ''
    };
}

async function fetchSocialMetadata(originalUrl) {
    const type = getSocialType(originalUrl);
    const proxyUrl = convertSocialUrl(originalUrl);

    if (!type || !proxyUrl) return null;

    try {
        const response = await fetch(proxyUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; DiscordEmbedBot/1.0)'
            },
            redirect: 'follow'
        });

        if (!response.ok) {
            console.log(`โหลดข้อมูลไม่สำเร็จ ${response.status}: ${proxyUrl}`);
            return null;
        }

        const html = await response.text();
        const title = getMeta(html, 'og:title') || getMeta(html, 'twitter:title') || '';
        const description = getMeta(html, 'og:description') || getMeta(html, 'twitter:description') || '';
        const image = getMeta(html, 'og:image') || getMeta(html, 'twitter:image') || '';
        const siteName = getMeta(html, 'og:site_name') || (type === 'instagram' ? 'Instagram' : 'Facebook');
        const author = extractAuthor(title);

        return {
            type,
            originalUrl: cleanUrl(originalUrl),
            proxyUrl,
            title: title || siteName,
            description: stripHtml(description),
            image: absoluteUrl(image, proxyUrl),
            siteName,
            author
        };
    } catch (error) {
        console.log(`ดึงข้อมูล Social ไม่สำเร็จ: ${originalUrl}`, error.message);
        return null;
    }
}

function createSocialEmbed(data) {
    const isInstagram = data.type === 'instagram';
    const color = isInstagram ? 0xE1306C : 0x1877F2;
    const serviceName = isInstagram ? 'Instagram' : 'Facebook';

    const embed = new EmbedBuilder()
        .setColor(color)
        .setURL(data.originalUrl)
        .setFooter({ text: serviceName });

    if (data.author.name) {
        embed.setAuthor({
            name: limitText(data.author.name + (data.author.username ? ` ${data.author.username}` : ''), 256),
            url: data.originalUrl
        });
    } else if (data.title) {
        embed.setTitle(limitText(data.title, 256));
    }

    if (data.description) embed.setDescription(limitText(data.description, 4096));
    if (data.image) embed.setImage(data.image);

    return embed;
}

client.on('voiceStateUpdate', (oldState, newState) => {
    const logChannel = newState.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;

    const member = newState.member;
    if (!member || member.user.bot) return;

    const dateStr = getDateStr();
    const channelName = newState.channel?.name || oldState.channel?.name || 'ไม่ทราบห้อง';

    if (!oldState.channelId && newState.channelId) logChannel.send(`${dateStr} <@${member.id}> เข้า **${channelName}**`);
    else if (oldState.channelId && !newState.channelId) logChannel.send(`${dateStr} <@${member.id}> ออก **${channelName}**`);
    else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) logChannel.send(`${dateStr} <@${member.id}> ย้ายจาก **${oldState.channel.name}** ไป **${channelName}**`);

    if (!oldState.selfMute && newState.selfMute) logChannel.send(`${dateStr} 🎙️ <@${member.id}> **ปิดไมค์**`);
    else if (oldState.selfMute && !newState.selfMute) logChannel.send(`${dateStr} 🎙️ <@${member.id}> **เปิดไมค์**`);

    if (!oldState.selfDeaf && newState.selfDeaf) logChannel.send(`${dateStr} 🔈 <@${member.id}> **ปิดหูฟัง/ลำโพง**`);
    else if (oldState.selfDeaf && !newState.selfDeaf) logChannel.send(`${dateStr} 🔊 <@${member.id}> **เปิดหูฟัง/ลำโพง**`);

    if (!oldState.selfVideo && newState.selfVideo) logChannel.send(`${dateStr} 📹 <@${member.id}> เริ่ม **เปิดกล้อง** ในห้อง **${channelName}**`);
    else if (oldState.selfVideo && !newState.selfVideo) logChannel.send(`${dateStr} 📹 <@${member.id}> **ปิดกล้อง** ในห้อง **${channelName}**`);

    if (!oldState.streaming && newState.streaming) logChannel.send(`${dateStr} 🛑 <@${member.id}> เริ่ม **สตรีมหน้าจอ** ในห้อง **${channelName}**`);
    else if (oldState.streaming && !newState.streaming) logChannel.send(`${dateStr} 🛑 <@${member.id}> **หยุดสตรีมหน้าจอ** ในห้อง **${channelName}**`);
});

client.on('messageDelete', async message => {
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
            if (message.author && target && target.id === message.author.id && createdTimestamp > Date.now() - 5000) {
                executorTag = `<@${executor.id}>`;
            }
        }
    } catch {
        console.log('บอทอ่าน Audit Log ไม่ได้ หรือไม่มีสิทธิ์');
    }

    let contentLog = `🗑️ ${dateStr} | ลบข้อความของ ${authorTag}\nคนลบ : ${executorTag} | ช่อง : <#${message.channel.id}>`;
    if (message.content) contentLog += `\n"${message.content}"`;

    await logChannel.send(contentLog);

    if (message.attachments.size > 0) {
        const attachmentUrls = [...message.attachments.values()].map(attachment => attachment.url);
        await logChannel.send(attachmentUrls.join('\n'));
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const content = message.content;

    if (allowedChannels.includes(message.channel.id)) {
        const socialRegex = /(https?:\/\/(?:www\.)?(?:instagram\.com|facebook\.com|m\.facebook\.com|fb\.watch)\/[^\s<]+)/gi;
        const matches = content.match(socialRegex);

        if (matches?.length) {
            const uniqueUrls = [...new Set(matches.map(cleanUrl))];
            const metadataList = await Promise.all(uniqueUrls.map(fetchSocialMetadata));
            const validMetadata = metadataList.filter(Boolean);

            if (validMetadata.length > 0) {
                const embeds = validMetadata.map(createSocialEmbed).slice(0, 10);

                try {
                    await message.reply({
                        embeds,
                        allowedMentions: { repliedUser: false }
                    });

                    setTimeout(() => {
                        message.suppressEmbeds(true).catch(() => {});
                    }, 1000);
                } catch (error) {
                    console.log(`ส่ง Embed ไม่สำเร็จ: ${error.message}`);
                }

                return;
            }
        }
    }

    if (content.startsWith('/img')) {
        const targetUser = message.mentions.users.first() || message.author;
        const avatarUrl = targetUser.displayAvatarURL({ size: 4096, dynamic: true });
        return message.reply(`profile **${targetUser.username}**\n${avatarUrl}`);
    }

    const greetings = ['สวัสดีครับ', 'สวัสดีค่ะ', 'ดีครับ', 'ดีค่ะ', 'ดีจ้า', 'สวัสดีจ้า'];
    if (greetings.some(word => content.includes(word))) return message.reply('โฮ่ง!');

    if (content.includes('คิดถึงหมาคีตะ') || content.includes('คืดถึงหมาคีตะ')) return message.reply('แห่ะๆ');
    else if (content.includes('คิดถึงคีตะ')) return message.reply('คิดถึงเหมือนกันครับ');
    else if (content.includes('หมาคีตะ')) return message.reply('บ๊อกๆ');
});

client.on('messageUpdate', (oldMessage, newMessage) => {
    if (!newMessage.guild || newMessage.author?.bot || !oldMessage.content || !newMessage.content) return;

    if (oldMessage.content !== newMessage.content) {
        const logChannel = newMessage.guild.channels.cache.get(LOG_CHANNEL_ID);
        if (!logChannel) return;

        const dateStr = getDateStr();
        const authorTag = `<@${newMessage.author.id}>`;
        const editLog = `✏️ ${dateStr} | แก้ไขข้อความ\nผู้ส่ง: ${authorTag} | ช่อง : <#${newMessage.channel.id}>\n"${oldMessage.content}"เป็น : "${newMessage.content}"`;

        logChannel.send(editLog);
    }
});

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
    console.log(`บอท ${client.user.tag} ออนไลน์ (Render)`);
    setRandomStatus();
    const SEVENTEEN_DAYS_MS = 17 * 24 * 60 * 60 * 1000;
    setInterval(setRandomStatus, SEVENTEEN_DAYS_MS);
});

client.login(process.env.DISCORD_TOKEN);
