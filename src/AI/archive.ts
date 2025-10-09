import { ConfigManager } from "../config/config";
import { logger } from "../logger";
import { AI } from "./AI";
import { Message } from "./context";
import { Privilege } from "./AI";

export interface Archive {
    name: string;                    // 存档名称
    id: string;                      // AI实例ID（用户/群组）
    createTime: string;              // 创建时间
    updateTime: string;              // 最后更新时间
    context: {
        messages: Message[];
        ignoreList: string[];
        summaryCounter: number;
        lastReply: string;
        counter: number;
        timer: number;
    };
    privilege: Privilege;
    memory: {
        persona: string;
        memoryMap: { [key: string]: any };
        useShortMemory: boolean;
        shortMemoryList: string[];
    };
    metadata: {
        messageCount: number;
        tokenCount: number;
        description?: string;
    };
}

export class ArchiveManager {
    ai: AI;
    working: Archive | null;
    isRecording: boolean;

    constructor(ai: AI) {
        this.ai = ai;
        this.working = null;
        this.isRecording = false;
    }

    static reviver(value: any, ai: AI): ArchiveManager {
        const manager = new ArchiveManager(ai);
        manager.working = value.working;
        manager.isRecording = value.isRecording;
        return manager;
    }

    /**
     * 生成自动存档名称
     */
    static generateAutoArchiveName(): string {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const minute = String(now.getMinutes()).padStart(2, '0');
        const second = String(now.getSeconds()).padStart(2, '0');
        return `auto_${year}${month}${day}_${hour}${minute}${second}`;
    }

    /**
     * 开启工作存档
     */
    startWorking(name?: string): string {
        if (this.isRecording && this.working) {
            return `当前已有工作存档"${this.working.name}"正在记录中\n请先使用 .ai arc save 保存或 .ai arc stop 停止`;
        }

        const archiveName = name || ArchiveManager.generateAutoArchiveName();

        // 检查存档名是否已存在
        if (this.archiveExists(archiveName)) {
            return `存档"${archiveName}"已存在，请使用其他名称`;
        }

        this.working = this.createArchiveSnapshot(archiveName);
        this.isRecording = true;

        logger.info(`开启工作存档: ${archiveName}`);
        return `[存档] 已开启工作存档: ${archiveName}`;
    }

    /**
     * 停止记录但不保存
     */
    stopWorking(): string {
        if (!this.isRecording || !this.working) {
            return `当前没有正在记录的工作存档`;
        }

        const name = this.working.name;
        this.working = null;
        this.isRecording = false;

        logger.info(`停止工作存档: ${name}`);
        return `[存档] 已停止工作存档"${name}"的记录（未保存）`;
    }

    /**
     * 更新工作存档（在上下文变化时调用）
     */
    updateWorking() {
        if (!this.isRecording || !this.working) {
            return;
        }

        // 更新存档快照
        this.working.updateTime = new Date().toLocaleString();
        this.working.context.messages = JSON.parse(JSON.stringify(this.ai.context.messages));
        this.working.context.ignoreList = [...this.ai.context.ignoreList];
        this.working.context.summaryCounter = this.ai.context.summaryCounter;
        this.working.context.lastReply = this.ai.context.lastReply;
        this.working.context.counter = this.ai.context.counter;
        this.working.context.timer = this.ai.context.timer;

        this.working.privilege = JSON.parse(JSON.stringify(this.ai.privilege));

        this.working.memory = {
            persona: this.ai.memory.persona,
            memoryMap: JSON.parse(JSON.stringify(this.ai.memory.memoryMap)),
            useShortMemory: this.ai.memory.useShortMemory,
            shortMemoryList: [...this.ai.memory.shortMemoryList]
        };

        this.working.metadata.messageCount = this.working.context.messages.length;
        this.working.metadata.tokenCount = this.calculateTokenCount();
    }

    /**
     * 创建当前状态的存档快照
     */
    createArchiveSnapshot(name: string): Archive {
        return {
            name: name,
            id: this.ai.id,
            createTime: new Date().toLocaleString(),
            updateTime: new Date().toLocaleString(),
            context: {
                messages: JSON.parse(JSON.stringify(this.ai.context.messages)),
                ignoreList: [...this.ai.context.ignoreList],
                summaryCounter: this.ai.context.summaryCounter,
                lastReply: this.ai.context.lastReply,
                counter: this.ai.context.counter,
                timer: this.ai.context.timer
            },
            privilege: JSON.parse(JSON.stringify(this.ai.privilege)),
            memory: {
                persona: this.ai.memory.persona,
                memoryMap: JSON.parse(JSON.stringify(this.ai.memory.memoryMap)),
                useShortMemory: this.ai.memory.useShortMemory,
                shortMemoryList: [...this.ai.memory.shortMemoryList]
            },
            metadata: {
                messageCount: this.ai.context.messages.length,
                tokenCount: this.calculateTokenCount(),
                description: ''
            }
        };
    }

    /**
     * 保存工作存档
     */
    saveWorking(name?: string): string {
        if (!this.working) {
            return `当前没有工作存档`;
        }

        // 如果提供了新名称，检查是否已存在
        if (name && name !== this.working.name) {
            if (this.archiveExists(name)) {
                return `存档"${name}"已存在，无法保存`;
            }
            this.working.name = name;
        }

        // 更新最后一次快照
        this.updateWorking();

        // 保存到数据库
        const result = this.saveArchive(this.working);

        if (result.success) {
            const archive = this.working;
            this.working = null;
            this.isRecording = false;

            return `[存档] 工作存档"${archive.name}"已保存
- 消息数: ${archive.metadata.messageCount}条
- Token: ${archive.metadata.tokenCount}
- 创建时间: ${archive.createTime}
- 保存时间: ${archive.updateTime}`;
        } else {
            return `[存档] 保存失败: ${result.error}`;
        }
    }

    /**
     * 保存当前上下文到指定存档（覆盖或新建）
     */
    saveTo(name: string): string {
        const archive = this.createArchiveSnapshot(name);
        const result = this.saveArchive(archive);

        if (result.success) {
            return `[存档] 当前上下文已保存到存档"${name}"
- 消息数: ${archive.metadata.messageCount}条
- Token: ${archive.metadata.tokenCount}
- 保存时间: ${archive.updateTime}`;
        } else {
            return `[存档] 保存失败: ${result.error}`;
        }
    }

    /**
     * 加载存档
     */
    loadArchive(name: string): string {
        const archive = this.getArchive(name);
        if (!archive) {
            return `存档"${name}"不存在`;
        }

        try {
            // 恢复上下文
            this.ai.context.messages = JSON.parse(JSON.stringify(archive.context.messages));
            this.ai.context.ignoreList = [...archive.context.ignoreList];
            this.ai.context.summaryCounter = archive.context.summaryCounter;
            this.ai.context.lastReply = archive.context.lastReply;
            this.ai.context.counter = archive.context.counter;
            this.ai.context.timer = archive.context.timer;

            // 恢复权限
            this.ai.privilege = JSON.parse(JSON.stringify(archive.privilege));

            // 恢复记忆
            this.ai.memory.persona = archive.memory.persona;
            this.ai.memory.memoryMap = JSON.parse(JSON.stringify(archive.memory.memoryMap));
            this.ai.memory.useShortMemory = archive.memory.useShortMemory;
            this.ai.memory.shortMemoryList = [...archive.memory.shortMemoryList];

            logger.info(`加载存档: ${name}`);

            return `[存档] 已加载存档"${name}"
- 消息数: ${archive.metadata.messageCount}条
- Token: ${archive.metadata.tokenCount}
- 原存档时间: ${archive.updateTime}
[提示] 当前对话将基于此存档继续，使用 .ai arc save 可保存新的修改`;
        } catch (e) {
            logger.error(`加载存档失败: ${e.message}`);
            return `[存档] 加载失败: ${e.message}`;
        }
    }

    /**
     * 列出所有存档
     */
    listArchives(): string {
        const index = this.getArchiveIndex();

        if (index.length === 0) {
            return `暂无已保存的存档`;
        }

        const archives = index.map(name => this.getArchive(name)).filter(a => a !== null);

        let result = `已保存的存档列表 (共${archives.length}个):\n`;
        archives.forEach((archive, i) => {
            result += `\n${i + 1}. ${archive.name}`;
            result += `\n   消息数: ${archive.metadata.messageCount}条`;
            result += `\n   Token: ${archive.metadata.tokenCount}`;
            result += `\n   保存时间: ${archive.updateTime}`;
            if (archive.metadata.description) {
                result += `\n   描述: ${archive.metadata.description}`;
            }
        });

        return result;
    }

    /**
     * 查看存档信息
     */
    getArchiveInfo(name: string): string {
        const archive = this.getArchive(name);
        if (!archive) {
            return `存档"${name}"不存在`;
        }

        let result = `存档"${archive.name}"的详细信息:\n`;
        result += `- ID: ${archive.id}\n`;
        result += `- 创建时间: ${archive.createTime}\n`;
        result += `- 最后更新: ${archive.updateTime}\n`;
        result += `- 消息数: ${archive.metadata.messageCount}条\n`;
        result += `- Token估计: ${archive.metadata.tokenCount}\n`;
        result += `- 长期记忆数: ${Object.keys(archive.memory.memoryMap).length}条\n`;
        result += `- 短期记忆数: ${archive.memory.shortMemoryList.length}条\n`;
        if (archive.metadata.description) {
            result += `- 描述: ${archive.metadata.description}`;
        }

        return result;
    }

    /**
     * 重命名存档
     */
    renameArchive(oldName: string, newName: string): string {
        if (!this.archiveExists(oldName)) {
            return `存档"${oldName}"不存在`;
        }

        if (this.archiveExists(newName)) {
            return `存档"${newName}"已存在`;
        }

        const archive = this.getArchive(oldName);
        if (!archive) {
            return `读取存档"${oldName}"失败`;
        }

        archive.name = newName;

        // 删除旧存档
        this.deleteArchive(oldName);

        // 保存新存档
        const result = this.saveArchive(archive);

        if (result.success) {
            return `[存档] 已将存档"${oldName}"重命名为"${newName}"`;
        } else {
            return `[存档] 重命名失败: ${result.error}`;
        }
    }

    /**
     * 删除存档
     */
    deleteArchive(name: string): string {
        if (!this.archiveExists(name)) {
            return `存档"${name}"不存在`;
        }

        try {
            const key = `archive_${this.ai.id}_${name}`;
            ConfigManager.ext.storageSet(key, '');

            // 更新索引
            const index = this.getArchiveIndex();
            const newIndex = index.filter(n => n !== name);
            this.saveArchiveIndex(newIndex);

            logger.info(`删除存档: ${name}`);
            return `[存档] 已删除存档"${name}"`;
        } catch (e) {
            logger.error(`删除存档失败: ${e.message}`);
            return `[存档] 删除失败: ${e.message}`;
        }
    }

    /**
     * 查看工作存档状态
     */
    getStatus(): string {
        if (!this.isRecording || !this.working) {
            return `当前没有正在记录的工作存档`;
        }

        // 实时更新统计
        const messageCount = this.ai.context.messages.length;
        const tokenCount = this.calculateTokenCount();

        return `[存档] 工作存档状态:
- 名称: ${this.working.name}
- 开始时间: ${this.working.createTime}
- 当前消息数: ${messageCount}条
- 当前Token: ${tokenCount}
- 记录状态: 进行中`;
    }

    // ============ 私有辅助方法 ============

    /**
     * 保存存档到数据库
     */
    private saveArchive(archive: Archive): { success: boolean, error?: string } {
        try {
            const key = `archive_${this.ai.id}_${archive.name}`;
            const data = JSON.stringify(archive);
            ConfigManager.ext.storageSet(key, data);

            // 更新索引
            const index = this.getArchiveIndex();
            if (!index.includes(archive.name)) {
                index.push(archive.name);
                this.saveArchiveIndex(index);
            }

            logger.info(`保存存档: ${archive.name}, 大小: ${data.length} bytes`);
            return { success: true };
        } catch (e) {
            logger.error(`保存存档失败: ${e.message}`);
            return { success: false, error: e.message };
        }
    }

    /**
     * 从数据库获取存档
     */
    private getArchive(name: string): Archive | null {
        try {
            const key = `archive_${this.ai.id}_${name}`;
            const data = ConfigManager.ext.storageGet(key);

            if (!data) {
                return null;
            }

            return JSON.parse(data);
        } catch (e) {
            logger.error(`读取存档失败: ${e.message}`);
            return null;
        }
    }

    /**
     * 检查存档是否存在
     */
    private archiveExists(name: string): boolean {
        const index = this.getArchiveIndex();
        return index.includes(name);
    }

    /**
     * 获取存档索引
     */
    private getArchiveIndex(): string[] {
        try {
            const key = `archive_index_${this.ai.id}`;
            const data = ConfigManager.ext.storageGet(key);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            logger.error(`读取存档索引失败: ${e.message}`);
            return [];
        }
    }

    /**
     * 保存存档索引
     */
    private saveArchiveIndex(index: string[]) {
        try {
            const key = `archive_index_${this.ai.id}`;
            ConfigManager.ext.storageSet(key, JSON.stringify(index));
        } catch (e) {
            logger.error(`保存存档索引失败: ${e.message}`);
        }
    }

    /**
     * 计算Token数量（简单估算）
     */
    private calculateTokenCount(): number {
        let count = 0;
        for (const msg of this.ai.context.messages) {
            for (const content of msg.contentArray) {
                // 简单估算：中文约1.5字符/token，英文约4字符/token
                count += Math.ceil(content.length / 2);
            }
        }
        return count;
    }
}
