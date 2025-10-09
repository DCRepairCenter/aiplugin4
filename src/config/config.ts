import { ArchiveConfig } from "./config_archive";
import { BackendConfig } from "./config_backend";
import { ImageConfig } from "./config_image";
import { LogConfig } from "./config_log";
import { MemoryConfig } from "./config_memory";
import { MessageConfig } from "./config_message";
import { ReceivedConfig } from "./config_received";
import { ReplyConfig } from "./config_reply";
import { RequestConfig } from "./config_request";
import { SoupConfig } from "./config_soup";
import { TimerConfig } from "./config_timer";
import { ToolConfig } from "./config_tool";
import { UndoConfig } from "./config_undo";

export const VERSION = "4.10.1";
export const AUTHOR = "baiyu&错误";
export const CQTYPESALLOW = ["at", "image", "reply", "face", "poke"];

export class ConfigManager {
    static ext: seal.ExtInfo;
    static cache: {
        [key: string]: {
            timestamp: number,
            data: any
        }
    } = {}

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
        ArchiveConfig.register();
        UndoConfig.register();
        TimerConfig.register();
        SoupConfig.register();
    }

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

    static get log() { return this.getCache('log', LogConfig.get) }
    static get request() { return this.getCache('request', RequestConfig.get) }
    static get message() { return this.getCache('message', MessageConfig.get) }
    static get tool() { return this.getCache('tool', ToolConfig.get) }
    static get received() { return this.getCache('received', ReceivedConfig.get) }
    static get reply() { return this.getCache('reply', ReplyConfig.get) }
    static get image() { return this.getCache('image', ImageConfig.get) }
    static get backend() { return this.getCache('backend', BackendConfig.get) }
    static get memory() { return this.getCache('memory', MemoryConfig.get) }
    static get archive() { return this.getCache('archive', ArchiveConfig.get) }
    static get undo() { return this.getCache('undo', UndoConfig.get) }
    static get timer() { return this.getCache('timer', TimerConfig.get) }
    static get soup() { return this.getCache('soup', SoupConfig.get) }

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