import { ConfigManager } from "../config/config";

/**
 * 日志记录器类
 * 提供统一的日志输出功能，支持不同级别的日志记录
 */
class Logger {
    /** 日志记录器名称 */
    name: string;

    /**
     * 日志记录器构造函数
     * @param name 日志记录器的名称
     */
    constructor(name: string) {
        this.name = name;
    }

    /**
     * 处理日志数据，根据配置决定输出格式
     * @param data 要记录的数据
     * @returns 处理后的日志字符串
     */
    handleLog(...data: any[]): string {
        const { logLevel } = ConfigManager.log;
        if (logLevel === "永不") {
            return '';
        } else if (logLevel === "简短") {
            const s = data.map(item => `${item}`).join(" ");
            if (s.length > 1000) {
                return s.substring(0, 500) + "\n...\n" + s.substring(s.length - 500);
            } else {
                return s;
            }
        } else if (logLevel === "详细") {
            return data.map(item => `${item}`).join(" ");
        } else {
            return '';
        }
    }

    /**
     * 记录信息级别日志
     * @param data 要记录的数据
     */
    info(...data: any[]) {
        const s = this.handleLog(...data);
        if (!s) {
            return;
        }
        console.log(`【${this.name}】: ${s}`);
    }

    /**
     * 记录警告级别日志
     * @param data 要记录的数据
     */
    warning(...data: any[]) {
        const s = this.handleLog(...data);
        if (!s) {
            return;
        }
        console.warn(`【${this.name}】: ${s}`);
    }

    /**
     * 记录错误级别日志
     * @param data 要记录的数据
     */
    error(...data: any[]) {
        const s = this.handleLog(...data);
        if (!s) {
            return;
        }
        console.error(`【${this.name}】: ${s}`);
    }
}

/** 默认的AI插件日志记录器实例 */
export const logger = new Logger('aiplugin4');