import { ToolCall } from "../tool/tool";
import { ConfigManager } from "../config/config";
import { Image, ImageManager } from "./image";
import { createCtx, createMsg } from "../utils/utils_seal";
import { levenshteinDistance } from "../utils/utils_string";
import { AI, AIManager } from "./AI";
import { logger } from "../logger";
import { transformMsgId } from "../utils/utils";

export interface Message {
    role: string;
    tool_calls?: ToolCall[];
    tool_call_id?: string;

    uid: string;
    name: string;
    contentArray: string[];
    msgIdArray: string[];
    images: Image[];
}

export interface ContextSnapshot {
    timestamp: number;          // 快照创建时间戳
    messageCount: number;       // 快照时的消息数量
    userMessage: string;        // 用户的原始输入
    source: string;             // 触发来源
    userId: string;             // 创建快照的用户ID（用于群聊权限判断）
}

export class Context {
    messages: Message[];
    ignoreList: string[];
    summaryCounter: number; // 用于短期记忆自动总结计数
    snapshots: ContextSnapshot[]; // 快照栈

    lastReply: string;
    counter: number;
    timer: number;

    constructor() {
        this.messages = [];
        this.ignoreList = [];
        this.summaryCounter = 0;
        this.snapshots = [];
        this.lastReply = '';
        this.counter = 0;
        this.timer = null;
    }

    static reviver(value: any): Context {
        const context = new Context();
        const validKeys = ['messages', 'ignoreList', 'summaryCounter', 'snapshots'];

        for (const k of validKeys) {
            if (value.hasOwnProperty(k)) {
                context[k] = value[k];
            }
        }

        return context;
    }

    clearMessages(...roles: string[]) {
        if (roles.length === 0) {
            this.summaryCounter = 0;
            this.messages = [];
        } else {
            this.messages = this.messages.filter(message => {
                if (roles.includes(message.role)) {
                    this.summaryCounter--;
                    return false;
                }
                return true;
            });
        }
    }

    async addMessage(ctx: seal.MsgContext, msg: seal.Message, ai: AI, s: string, images: Image[], role: 'user' | 'assistant', msgId: string = '') {
        const { showNumber, showMsgId, maxRounds } = ConfigManager.message;
        const { isShortMemory, shortMemorySummaryRound } = ConfigManager.memory;
        const messages = this.messages;

        //处理文本
        s = s
            .replace(/\[CQ:(.*?),(?:qq|id)=(-?\d+)\]/g, (_, p1, p2) => {
                switch (p1) {
                    case 'at': {
                        const epId = ctx.endPoint.userId;
                        const gid = ctx.group.groupId;
                        const uid = `QQ:${p2}`;
                        const mmsg = createMsg(gid === '' ? 'private' : 'group', uid, gid);
                        const mctx = createCtx(epId, mmsg);
                        const name = mctx.player.name || '未知用户';

                        return `<|@${name}${showNumber ? `(${uid.replace(/^.+:/, '')})` : ``}|>`;
                    }
                    case 'poke': {
                        const epId = ctx.endPoint.userId;
                        const gid = ctx.group.groupId;
                        const uid = `QQ:${p2}`;
                        const mmsg = createMsg(gid === '' ? 'private' : 'group', uid, gid);
                        const mctx = createCtx(epId, mmsg);
                        const name = mctx.player.name || '未知用户';

                        return `<|poke:${name}${showNumber ? `(${uid.replace(/^.+:/, '')})` : ``}|>`;
                    }
                    case 'reply': {
                        return showMsgId ? `<|quote:${transformMsgId(p2)}|>` : ``;
                    }
                    default: {
                        return '';
                    }
                }

            })
            .replace(/\[CQ:.*?\]/g, '')

        if (s === '') {
            return;
        }

        //更新上下文
        const name = role == 'user' ? ctx.player.name : seal.formatTmpl(ctx, "核心:骰子名字");
        const uid = role == 'user' ? ctx.player.userId : ctx.endPoint.userId;
        const length = messages.length;
        if (length !== 0 && messages[length - 1].uid === uid && !/<function(?:_call)?>/.test(s)) {
            messages[length - 1].contentArray.push(s);
            messages[length - 1].msgIdArray.push(msgId);
            messages[length - 1].images.push(...images);
        } else {
            const message = {
                role: role,
                content: '',
                uid: uid,
                name: name,
                contentArray: [s],
                msgIdArray: [msgId],
                images: images
            };
            messages.push(message);

            // 更新短期记忆
            if (isShortMemory) {
                if (this.summaryCounter >= shortMemorySummaryRound) {
                    this.summaryCounter = 0;
                    ai.memory.updateShortMemory(ctx, msg, ai, messages.slice(0, shortMemorySummaryRound));
                } else {
                    this.summaryCounter++;
                }
            }
        }

        //更新记忆权重
        ai.memory.updateMemoryWeight(ctx, ai.context, s, role);

        //删除多余的上下文
        this.limitMessages(maxRounds);

        // 更新工作存档（延迟执行，避免阻塞）
        if (ai.archiveManager?.isRecording) {
            setTimeout(() => {
                try {
                    ai.archiveManager?.updateWorking();
                } catch (e) {
                    // 静默处理存档更新错误，不影响主流程
                }
            }, 0);
        }
    }

    async addToolCallsMessage(tool_calls: ToolCall[], ai?: any) {
        const message = {
            role: 'assistant',
            tool_calls: tool_calls,
            uid: '',
            name: '',
            contentArray: [],
            msgIdArray: [],
            images: []
        };
        this.messages.push(message);

        // 更新工作存档（延迟执行）
        if (ai?.archiveManager?.isRecording) {
            setTimeout(() => {
                try {
                    ai.archiveManager?.updateWorking();
                } catch (e) {
                    // 静默处理
                }
            }, 0);
        }
    }

    async addToolMessage(tool_call_id: string, s: string, ai?: any) {
        const message = {
            role: 'tool',
            tool_call_id: tool_call_id,
            uid: '',
            name: '',
            contentArray: [s],
            msgIdArray: [''],
            images: []
        };

        for (let i = this.messages.length - 1; i >= 0; i--) {
            if (this.messages[i]?.tool_calls && this.messages[i].tool_calls.some(tool_call => tool_call.id === tool_call_id)) {
                this.messages.splice(i + 1, 0, message);

                // 更新工作存档（延迟执行）
                if (ai?.archiveManager?.isRecording) {
                    setTimeout(() => {
                        try {
                            ai.archiveManager?.updateWorking();
                        } catch (e) {
                            // 静默处理
                        }
                    }, 0);
                }
                return;
            }
        }

        logger.error(`在添加时找不到对应的 tool_call_id: ${tool_call_id}`);
    }

    async addSystemUserMessage(name: string, s: string, images: Image[], ai?: any) {
        const message = {
            role: 'user',
            content: s,
            uid: '',
            name: `_${name}`,
            contentArray: [s],
            msgIdArray: [''],
            images: images
        };
        this.messages.push(message);

        // 更新工作存档（延迟执行）
        if (ai?.archiveManager?.isRecording) {
            setTimeout(() => {
                try {
                    ai.archiveManager?.updateWorking();
                } catch (e) {
                    // 静默处理
                }
            }, 0);
        }
    }

    limitMessages(maxRounds: number) {
        const messages = this.messages;
        let round = 0;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'user' && !messages[i].name.startsWith('_')) {
                round++;
            }
            if (round > maxRounds) {
                messages.splice(0, i);
                break;
            }
        }
    }

    async findUserId(ctx: seal.MsgContext, name: string | number, findInFriendList: boolean = false): Promise<string> {
        name = String(name);

        if (!name) {
            return null;
        }

        if (name.length > 4 && !isNaN(parseInt(name))) {
            const uid = `QQ:${name}`;
            return this.ignoreList.includes(uid) ? null : uid;
        }

        const match = name.match(/^<([^>]+?)>(?:\(\d+\))?$|(.+?)\(\d+\)$/);
        if (match) {
            name = match[1] || match[2];
        }

        if (name === ctx.player.name) {
            const uid = ctx.player.userId;
            return this.ignoreList.includes(uid) ? null : uid;
        }

        if (name === seal.formatTmpl(ctx, "核心:骰子名字")) {
            return ctx.endPoint.userId;
        }

        // 在上下文中查找用户
        const messages = this.messages;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (name === messages[i].name) {
                const uid = messages[i].uid;
                return this.ignoreList.includes(uid) ? null : uid;
            }
            if (name.length > 4) {
                const distance = levenshteinDistance(name, messages[i].name);
                if (distance <= 2) {
                    const uid = messages[i].uid;
                    return this.ignoreList.includes(uid) ? null : uid;
                }
            }
        }

        // 在群成员列表、好友列表中查找用户
        const ext = seal.ext.find('HTTP依赖');
        if (ext) {
            const epId = ctx.endPoint.userId;

            if (!ctx.isPrivate) {
                const gid = ctx.group.groupId;
                const data = await globalThis.http.getData(epId, `get_group_member_list?group_id=${gid.replace(/^.+:/, '')}`);
                for (let i = 0; i < data.length; i++) {
                    if (name === data[i].card || name === data[i].nickname) {
                        const uid = `QQ:${data[i].user_id}`;
                        return this.ignoreList.includes(uid) ? null : uid;
                    }
                }
            }

            if (findInFriendList) {
                const data = await globalThis.http.getData(epId, 'get_friend_list');
                for (let i = 0; i < data.length; i++) {
                    if (name === data[i].nickname || name === data[i].remark) {
                        const uid = `QQ:${data[i].user_id}`;
                        return this.ignoreList.includes(uid) ? null : uid;
                    }
                }
            }
        }

        if (name.length > 4) {
            const distance = levenshteinDistance(name, ctx.player.name);
            if (distance <= 2) {
                const uid = ctx.player.userId;
                return this.ignoreList.includes(uid) ? null : uid;
            }
        }

        logger.warning(`未找到用户<${name}>`);
        return null;
    }

    async findGroupId(ctx: seal.MsgContext, groupName: string | number): Promise<string> {
        groupName = String(groupName);

        if (!groupName) {
            return null;
        }

        if (groupName.length > 5 && !isNaN(parseInt(groupName))) {
            return `QQ-Group:${groupName}`;
        }

        const match = groupName.match(/^<([^>]+?)>(?:\(\d+\))?$|(.+?)\(\d+\)$/);
        if (match) {
            groupName = match[1] || match[2];
        }

        if (groupName === ctx.group.groupName) {
            return ctx.group.groupId;
        }

        // 在上下文中用户的记忆中查找群聊
        const messages = this.messages;
        const userSet = new Set<string>();
        for (let i = messages.length - 1; i >= 0; i--) {
            const uid = messages[i].uid;
            if (userSet.has(uid) || messages[i].role !== 'user') {
                continue;
            }

            const name = messages[i].name;
            if (name.startsWith('_')) {
                continue;
            }

            const ai = AIManager.getAI(uid);
            const memoryList = Object.values(ai.memory.memoryMap);

            for (const mi of memoryList) {
                if (mi.group.groupName === groupName) {
                    return mi.group.groupId;
                }
                if (mi.group.groupName.length > 4) {
                    const distance = levenshteinDistance(groupName, mi.group.groupName);
                    if (distance <= 2) {
                        return mi.group.groupId;
                    }
                }
            }

            userSet.add(uid);
        }

        // 在群聊列表中查找用户
        const ext = seal.ext.find('HTTP依赖');
        if (ext) {
            const epId = ctx.endPoint.userId;
            const data = await globalThis.http.getData(epId, 'get_group_list');
            for (let i = 0; i < data.length; i++) {
                if (groupName === data[i].group_name) {
                    return `QQ-Group:${data[i].group_id}`;
                }
            }
        }

        if (groupName.length > 4) {
            const distance = levenshteinDistance(groupName, ctx.group.groupName);
            if (distance <= 2) {
                return ctx.group.groupId;
            }
        }

        logger.warning(`未找到群聊<${groupName}>`);
        return null;
    }

    getNames(): string[] {
        const names = [];
        for (const message of this.messages) {
            if (message.role === 'user' && message.name && !names.includes(message.name)) {
                names.push(message.name);
            }
        }
        return names;
    }

    findImage(id: string, im: ImageManager): Image | null {
        if (/^[0-9a-z]{6}$/.test(id.trim())) {
            const messages = this.messages;
            for (let i = messages.length - 1; i >= 0; i--) {
                const image = messages[i].images.find(item => item.id === id);
                if (image) {
                    return image;
                }
            }
        }

        const { localImagePaths } = ConfigManager.image;
        const localImages: { [key: string]: string } = localImagePaths.reduce((acc: { [key: string]: string }, path: string) => {
            if (path.trim() === '') {
                return acc;
            }
            try {
                const name = path.split('/').pop().replace(/\.[^/.]+$/, '');
                if (!name) {
                    throw new Error(`本地图片路径格式错误:${path}`);
                }

                acc[name] = path;
            } catch (e) {
                logger.error(e);
            }
            return acc;
        }, {});

        if (localImages.hasOwnProperty(id)) {
            return new Image(localImages[id]);
        }

        const savedImage = im.savedImages.find(img => img.id === id);
        if (savedImage) {
            const filePath = seal.base64ToImage(savedImage.base64);
            savedImage.file = filePath;
            return savedImage;
        }

        return null;
    }

    /**
     * 创建上下文快照
     * @param userMessage 用户的原始输入消息
     * @param source 触发来源
     * @param userId 用户ID
     */
    createSnapshot(userMessage: string, source: string, userId: string): void {
        const { enableUndo, maxSnapshots } = ConfigManager.undo;
        
        if (!enableUndo) {
            return;
        }
        
        const snapshot: ContextSnapshot = {
            timestamp: Date.now(),
            messageCount: this.messages.length,
            userMessage: userMessage,
            source: source,
            userId: userId
        };
        
        this.snapshots.push(snapshot);
        
        // 限制快照数量
        while (this.snapshots.length > maxSnapshots) {
            this.snapshots.shift();
        }
        
        logger.info(`创建快照: 消息数=${snapshot.messageCount}, 来源=${source}, 用户=${userId}`);
    }
    
    /**
     * 回滚到最后一个快照
     * @param userId 当前用户ID（用于权限验证）
     * @param isPrivate 是否私聊
     * @param hasPrivilege 是否有权限
     * @returns 回滚结果
     */
    rollbackToLastSnapshot(userId: string, isPrivate: boolean, hasPrivilege: boolean): { 
        success: boolean; 
        userMessage?: string; 
        source?: string;
        removedCount?: number;
        snapshotTime?: string;
        error?: string;
    } {
        if (this.snapshots.length === 0) {
            return { success: false, error: '没有可用的快照' };
        }
        
        // 清理过期快照
        this.cleanupExpiredSnapshots();
        
        if (this.snapshots.length === 0) {
            return { success: false, error: '所有快照已过期' };
        }
        
        const { groupRequirePrivilege } = ConfigManager.undo;
        const lastSnapshot = this.snapshots[this.snapshots.length - 1];
        
        // 权限检查：私聊时总是允许，群聊时根据配置检查
        if (!isPrivate && groupRequirePrivilege) {
            // 群聊中需要权限或者是快照创建者
            if (!hasPrivilege && lastSnapshot.userId !== userId) {
                return { 
                    success: false, 
                    error: '权限不足：只能撤销自己创建的快照，或需要管理员权限' 
                };
            }
        }
        
        // 执行回滚
        this.snapshots.pop();
        const currentCount = this.messages.length;
        const targetCount = lastSnapshot.messageCount;
        
        if (targetCount >= currentCount) {
            logger.warning(`快照位置无效: 目标=${targetCount}, 当前=${currentCount}`);
            return { success: false, error: '快照位置无效' };
        }
        
        // 删除从快照点之后的所有消息
        const removedCount = currentCount - targetCount;
        const removedMessages = this.messages.splice(targetCount);
        
        logger.info(`回滚快照: 删除了${removedCount}条消息, 操作者=${userId}`);
        logger.info(`被删除的消息:`, JSON.stringify(removedMessages, null, 2));
        
        return { 
            success: true, 
            userMessage: lastSnapshot.userMessage,
            source: lastSnapshot.source,
            removedCount: removedCount,
            snapshotTime: new Date(lastSnapshot.timestamp).toLocaleString()
        };
    }
    
    /**
     * 清理过期的快照
     */
    cleanupExpiredSnapshots(): void {
        const { autoCleanup, snapshotTimeout } = ConfigManager.undo;
        
        if (!autoCleanup || snapshotTimeout === 0) {
            return;
        }
        
        const now = Date.now();
        const timeoutMs = snapshotTimeout * 60 * 1000;
        
        const validSnapshots = this.snapshots.filter(snapshot => {
            return (now - snapshot.timestamp) < timeoutMs;
        });
        
        const removedCount = this.snapshots.length - validSnapshots.length;
        if (removedCount > 0) {
            logger.info(`清理了${removedCount}个过期快照`);
            this.snapshots = validSnapshots;
        }
    }
    
    /**
     * 清除所有快照
     */
    clearSnapshots(): number {
        const count = this.snapshots.length;
        this.snapshots = [];
        logger.info(`清除了${count}个快照`);
        return count;
    }
    
    /**
     * 获取快照信息
     * @param currentUserId 当前用户ID
     * @param isPrivate 是否私聊
     * @returns 格式化的快照信息字符串
     */
    getSnapshotInfo(currentUserId: string, isPrivate: boolean): string {
        this.cleanupExpiredSnapshots();
        
        if (this.snapshots.length === 0) {
            return '当前没有可用的快照';
        }
        
        const lines = this.snapshots.map((snapshot, index) => {
            const time = new Date(snapshot.timestamp).toLocaleString('zh-CN', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            const preview = snapshot.userMessage.length > 30 
                ? snapshot.userMessage.substring(0, 30) + '...' 
                : snapshot.userMessage;
            const source = snapshot.source ? `[${snapshot.source}]` : '';
            
            // 在群聊中标记是否为自己创建的快照
            let ownerMark = '';
            if (!isPrivate) {
                ownerMark = snapshot.userId === currentUserId ? ' ⭐' : '';
            }
            
            return `${index + 1}. ${time} ${source}${ownerMark}\n   "${preview}"`;
        });
        
        let infoText = `共有 ${this.snapshots.length} 个快照:\n` + lines.join('\n');
        
        if (!isPrivate) {
            infoText += `\n\n提示：⭐标记的是你创建的快照`;
        }
        
        return infoText;
    }
    
    /**
     * 检查是否有可用快照
     */
    hasSnapshots(): boolean {
        this.cleanupExpiredSnapshots();
        return this.snapshots.length > 0;
    }
}
