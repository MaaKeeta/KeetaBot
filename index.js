const {
    Client,
    GatewayIntentBits,
    AuditLogEvent,
    ActivityType
} = require('discord.js');

const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('ระบบเก็บ Log 24 ชั่วโมงกำลังทำงาน!');
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});


const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const LOG_CHANNEL_ID =
    process.env.LOG_CHANNEL_ID || '1535687188048511036';

const allowedChannels = [
    '1394626249149780089',
    '1394633403403337858'
];


const IG_PROXY_DOMAIN =
    process.env.IG_PROXY_DOMAIN || 'oginstagram.com';

const FB_PROXY_DOMAIN =
    process.env.FB_PROXY_DOMAIN || 'facebed.com';


function getDateStr() {

    const optionsDate = {
        timeZone: 'Asia/Bangkok',
        day: 'numeric',
        month: 'numeric',
        year: 'numeric'
    };

    const dateString =
        new Intl.DateTimeFormat('en-GB', optionsDate)
            .format(new Date());

    const [day, month, yearCE] =
        dateString.split('/');

    const yearBE =
        parseInt(yearCE) + 543;

    return `${day}/${month}/${yearBE}`;
}


function cleanUrl(url) {

    return url.replace(/[),.!?;:'"]+$/g, '');
}


function convertSocialUrl(originalUrl) {

    try {

        const cleanedUrl =
            cleanUrl(originalUrl);

        const url =
            new URL(cleanedUrl);

        const hostname =
            url.hostname.toLowerCase();


        if (
            hostname === 'instagram.com' ||
            hostname === 'www.instagram.com'
        ) {

            return `https://${IG_PROXY_DOMAIN}${url.pathname}${url.search}${url.hash}`;
        }


        if (
            hostname === 'facebook.com' ||
            hostname === 'www.facebook.com' ||
            hostname === 'm.facebook.com' ||
            hostname === 'fb.watch'
        ) {

            return `https://${FB_PROXY_DOMAIN}${url.pathname}${url.search}${url.hash}`;
        }


        return originalUrl;

    } catch (error) {

        console.log(
            `แปลง URL ไม่สำเร็จ: ${originalUrl}`
        );

        return originalUrl;
    }
}


client.on('voiceStateUpdate', (oldState, newState) => {

    const logChannel =
        newState.guild.channels.cache.get(LOG_CHANNEL_ID);

    if (!logChannel) return;

    const member =
        newState.member;

    if (!member) return;

    if (member.user.bot) return;

    const dateStr =
        getDateStr();

    const channelName =
        newState.channel
            ? newState.channel.name
            : (
                oldState.channel
                    ? oldState.channel.name
                    : 'ไม่ทราบห้อง'
            );


    if (!oldState.channelId && newState.channelId) {

        logChannel.send(
            `${dateStr} <@${member.id}> เข้า **${channelName}**`
        );
    }


    else if (
        oldState.channelId &&
        !newState.channelId
    ) {

        logChannel.send(
            `${dateStr} <@${member.id}> ออก **${channelName}**`
        );
    }


    else if (
        oldState.channelId &&
        newState.channelId &&
        oldState.channelId !== newState.channelId
    ) {

        logChannel.send(
            `${dateStr} <@${member.id}> ย้ายจาก **${oldState.channel.name}** ไป **${channelName}**`
        );
    }


    if (
        !oldState.selfMute &&
        newState.selfMute
    ) {

        logChannel.send(
            `${dateStr} 🎙️ <@${member.id}> **ปิดไมค์**`
        );

    } else if (
        oldState.selfMute &&
        !newState.selfMute
    ) {

        logChannel.send(
            `${dateStr} 🎙️ <@${member.id}> **เปิดไมค์**`
        );
    }


    if (
        !oldState.selfDeaf &&
        newState.selfDeaf
    ) {

        logChannel.send(
            `${dateStr} 🔈 <@${member.id}> **ปิดหูฟัง/ลำโพง**`
        );

    } else if (
        oldState.selfDeaf &&
        !newState.selfDeaf
    ) {

        logChannel.send(
            `${dateStr} 🔊 <@${member.id}> **เปิดหูฟัง/ลำโพง**`
        );
    }


    if (
        !oldState.selfVideo &&
        newState.selfVideo
    ) {

        logChannel.send(
            `${dateStr} 📹 <@${member.id}> เริ่ม **เปิดกล้อง** ในห้อง **${channelName}**`
        );

    } else if (
        oldState.selfVideo &&
        !newState.selfVideo
    ) {

        logChannel.send(
            `${dateStr} 📹 <@${member.id}> **ปิดกล้อง** ในห้อง **${channelName}**`
        );
    }

    if (
        !oldState.streaming &&
        newState.streaming
    ) {

        logChannel.send(
            `${dateStr} 🛑 <@${member.id}> เริ่ม **สตรีมหน้าจอ** ในห้อง **${channelName}**`
        );

    } else if (
        oldState.streaming &&
        !newState.streaming
    ) {

        logChannel.send(
            `${dateStr} 🛑 <@${member.id}> **หยุดสตรีมหน้าจอ** ในห้อง **${channelName}**`
        );
    }

});


client.on('messageDelete', async (message) => {

    if (!message.guild) return;

    const logChannel =
        message.guild.channels.cache.get(LOG_CHANNEL_ID);

    if (!logChannel) return;

    const dateStr =
        getDateStr();

    const authorTag =
        message.author
            ? `<@${message.author.id}>`
            : 'ไม่ทราบผู้ใช้';

    let executorTag =
        `${authorTag} ลบเอง`;


    try {

        const fetchedLogs =
            await message.guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.MessageDelete
            });

        const deletionLog =
            fetchedLogs.entries.first();

        if (deletionLog) {

            const {
                executor,
                target,
                createdTimestamp
            } = deletionLog;

            if (
                message.author &&
                target &&
                target.id === message.author.id &&
                createdTimestamp > (Date.now() - 5000)
            ) {

                executorTag =
                    `<@${executor.id}>`;
            }
        }

    } catch (error) {

        console.log(
            'บอทอ่าน Audit Log ไม่ได้ หรือไม่มีสิทธิ์'
        );
    }


    let contentLog =
        `🗑️ ${dateStr} | ลบข้อความของ ${authorTag}\n` +
        `คนลบ : ${executorTag} | ช่อง : <#${message.channel.id}>`;


    if (message.content) {

        contentLog +=
            `\n"${message.content}"`;
    }


    await logChannel.send(contentLog);


    if (message.attachments.size > 0) {

        let attachmentUrls = [];

        message.attachments.forEach(
            attachment => {

                attachmentUrls.push(
                    attachment.url
                );

            }
        );

        await logChannel.send(
            attachmentUrls.join('\n')
        );
    }

});

client.on('messageCreate', async (message) => {

    if (message.author.bot) return;


    const content =
        message.content;


    if (
        allowedChannels.includes(
            message.channel.id
        )
    ) {


        const socialRegex =
            /(https?:\/\/(?:www\.)?(?:instagram\.com|facebook\.com|m\.facebook\.com|fb\.watch)\/[^\s<]+)/gi;


        const matches =
            content.match(socialRegex);


        if (matches && matches.length > 0) {

            const convertedLinks =
                matches.map(originalUrl => {

                    return convertSocialUrl(
                        originalUrl
                    );

                });


            await message.reply({
                content:
                    convertedLinks.join('\n'),

                allowedMentions: {
                    repliedUser: false
                }
            });


            setTimeout(() => {

                message
                    .suppressEmbeds(true)
                    .catch(() => {

                        console.log(
                            'ไม่มีสิทธิ์ซ่อน Embed หรือข้อความถูกลบไปแล้ว'
                        );

                    });

            }, 1000);


            return;
        }

    }


    if (content.startsWith('/img')) {

        const targetUser =
            message.mentions.users.first() ||
            message.author;

        const avatarUrl =
            targetUser.displayAvatarURL({
                size: 4096,
                dynamic: true
            });

        return message.reply(
            `profile **${targetUser.username}** \n${avatarUrl}`
        );
    }


    const greetings = [
        'สวัสดีครับ',
        'สวัสดีค่ะ',
        'ดีครับ',
        'ดีค่ะ',
        'ดีจ้า',
        'สวัสดีจ้า'
    ];


    if (
        greetings.some(
            word => content.includes(word)
        )
    ) {

        return message.reply(
            'โฮ่ง!'
        );
    }


    if (
        content.includes('คิดถึงหมาคีตะ') ||
        content.includes('คืดถึงหมาคีตะ')
    ) {

        return message.reply(
            'แห่ะๆ'
        );

    }


    else if (
        content.includes('คิดถึงคีตะ')
    ) {

        return message.reply(
            'คิดถึงเหมือนกันครับ'
        );
    }



    else if (
        content.includes('หมาคีตะ')
    ) {

        return message.reply(
            'บ๊อกๆ'
        );
    }

});

client.on(
    'messageUpdate',
    (oldMessage, newMessage) => {

        if (!newMessage.guild) return;

        if (
            newMessage.author &&
            newMessage.author.bot
        ) {
            return;
        }


        if (
            !oldMessage.content ||
            !newMessage.content
        ) {
            return;
        }


        if (
            oldMessage.content !==
            newMessage.content
        ) {

            const logChannel =
                newMessage.guild.channels.cache.get(
                    LOG_CHANNEL_ID
                );

            if (!logChannel) return;


            const dateStr =
                getDateStr();


            const authorTag =
                `<@${newMessage.author.id}>`;


            const editLog =
                `✏️ ${dateStr} | แก้ไขข้อความ\n` +
                `ผู้ส่ง: ${authorTag} | ช่อง : <#${newMessage.channel.id}>\n` +
                `"${oldMessage.content}"เป็น : "${newMessage.content}"`;


            logChannel.send(
                editLog
            );
        }

    }
);


const statusList = [

    {
        name: 'custom',
        type: ActivityType.Custom,
        state: 'โฮ่ง'
    },

    {
        name: 'custom',
        type: ActivityType.Custom,
        state: 'หมามองไร'
    },

    {
        name: 'custom',
        type: ActivityType.Custom,
        state: 'คิดถึงกันมั้ย'
    },

    {
        name: 'custom',
        type: ActivityType.Custom,
        state: 'คิดถึงอะดิ้'
    },

    {
        name: 'custom',
        type: ActivityType.Custom,
        state: 'เห่า'
    },

    {
        name: 'custom',
        type: ActivityType.Custom,
        state: 'หอน'
    },

    {
        name: 'custom',
        type: ActivityType.Custom,
        state: 'ดีจ้า'
    },

    {
        name: 'custom',
        type: ActivityType.Custom,
        state: 'คิดถึงนะ'
    },

    {
        name: 'custom',
        type: ActivityType.Custom,
        state: 'หิววว'
    },

    {
        name: 'หมาที่ส่องโปรไฟล์',
        type: ActivityType.Watching
    },

    {
        name: 'หมาที่อยู่ในดิส',
        type: ActivityType.Watching
    },

    {
        name: 'เรื่องข้างบ้าน',
        type: ActivityType.Listening
    },

    {
        name: 'หมาเห่ากัน',
        type: ActivityType.Listening
    }

];


function setRandomStatus() {

    if (!client.user) return;

    const randomStatus =
        statusList[
            Math.floor(
                Math.random() *
                statusList.length
            )
        ];


    client.user.setPresence({

        activities: [
            randomStatus
        ]

    });

}


client.once(
    'ready',
    () => {

        console.log(
            `บอท ${client.user.tag} ออนไลน์ (Render)`
        );


        setRandomStatus();


        const SEVENTEEN_DAYS_MS =
            17 *
            24 *
            60 *
            60 *
           1000;

        setInterval(
            setRandomStatus,
            SEVENTEEN_DAYS_MS
        );
    }
);

client.login(
    process.env.DISCORD_TOKEN
);
