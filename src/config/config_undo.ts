import { ConfigManager } from "./config";

export class UndoConfig {
    static ext: seal.ExtInfo;

    static register() {
        UndoConfig.ext = ConfigManager.getExt('aiplugin4_6:撤销');

        seal.ext.registerBoolConfig(UndoConfig.ext, '启用', true, '是否启用撤销功能');
        seal.ext.registerIntConfig(UndoConfig.ext, '最大快照数', 10, '保留的最大快照数量（1-20）');
        seal.ext.registerBoolConfig(UndoConfig.ext, '自动清理', true, '是否自动清理过期快照');
        seal.ext.registerIntConfig(UndoConfig.ext, '快照过期时间', 30, '快照过期时间（分钟，0表示永不过期）');
        seal.ext.registerBoolConfig(UndoConfig.ext, '群聊需要权限', true, '群聊中使用撤销功能是否需要权限（私聊始终允许）');
    }

    static get(): {
        enableUndo: boolean;
        maxSnapshots: number;
        autoCleanup: boolean;
        snapshotTimeout: number;
        groupRequirePrivilege: boolean;
    } {
        return {
            enableUndo: seal.ext.getBoolConfig(UndoConfig.ext, '启用'),
            maxSnapshots: Math.max(1, Math.min(20, seal.ext.getIntConfig(UndoConfig.ext, '最大快照数'))),
            autoCleanup: seal.ext.getBoolConfig(UndoConfig.ext, '自动清理'),
            snapshotTimeout: Math.max(0, seal.ext.getIntConfig(UndoConfig.ext, '快照过期时间')),
            groupRequirePrivilege: seal.ext.getBoolConfig(UndoConfig.ext, '群聊需要权限')
        };
    }
}
