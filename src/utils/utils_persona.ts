// 自设相关工具函数

export interface PersonaCommandResult {
    mode: 'direct' | 'named' | 'clear';
    name?: string;
    content?: string;
}

/**
 * 解析自设命令
 * @param restArgs 从第4个参数开始的剩余参数
 * @returns 解析结果
 */
export function parsePersonaCommand(restArgs: string): PersonaCommandResult {
    if (restArgs === 'clr') {
        return { mode: 'clear' };
    }

    // 尝试分割为名称和内容
    // 规则: 第一个空格前的部分作为名称，后续作为内容
    // 如果名称包含特殊字符(如换行、标点等)，则视为直接替换模式
    const firstSpaceIndex = restArgs.indexOf(' ');

    if (firstSpaceIndex === -1) {
        // 没有空格，整体作为内容
        return { mode: 'direct', content: restArgs };
    }

    const possibleName = restArgs.substring(0, firstSpaceIndex);
    const possibleContent = restArgs.substring(firstSpaceIndex + 1).trim();

    // 验证名称合法性
    if (isValidPersonaName(possibleName) && possibleContent.length > 0) {
        return { mode: 'named', name: possibleName, content: possibleContent };
    } else {
        return { mode: 'direct', content: restArgs };
    }
}

/**
 * 验证自设名称是否合法
 * @param name 自设名称
 * @returns 是否合法
 */
export function isValidPersonaName(name: string): boolean {
    // 名称规则:
    // 1. 长度 1-20 字符
    // 2. 不包含换行符、制表符
    // 3. 不以空格开头或结尾
    // 4. 不是保留词(clr, show, list, del, switch, rename, status, lst)

    const reserved = ['clr', 'show', 'list', 'lst', 'del', 'switch', 'rename', 'status'];

    return name.length >= 1
        && name.length <= 20
        && !name.includes('\n')
        && !name.includes('\t')
        && name.trim() === name
        && !reserved.includes(name.toLowerCase());
}

/**
 * 判断是否看起来像记忆ID
 * 记忆ID特征：6位36进制字符串，只包含数字和小写字母
 * @param str 要判断的字符串
 * @returns 是否像记忆ID
 */
export function looksLikeMemoryId(str: string): boolean {
    // 记忆ID是6位的36进制字符串
    if (str.length !== 6) {
        return false;
    }
    // 36进制只包含 0-9 和 a-z
    return /^[0-9a-z]{6}$/.test(str);
}

/**
 * 判断删除操作的意图：删除自设还是删除记忆
 * @param args 参数列表（从第4个参数开始）
 * @param kwargs 关键词参数列表
 * @param personaMap 自设映射表
 * @returns 'persona' 表示删除自设，'memory' 表示删除记忆
 */
export function detectDeleteIntent(
    args: string[],
    kwargs: { name: string, value: string }[],
    personaMap: { [name: string]: string }
): 'persona' | 'memory' {
    // 如果有关键词参数（--xxx），肯定是删除记忆
    if (kwargs.length > 0) {
        return 'memory';
    }

    // 如果没有参数，无法判断（会在后续处理中报错）
    if (args.length === 0) {
        return 'memory'; // 默认返回memory，让原有错误提示生效
    }

    // 检查所有参数
    let memoryIdCount = 0;
    let personaNameCount = 0;

    for (const arg of args) {
        // 如果在自设列表中存在，认为是自设名称
        if (personaMap.hasOwnProperty(arg)) {
            personaNameCount++;
        }
        // 如果看起来像记忆ID，认为是记忆ID
        else if (looksLikeMemoryId(arg)) {
            memoryIdCount++;
        }
        // 其他情况，如果不是6位字符，更可能是自设名称
        else if (arg.length !== 6) {
            personaNameCount++;
        }
    }

    // 如果有任何一个是自设名称，且没有明显的记忆ID，认为是删除自设
    if (personaNameCount > 0 && memoryIdCount === 0) {
        return 'persona';
    }

    // 如果有记忆ID特征，认为是删除记忆
    if (memoryIdCount > 0) {
        return 'memory';
    }

    // 默认情况：参数都是6位字符
    // 优先检查是否在自设列表中
    for (const arg of args) {
        if (personaMap.hasOwnProperty(arg)) {
            return 'persona';
        }
    }

    // 都不匹配时，默认为删除记忆
    return 'memory';
}
