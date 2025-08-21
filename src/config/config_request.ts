import { ConfigManager } from "./config";

/**
 * 请求配置类
 * 管理AI API请求相关的配置，包括URL、密钥和请求体模板
 */
export class RequestConfig {
    /** 扩展信息对象 */
    static ext: seal.ExtInfo;

    /**
     * 注册请求配置项
     * 包括API地址、密钥和请求体模板等配置
     */
    static register() {
        RequestConfig.ext = ConfigManager.getExt('aiplugin4');

        seal.ext.registerStringConfig(RequestConfig.ext, "url地址", "https://api.deepseek.com/v1/chat/completions", '');
        seal.ext.registerStringConfig(RequestConfig.ext, "API Key", "你的API Key", '');
        seal.ext.registerTemplateConfig(RequestConfig.ext, "body", [
            `"model":"deepseek-chat"`,
            `"max_tokens":1024`,
            `"stop":null`,
            `"stream":false`,
            `"frequency_penalty":0`,
            `"presence_penalty":0`,
            `"temperature":1`,
            `"top_p":1`
        ], "messages,tools,tool_choice不存在时，将会自动替换。具体参数请参考你所使用模型的接口文档");
    }

    /**
     * 获取请求配置
     * @returns 请求配置对象，包含URL、API密钥和请求体模板
     */
    static get() {
        return {
            url: seal.ext.getStringConfig(RequestConfig.ext, "url地址"),
            apiKey: seal.ext.getStringConfig(RequestConfig.ext, "API Key"),
            bodyTemplate: seal.ext.getTemplateConfig(RequestConfig.ext, "body")
        }
    }
}