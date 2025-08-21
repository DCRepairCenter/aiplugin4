import { ConfigManager } from "../config/config";
import { sendITTRequest } from "./service";
import { generateId } from "../utils/utils";
import { logger } from "./logger";

/**
 * 图片类
 * 封装图片的基本信息和元数据
 */
export class Image {
    /** 图片唯一标识符 */
    id: string;
    /** 是否为URL格式 */
    isUrl: boolean;
    /** 图片文件路径或URL */
    file: string;
    /** 应用场景列表 */
    scenes: string[];
    /** Base64编码内容 */
    base64: string;
    /** 图片描述内容 */
    content: string;
    /** 图片权重 */
    weight: number;

    /**
     * 图片构造函数
     * @param file 图片文件路径或URL
     */
    constructor(file: string) {
        this.id = generateId();
        this.isUrl = file.startsWith('http');
        this.file = file;
        this.scenes = [];
        this.base64 = '';
        this.content = '';
        this.weight = 1;
    }
}

/**
 * 图片管理器类
 * 负责管理偷取的图片、保存的图片以及图片相关功能
 */
export class ImageManager {
    /** 偷取的图片列表 */
    stolenImages: Image[];
    /** 保存的图片列表 */
    savedImages: Image[];
    /** 偷图功能状态 */
    stealStatus: boolean;

    /**
     * 图片管理器构造函数
     * 初始化图片列表和偷图状态
     */
    constructor() {
        this.stolenImages = [];
        this.savedImages = [];
        this.stealStatus = false;
    }

    /**
     * JSON反序列化复活器函数
     * @param value 待恢复的数据对象
     * @returns 恢复后的ImageManager实例
     */
    static reviver(value: any): ImageManager {
        const im = new ImageManager();
        const validKeys = ['stolenImages', 'savedImages', 'stealStatus'];

        for (const k of validKeys) {
            if (value.hasOwnProperty(k)) {
                im[k] = value[k];
            }
        }

        return im;
    }

    /**
     * 更新偷取的图片列表
     * @param images 要添加的图片数组
     */
    updateStolenImages(images: Image[]) {
        const { maxStolenImageNum } = ConfigManager.image;
        this.stolenImages = this.stolenImages.concat(images.filter(item => item.isUrl)).slice(-maxStolenImageNum);
    }

    /**
     * 更新保存的图片列表
     * @param images 要添加的图片数组
     */
    updateSavedImages(images: Image[]) {
        const { maxSavedImageNum } = ConfigManager.image;
        this.savedImages = this.savedImages.concat(images.filter(item => item.isUrl));

        if (this.savedImages.length > maxSavedImageNum) {
            this.savedImages = this.savedImages
                .sort((a, b) => b.weight - a.weight)
                .slice(0, maxSavedImageNum);
        }
    }

    /**
     * 删除指定名称的保存图片
     * @param nameList 要删除的图片名称列表
     */
    delSavedImage(nameList: string[]) {
        this.savedImages = this.savedImages.filter(img => !nameList.includes(img.id));
    }

    drawLocalImageFile(): string {
        const { localImagePaths } = ConfigManager.image;
        const localImages: { [key: string]: string } = localImagePaths.reduce((acc: { [key: string]: string }, path: string) => {
            if (path.trim() === '') {
                return acc;
            }
            try {
                const name = path.split('/').pop().replace(/\.[^/.]+$/, '');
                if (!name) {
                    throw new Error(`本地图片路径格式错误:${path}`);
                }

                acc[name] = path;
            } catch (e) {
                logger.error(e);
            }
            return acc;
        }, {});

        const keys = Object.keys(localImages);
        if (keys.length == 0) {
            return '';
        }
        const index = Math.floor(Math.random() * keys.length);
        return localImages[keys[index]];
    }

    async drawStolenImageFile(): Promise<string> {
        if (this.stolenImages.length === 0) {
            return '';
        }

        const index = Math.floor(Math.random() * this.stolenImages.length);
        const image = this.stolenImages.splice(index, 1)[0];
        const url = image.file;

        if (!await ImageManager.checkImageUrl(url)) {
            await new Promise(resolve => setTimeout(resolve, 500));
            return await this.drawStolenImageFile();
        }

        return url;
    }

    drawSavedImageFile(): string {
        if (this.savedImages.length === 0) return null;
        const index = Math.floor(Math.random() * this.savedImages.length);
        const image = this.savedImages[index];
        return seal.base64ToImage(image.base64);
    }

    async drawImageFile(): Promise<string> {
        const { localImagePaths } = ConfigManager.image;
        const localImages: { [key: string]: string } = localImagePaths.reduce((acc: { [key: string]: string }, path: string) => {
            if (path.trim() === '') {
                return acc;
            }
            try {
                const name = path.split('/').pop().replace(/\.[^/.]+$/, '');
                if (!name) {
                    throw new Error(`本地图片路径格式错误:${path}`);
                }

                acc[name] = path;
            } catch (e) {
                logger.error(e);
            }
            return acc;
        }, {});

        const values = Object.values(localImages);
        if (this.stolenImages.length == 0 && values.length == 0 && this.savedImages.length == 0) {
            return '';
        }

        const index = Math.floor(Math.random() * (values.length + this.stolenImages.length + this.savedImages.length));

        if (index < values.length) {
            return values[index];
        } else if (index < values.length + this.stolenImages.length) {
            return await this.drawStolenImageFile();
        } else {
            return this.drawSavedImageFile();
        }
    }

    /**
     * 提取并替换CQ码中的图片
     * @param ctx 
     * @param message 
     * @returns 
     */
    static async handleImageMessage(ctx: seal.MsgContext, message: string): Promise<{ message: string, images: Image[] }> {
        const { receiveImage } = ConfigManager.image;

        const images: Image[] = [];

        const match = message.match(/\[CQ:image,file=(.*?)\]/g);
        if (match !== null) {
            for (let i = 0; i < match.length; i++) {
                try {
                    const file = match[i].match(/\[CQ:image,file=(.*?)\]/)[1];

                    if (!receiveImage) {
                        message = message.replace(`[CQ:image,file=${file}]`, '');
                        continue;
                    }

                    const image = new Image(file);

                    message = message.replace(`[CQ:image,file=${file}]`, `<|img:${image.id}|>`);

                    if (image.isUrl) {
                        const { condition } = ConfigManager.image;

                        const fmtCondition = parseInt(seal.format(ctx, `{${condition}}`));
                        if (fmtCondition === 1) {
                            const reply = await ImageManager.imageToText(file);
                            if (reply) {
                                image.content = reply;
                                message = message.replace(`<|img:${image.id}|>`, `<|img:${image.id}:${reply}|>`);
                            }
                        }
                    }

                    images.push(image);
                } catch (error) {
                    logger.error('在handleImageMessage中处理图片时出错:', error);
                }
            }
        }

        return { message, images };
    }

    static async checkImageUrl(url: string): Promise<boolean> {
        let isValid = false;

        try {
            const response = await fetch(url, { method: 'GET' });

            if (response.ok) {
                const contentType = response.headers.get('Content-Type');
                if (contentType && contentType.startsWith('image')) {
                    logger.info('URL有效且未过期');
                    isValid = true;
                } else {
                    logger.warning(`URL有效但未返回图片 Content-Type: ${contentType}`);
                }
            } else {
                if (response.status === 500) {
                    logger.warning(`URL不知道有没有效 状态码: ${response.status}`);
                    isValid = true;
                } else {
                    logger.warning(`URL无效或过期 状态码: ${response.status}`);
                }
            }
        } catch (error) {
            logger.error('在checkImageUrl中请求出错:', error);
        }

        return isValid;
    }

    static async imageToText(imageUrl: string, text = ''): Promise<string> {
        const { defaultPrompt, urlToBase64 } = ConfigManager.image;

        let useBase64 = false;
        let imageContent = {
            "type": "image_url",
            "image_url": { "url": imageUrl }
        }
        if (urlToBase64 == '总是') {
            const { base64, format } = await ImageManager.imageUrlToBase64(imageUrl);
            if (!base64 || !format) {
                logger.warning(`转换为base64失败`);
                return '';
            }

            useBase64 = true;
            imageContent = {
                "type": "image_url",
                "image_url": { "url": `data:image/${format};base64,${base64}` }
            }
        }

        const textContent = {
            "type": "text",
            "text": text ? text : defaultPrompt
        }

        const messages = [{
            role: "user",
            content: [imageContent, textContent]
        }]

        const { maxChars } = ConfigManager.image;

        const raw_reply = await sendITTRequest(messages, useBase64);
        const reply = raw_reply.slice(0, maxChars);

        return reply;
    }

    static async imageUrlToBase64(imageUrl: string): Promise<{ base64: string, format: string }> {
        const { imageTobase64Url } = ConfigManager.backend;

        try {
            const response = await fetch(`${imageTobase64Url}/image-to-base64`, {
                method: 'POST',
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify({ url: imageUrl })
            });

            const text = await response.text();
            if (!response.ok) {
                throw new Error(`请求失败! 状态码: ${response.status}\n响应体: ${text}`);
            }
            if (!text) {
                throw new Error("响应体为空");
            }

            try {
                const data = JSON.parse(text);
                if (data.error) {
                    throw new Error(`请求失败! 错误信息: ${data.error.message}`);
                }
                if (!data.base64 || !data.format) {
                    throw new Error(`响应体中缺少base64或format字段`);
                }
                return data;
            } catch (e) {
                throw new Error(`解析响应体时出错:${e}\n响应体:${text}`);
            }
        } catch (error) {
            logger.error("在imageUrlToBase64中请求出错：", error);
            return { base64: '', format: '' };
        }
    }
}