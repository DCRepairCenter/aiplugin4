import { ConfigManager } from "./config";

export class TimerConfig {
    static ext: seal.ExtInfo;

    static register() {
        TimerConfig.ext = ConfigManager.getExt('aiplugin4_9:定时器');

        seal.ext.registerIntConfig(TimerConfig.ext, "最大定时器数量", 20, "每个用户/群组的最大定时器数量限制");
        seal.ext.registerIntConfig(TimerConfig.ext, "定时器检查间隔/s", 5, "定时器任务检查间隔");
        seal.ext.registerBoolConfig(TimerConfig.ext, "允许重复任务", true, "是否允许创建重复类型的定时器");
    }

    static get() {
        return {
            maxTimers: seal.ext.getIntConfig(TimerConfig.ext, "最大定时器数量"),
            checkInterval: seal.ext.getIntConfig(TimerConfig.ext, "定时器检查间隔/s") * 1000,
            allowRepeat: seal.ext.getBoolConfig(TimerConfig.ext, "允许重复任务")
        }
    }
}
