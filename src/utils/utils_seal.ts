/**
 * 创建消息对象
 * @param messageType 消息类型（群聊或私聊）
 * @param senderId 发送者ID
 * @param groupId 群组ID（可选）
 * @returns 创建的消息对象
 */
export function createMsg(messageType: "group" | "private", senderId: string, groupId: string = ''): seal.Message {
    let msg = seal.newMessage();

    if (messageType === 'group') {
        msg.groupId = groupId;
        msg.guildId = '';
    }

    msg.messageType = messageType;
    msg.sender.userId = senderId;
    return msg;
}

/**
 * 创建上下文对象
 * @param epId 端点ID
 * @param msg 消息对象
 * @returns 创建的消息上下文对象或undefined
 */
export function createCtx(epId: string, msg: seal.Message): seal.MsgContext | undefined {
    const eps = seal.getEndPoints();

    for (let i = 0; i < eps.length; i++) {
        if (eps[i].userId === epId) {
            const ctx = seal.createTempCtx(eps[i], msg);

            ctx.isPrivate = msg.messageType === 'private';

            if (ctx.player.userId === epId) {
                ctx.player.name = seal.formatTmpl(ctx, "核心:骰子名字");
            }

            return ctx;
        }
    }

    return undefined;
}