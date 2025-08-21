import { ConfigManager } from "./config";

/**
 * 后端配置类
 * 管理各种后端服务的URL配置
 */
export class BackendConfig {
    /** 扩展信息对象 */
    static ext: seal.ExtInfo;

    /**
     * 注册后端配置项
     * 包括流式输出、图片转换、联网搜索等后端服务配置
     */
    static register() {
        BackendConfig.ext = ConfigManager.getExt('aiplugin4_6:后端');

        seal.ext.registerStringConfig(BackendConfig.ext, "流式输出", "http://localhost:3010", '自行搭建或使用他人提供的后端');
        seal.ext.registerStringConfig(BackendConfig.ext, "图片转base64", "https://urltobase64.白鱼.chat", '可自行搭建');
        seal.ext.registerStringConfig(BackendConfig.ext, "联网搜索", "https://searxng.白鱼.chat", '可自行搭建');
        seal.ext.registerStringConfig(BackendConfig.ext, "网页读取", "https://webread.白鱼.chat", '可自行搭建');
        seal.ext.registerStringConfig(BackendConfig.ext, "用量图表", "http://error.白鱼.chat:3009", '可自行搭建');
    }

    /**
     * 获取后端配置
     * @returns 后端服务URL配置对象
     */
    static get() {
        return {
            streamUrl: seal.ext.getStringConfig(BackendConfig.ext, "流式输出"),
            imageTobase64Url: seal.ext.getStringConfig(BackendConfig.ext, "图片转base64"),
            webSearchUrl: seal.ext.getStringConfig(BackendConfig.ext, "联网搜索"),
            webReadUrl: seal.ext.getStringConfig(BackendConfig.ext, "网页读取"),
            usageChartUrl: seal.ext.getStringConfig(BackendConfig.ext, "用量图表")
        }
    }
}
