client.on('messageCreate', async (message) => {
    if (message.author.bot) return; 
    let content = message.content;
    let isConverted = false;

    // --- แปลงแค่ลิงก์ IG และ Facebook ตามที่คุณต้องการ ---
    
    // แปลง Instagram -> kkinstagram (เพื่อให้ Discord ดึงชื่อ แคปชั่น และรูปมาโชว์)
    if (/(https?:\/\/(www\.)?instagram\.com\/[^\s]+)/gi.test(content)) {
        content = content.replace(/https?:\/\/(www\.)?instagram\.com/gi, 'https://www.kkinstagram.com');
        isConverted = true;
    }
    // แปลง Facebook -> fxfacebook (kkinstagram ใช้กับเฟสไม่ได้ ต้องใช้ตัวนี้แทน)
    else if (/(https?:\/\/(www\.|web\.|m\.)?facebook\.com\/[^\s]+)/gi.test(content)) {
        content = content.replace(/https?:\/\/(www\.|web\.|m\.)?facebook\.com/gi, 'https://fxfacebook.com');
        isConverted = true;
    }

    if (isConverted) {
        // ให้บอทตอบกลับด้วยลิงก์ที่แปลงแล้ว
        await message.reply({ content: content, allowedMentions: { repliedUser: false } });
        
        // ซ่อนพรีวิวของลิงก์ต้นฉบับ(ที่รูปไม่ขึ้น) เพื่อไม่ให้แชทรก
        setTimeout(() => {
            message.suppressEmbeds(true).catch(() => console.log('ไม่มีสิทธิ์ซ่อน Embed หรือข้อความถูกลบไปแล้ว'));
        }, 1000);
        return; 
    }
    // --------------------------------------------------------

    if (content.startsWith('/img')) {
        const targetUser = message.mentions.users.first() || message.author;
        const avatarUrl = targetUser.displayAvatarURL({ size: 4096, dynamic: true });
        
        return message.reply(`profile **${targetUser.username}** \n${avatarUrl}`);
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
