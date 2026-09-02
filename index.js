const {
    Client,
    GatewayIntentBits,
    AuditLogEvent,
    ActivityType,
    EmbedBuilder
} = require('discord.js');

const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || '1535687188048511036';

app.get('/', (_, res) => res.send('Bot online.'));
app.listen(PORT, () => console.log(`Web server :${PORT}`));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

const IG_APP_ID = '936619743392459';
const IG_UA = 'Googlebot/2.1 (+http://www.google.com/bot.html)';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/146 Safari/537.36';

const greetings = [
    'สวัสดีครับ',
    'สวัสดีค่ะ',
    'ดีครับ',
    'ดีค่ะ',
    'ดีจ้า',
    'สวัสดีจ้า'
];

const statuses = [
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

function dateTH() {
    const d = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Bangkok',
        day: 'numeric',
        month: 'numeric',
        year: 'numeric'
    }).format(new Date());

    const [day, month, year] = d.split('/');
    return `${day}/${month}/${Number(year) + 543}`;
}

function clean(url) {
    return url.replace(/[),.!?;:'"]+$/g, '');
}

function html(text = '') {
    return String(text)
        .replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16)))
        .replace(/&#(\d+);/g, (_, x) => String.fromCodePoint(Number(x)))
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

function strip(text = '') {
    return html(text)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .trim();
}

function meta(src, key) {
    const re = new RegExp(
        `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']*)["']`,
        'i'
    );

    return src.match(re)?.[1] || null;
}

function cacheGet(key) {
    const x = cache.get(key);

    if (!x) return null;

    if (Date.now() - x.time > CACHE_TTL) {
        cache.delete(key);
        return null;
    }

    return x.data;
}

function cacheSet(key, data) {
    cache.set(key, { time: Date.now(), data });

    while (cache.size > 100) {
        cache.delete(cache.keys().next().value);
    }
}

function count(v) {
    if (v === null || v === undefined || v === '') return null;
    if (/^\d+$/.test(String(v))) return Number(v).toLocaleString('en-US');
    return String(v);
}

function stats(likes, comments) {
    const out = [];

    if (likes != null) out.push(`❤️ ${count(likes)}`);
    if (comments != null) out.push(`💬 ${count(comments)}`);

    return out.join(' • ');
}

function socialType(url) {
    try {
        const host = new URL(clean(url)).hostname.toLowerCase();

        if (host === 'instagram.com' || host === 'www.instagram.com') {
            return 'instagram';
        }

        if (
            host === 'facebook.com' ||
            host === 'www.facebook.com' ||
            host === 'm.facebook.com' ||
            host === 'fb.watch'
        ) {
            return 'facebook';
        }
    } catch {}

    return null;
}

function parseInstagram(htmlText, finalUrl) {
    const title =
        meta(htmlText, 'og:title') ||
        meta(htmlText, 'twitter:title') ||
        '';

    const description =
        meta(htmlText, 'og:description') ||
        meta(htmlText, 'twitter:description') ||
        '';

    const image =
        meta(htmlText, 'og:image') ||
        meta(htmlText, 'twitter:image') ||
        '';

    const url = meta(htmlText, 'og:url') || '';

    let username = null;
    let fullName = null;
    let likes = null;
    let comments = null;
    let caption = null;

    const author = title.match(/^(.+?)\s*\(@([^)]+)\)/);

    if (author) {
        fullName = author[1].trim();
        username = author[2].trim();
    }

    if (!username) {
        username =
            url.match(
                /instagram\.com\/([A-Za-z0-9_.]+)\/(?:p|reel|reels|tv)\//i
            )?.[1] || null;
    }

    const stat = html(description).match(
        /^([\d,.KM]+)\s+likes?,\s+([\d,.KM]+)\s+comments?/i
    );

    if (stat) {
        likes = stat[1];
        comments = stat[2];
    }

    if (description && !stat) {
        caption = strip(description);
    }

    if (!image && !username) return null;

    return {
        type: 'instagram',
        originalUrl: finalUrl,
        username,
        fullName,
        caption,
        likes,
        comments,
        imageUrl: image ? new URL(image, finalUrl).href : null
    };
}

async function getInstagram(url) {
    const key = clean(url);
    const cached = cacheGet(key);

    if (cached) return cached;

    let code;

    try {
        const u = new URL(key);

        code = u.pathname.match(
            /\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i
        )?.[1];

        if (!code && u.pathname.startsWith('/share/')) {
            const r = await fetch(`https://www.instagram.com${u.pathname}${u.search}`, {
                headers: { 'User-Agent': UA },
                redirect: 'manual',
                signal: AbortSignal.timeout(8000)
            });

            const location = r.headers.get('location');

            if (location) {
                code = new URL(location).pathname.match(
                    /\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i
                )?.[1];
            }
        }
    } catch {
        return null;
    }

    if (!code) return null;

    try {
        const target = `https://www.instagram.com/p/${code}/`;

        const r = await fetch(target, {
            headers: {
                'User-Agent': IG_UA,
                'Accept-Language': 'en-US,en;q=0.9'
            },
            signal: AbortSignal.timeout(12000)
        });

        if (!r.ok) return null;

        const source = await r.text();
        const data = parseInstagram(source, r.url || target);

        if (!data) return null;

        data.originalUrl = key;

        cacheSet(key, data);
        return data;
    } catch (e) {
        console.log(`Instagram error: ${e.message}`);
        return null;
    }
}

async function getFacebook(url) {
    const key = clean(url);
    const cached = cacheGet(key);

    if (cached) return cached;

    let target;

    try {
        const u = new URL(key);

        target =
            `https://facebed.com${u.pathname}` +
            `${u.search}${u.hash}`;
    } catch {
        return null;
    }

    try {
        const r = await fetch(target, {
            headers: {
                'User-Agent': UA,
                'Accept-Language': 'en-US,en;q=0.9'
            },
            signal: AbortSignal.timeout(12000)
        });

        if (!r.ok) return null;

        const source = await r.text();

        const data = {
            type: 'facebook',
            originalUrl: key,
            fullName: strip(meta(source, 'og:title') || ''),
            caption: strip(
                meta(source, 'og:description') ||
                meta(source, 'twitter:description') ||
                ''
            ),
            imageUrl: meta(source, 'og:image') || null,
            likes: null,
            comments: null,
            videoUrl: meta(source, 'og:video') || null
        };

        if (!data.fullName && !data.caption && !data.imageUrl) {
            return null;
        }

        cacheSet(key, data);
        return data;
    } catch (e) {
        console.log(`Facebook error: ${e.message}`);
        return null;
    }
}

async function getSocial(url) {
    const type = socialType(url);

    if (type === 'instagram') return getInstagram(url);
    if (type === 'facebook') return getFacebook(url);

    return null;
}

function socialEmbed(data) {
    const ig = data.type === 'instagram';
    const name =
        data.fullName ||
        data.username ||
        (ig ? 'Instagram' : 'Facebook');

    let text = stats(data.likes, data.comments);

    if (data.caption) {
        const cap = strip(data.caption);
        if (cap) {
            text += `${text ? '\n\n' : ''}${
                cap.length > 150 ? cap.slice(0, 147) + '...' : cap
            }`;
        }
    }

    const embed = new EmbedBuilder()
        .setColor(ig ? 0xE1306C : 0x1877F2)
        .setURL(data.originalUrl)
        .setAuthor({ name })
        .setFooter({ text: ig ? 'Instagram' : 'Facebook' });

    if (text) embed.setDescription(text);
    if (data.imageUrl) embed.setImage(data.imageUrl);

    return embed;
}

/* =====================
   VOICE LOG
===================== */

client.on('voiceStateUpdate', (oldState, newState) => {
    const ch = newState.guild.channels.cache.get(LOG_CHANNEL_ID);
    const m = newState.member;

    if (!ch || !m || m.user.bot) return;

    const d = dateTH();
    const current = newState.channel?.name;
    const previous = oldState.channel?.name;

    if (!oldState.channelId && newState.channelId) {
        ch.send(`${d} <@${m.id}> เข้า **${current}**`);
    } else if (oldState.channelId && !newState.channelId) {
        ch.send(`${d} <@${m.id}> ออก **${previous}**`);
    } else if (
        oldState.channelId &&
        newState.channelId &&
        oldState.channelId !== newState.channelId
    ) {
        ch.send(`${d} <@${m.id}> ย้ายจาก **${previous}** ไป **${current}**`);
    }

    if (!oldState.selfMute && newState.selfMute) {
        ch.send(`${d} 🎙️ <@${m.id}> **ปิดไมค์**`);
    } else if (oldState.selfMute && !newState.selfMute) {
        ch.send(`${d} 🎙️ <@${m.id}> **เปิดไมค์**`);
    }

    if (!oldState.selfDeaf && newState.selfDeaf) {
        ch.send(`${d} 🔈 <@${m.id}> **ปิดหูฟัง/ลำโพง**`);
    } else if (oldState.selfDeaf && !newState.selfDeaf) {
        ch.send(`${d} 🔊 <@${m.id}> **เปิดหูฟัง/ลำโพง**`);
    }

    if (!oldState.selfVideo && newState.selfVideo) {
        ch.send(`${d} 📹 <@${m.id}> เริ่ม **เปิดกล้อง** ใน **${current}**`);
    } else if (oldState.selfVideo && !newState.selfVideo) {
        ch.send(`${d} 📹 <@${m.id}> **ปิดกล้อง** ใน **${current || previous}**`);
    }

    if (!oldState.streaming && newState.streaming) {
        ch.send(`${d} 🛑 <@${m.id}> เริ่ม **สตรีมหน้าจอ** ใน **${current}**`);
    } else if (oldState.streaming && !newState.streaming) {
        ch.send(`${d} 🛑 <@${m.id}> **หยุดสตรีมหน้าจอ** ใน **${current || previous}**`);
    }
});

/* =====================
   DELETE LOG
===================== */

client.on('messageDelete', async message => {
    if (!message.guild) return;

    const ch = message.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!ch) return;

    const d = dateTH();
    const author = message.author
        ? `<@${message.author.id}>`
        : 'ไม่ทราบผู้ใช้';

    let executor = `${author} ลบเอง`;

    try {
        const logs = await message.guild.fetchAuditLogs({
            limit: 1,
            type: AuditLogEvent.MessageDelete
        });

        const log = logs.entries.first();

        if (
            log &&
            message.author &&
            log.target?.id === message.author.id &&
            Date.now() - log.createdTimestamp < 5000
        ) {
            executor = `<@${log.executor.id}>`;
        }
    } catch {}

    let text =
        `🗑️ ${d} | ลบข้อความของ ${author}\n` +
        `คนลบ : ${executor} | ช่อง : <#${message.channel.id}>`;

    if (message.content) {
        text += `\n"${message.content}"`;
    }

    await ch.send(text);

    if (message.attachments.size) {
        await ch.send(
            [...message.attachments.values()]
                .map(x => x.url)
                .join('\n')
        );
    }
});

/* =====================
   MESSAGES
===================== */

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const content = message.content;

    const links =
        content.match(
            /https?:\/\/(?:www\.)?(?:instagram\.com|facebook\.com|m\.facebook\.com|fb\.watch)\/[^\s<]+/gi
        ) || [];

    if (links.length) {
        const unique = [...new Set(links.map(clean))].slice(0, 3);

        const list = [];

        for (const url of unique) {
            const data = await getSocial(url);
            if (data) list.push(data);
        }

        if (list.length) {
            try {
                await message.reply({
                    embeds: list.map(socialEmbed),
                    allowedMentions: { repliedUser: false }
                });

                await message.suppressEmbeds(true).catch(() => {});
            } catch (e) {
                console.log(`Social embed error: ${e.message}`);
            }

            return;
        }
    }

    if (content.startsWith('/img')) {
        const user =
            message.mentions.users.first() ||
            message.author;

        return message.reply(
            `profile **${user.username}**\n` +
            user.displayAvatarURL({
                size: 4096,
                dynamic: true
            })
        );
    }

    if (greetings.some(x => content.includes(x))) {
        return message.reply('โฮ่ง!');
    }

    if (
        content.includes('คิดถึงหมาคีตะ') ||
        content.includes('คืดถึงหมาคีตะ')
    ) {
        return message.reply('แห่ะๆ');
    }

    if (content.includes('คิดถึงคีตะ')) {
        return message.reply('คิดถึงเหมือนกันครับ');
    }

    if (content.includes('หมาคีตะ')) {
        return message.reply('บ๊อกๆ');
    }
});

/* =====================
   EDIT LOG
===================== */

client.on('messageUpdate', (oldMessage, newMessage) => {
    if (
        !newMessage.guild ||
        newMessage.author?.bot ||
        !oldMessage.content ||
        !newMessage.content ||
        oldMessage.content === newMessage.content
    ) return;

    const ch = newMessage.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!ch) return;

    ch.send(
        `✏️ ${dateTH()} | แก้ไขข้อความ\n` +
        `ผู้ส่ง: <@${newMessage.author.id}> | ` +
        `ช่อง : <#${newMessage.channel.id}>\n` +
        `"${oldMessage.content}" เป็น : "${newMessage.content}"`
    );
});

/* =====================
   STATUS
===================== */

function randomStatus() {
    if (!client.user) return;

    client.user.setPresence({
        activities: [
            statuses[Math.floor(Math.random() * statuses.length)]
        ]
    });
}

/* =====================
   ERRORS
===================== */

client.on('error', e =>
    console.error('Discord Error:', e.message)
);

client.on('warn', e =>
    console.warn('Discord Warning:', e)
);

client.on('shardError', e =>
    console.error('Shard Error:', e.message)
);

client.once('ready', () => {
    console.log(`✅ ${client.user.tag} ออนไลน์`);

    randomStatus();

    setInterval(
        randomStatus,
        17 * 24 * 60 * 60 * 1000
    );
});

client.login(process.env.DISCORD_TOKEN)
    .then(() => console.log('✅ Discord login สำเร็จ'))
    .catch(e => console.error('❌ Login failed:', e.message));
