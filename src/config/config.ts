import { BackendConfig } from "./config_backend";
import { ImageConfig } from "./config_image";
import { LogConfig } from "./config_log";
import { MemoryConfig } from "./config_memory";
import { MessageConfig } from "./config_message";
import { ReceivedConfig } from "./config_received";
import { ReplyConfig } from "./config_reply";
import { RequestConfig } from "./config_request";
import { ToolConfig } from "./config_tool";

/** 插件版本号 */
export const VERSION = "4.10.0";
/** 插件作者 */
export const AUTHOR = "baiyu&错误";
/** 允许的CQ码类型列表 */
export const CQTYPESALLOW = ["at", "image", "reply", "face", "poke"];

/**
 * 配置管理器
 * 负责管理插件的各种配置项，包括注册配置、缓存管理等
 */
export class ConfigManager {
    /** 扩展信息对象 */
    static ext: seal.ExtInfo;
    /** 配置缓存，用于避免频繁读取配置 */
    static cache: {
        [key: string]: {
            /** 缓存时间戳 */
            timestamp: number,
            /** 缓存数据 */
            data: any
        }
    } = {}

    /**
     * 注册所有配置模块
     * 初始化扩展对象并注册各个配置子模块
     */
    static registerConfig() {
        this.ext = ConfigManager.getExt('aiplugin4');
        LogConfig.register();
        RequestConfig.register();
        MessageConfig.register();
        ToolConfig.register();
        ReceivedConfig.register();
        ReplyConfig.register();
        ImageConfig.register();
        BackendConfig.register();
        MemoryConfig.register();
    }

    /**
     * 获取带缓存的配置数据
     * @param key 缓存键名
     * @param getFunc 获取数据的函数
     * @returns 配置数据
     */
    static getCache<T>(key: string, getFunc: () => T): T {
        const timestamp = Date.now()
        if (this.cache?.[key] && timestamp - this.cache[key].timestamp < 3000) {
            return this.cache[key].data;
        }

        const data = getFunc();
        this.cache[key] = {
            timestamp: timestamp,
            data: data
        }

        return data;
    }

    /** 获取日志配置 */
    static get log() { return this.getCache('log', LogConfig.get) }
    /** 获取请求配置 */
    static get request() { return this.getCache('request', RequestConfig.get) }
    /** 获取消息配置 */
    static get message() { return this.getCache('message', MessageConfig.get) }
    /** 获取工具配置 */
    static get tool() { return this.getCache('tool', ToolConfig.get) }
    /** 获取接收配置 */
    static get received() { return this.getCache('received', ReceivedConfig.get) }
    /** 获取回复配置 */
    static get reply() { return this.getCache('reply', ReplyConfig.get) }
    /** 获取图片配置 */
    static get image() { return this.getCache('image', ImageConfig.get) }
    /** 获取后端配置 */
    static get backend() { return this.getCache('backend', BackendConfig.get) }
    /** 获取记忆配置 */
    static get memory() { return this.getCache('memory', MemoryConfig.get) }

    /**
     * 获取或创建扩展对象
     * @param name 扩展名称
     * @returns 扩展信息对象
     */
    static getExt(name: string): seal.ExtInfo {
        if (name == 'aiplugin4' && ConfigManager.ext) {
            return ConfigManager.ext;
        }

        let ext = seal.ext.find(name);
        if (!ext) {
            ext = seal.ext.new(name, AUTHOR, VERSION);
            seal.ext.register(ext);
        }

        return ext;
    }
}