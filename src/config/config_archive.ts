import { ConfigManager } from "./config";

export class ArchiveConfig {
    static ext: seal.ExtInfo;

    static register() {
        ArchiveConfig.ext = ConfigManager.getExt('aiplugin4_8:存档');

        seal.ext.registerBoolConfig(ArchiveConfig.ext, "自动开启存档", true, "在遗忘上下文时自动开启新的工作存档");
        seal.ext.registerStringConfig(ArchiveConfig.ext, "自动存档名称前缀", "auto", "自动开启的存档名称前缀");
        seal.ext.registerIntConfig(ArchiveConfig.ext, "最大存档数量", 50, "每个用户/群组的最大存档数量限制，0为无限制");
    }

    static get() {
        return {
            autoStart: seal.ext.getBoolConfig(ArchiveConfig.ext, "自动开启存档"),
            autoStartPrefix: seal.ext.getStringConfig(ArchiveConfig.ext, "自动存档名称前缀"),
            maxArchives: seal.ext.getIntConfig(ArchiveConfig.ext, "最大存档数量")
        }
    }
}
