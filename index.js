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
const IG_PROXY_DOMAIN = 'oginstagram.com';
const FB_PROXY_DOMAIN = 'facebed.com';
const CACHE_TTL = 10 * 60 * 1000;
const metadataCache = new Map();

function getDateStr() {
    const dateString = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Bangkok',
        day: 'numeric',
        month: 'numeric',
        year: 'numeric'
    }).format(new Date());
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
        .replace(/&#x27;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&#x2F;/gi, '/')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
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

function getMeta(html, name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
        new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
        new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${escaped}["'][^>]*>`, 'i'),
        new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
        new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${escaped}["'][^>]*>`, 'i')
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

function parseAuthor(title = '') {
    const cleaned = stripHtml(title);

    const match = cleaned.match(/^(.+?)\s*\(@([^)]+)\)/);

    if (match) {
        return {
            name: match[1].trim(),
            username: `@${match[2].trim()}`
        };
    }

    const usernameMatch = cleaned.match(/@([A-Za-z0-9._-]+)/);

    return {
        name: cleaned.trim(),
        username: usernameMatch ? `@${usernameMatch[1]}` : ''
    };
}

function parseDate(value) {
    if (!value) return null;

    const timestamp = Date.parse(value);

    return Number.isNaN(timestamp) ? null : new Date(timestamp);
}

function getCache(key) {
    const cached = metadataCache.get(key);

    if (!cached) return null;

    if (Date.now() - cached.timestamp > CACHE_TTL) {
        metadataCache.delete(key);
        return null;
    }

    return cached.data;
}

function setCache(key, data) {
    metadataCache.set(key, {
        timestamp: Date.now(),
        data
    });

    if (metadataCache.size > 500) {
        const oldestKey = metadataCache.keys().next().value;
        if (oldestKey) metadataCache.delete(oldestKey);
    }
}

async function requestPage(url, type) {
    const userAgents = type === 'facebook'
        ? [
            'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36'
        ]
        : [
            'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36'
        ];

    for (const userAgent of userAgents) {
        try {
            const response = await fetch(url, {
                method: 'GET',
                redirect: 'follow',
                headers: {
                    'User-Agent': userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9'
                },
                signal: AbortSignal.timeout(15000)
            });

            if (response.ok) {
                return response;
            }

            console.log(`Proxy ตอบ ${response.status}: ${url}`);
        } catch (error) {
            console.log(`Request ไม่สำเร็จ: ${url} | ${error.message}`);
        }
    }

    return null;
}

async function fetchSocialMetadata(originalUrl) {
    const cleanedOriginalUrl = cleanUrl(originalUrl);
    const cached = getCache(cleanedOriginalUrl);

    if (cached) return cached;

    const type = getSocialType(cleanedOriginalUrl);
    const proxyUrl = convertSocialUrl(cleanedOriginalUrl);

    if (!type || !proxyUrl) return null;

    const response = await requestPage(proxyUrl, type);

    if (!response) return null;

    try {
        const html = await response.text();
        const finalUrl = response.url || proxyUrl;

        const title = getMeta(html, 'og:title') || getMeta(html, 'twitter:title') || '';
        const description = getMeta(html, 'og:description') || getMeta(html, 'twitter:description') || '';
        const image = getMeta(html, 'og:image') || getMeta(html, 'twitter:image') || '';
        const video = getMeta(html, 'og:video') || getMeta(html, 'og:video:url') || getMeta(html, 'twitter:player:stream') || '';
        const siteName = getMeta(html, 'og:site_name') || (type === 'instagram' ? 'Instagram' : 'Facebook');
        const publishedTime = getMeta(html, 'article:published_time') || getMeta(html, 'og:updated_time');
        const authorName = getMeta(html, 'author') || getMeta(html, 'profile:username') || getMeta(html, 'twitter:creator');
        const authorImage = getMeta(html, 'profile:image') || getMeta(html, 'twitter:image');

        const parsedTitleAuthor = parseAuthor(title);

        const data = {
            type,
            originalUrl: cleanedOriginalUrl,
            proxyUrl,
            finalUrl,
            title: stripHtml(title),
            description: stripHtml(description),
            image: absoluteUrl(image, finalUrl),
            video: absoluteUrl(video, finalUrl),
            siteName,
            authorName: authorName || parsedTitleAuthor.name,
            username: parsedTitleAuthor.username,
            authorImage: absoluteUrl(authorImage, finalUrl),
            publishedTime: parseDate(publishedTime)
        };

        if (!data.title && !data.description && !data.image && !data.video) {
            console.log(`ไม่พบ metadata ที่ใช้ทำ Embed: ${originalUrl}`);
            return null;
        }

        setCache(cleanedOriginalUrl, data);

        return data;
    } catch (error) {
        console.log(`อ่าน metadata ไม่สำเร็จ: ${originalUrl} | ${error.message}`);
        return null;
    }
}

function createSocialEmbed(data) {
    const isInstagram = data.type === 'instagram';
    const color = isInstagram ? 0xE1306C : 0x1877F2;
    const serviceName = isInstagram ? 'Instagram' : 'Facebook';

    const embed = new EmbedBuilder()
        .setColor(color)
        .setURL(data.originalUrl);

    const authorText = limitText(
        data.authorName || data.title || serviceName,
        256
    );

    if (authorText) {
        embed.setAuthor({
            name: authorText,
            url: data.originalUrl,
            ...(data.authorImage ? { iconURL: data.authorImage } : {})
        });
    }

    if (data.username && data.username !== data.authorName) {
        embed.setTitle(limitText(data.username, 256));
    }

    if (data.description) {
        embed.setDescription(limitText(data.description, 4096));
    } else if (data.title && !data.authorName) {
        embed.setDescription(limitText(data.title, 4096));
    }

    if (data.image) {
        embed.setImage(data.image);
    }

    if (data.publishedTime) {
        embed.setTimestamp(data.publishedTime);
    }

    embed.setFooter({ text: serviceName });

    return embed;
}

client.on('voiceStateUpdate', (oldState, newState) => {
    const logChannel = newState.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;

    const member = newState.member;
    if (!member || member.user.bot) return;

    const dateStr = getDateStr();
    const channelName = newState.channel?.name || oldState.channel?.name || 'ไม่ทราบห้อง';

    if (!oldState.channelId && newState.channelId) {
        logChannel.send(`${dateStr} <@${member.id}> เข้า **${channelName}**`);
    } else if (oldState.channelId && !newState.channelId) {
        logChannel.send(`${dateStr} <@${member.id}> ออก **${channelName}**`);
    } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        logChannel.send(`${dateStr} <@${member.id}> ย้ายจาก **${oldState.channel.name}** ไป **${channelName}**`);
    }

    if (!oldState.selfMute && newState.selfMute) {
        logChannel.send(`${dateStr} 🎙️ <@${member.id}> **ปิดไมค์**`);
    } else if (oldState.selfMute && !newState.selfMute) {
        logChannel.send(`${dateStr} 🎙️ <@${member.id}> **เปิดไมค์**`);
    }

    if (!oldState.selfDeaf && newState.selfDeaf) {
        logChannel.send(`${dateStr} 🔈 <@${member.id}> **ปิดหูฟัง/ลำโพง**`);
    } else if (oldState.selfDeaf && !newState.selfDeaf) {
        logChannel.send(`${dateStr} 🔊 <@${member.id}> **เปิดหูฟัง/ลำโพง**`);
    }

    if (!oldState.selfVideo && newState.selfVideo) {
        logChannel.send(`${dateStr} 📹 <@${member.id}> เริ่ม **เปิดกล้อง** ในห้อง **${channelName}**`);
    } else if (oldState.selfVideo && !newState.selfVideo) {
        logChannel.send(`${dateStr} 📹 <@${member.id}> **ปิดกล้อง** ในห้อง **${channelName}**`);
    }

    if (!oldState.streaming && newState.streaming) {
        logChannel.send(`${dateStr} 🛑 <@${member.id}> เริ่ม **สตรีมหน้าจอ** ในห้อง **${channelName}**`);
    } else if (oldState.streaming && !newState.streaming) {
        logChannel.send(`${dateStr} 🛑 <@${member.id}> **หยุดสตรีมหน้าจอ** ในห้อง **${channelName}**`);
    }
});

client.on('messageDelete', async message => {
    if (!message.guild) return;

    const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;

    const dateStr = getDateStr();
    const authorTag = message.author ? `<@${message.author.id}>` : 'ไม่ทราบผู้ใช้';
    let executorTag = `${authorTag} ลบเอง`;

    try {
        const fetchedLogs = await message.guild.fetchAuditLogs({
            limit: 1,
            type: AuditLogEvent.MessageDelete
        });

        const deletionLog = fetchedLogs.entries.first();

        if (deletionLog) {
            const { executor, target, createdTimestamp } = deletionLog;

            if (
                message.author &&
                target &&
                target.id === message.author.id &&
                createdTimestamp > Date.now() - 5000
            ) {
                executorTag = `<@${executor.id}>`;
            }
        }
    } catch {
        console.log('บอทอ่าน Audit Log ไม่ได้ หรือไม่มีสิทธิ์');
    }

    let contentLog = `🗑️ ${dateStr} | ลบข้อความของ ${authorTag}\nคนลบ : ${executorTag} | ช่อง : <#${message.channel.id}>`;

    if (message.content) {
        contentLog += `\n"${message.content}"`;
    }

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
            const limitedUrls = uniqueUrls.slice(0, 5);
            const metadataList = await Promise.all(limitedUrls.map(fetchSocialMetadata));
            const validMetadata = metadataList.filter(Boolean);

            if (validMetadata.length > 0) {
                const embeds = validMetadata.map(createSocialEmbed).slice(0, 10);

                try {
                    await message.reply({
                        embeds,
                        allowedMentions: { repliedUser: false }
                    });

                    setTimeout(() => {
                        message.suppressEmbeds(true).catch(error => {
                            console.log(`ซ่อน Embed ต้นฉบับไม่ได้: ${error.message}`);
                        });
                    }, 500);
                } catch (error) {
                    console.log(`ส่ง Social Embed ไม่สำเร็จ: ${error.message}`);
                }

                return;
            }

            console.log(`สร้าง Embed จากลิงก์ไม่ได้: ${uniqueUrls.join(', ')}`);
        }
    }

    if (content.startsWith('/img')) {
        const targetUser = message.mentions.users.first() || message.author;
        const avatarUrl = targetUser.displayAvatarURL({ size: 4096, dynamic: true });
        return message.reply(`profile **${targetUser.username}**\n${avatarUrl}`);
    }

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
