import { ConfigManager } from "./config/config";
import { createCtx, createMsg } from "./utils/utils_seal";
import { AI, AIManager } from "./AI/AI";
import { logger } from "./logger";

export interface TimerInfo {
    id: string;                      // AI实例ID
    name: string;                    // 定时器名称
    messageType: 'private' | 'group';
    uid: string;
    gid: string;
    epId: string;
    timestamp: number;               // 触发时间戳
    setTime: string;                 // 设置时间
    content: string;                 // 提示内容
    repeatType?: 'once' | 'daily' | 'weekly' | 'monthly'; // 重复类型
    enabled: boolean;                // 是否启用
};

/**
 * 时间解析器
 */
export class TimeParser {
    /**
     * 解析相对时间: 30m, 2h, 1d
     */
    static parseRelative(timeStr: string): number | null {
        const match = timeStr.match(/^(\d+)(m|h|d)$/);
        if (!match) return null;
        
        const value = parseInt(match[1]);
        const unit = match[2];
        
        const multipliers: { [key: string]: number } = { m: 60, h: 3600, d: 86400 };
        return value * multipliers[unit];
    }
    
    /**
     * 解析绝对时间: 14:30, 2024-10-09 14:30
     */
    static parseAbsolute(timeStr: string): number | null {
        // HH:MM 格式
        const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
        if (timeMatch) {
            const now = new Date();
            const targetTime = new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate(),
                parseInt(timeMatch[1]),
                parseInt(timeMatch[2])
            );
            
            // 如果时间已过，设置为明天
            if (targetTime.getTime() < now.getTime()) {
                targetTime.setDate(targetTime.getDate() + 1);
            }
            
            return Math.floor(targetTime.getTime() / 1000);
        }
        
        // 完整日期时间格式
        const fullMatch = timeStr.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})$/);
        if (fullMatch) {
            const targetTime = new Date(
                parseInt(fullMatch[1]),
                parseInt(fullMatch[2]) - 1,
                parseInt(fullMatch[3]),
                parseInt(fullMatch[4]),
                parseInt(fullMatch[5])
            );
            return Math.floor(targetTime.getTime() / 1000);
        }
        
        return null;
    }
    
    /**
     * 解析重复周期: daily@14:30, weekly@1@09:00
     */
    static parseRepeat(timeStr: string): { timestamp: number, repeatType: string } | null {
        // daily@HH:MM
        const dailyMatch = timeStr.match(/^daily@(\d{1,2}):(\d{2})$/);
        if (dailyMatch) {
            const timestamp = this.parseAbsolute(`${dailyMatch[1]}:${dailyMatch[2]}`);
            return timestamp ? { timestamp, repeatType: 'daily' } : null;
        }
        
        // weekly@weekday@HH:MM
        const weeklyMatch = timeStr.match(/^weekly@([0-6])@(\d{1,2}):(\d{2})$/);
        if (weeklyMatch) {
            const targetWeekday = parseInt(weeklyMatch[1]);
            const now = new Date();
            const currentWeekday = now.getDay();
            
            let daysUntilTarget = targetWeekday - currentWeekday;
            if (daysUntilTarget < 0) daysUntilTarget += 7;
            
            const targetTime = new Date(now);
            targetTime.setDate(now.getDate() + daysUntilTarget);
            targetTime.setHours(parseInt(weeklyMatch[2]), parseInt(weeklyMatch[3]), 0, 0);
            
            return {
                timestamp: Math.floor(targetTime.getTime() / 1000),
                repeatType: 'weekly'
            };
        }
        
        return null;
    }
    
    /**
     * 统一解析入口
     */
    static parse(timeStr: string): { timestamp: number, repeatType?: string } | null {
        // 尝试相对时间
        const relativeSeconds = this.parseRelative(timeStr);
        if (relativeSeconds) {
            return {
                timestamp: Math.floor(Date.now() / 1000) + relativeSeconds,
                repeatType: 'once'
            };
        }
        
        // 尝试重复周期
        const repeat = this.parseRepeat(timeStr);
        if (repeat) return repeat;
        
        // 尝试绝对时间
        const absolute = this.parseAbsolute(timeStr);
        if (absolute) {
            return { timestamp: absolute, repeatType: 'once' };
        }
        
        return null;
    }
}

export class TimerManager {
    static timerQueue: TimerInfo[] = [];
    static isTaskRunning = false;
    static intervalId: number | null = null;

    static getTimerQueue() {
        try {
            JSON.parse(ConfigManager.ext.storageGet(`timerQueue`) || '[]')
                .forEach((item: any) => {
                    this.timerQueue.push(item);
                });
        } catch (e) {
            logger.error('在获取timerQueue时出错', e);
        }
    }

    static saveTimerQueue() {
        ConfigManager.ext.storageSet(`timerQueue`, JSON.stringify(this.timerQueue));
    }

    static addTimer(ctx: seal.MsgContext, msg: seal.Message, ai: AI, t: number, content: string) {
        const name = `auto_${Date.now().toString(36)}`;
        this.timerQueue.push({
            id: ai.id,
            name: name,
            messageType: msg.messageType,
            uid: ctx.player.userId,
            gid: ctx.group.groupId,
            epId: ctx.endPoint.userId,
            timestamp: Math.floor(Date.now() / 1000) + t * 60,
            setTime: new Date().toLocaleString(),
            content: content,
            repeatType: 'once',
            enabled: true
        });

        this.saveTimerQueue();

        if (!this.intervalId) {
            logger.info('定时器任务启动');
            this.executeTask();
        }
    }

    /**
     * 添加命名定时器
     */
    static addNamedTimer(
        ctx: seal.MsgContext,
        msg: seal.Message,
        ai: AI,
        name: string,
        timestamp: number,
        content: string,
        repeatType?: string
    ): { success: boolean, message: string } {
        const { maxTimers } = ConfigManager.timer;
        
        // 检查数量限制
        const userTimers = this.timerQueue.filter(t => t.id === ai.id);
        if (maxTimers > 0 && userTimers.length >= maxTimers) {
            return { success: false, message: `定时器数量已达上限(${maxTimers})` };
        }
        
        // 检查名称是否已存在
        if (this.timerQueue.find(t => t.name === name && t.id === ai.id)) {
            return { success: false, message: `定时器 "${name}" 已存在` };
        }
        
        // 检查名称格式
        if (!/^[\w\u4e00-\u9fa5]+$/.test(name)) {
            return { success: false, message: '定时器名称只能包含中英文、数字和下划线' };
        }
        
        this.timerQueue.push({
            id: ai.id,
            name: name,
            messageType: msg.messageType,
            uid: ctx.player.userId,
            gid: ctx.group.groupId,
            epId: ctx.endPoint.userId,
            timestamp: timestamp,
            setTime: new Date().toLocaleString(),
            content: content,
            repeatType: repeatType as any || 'once',
            enabled: true
        });
        
        this.saveTimerQueue();
        
        if (!this.intervalId) {
            logger.info('定时器任务启动');
            this.executeTask();
        }
        
        return { success: true, message: '定时器创建成功' };
    }
    
    /**
     * 查询定时器列表
     */
    static listTimers(aiId: string, filter?: string): TimerInfo[] {
        let timers = this.timerQueue.filter(t => t.id === aiId);
        
        if (filter) {
            timers = timers.filter(t => t.name.includes(filter));
        }
        
        return timers.sort((a, b) => a.timestamp - b.timestamp);
    }
    
    /**
     * 获取定时器详情
     */
    static getTimer(aiId: string, name: string): TimerInfo | null {
        return this.timerQueue.find(t => t.id === aiId && t.name === name) || null;
    }
    
    /**
     * 删除定时器
     */
    static deleteTimer(aiId: string, name: string): boolean {
        const index = this.timerQueue.findIndex(t => t.id === aiId && t.name === name);
        if (index === -1) return false;
        
        this.timerQueue.splice(index, 1);
        this.saveTimerQueue();
        return true;
    }
    
    /**
     * 启用/禁用定时器
     */
    static toggleTimer(aiId: string, name: string, enabled: boolean): boolean {
        const timer = this.getTimer(aiId, name);
        if (!timer) return false;
        
        timer.enabled = enabled;
        this.saveTimerQueue();
        return true;
    }
    
    /**
     * 编辑定时器
     */
    static editTimer(
        aiId: string,
        name: string,
        property: 'time' | 'content' | 'repeat',
        value: string
    ): { success: boolean, message: string } {
        const timer = this.getTimer(aiId, name);
        if (!timer) {
            return { success: false, message: '定时器不存在' };
        }
        
        switch (property) {
            case 'time':
                const parsed = TimeParser.parse(value);
                if (!parsed) {
                    return { success: false, message: '时间格式错误' };
                }
                timer.timestamp = parsed.timestamp;
                if (parsed.repeatType) {
                    timer.repeatType = parsed.repeatType as any;
                }
                break;
            case 'content':
                timer.content = value;
                break;
            case 'repeat':
                if (!['once', 'daily', 'weekly', 'monthly'].includes(value)) {
                    return { success: false, message: '重复类型错误' };
                }
                timer.repeatType = value as any;
                break;
        }
        
        this.saveTimerQueue();
        return { success: true, message: '定时器更新成功' };
    }
    
    /**
     * 格式化定时器信息
     */
    static formatTimerInfo(timer: TimerInfo, simple: boolean = false): string {
        const remainingSeconds = timer.timestamp - Math.floor(Date.now() / 1000);
        const remainingTime = this.formatDuration(remainingSeconds);
        const status = timer.enabled ? '[x]' : '[ ]';
        const repeatStr = timer.repeatType === 'once' ? '单次' : 
                         timer.repeatType === 'daily' ? '每日' :
                         timer.repeatType === 'weekly' ? '每周' : '每月';
        
        if (simple) {
            return `${status} ${timer.name} - ${remainingTime} (${repeatStr})`;
        }
        
        return `定时器: ${timer.name}
状态: ${timer.enabled ? '启用' : '禁用'}
类型: ${repeatStr}
剩余时间: ${remainingTime}
触发时间: ${new Date(timer.timestamp * 1000).toLocaleString()}
设置时间: ${timer.setTime}
提示内容: ${timer.content}`;
    }
    
    /**
     * 格式化时长
     */
    static formatDuration(seconds: number): string {
        if (seconds < 0) return '已过期';
        if (seconds < 60) return '即将触发';
        
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        const parts = [];
        if (days > 0) parts.push(`${days}天`);
        if (hours > 0) parts.push(`${hours}小时`);
        if (minutes > 0) parts.push(`${minutes}分钟`);
        
        return parts.length > 0 ? parts.join('') + '后' : '即将触发';
    }

    static async task() {
        try {
            if (this.isTaskRunning) {
                logger.info('定时器任务正在运行，跳过');
                return;
            }

            this.isTaskRunning = true;

            const remainingTimers: TimerInfo[] = [];
            let changed = false;
            
            for (const timer of this.timerQueue) {
                // 未启用或未到时间
                if (!timer.enabled || timer.timestamp > Math.floor(Date.now() / 1000)) {
                    remainingTimers.push(timer);
                    continue;
                }

                const { id, name, messageType, uid, gid, epId, setTime, content, repeatType } = timer;
                const msg = createMsg(messageType, uid, gid);
                const ctx = createCtx(epId, msg);
                
                if (!ctx) {
                    logger.error(`定时器 ${name} 无法创建上下文`);
                    continue;
                }
                
                const ai = AIManager.getAI(id);
                if (!ai) {
                    logger.error(`定时器 ${name} 找不到AI实例 ${id}`);
                    continue;
                }

                const s = `定时器 "${name}" 触发了，请按照以下内容发送回复：
定时器设定时间：${setTime}
当前触发时间：${new Date().toLocaleString()}
提示内容：${content}`;

                await ai.context.addSystemUserMessage("定时器触发提示", s, [], ai);
                await ai.chat(ctx, msg, '定时任务');

                changed = true;
                
                // 处理重复任务
                if (repeatType && repeatType !== 'once') {
                    const newTimer = { ...timer };
                    
                    switch (repeatType) {
                        case 'daily':
                            newTimer.timestamp += 86400; // +1天
                            break;
                        case 'weekly':
                            newTimer.timestamp += 604800; // +7天
                            break;
                        case 'monthly':
                            const date = new Date(timer.timestamp * 1000);
                            date.setMonth(date.getMonth() + 1);
                            newTimer.timestamp = Math.floor(date.getTime() / 1000);
                            break;
                    }
                    
                    remainingTimers.push(newTimer);
                }
                
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            if (changed) {
                this.timerQueue = remainingTimers;
                this.saveTimerQueue();
            }

            this.isTaskRunning = false;
        } catch (e) {
            logger.error(`定时任务处理出错，错误信息:${e.message}`);
            this.isTaskRunning = false;
        }
    }

    static async executeTask() {
        if (this.timerQueue.length === 0) {
            this.destroy();
            return;
        }

        await this.task();
        const { checkInterval } = ConfigManager.timer;
        this.intervalId = setTimeout(this.executeTask.bind(this), checkInterval);
    }

    static destroy() {
        if (this.intervalId) {
            clearTimeout(this.intervalId);
            this.intervalId = null;
            logger.info('定时器任务已停止');
        }
    }

    static init() {
        this.getTimerQueue();
        this.executeTask();
    }
}