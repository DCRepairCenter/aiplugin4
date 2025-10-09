import { ConfigManager } from "./config";

export interface SoupData {
    name: string;
    surface: string;  // 汤面
    truth: string;    // 汤底
    type: '红汤' | '清汤';
    style: '本格' | '变格';
    hints: string[];
}

export class SoupConfig {
    static ext: seal.ExtInfo;

    static register() {
        SoupConfig.ext = ConfigManager.getExt('aiplugin4_9:海龟汤');

        seal.ext.registerTemplateConfig(SoupConfig.ext, "题目列表", [
            `[
  {
    "name": "画纸",
    "surface": "我缠着妈妈给我买新的画纸，画纸终于拿到了，可是怎么皱巴巴的？我去问了妈妈怎么回事。。。我再也不能画画了",
    "truth": "我从小精神不正常，只有画画能让我安静，可我只迷恋在人皮上画画。妈妈为了我杀人剥皮，给我不断'买'来画纸。后来妈妈年纪大了，再也无法轻易'买'来画纸，我越来越不满，在家里大闹不止。妈妈无可奈何，剥下了自己的皮给我，拿到皱巴巴的画纸，我去质问妈妈，却看到身上血淋淋的妈妈躺在地上...以后我再也没有画纸作画了",
    "type": "红汤",
    "style": "本格",
    "hints": [
      "画纸不是普通的纸",
      "妈妈为我做出了极大牺牲",
      "我有特殊的精神问题"
    ]
  }
]`
        ], "题目列表为JSON数组，每个题目包含name, surface, truth, type, style, hints字段。可添加多个题目，用逗号分隔");
    }

    static get(): {
        soups: SoupData[];
    } {
        const templates = seal.ext.getTemplateConfig(SoupConfig.ext, "题目列表");
        const soups: SoupData[] = [];
        
        for (const template of templates) {
            try {
                const parsed = JSON.parse(template);
                const items = Array.isArray(parsed) ? parsed : [parsed];
                
                for (const soup of items) {
                    if (soup.name && soup.surface && soup.truth && soup.type && soup.style && Array.isArray(soup.hints)) {
                        soups.push(soup);
                    }
                }
            } catch (e) {
            }
        }
        
        return { soups };
    }

    static getSoup(soups: SoupData[], nameOrType?: string): SoupData | null {
        if (soups.length === 0) return null;

        if (!nameOrType) {
            // 随机选择
            return soups[Math.floor(Math.random() * soups.length)];
        }

        if (nameOrType === '红汤' || nameOrType === '清汤') {
            // 按类型随机选择
            const filtered = soups.filter(s => s.type === nameOrType);
            if (filtered.length === 0) return null;
            return filtered[Math.floor(Math.random() * filtered.length)];
        }

        // 按名称查找
        return soups.find(s => s.name === nameOrType) || null;
    }

    static listSoups(soups: SoupData[], type?: '红汤' | '清汤'): string {
        const filtered = type ? soups.filter(s => s.type === type) : soups;
        if (filtered.length === 0) {
            return type ? `暂无${type}题目` : '暂无题目';
        }
        return filtered.map((soup, index) => 
            `${index + 1}. ${soup.name} [${soup.type}|${soup.style}]`
        ).join('\n');
    }
}
