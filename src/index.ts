import { AIManager } from "./AI/AI";
import { ArchiveManager } from "./AI/archive";
import { ImageManager } from "./AI/image";
import { ToolManager } from "./tool/tool";
import { ConfigManager, CQTYPESALLOW } from "./config/config";
import { SoupConfig } from "./config/config_soup";
import { buildSystemMessage } from "./utils/utils_message";
import { triggerConditionMap } from "./tool/tool_trigger";
import { logger } from "./logger";
import { transformTextToArray } from "./utils/utils_string";
import { checkUpdate } from "./utils/utils_update";
import { get_chart_url } from "./service";
import { TimerManager, TimeParser } from "./timer";
import { parsePersonaCommand, isValidPersonaName, detectDeleteIntent } from "./utils/utils_persona";

function main() {
  ConfigManager.registerConfig();
  checkUpdate();
  AIManager.getUsageMap();
  ToolManager.registerTool();
  TimerManager.init();

  const ext = ConfigManager.ext;

  const cmdAI = seal.ext.newCmdItemInfo();
  cmdAI.name = 'ai'; // 指令名字，可用中文
  cmdAI.help = `帮助:
【.ai st】修改权限(仅骰主可用)
【.ai ck】检查权限(仅骰主可用)
【.ai prompt】检查当前prompt(仅骰主可用)
【.ai status】查看当前AI状态
【.ai ctxn】查看上下文里的名字
【.ai on】开启AI
【.ai sb】开启待机模式，此时AI将记忆聊天内容
【.ai off】关闭AI，此时仍能用关键词触发
【.ai fgt】遗忘上下文
【.ai role】选择角色设定
【.ai memo】AI的记忆相关
【.ai tool】AI的工具相关
【.ai ign】AI的忽略名单相关
【.ai tk】AI的token相关
【.ai arc】AI的存档相关
【.ai undo】撤销并重新生成AI回复
【.ai timer】定时器管理
【.ai shut】终止AI当前流式输出
【.ai soup】海龟汤游戏`;
  cmdAI.allowDelegate = true;
  cmdAI.solve = (ctx, msg, cmdArgs) => {
    try {
      const val = cmdArgs.getArgN(1);
      const uid = ctx.player.userId;
      const gid = ctx.group.groupId;
      const id = ctx.isPrivate ? uid : gid;

      const ret = seal.ext.newCmdExecuteResult(true);
      const ai = AIManager.getAI(id);

      switch (val) {
        case 'st': {
          if (ctx.privilegeLevel < 100) {
            seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
            return ret;
          }

          const val2 = cmdArgs.getArgN(2);
          if (!val2 || val2 == 'help') {
            seal.replyToSender(ctx, msg, `帮助:
【.ai st <ID> <权限限制>】

<ID>:
【QQ:1234567890】 私聊窗口
【QQ-Group:1234】 群聊窗口
【now】当前窗口

<权限限制>:
【0】普通用户
【40】邀请者
【50】群管理员
【60】群主
【100】骰主
不填写时默认为100`);
            return ret;
          }

          const limit = parseInt(cmdArgs.getArgN(3));
          if (isNaN(limit)) {
            seal.replyToSender(ctx, msg, '权限值必须为数字');
            return ret;
          }

          const id2 = val2 === 'now' ? id : val2;
          const ai2 = AIManager.getAI(id2);

          ai2.privilege.limit = limit;

          seal.replyToSender(ctx, msg, '权限修改完成');
          AIManager.saveAI(id2);
          return ret;
        }
        case 'ck': {
          if (ctx.privilegeLevel < 100) {
            seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
            return ret;
          }

          const val2 = cmdArgs.getArgN(2);
          if (!val2 || val2 == 'help') {
            seal.replyToSender(ctx, msg, `帮助:
【.ai ck <ID>】

<ID>:
【QQ:1234567890】 私聊窗口
【QQ-Group:1234】 群聊窗口
【now】当前窗口`);
            return ret;
          }

          const id2 = val2 === 'now' ? id : val2;
          const ai2 = AIManager.getAI(id2);

          const pr = ai2.privilege;

          const counter = pr.counter > -1 ? `${pr.counter}条` : '关闭';
          const timer = pr.timer > -1 ? `${pr.timer}秒` : '关闭';
          const prob = pr.prob > -1 ? `${pr.prob}%` : '关闭';
          const standby = pr.standby ? '开启' : '关闭';
          const s = `${id2}\n权限限制:${pr.limit}\n计数器模式(c):${counter}\n计时器模式(t):${timer}\n概率模式(p):${prob}\n待机模式:${standby}`;
          seal.replyToSender(ctx, msg, s);
          return ret;
        }
        case 'prompt': {
          if (ctx.privilegeLevel < 100) {
            seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
            return ret;
          }

          const systemMessage = buildSystemMessage(ctx, ai);

          seal.replyToSender(ctx, msg, systemMessage.contentArray[0]);
          return ret;
        }
        case 'status': {
          const pr = ai.privilege;
          if (ctx.privilegeLevel < pr.limit) {
            seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
            return ret;
          }

          seal.replyToSender(ctx, msg, `${id}
权限限制: ${pr.limit}
上下文轮数: ${ai.context.messages.filter(m => m.role === 'user').length}
计数器模式(c): ${pr.counter > -1 ? `${pr.counter}条` : '关闭'}
计时器模式(t): ${pr.timer > -1 ? `${pr.timer}秒` : '关闭'}
概率模式(p): ${pr.prob > -1 ? `${pr.prob}%` : '关闭'}
待机模式: ${pr.standby ? '开启' : '关闭'}`);
          return ret;
        }
        case 'ctxn': {
          const pr = ai.privilege;
          if (ctx.privilegeLevel < pr.limit) {
            seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
            return ret;
          }

          const names = ai.context.getNames();
          const s = `上下文里的名字有：\n<${names.join('>\n<')}>`;
          seal.replyToSender(ctx, msg, s);
          return ret;
        }
        case 'on': {
          const pr = ai.privilege;
          if (ctx.privilegeLevel < pr.limit) {
            seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
            return ret;
          }

          const kwargs = cmdArgs.kwargs;
          if (kwargs.length == 0) {
            seal.replyToSender(ctx, msg, `帮助:
【.ai on --<参数>=<数字>】

<参数>:
【c】计数器模式，接收消息数达到后触发
单位/条，默认10条
【t】计时器模式，最后一条消息后达到时限触发
单位/秒，默认60秒
【p】概率模式，每条消息按概率触发
单位/%，默认10%

【.ai on --t --p=42】使用示例`);
            return ret;
          }

          let text = `AI已开启：`;
          kwargs.forEach(kwarg => {
            const name = kwarg.name;
            const exist = kwarg.valueExists;
            const value = parseFloat(kwarg.value);

            switch (name) {
              case 'c':
              case 'counter': {
                pr.counter = exist && !isNaN(value) ? value : 10;
                text += `\n计数器模式:${pr.counter}条`;
                break;
              }
              case 't':
              case 'timer': {
                pr.timer = exist && !isNaN(value) ? value : 60;
                text += `\n计时器模式:${pr.timer}秒`;
                break;
              }
              case 'p':
              case 'prob': {
                pr.prob = exist && !isNaN(value) ? value : 10;
                text += `\n概率模式:${pr.prob}%`;
                break;
              }
            }
          });

          pr.standby = true;

          seal.replyToSender(ctx, msg, text);
          AIManager.saveAI(id);
          return ret;
        }
        case 'sb': {
          const pr = ai.privilege;
          if (ctx.privilegeLevel < pr.limit) {
            seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
            return ret;
          }

          pr.counter = -1;
          pr.timer = -1;
          pr.prob = -1;
          pr.standby = true;

          ai.resetState();

          seal.replyToSender(ctx, msg, 'AI已开启待机模式');
          AIManager.saveAI(id);
          return ret;
        }
        case 'off': {
          const pr = ai.privilege;
          if (ctx.privilegeLevel < pr.limit) {
            seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
            return ret;
          }

          const kwargs = cmdArgs.kwargs;
          if (kwargs.length == 0) {
            pr.counter = -1;
            pr.timer = -1;
            pr.prob = -1;
            pr.standby = false;

            ai.resetState();

            seal.replyToSender(ctx, msg, 'AI已关闭');
            AIManager.saveAI(id);
            return ret;
          }

          let text = `AI已关闭：`;
          kwargs.forEach(kwarg => {
            const name = kwarg.name;

            switch (name) {
              case 'c':
              case 'counter': {
                pr.counter = -1;
                text += `\n计数器模式`;
                break;
              }
              case 't':
              case 'timer': {
                pr.timer = -1;
                text += `\n计时器模式`;
                break;
              }
              case 'p':
              case 'prob': {
                pr.prob = -1;
                text += `\n概率模式`;
                break;
              }
            }
          });

          ai.resetState();

          seal.replyToSender(ctx, msg, text);
          AIManager.saveAI(id);
          return ret;
        }
        case 'f':
        case 'fgt': {
          const pr = ai.privilege;
          if (ctx.privilegeLevel < pr.limit) {
            seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
            return ret;
          }

          ai.resetState();

          const val2 = cmdArgs.getArgN(2);
          switch (val2) {
            case 'ass':
            case 'assistant': {
              ai.context.clearMessages('assistant', 'tool');
              seal.replyToSender(ctx, msg, 'ai上下文已清除');
              AIManager.saveAI(id);
              return ret;
            }
            case 'user': {
              ai.context.clearMessages('user');
              seal.replyToSender(ctx, msg, '用户上下文已清除');
              AIManager.saveAI(id);
              return ret;
            }
            default: {
              ai.context.clearMessages();
              ai.context.clearSnapshots();
              const { autoStart } = ConfigManager.archive;
              if (autoStart && ai.archiveManager) {
                try {
                  const result = ai.archiveManager.startWorking();
                  seal.replyToSender(ctx, msg, `上下文和快照已清除\n${result}`);
                } catch (e) {
                  logger.error(`自动开启存档失败: ${e.message}`);
                  seal.replyToSender(ctx, msg, '上下文和快照已清除');
                }
              } else {
                seal.replyToSender(ctx, msg, '上下文和快照已清除');
              }

              AIManager.saveAI(id);
              return ret;
            }
          }
        }
        case 'role': {
          const pr = ai.privilege;
          if (ctx.privilegeLevel < pr.limit) {
            seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
            return ret;
          }

          const { roleSettingTemplate } = ConfigManager.message;

          const val2 = cmdArgs.getArgN(2);
          switch (val2) {
            case 'show': {
              const [roleSettingIndex, _] = seal.vars.intGet(ctx, "$gSYSPROMPT");
              seal.replyToSender(ctx, msg, `当前角色设定序号为${roleSettingIndex}，序号范围为0-${roleSettingTemplate.length - 1}`);
              return ret;
            }
            case '':
            case 'help': {
              seal.replyToSender(ctx, msg, `帮助:
【.ai role show】查看当前角色设定序号
【.ai role <序号>】切换角色设定，序号范围为0-${roleSettingTemplate.length - 1}`);
              return ret;
            }
            default: {
              const index = parseInt(val2);
              if (isNaN(index) || index < 0 || index >= roleSettingTemplate.length) {
                seal.replyToSender(ctx, msg, `角色设定序号错误，序号范围为0-${roleSettingTemplate.length - 1}`);
                return ret;
              }

              seal.vars.intSet(ctx, "$gSYSPROMPT", index);
              seal.replyToSender(ctx, msg, `角色设定已切换到${index}`);
              return ret;
            }
          }
        }
        case 'memo': {
          const mctx = seal.getCtxProxyFirst(ctx, cmdArgs);
          const muid = mctx.player.userId;

          if (ctx.privilegeLevel < 100 && muid !== uid) {
            seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
            return ret;
          }

          const ai2 = AIManager.getAI(muid);
          const val2 = cmdArgs.getArgN(2);
          switch (val2) {
            case 'status': {
              let ai3 = ai;
              if (cmdArgs.at.length > 0 && (cmdArgs.at.length !== 1 || cmdArgs.at[0].userId !== ctx.endPoint.userId)) {
                ai3 = ai2;
              }

              const { isMemory, isShortMemory } = ConfigManager.memory;

              const keywords = new Set<string>();
              for (const key in ai3.memory.memoryMap) {
                ai3.memory.memoryMap[key].keywords.forEach(kw => keywords.add(kw));
              }

              seal.replyToSender(ctx, msg, `${ai3.id}
长期记忆开启状态: ${isMemory ? '是' : '否'}
长期记忆条数: ${Object.keys(ai3.memory.memoryMap).length}
关键词库: ${Array.from(keywords).join('、') || '无'}
短期记忆开启状态: ${(isShortMemory && ai3.memory.useShortMemory) ? '是' : '否'}
短期记忆条数: ${ai3.memory.shortMemoryList.length}`);
              return ret;
            }
            case 'p':
            case 'private': {
              const val3 = cmdArgs.getArgN(3);
              switch (val3) {
                case 'st': {
                  const s = cmdArgs.getRestArgsFrom(4);

                  if (s === '') {
                    seal.replyToSender(ctx, msg,
                      '参数缺失，请使用:\n' +
                      '【.ai memo p st <内容>】直接设置当前自设\n' +
                      '【.ai memo p st <名称> <内容>】创建/更新命名自设\n' +
                      '【.ai memo p st clr】清除所有自设');
                    return ret;
                  }

                  const parsed = parsePersonaCommand(s);

                  if (parsed.mode === 'clear') {
                    if (muid !== uid) {
                      seal.replyToSender(ctx, msg, '只能清除自己的个人设定');
                      return ret;
                    }
                    ai2.memory.clearAllPersonas();
                    seal.replyToSender(ctx, msg, '所有自设已清除');
                    AIManager.saveAI(muid);
                    return ret;
                  }

                  if (parsed.mode === 'direct') {
                    if (parsed.content.length > 65536) {
                      seal.replyToSender(ctx, msg, '设定过长，请控制在65536字以内');
                      return ret;
                    }
                    ai2.memory.setCurrentPersona(parsed.content);
                    seal.replyToSender(ctx, msg,
                      `当前自设"${ai2.memory.currentPersona}"已更新\n` +
                      `共 ${Object.keys(ai2.memory.personaMap).length} 个自设`);
                    AIManager.saveAI(muid);
                    return ret;
                  }

                  if (parsed.mode === 'named') {
                    if (parsed.content.length > 65536) {
                      seal.replyToSender(ctx, msg, '设定过长，请控制在65536字以内');
                      return ret;
                    }
                    const isNew = !ai2.memory.personaMap.hasOwnProperty(parsed.name);
                    ai2.memory.setNamedPersona(parsed.name, parsed.content);
                    seal.replyToSender(ctx, msg,
                      `自设"${parsed.name}"已${isNew ? '创建' : '更新'}并切换\n` +
                      `共 ${Object.keys(ai2.memory.personaMap).length} 个自设`);
                    AIManager.saveAI(muid);
                    return ret;
                  }

                  return ret;
                }

                case 'switch': {
                  if (muid !== uid) {
                    seal.replyToSender(ctx, msg, '只能切换自己的自设');
                    return ret;
                  }

                  const name = cmdArgs.getRestArgsFrom(4);
                  if (!name) {
                    seal.replyToSender(ctx, msg, '参数缺失，【.ai memo p switch <名称>】切换自设');
                    return ret;
                  }

                  if (ai2.memory.switchPersona(name)) {
                    seal.replyToSender(ctx, msg, `已切换到自设"${name}"`);
                    AIManager.saveAI(muid);
                  } else {
                    seal.replyToSender(ctx, msg, `自设"${name}"不存在\n使用【.ai memo p list】查看所有自设`);
                  }
                  return ret;
                }

                case 'lst':
                case 'list': {
                  if (muid !== uid) {
                    seal.replyToSender(ctx, msg, '只能查看自己的自设列表');
                    return ret;
                  }

                  const { current, list } = ai2.memory.listPersonas();
                  if (list.length === 0) {
                    seal.replyToSender(ctx, msg, '暂无自设');
                  } else {
                    const listStr = list.map(name =>
                      name === current ? `[x] ${name}` : `[ ] ${name}`
                    ).join('\n');
                    seal.replyToSender(ctx, msg, `自设列表 (共${list.length}个):\n${listStr}`);
                  }
                  return ret;
                }

                case 'rename': {
                  if (muid !== uid) {
                    seal.replyToSender(ctx, msg, '只能重命名自己的自设');
                    return ret;
                  }

                  const oldName = cmdArgs.getArgN(4);
                  const newName = cmdArgs.getArgN(5);

                  if (!oldName || !newName) {
                    seal.replyToSender(ctx, msg, '参数缺失，【.ai memo p rename <旧名称> <新名称>】重命名自设');
                    return ret;
                  }

                  if (!isValidPersonaName(newName)) {
                    seal.replyToSender(ctx, msg, '新名称不合法，请使用1-20字符，不含换行制表符，且非保留词');
                    return ret;
                  }

                  if (ai2.memory.renamePersona(oldName, newName)) {
                    seal.replyToSender(ctx, msg, `自设"${oldName}"已重命名为"${newName}"`);
                    AIManager.saveAI(muid);
                  } else {
                    if (!ai2.memory.personaMap.hasOwnProperty(oldName)) {
                      seal.replyToSender(ctx, msg, `自设"${oldName}"不存在`);
                    } else {
                      seal.replyToSender(ctx, msg, `自设"${newName}"已存在，无法重命名`);
                    }
                  }
                  return ret;
                }

                case 'del': {
                  if (muid !== uid) {
                    seal.replyToSender(ctx, msg, '只能删除自己的个人记忆/自设');
                    return ret;
                  }

                  const args = cmdArgs.args.slice(3);
                  const kw = cmdArgs.kwargs.map(item => item.name);

                  if (args.length === 0 && kw.length === 0) {
                    seal.replyToSender(ctx, msg, '参数缺失\n【.ai memo p del <名称1> <名称2>...】删除自设\n【.ai memo p del <ID1> <ID2> --关键词1】删除记忆');
                    return ret;
                  }

                  // 意图识别
                  const intent = detectDeleteIntent(args, cmdArgs.kwargs, ai2.memory.personaMap);

                  if (intent === 'persona') {
                    // 删除自设
                    const result = ai2.memory.deletePersona(args);
                    let replyMsg = '';
                    if (result.success.length > 0) {
                      replyMsg += `已删除自设: ${result.success.join('、')}\n`;
                    }
                    if (result.failed.length > 0) {
                      replyMsg += `失败: ${result.failed.join('、')}`;
                    }
                    seal.replyToSender(ctx, msg, replyMsg.trim());
                    AIManager.saveAI(muid);
                  } else {
                    // 删除记忆
                    ai2.memory.delMemory(args, kw);
                    const s = ai2.memory.buildMemory(true, mctx.player.name, mctx.player.userId, '', '');
                    seal.replyToSender(ctx, msg, s || '无');
                    AIManager.saveAI(muid);
                  }
                  return ret;
                }
                case 'show': {
                  if (muid !== uid) {
                    seal.replyToSender(ctx, msg, '只能查看自己的个人设定');
                    return ret;
                  }

                  const current = ai2.memory.getCurrentPersona();
                  const name = ai2.memory.currentPersona || '无';
                  const count = Object.keys(ai2.memory.personaMap).length;

                  let replyMsg = `当前自设: ${name}\n`;
                  if (count > 0) {
                    replyMsg += `总计: ${count} 个自设\n`;
                  }
                  replyMsg += `内容:\n${current}`;

                  seal.replyToSender(ctx, msg, replyMsg);
                  return ret;
                }
                case 'clr': {
                  ai2.memory.clearMemory();
                  seal.replyToSender(ctx, msg, '个人记忆已清除');
                  AIManager.saveAI(muid);
                  return ret;
                }
                default: {
                  seal.replyToSender(ctx, msg,
                    '个人记忆指令:\n' +
                    '【.ai memo p st】设置自设\n' +
                    '【.ai memo p switch】切换自设\n' +
                    '【.ai memo p lst】列出自设\n' +
                    '【.ai memo p rename】重命名自设\n' +
                    '【.ai memo p show】查看当前自设\n' +
                    '【.ai memo p del】删除记忆/自设\n' +
                    '【.ai memo p clr】清除记忆');
                  return ret;
                }
              }
            }
            case 'g':
            case 'group': {
              if (ctx.isPrivate) {
                seal.replyToSender(ctx, msg, '群聊记忆仅在群聊可用');
                return ret;
              }
              const pr = ai.privilege;
              if (ctx.privilegeLevel < pr.limit) {
                seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
                return ret;
              }
              const val3 = cmdArgs.getArgN(3);
              switch (val3) {
                case 'st': {
                  const s = cmdArgs.getRestArgsFrom(4);

                  if (s === '') {
                    seal.replyToSender(ctx, msg,
                      '参数缺失，请使用:\n' +
                      '【.ai memo g st <内容>】直接设置当前自设\n' +
                      '【.ai memo g st <名称> <内容>】创建/更新命名自设\n' +
                      '【.ai memo g st clr】清除所有自设');
                    return ret;
                  }

                  const parsed = parsePersonaCommand(s);

                  if (parsed.mode === 'clear') {
                    ai.memory.clearAllPersonas();
                    seal.replyToSender(ctx, msg, '所有自设已清除');
                    AIManager.saveAI(id);
                    return ret;
                  }

                  if (parsed.mode === 'direct') {
                    if (parsed.content.length > 65536) {
                      seal.replyToSender(ctx, msg, '设定过长，请控制在65536字以内');
                      return ret;
                    }
                    ai.memory.setCurrentPersona(parsed.content);
                    seal.replyToSender(ctx, msg,
                      `当前自设"${ai.memory.currentPersona}"已更新\n` +
                      `共 ${Object.keys(ai.memory.personaMap).length} 个自设`);
                    AIManager.saveAI(id);
                    return ret;
                  }

                  if (parsed.mode === 'named') {
                    if (parsed.content.length > 65536) {
                      seal.replyToSender(ctx, msg, '设定过长，请控制在65536字以内');
                      return ret;
                    }
                    const isNew = !ai.memory.personaMap.hasOwnProperty(parsed.name);
                    ai.memory.setNamedPersona(parsed.name, parsed.content);
                    seal.replyToSender(ctx, msg,
                      `自设"${parsed.name}"已${isNew ? '创建' : '更新'}并切换\n` +
                      `共 ${Object.keys(ai.memory.personaMap).length} 个自设`);
                    AIManager.saveAI(id);
                    return ret;
                  }

                  return ret;
                }

                case 'switch': {
                  const name = cmdArgs.getRestArgsFrom(4);
                  if (!name) {
                    seal.replyToSender(ctx, msg, '参数缺失，【.ai memo g switch <名称>】切换自设');
                    return ret;
                  }

                  if (ai.memory.switchPersona(name)) {
                    seal.replyToSender(ctx, msg, `已切换到自设"${name}"`);
                    AIManager.saveAI(id);
                  } else {
                    seal.replyToSender(ctx, msg, `自设"${name}"不存在\n使用【.ai memo g list】查看所有自设`);
                  }
                  return ret;
                }

                case 'lst':
                case 'list': {
                  const { current, list } = ai.memory.listPersonas();
                  if (list.length === 0) {
                    seal.replyToSender(ctx, msg, '暂无自设');
                  } else {
                    const listStr = list.map(name =>
                      name === current ? `[x] ${name}` : `[ ] ${name}`
                    ).join('\n');
                    seal.replyToSender(ctx, msg, `自设列表 (共${list.length}个):\n${listStr}`);
                  }
                  return ret;
                }

                case 'rename': {
                  const oldName = cmdArgs.getArgN(4);
                  const newName = cmdArgs.getArgN(5);

                  if (!oldName || !newName) {
                    seal.replyToSender(ctx, msg, '参数缺失，【.ai memo g rename <旧名称> <新名称>】重命名自设');
                    return ret;
                  }

                  if (!isValidPersonaName(newName)) {
                    seal.replyToSender(ctx, msg, '新名称不合法，请使用1-20字符，不含换行制表符，且非保留词');
                    return ret;
                  }

                  if (ai.memory.renamePersona(oldName, newName)) {
                    seal.replyToSender(ctx, msg, `自设"${oldName}"已重命名为"${newName}"`);
                    AIManager.saveAI(id);
                  } else {
                    if (!ai.memory.personaMap.hasOwnProperty(oldName)) {
                      seal.replyToSender(ctx, msg, `自设"${oldName}"不存在`);
                    } else {
                      seal.replyToSender(ctx, msg, `自设"${newName}"已存在，无法重命名`);
                    }
                  }
                  return ret;
                }

                case 'del': {
                  const args = cmdArgs.args.slice(3);  // .ai memo g del 海棠 => args=['memo','g','del','海棠'], slice(3)=['海棠']
                  const kw = cmdArgs.kwargs.map(item => item.name);

                  if (args.length === 0 && kw.length === 0) {
                    seal.replyToSender(ctx, msg, '参数缺失\n【.ai memo g del <名称1> <名称2>...】删除自设\n【.ai memo g del <ID1> <ID2> --关键词1】删除记忆');
                    return ret;
                  }

                  // 意图识别
                  const intent = detectDeleteIntent(args, cmdArgs.kwargs, ai.memory.personaMap);

                  if (intent === 'persona') {
                    // 删除自设
                    const result = ai.memory.deletePersona(args);
                    let replyMsg = '';
                    if (result.success.length > 0) {
                      replyMsg += `已删除自设: ${result.success.join('、')}\n`;
                    }
                    if (result.failed.length > 0) {
                      replyMsg += `失败: ${result.failed.join('、')}`;
                    }
                    seal.replyToSender(ctx, msg, replyMsg.trim());
                    AIManager.saveAI(id);
                  } else {
                    // 删除记忆
                    ai.memory.delMemory(args, kw);
                    const s = ai.memory.buildMemory(false, '', '', ctx.group.groupName, ctx.group.groupId);
                    seal.replyToSender(ctx, msg, s || '无');
                    AIManager.saveAI(id);
                  }
                  return ret;
                }
                case 'show': {
                  const current = ai.memory.getCurrentPersona();
                  const name = ai.memory.currentPersona || '无';
                  const count = Object.keys(ai.memory.personaMap).length;

                  let replyMsg = `当前自设: ${name}\n`;
                  if (count > 0) {
                    replyMsg += `总计: ${count} 个自设\n`;
                  }
                  replyMsg += `内容:\n${current}`;

                  seal.replyToSender(ctx, msg, replyMsg);
                  return ret;
                }
                case 'clr': {
                  ai.memory.clearMemory();
                  seal.replyToSender(ctx, msg, '群聊记忆已清除');
                  AIManager.saveAI(id);
                  return ret;
                }
                default: {
                  seal.replyToSender(ctx, msg,
                    '群聊记忆指令:\n' +
                    '【.ai memo g st】设置自设\n' +
                    '【.ai memo g switch】切换自设\n' +
                    '【.ai memo g lst】列出自设\n' +
                    '【.ai memo g rename】重命名自设\n' +
                    '【.ai memo g show】查看当前自设\n' +
                    '【.ai memo g del】删除记忆/自设\n' +
                    '【.ai memo g clr】清除记忆');
                  return ret;
                }
              }
            }
            case 's':
            case 'short': {
              const val3 = cmdArgs.getArgN(3);
              switch (val3) {
                case 'on': {
                  ai.memory.useShortMemory = true;
                  seal.replyToSender(ctx, msg, '短期记忆已开启');
                  AIManager.saveAI(id);
                  return ret;
                }
                case 'off': {
                  ai.memory.useShortMemory = false;
                  seal.replyToSender(ctx, msg, '短期记忆已关闭');
                  AIManager.saveAI(id);
                  return ret;
                }
                case 'show': {
                  const s = ai.memory.shortMemoryList.map((item, index) => `${index + 1}. ${item}`).join('\n');
                  seal.replyToSender(ctx, msg, s || '无');
                  return ret;
                }
                case 'clr': {
                  ai.memory.clearShortMemory();
                  seal.replyToSender(ctx, msg, '短期记忆已清除');
                  AIManager.saveAI(id);
                  return ret;
                }
                default: {
                  seal.replyToSender(ctx, msg, '参数缺失，【.ai memo s show】展示短期记忆，【.ai memo s clr】清除短期记忆');
                  return ret;
                }
              }
            }
            case 'sum': {
              const { shortMemorySummaryRound } = ConfigManager.memory;
              ai.context.summaryCounter = 0;
              ai.memory.updateShortMemory(ctx, msg, ai, ai.context.messages.slice(0, shortMemorySummaryRound))
                .then(() => {
                  const s = ai.memory.shortMemoryList.map((item, index) => `${index + 1}. ${item}`).join('\n');
                  seal.replyToSender(ctx, msg, s || '无');
                });
              return ret;
            }
            default: {
              seal.replyToSender(ctx, msg, `帮助:
【.ai memo status (@xxx)】查看记忆状态，@为查看个人记忆状态
【.ai memo [p/g] st <内容>】直接设置当前自设
【.ai memo [p/g] st <名称> <内容>】创建/更新命名自设
【.ai memo [p/g] st clr】清除所有自设
【.ai memo [p/g] switch <名称>】切换自设
【.ai memo [p/g] lst】列出所有自设
【.ai memo [p/g] rename <旧名> <新名>】重命名自设
【.ai memo [p/g] del <名称>...】删除自设
【.ai memo [p/g] del <ID> --关键词】删除记忆
【.ai memo [p/g/s] show】展示自设/记忆内容
【.ai memo [p/g/s] clr】清除记忆
【.ai memo s [on/off]】开启/关闭短期记忆
【.ai memo sum】立即总结一次短期记忆`);
              return ret;
            }
          }
        }
        case 'tool': {
          const val2 = cmdArgs.getArgN(2);
          switch (val2) {
            case '': {
              const toolStatus = ai.tool.toolStatus;

              let i = 1;
              let s = '工具函数如下:';
              Object.keys(toolStatus).forEach(key => {
                const status = toolStatus[key] ? '开' : '关';
                s += `\n${i++}. ${key}[${status}]`;
              });

              seal.replyToSender(ctx, msg, s);
              return ret;
            }
            case 'help': {
              const val3 = cmdArgs.getArgN(3);
              if (!val3) {
                seal.replyToSender(ctx, msg, `帮助:
【.ai tool】列出所有工具
【.ai tool help <函数名>】查看工具详情
【.ai tool [on/off]】开启或关闭全部工具函数
【.ai tool <函数名> [on/off]】开启或关闭工具函数
【.ai tool <函数名> --参数名=具体参数】试用工具函数`);
                return ret;
              }

              if (!ToolManager.toolMap.hasOwnProperty(val3)) {
                seal.replyToSender(ctx, msg, '没有这个工具函数');
                return ret;
              }

              const tool = ToolManager.toolMap[val3];
              const s = `${tool.info.function.name}
描述:${tool.info.function.description}

参数:
${Object.keys(tool.info.function.parameters.properties).map(key => {
                const property = tool.info.function.parameters.properties[key];
                return `【${key}】${property.description}`;
              }).join('\n')}

必需参数:${tool.info.function.parameters.required.join(',')}`;

              seal.replyToSender(ctx, msg, s);
              return ret;
            }
            case 'on': {
              const toolsNotAllow = ConfigManager.tool.toolsNotAllow;
              for (const key in ai.tool.toolStatus) {
                ai.tool.toolStatus[key] = toolsNotAllow.includes(key) ? false : true;
              }
              seal.replyToSender(ctx, msg, '已开启全部工具函数');
              AIManager.saveAI(id);
              return ret;
            }
            case 'off': {
              for (const key in ai.tool.toolStatus) {
                ai.tool.toolStatus[key] = false;
              }
              seal.replyToSender(ctx, msg, '已关闭全部工具函数');
              AIManager.saveAI(id);
              return ret;
            }
            default: {
              if (!ToolManager.toolMap.hasOwnProperty(val2)) {
                seal.replyToSender(ctx, msg, '没有这个工具函数');
                return ret;
              }

              // 开启或关闭工具函数
              const val3 = cmdArgs.getArgN(3);
              if (val3 === 'on') {
                const toolsNotAllow = ConfigManager.tool.toolsNotAllow;
                if (toolsNotAllow.includes(val2)) {
                  seal.replyToSender(ctx, msg, `工具函数 ${val2} 不被允许开启`);
                  return ret;
                }

                ai.tool.toolStatus[val2] = true;
                seal.replyToSender(ctx, msg, `已开启工具函数 ${val2}`);
                AIManager.saveAI(id);
                return ret;
              } else if (val3 === 'off') {
                ai.tool.toolStatus[val2] = false;
                seal.replyToSender(ctx, msg, `已关闭工具函数 ${val2}`);
                AIManager.saveAI(id);
                return ret;
              }

              // 调用工具函数
              if (ctx.privilegeLevel < 100) {
                seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
                return ret;
              }

              if (ToolManager.cmdArgs == null) {
                seal.replyToSender(ctx, msg, `暂时无法调用函数，请先使用 .r 指令`);
                return ret;
              }

              const tool = ToolManager.toolMap[val2];

              try {
                const args = cmdArgs.kwargs.reduce((acc, kwarg) => {
                  const valueString = kwarg.value;
                  try {
                    acc[kwarg.name] = JSON.parse(`[${valueString}]`)[0];
                  } catch (e) {
                    acc[kwarg.name] = valueString;
                  }
                  return acc;
                }, {});

                for (const key of tool.info.function.parameters.required) {
                  if (!args.hasOwnProperty(key)) {
                    logger.warning(`调用函数失败:缺少必需参数 ${key}`);
                    seal.replyToSender(ctx, msg, `调用函数失败:缺少必需参数 ${key}`);
                    return ret;
                  }
                }

                tool.solve(ctx, msg, ai, args)
                  .then(s => seal.replyToSender(ctx, msg, s));
                return ret;
              } catch (e) {
                const s = `调用函数 (${val2}) 失败:${e.message}`;
                seal.replyToSender(ctx, msg, s);
                return ret;
              }
            }
          }
        }
        case 'ign': {
          if (ctx.isPrivate) {
            seal.replyToSender(ctx, msg, '忽略名单仅在群聊可用');
            return ret;
          }

          const pr = ai.privilege;
          if (ctx.privilegeLevel < pr.limit) {
            seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
            return ret;
          }

          const epId = ctx.endPoint.userId;
          const mctx = seal.getCtxProxyFirst(ctx, cmdArgs);
          const muid = cmdArgs.amIBeMentionedFirst ? epId : mctx.player.userId;

          const val2 = cmdArgs.getArgN(2);
          switch (val2) {
            case 'add': {
              if (cmdArgs.at.length === 0) {
                seal.replyToSender(ctx, msg, '参数缺失，【.ai ign add @xxx】添加忽略名单');
                return ret;
              }
              if (ai.context.ignoreList.includes(muid)) {
                seal.replyToSender(ctx, msg, '已经在忽略名单中');
                return ret;
              }
              ai.context.ignoreList.push(muid);
              seal.replyToSender(ctx, msg, '已添加到忽略名单');
              AIManager.saveAI(id);
              return ret;
            }
            case 'rm': {
              if (cmdArgs.at.length === 0) {
                seal.replyToSender(ctx, msg, '参数缺失，【.ai ign rm @xxx】移除忽略名单');
                return ret;
              }
              if (!ai.context.ignoreList.includes(muid)) {
                seal.replyToSender(ctx, msg, '不在忽略名单中');
                return ret;
              }
              ai.context.ignoreList = ai.context.ignoreList.filter(item => item !== muid);
              seal.replyToSender(ctx, msg, '已从忽略名单中移除');
              AIManager.saveAI(id);
              return ret;
            }
            case 'list': {
              const s = ai.context.ignoreList.length === 0 ? '忽略名单为空' : `忽略名单如下:\n${ai.context.ignoreList.join('\n')}`;
              seal.replyToSender(ctx, msg, s);
              return ret;
            }
            default: {
              seal.replyToSender(ctx, msg, `帮助:
【.ai ign add @xxx】添加忽略名单
【.ai ign rm @xxx】移除忽略名单
【.ai ign list】列出忽略名单

忽略名单中的对象仍能正常对话，但无法被选中QQ号`);
              return ret;
            }
          }
        }
        case 'tk': {
          if (ctx.privilegeLevel < 100) {
            seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
            return ret;
          }

          const val2 = cmdArgs.getArgN(2);
          switch (val2) {
            case 'lst': {
              const s = Object.keys(AIManager.usageMap).join('\n');
              seal.replyToSender(ctx, msg, `有使用记录的模型:\n${s}`);
              return ret;
            }
            case 'sum': {
              const usage = {
                prompt_tokens: 0,
                completion_tokens: 0
              };

              for (const model in AIManager.usageMap) {
                const modelUsage = AIManager.getModelUsage(model);
                usage.prompt_tokens += modelUsage.prompt_tokens;
                usage.completion_tokens += modelUsage.completion_tokens;
              }

              if (usage.prompt_tokens === 0 && usage.completion_tokens === 0) {
                seal.replyToSender(ctx, msg, `没有使用记录`);
                return ret;
              }

              const s = `输入token:${usage.prompt_tokens}
输出token:${usage.completion_tokens}
总token:${usage.prompt_tokens + usage.completion_tokens}`;
              seal.replyToSender(ctx, msg, s);
              return ret;
            }
            case 'all': {
              const s = Object.keys(AIManager.usageMap).map((model, index) => {
                const usage = AIManager.getModelUsage(model);

                if (usage.prompt_tokens === 0 && usage.completion_tokens === 0) {
                  return `${index + 1}. ${model}: 没有使用记录`;
                }

                return `${index + 1}. ${model}:
  输入token:${usage.prompt_tokens}
  输出token:${usage.completion_tokens}
  总token:${usage.prompt_tokens + usage.completion_tokens}`;
              }).join('\n');

              if (!s) {
                seal.replyToSender(ctx, msg, `没有使用记录`);
                return ret;
              }

              seal.replyToSender(ctx, msg, `全部使用记录如下:\n${s}`);
              return ret;
            }
            case 'y': {
              const obj: {
                [key: string]: {
                  prompt_tokens: number;
                  completion_tokens: number;
                }
              } = {};
              const now = new Date();
              const currentYear = now.getFullYear();
              const currentMonth = now.getMonth() + 1;
              const currentYM = currentYear * 12 + currentMonth;
              for (const model in AIManager.usageMap) {
                const modelUsage = AIManager.usageMap[model];
                for (const key in modelUsage) {
                  const usage = modelUsage[key];
                  const [year, month, _] = key.split('-').map(v => parseInt(v));
                  const ym = year * 12 + month;

                  if (ym >= currentYM - 11 && ym <= currentYM) {
                    const key = `${year}-${month}`;
                    if (!obj.hasOwnProperty(key)) {
                      obj[key] = {
                        prompt_tokens: 0,
                        completion_tokens: 0
                      };
                    }

                    obj[key].prompt_tokens += usage.prompt_tokens;
                    obj[key].completion_tokens += usage.completion_tokens;
                  }
                }
              }

              const val3 = cmdArgs.getArgN(3);
              if (val3 === 'chart') {
                get_chart_url('year', obj)
                  .then(url => seal.replyToSender(ctx, msg, url ? `[CQ:image,file=${url}]` : '图表生成失败'));
                return ret;
              }

              const keys = Object.keys(obj).sort((a, b) => {
                const [yearA, monthA] = a.split('-').map(v => parseInt(v));
                const [yearB, monthB] = b.split('-').map(v => parseInt(v));
                return (yearA * 12 + monthA) - (yearB * 12 + monthB);
              });

              const s = keys.map(key => {
                const usage = obj[key];
                if (usage.prompt_tokens === 0 && usage.completion_tokens === 0) {
                  return ``;
                }

                return `${key}:
  输入token:${usage.prompt_tokens}
  输出token:${usage.completion_tokens}
  总token:${usage.prompt_tokens + usage.completion_tokens}`;
              }).join('\n');

              if (!s) {
                seal.replyToSender(ctx, msg, `没有使用记录`);
                return ret;
              }

              seal.replyToSender(ctx, msg, `最近12个月使用记录如下:\n${s}`);
              return ret;
            }
            case 'm': {
              const obj: {
                [key: string]: {
                  prompt_tokens: number;
                  completion_tokens: number;
                }
              } = {};
              const now = new Date();
              const currentYear = now.getFullYear();
              const currentMonth = now.getMonth() + 1;
              const currentDay = now.getDate();
              const currentYMD = currentYear * 12 * 31 + currentMonth * 31 + currentDay;
              for (const model in AIManager.usageMap) {
                const modelUsage = AIManager.usageMap[model];
                for (const key in modelUsage) {
                  const usage = modelUsage[key];
                  const [year, month, day] = key.split('-').map(v => parseInt(v));
                  const ymd = year * 12 * 31 + month * 31 + day;

                  if (ymd >= currentYMD - 30 && ymd <= currentYMD) {
                    const key = `${year}-${month}-${day}`;
                    if (!obj.hasOwnProperty(key)) {
                      obj[key] = {
                        prompt_tokens: 0,
                        completion_tokens: 0
                      };
                    }

                    obj[key].prompt_tokens += usage.prompt_tokens;
                    obj[key].completion_tokens += usage.completion_tokens;
                  }
                }
              }

              const val3 = cmdArgs.getArgN(3);
              if (val3 === 'chart') {
                get_chart_url('month', obj)
                  .then(url => seal.replyToSender(ctx, msg, url ? `[CQ:image,file=${url}]` : '图表生成失败'));
                return ret;
              }

              const keys = Object.keys(obj).sort((a, b) => {
                const [yearA, monthA, dayA] = a.split('-').map(v => parseInt(v));
                const [yearB, monthB, dayB] = b.split('-').map(v => parseInt(v));
                return (yearA * 12 * 31 + monthA * 31 + dayA) - (yearB * 12 * 31 + monthB * 31 + dayB);
              });

              const s = keys.map(key => {
                const usage = obj[key];
                if (usage.prompt_tokens === 0 && usage.completion_tokens === 0) {
                  return ``;
                }

                return `${key}:
  输入token:${usage.prompt_tokens}
  输出token:${usage.completion_tokens}
  总token:${usage.prompt_tokens + usage.completion_tokens}`;
              }).join('\n');

              seal.replyToSender(ctx, msg, `最近31天使用记录如下:\n${s}`);
              return ret;
            }
            case 'clr': {
              const val3 = cmdArgs.getArgN(3);
              if (!val3) {
                AIManager.clearUsageMap();
                seal.replyToSender(ctx, msg, '已清除token使用记录');
                AIManager.saveUsageMap();
                return ret;
              }

              if (!AIManager.usageMap.hasOwnProperty(val3)) {
                seal.replyToSender(ctx, msg, '没有这个模型，请使用【.ai tk lst】查看所有模型');
                return ret;
              }

              delete AIManager.usageMap[val3];
              seal.replyToSender(ctx, msg, `已清除 ${val3} 的token使用记录`);
              AIManager.saveUsageMap();
              return ret;
            }
            case '':
            case 'help': {
              seal.replyToSender(ctx, msg, `帮助:
【.ai tk lst】查看所有模型
【.ai tk sum】查看所有模型的token使用记录总和
【.ai tk all】查看所有模型的token使用记录
【.ai tk [y/m] (chart)】查看所有模型今年/这个月的token使用记录
【.ai tk <模型名称>】查看模型的token使用记录
【.ai tk <模型名称> [y/m] (chart)】查看模型今年/这个月的token使用记录
【.ai tk clr】清除token使用记录
【.ai tk clr <模型名称>】清除token使用记录`);
              return ret;
            }
            default: {
              if (!AIManager.usageMap.hasOwnProperty(val2)) {
                seal.replyToSender(ctx, msg, '没有这个模型，请使用【.ai tk lst】查看所有模型');
                return ret;
              }

              const val3 = cmdArgs.getArgN(3);
              switch (val3) {
                case 'y': {
                  const obj: {
                    [key: string]: {
                      prompt_tokens: number;
                      completion_tokens: number;
                    }
                  } = {};
                  const now = new Date();
                  const currentYear = now.getFullYear();
                  const currentMonth = now.getMonth() + 1;
                  const currentYM = currentYear * 12 + currentMonth;
                  const model = val2;

                  const modelUsage = AIManager.usageMap[model];
                  for (const key in modelUsage) {
                    const usage = modelUsage[key];
                    const [year, month, _] = key.split('-').map(v => parseInt(v));
                    const ym = year * 12 + month;

                    if (ym >= currentYM - 11 && ym <= currentYM) {
                      const key = `${year}-${month}`;
                      if (!obj.hasOwnProperty(key)) {
                        obj[key] = {
                          prompt_tokens: 0,
                          completion_tokens: 0
                        };
                      }

                      obj[key].prompt_tokens += usage.prompt_tokens;
                      obj[key].completion_tokens += usage.completion_tokens;
                    }
                  }

                  const val4 = cmdArgs.getArgN(4);
                  if (val4 === 'chart') {
                    get_chart_url('year', obj)
                      .then(url => seal.replyToSender(ctx, msg, url ? `[CQ:image,file=${url}]` : '图表生成失败'));
                    return ret;
                  }

                  const keys = Object.keys(obj).sort((a, b) => {
                    const [yearA, monthA] = a.split('-').map(v => parseInt(v));
                    const [yearB, monthB] = b.split('-').map(v => parseInt(v));
                    return (yearA * 12 + monthA) - (yearB * 12 + monthB);
                  });

                  const s = keys.map(key => {
                    const usage = obj[key];
                    if (usage.prompt_tokens === 0 && usage.completion_tokens === 0) {
                      return ``;
                    }

                    return `${key}:
      输入token:${usage.prompt_tokens}
      输出token:${usage.completion_tokens}
      总token:${usage.prompt_tokens + usage.completion_tokens}`;
                  }).join('\n');

                  if (!s) {
                    seal.replyToSender(ctx, msg, `没有使用记录`);
                    return ret;
                  }

                  seal.replyToSender(ctx, msg, `最近12个月使用记录如下:\n${s}`);
                  return ret;
                }
                case 'm': {
                  const obj: {
                    [key: string]: {
                      prompt_tokens: number;
                      completion_tokens: number;
                    }
                  } = {};
                  const now = new Date();
                  const currentYear = now.getFullYear();
                  const currentMonth = now.getMonth() + 1;
                  const currentDay = now.getDate();
                  const currentYMD = currentYear * 12 * 31 + currentMonth * 31 + currentDay;
                  const model = val2;

                  const modelUsage = AIManager.usageMap[model];
                  for (const key in modelUsage) {
                    const usage = modelUsage[key];
                    const [year, month, day] = key.split('-').map(v => parseInt(v));
                    const ymd = year * 12 * 31 + month * 31 + day;

                    if (ymd >= currentYMD - 30 && ymd <= currentYMD) {
                      const key = `${year}-${month}-${day}`;
                      if (!obj.hasOwnProperty(key)) {
                        obj[key] = {
                          prompt_tokens: 0,
                          completion_tokens: 0
                        };
                      }

                      obj[key].prompt_tokens += usage.prompt_tokens;
                      obj[key].completion_tokens += usage.completion_tokens;
                    }
                  }

                  const val4 = cmdArgs.getArgN(4);
                  if (val4 === 'chart') {
                    get_chart_url('month', obj)
                      .then(url => seal.replyToSender(ctx, msg, url ? `[CQ:image,file=${url}]` : '图表生成失败'));
                    return ret;
                  }

                  const keys = Object.keys(obj).sort((a, b) => {
                    const [yearA, monthA, dayA] = a.split('-').map(v => parseInt(v));
                    const [yearB, monthB, dayB] = b.split('-').map(v => parseInt(v));
                    return (yearA * 12 * 31 + monthA * 31 + dayA) - (yearB * 12 * 31 + monthB * 31 + dayB);
                  });

                  const s = keys.map(key => {
                    const usage = obj[key];
                    if (usage.prompt_tokens === 0 && usage.completion_tokens === 0) {
                      return ``;
                    }

                    return `${key}:
      输入token:${usage.prompt_tokens}
      输出token:${usage.completion_tokens}
      总token:${usage.prompt_tokens + usage.completion_tokens}`;
                  }).join('\n');

                  seal.replyToSender(ctx, msg, `最近31天使用记录如下:\n${s}`);
                  return ret;
                }
                default: {
                  const usage = AIManager.getModelUsage(val2);

                  if (usage.prompt_tokens === 0 && usage.completion_tokens === 0) {
                    seal.replyToSender(ctx, msg, `没有使用记录`);
                    return ret;
                  }

                  const s = `输入token:${usage.prompt_tokens}
输出token:${usage.completion_tokens}
总token:${usage.prompt_tokens + usage.completion_tokens}`;
                  seal.replyToSender(ctx, msg, s);
                  return ret;
                }
              }
            }
          }
        }
        case 'arc':
        case 'archive': {
          const pr = ai.privilege;
          if (ctx.privilegeLevel < pr.limit) {
            seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
            return ret;
          }

          if (!ai.archiveManager) {
            ai.archiveManager = new ArchiveManager(ai);
          }

          const val2 = cmdArgs.getArgN(2);
          switch (val2) {
            case 'start': {
              const name = cmdArgs.getArgN(3);
              const result = ai.archiveManager.startWorking(name || undefined);
              seal.replyToSender(ctx, msg, result);
              AIManager.saveAI(id);
              return ret;
            }
            case 'stop': {
              const result = ai.archiveManager.stopWorking();
              seal.replyToSender(ctx, msg, result);
              AIManager.saveAI(id);
              return ret;
            }
            case 'save': {
              const name = cmdArgs.getArgN(3);
              const result = ai.archiveManager.saveWorking(name || undefined);
              seal.replyToSender(ctx, msg, result);
              AIManager.saveAI(id);
              return ret;
            }
            case 'saveto': {
              const name = cmdArgs.getArgN(3);
              if (!name) {
                seal.replyToSender(ctx, msg, '请指定存档名称，格式：.ai arc saveto <名称>');
                return ret;
              }
              const result = ai.archiveManager.saveTo(name);
              seal.replyToSender(ctx, msg, result);
              AIManager.saveAI(id);
              return ret;
            }
            case 'load': {
              const name = cmdArgs.getArgN(3);
              if (!name) {
                seal.replyToSender(ctx, msg, '请指定存档名称，格式：.ai arc load <名称>');
                return ret;
              }
              const result = ai.archiveManager.loadArchive(name);
              seal.replyToSender(ctx, msg, result);
              AIManager.saveAI(id);
              return ret;
            }
            case 'list': {
              const result = ai.archiveManager.listArchives();
              seal.replyToSender(ctx, msg, result);
              return ret;
            }
            case 'info': {
              const name = cmdArgs.getArgN(3);
              if (!name) {
                seal.replyToSender(ctx, msg, '请指定存档名称，格式：.ai arc info <名称>');
                return ret;
              }
              const result = ai.archiveManager.getArchiveInfo(name);
              seal.replyToSender(ctx, msg, result);
              return ret;
            }
            case 'rename': {
              const oldName = cmdArgs.getArgN(3);
              const newName = cmdArgs.getArgN(4);
              if (!oldName || !newName) {
                seal.replyToSender(ctx, msg, '请指定旧名称和新名称，格式：.ai arc rename <旧名> <新名>');
                return ret;
              }
              const result = ai.archiveManager.renameArchive(oldName, newName);
              seal.replyToSender(ctx, msg, result);
              AIManager.saveAI(id);
              return ret;
            }
            case 'delete':
            case 'del': {
              const name = cmdArgs.getArgN(3);
              if (!name) {
                seal.replyToSender(ctx, msg, '请指定存档名称，格式：.ai arc delete <名称>');
                return ret;
              }
              const result = ai.archiveManager.deleteArchive(name);
              seal.replyToSender(ctx, msg, result);
              return ret;
            }
            case 'status': {
              const result = ai.archiveManager.getStatus();
              seal.replyToSender(ctx, msg, result);
              return ret;
            }
            default: {
              const helpText = `存档管理帮助：
【.ai arc start [名称]】开启工作存档
【.ai arc stop】停止记录
【.ai arc save [名称]】保存工作存档
【.ai arc saveto <名称>】保存当前上下文到指定存档
【.ai arc load <名称>】加载存档
【.ai arc list】列出所有存档
【.ai arc info <名称>】查看存档信息
【.ai arc rename <旧名> <新名>】重命名存档
【.ai arc delete <名称>】删除存档
【.ai arc status】查看工作存档状态`;
              seal.replyToSender(ctx, msg, helpText);
              return ret;
            }
          }
        }
        case 'undo': {
          const { enableUndo } = ConfigManager.undo;

          if (!enableUndo) {
            seal.replyToSender(ctx, msg, '撤销功能未启用');
            return ret;
          }

          const pr = ai.privilege;
          // 私聊中所有人都可以使用，群聊中根据配置检查权限
          const { groupRequirePrivilege } = ConfigManager.undo;
          const needCheckPrivilege = !ctx.isPrivate && groupRequirePrivilege;

          if (needCheckPrivilege && ctx.privilegeLevel < pr.limit) {
            seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
            return ret;
          }

          const val2 = cmdArgs.getArgN(2);

          switch (val2) {
            case 'info':
            case 'list': {
              const info = ai.context.getSnapshotInfo(uid, ctx.isPrivate);
              seal.replyToSender(ctx, msg, info);
              return ret;
            }

            case 'clear': {
              // 清除快照需要权限
              if (ctx.privilegeLevel < pr.limit) {
                seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
                return ret;
              }
              const count = ai.context.clearSnapshots();
              seal.replyToSender(ctx, msg, `已清除 ${count} 个快照`);
              AIManager.saveAI(id);
              return ret;
            }

            case 'help': {
              const helpText = `撤销功能帮助:
【.ai undo】撤销最后一次AI回复并重新生成
【.ai undo info】查看可用快照列表
【.ai undo clear】清除所有快照(需要权限)

说明：
- 每次AI回复前会自动创建快照
- 快照记录了用户的原始输入
- 撤销会删除快照点之后的所有上下文
- 私聊中可以自由撤销自己的对话
- 群聊中${groupRequirePrivilege ? '需要权限或只能撤销自己创建的快照' : '所有人都可以撤销'}`;
              seal.replyToSender(ctx, msg, helpText);
              return ret;
            }

            case '':
            default: {
              // 执行撤销操作
              if (!ai.context.hasSnapshots()) {
                seal.replyToSender(ctx, msg, '没有可用的快照，无法撤销\n提示：快照会在AI回复后自动创建');
                return ret;
              }

              const hasPrivilege = ctx.privilegeLevel >= pr.limit;
              const rollbackResult = ai.context.rollbackToLastSnapshot(uid, ctx.isPrivate, hasPrivilege);

              if (!rollbackResult.success) {
                seal.replyToSender(ctx, msg, `撤销失败：${rollbackResult.error || '未知错误'}`);
                return ret;
              }

              const briefUserMessage = rollbackResult.userMessage.length > 30
                ? rollbackResult.userMessage.slice(0, 30) + '...'
                : rollbackResult.userMessage;

              const infoText = `已撤销 ${rollbackResult.removedCount} 条上下文记录
快照时间: ${rollbackResult.snapshotTime}
原始输入: "${briefUserMessage}"
正在重新生成...`;

              seal.replyToSender(ctx, msg, infoText);

              // 保存AI状态
              AIManager.saveAI(id);

              // 重新生成回复
              ai.chat(ctx, msg, '撤销重新生成', {
                userMessage: rollbackResult.userMessage,
                originalSource: rollbackResult.source
              }).catch(e => {
                logger.error(`重新生成失败: ${e.message}`);
                seal.replyToSender(ctx, msg, `重新生成失败: ${e.message}`);
              });

              return ret;
            }
          }
        }
        case 'soup': {
          const pr = ai.privilege;
          if (ctx.privilegeLevel < pr.limit) {
            seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
            return ret;
          }

          const val2 = cmdArgs.getArgN(2);
          const { soups } = ConfigManager.soup;
          
          switch (val2) {
            case 'start': {
              if (ai.soupGame.active) {
                seal.replyToSender(ctx, msg, '已有游戏正在进行中，请先使用【.ai soup answer】结束当前游戏');
                return ret;
              }

              const soupName = cmdArgs.getArgN(3);
              let soup = null;

              if (soupName === '红汤') {
                soup = SoupConfig.getSoup(soups, '红汤');
              } else if (soupName === '清汤') {
                soup = SoupConfig.getSoup(soups, '清汤');
              } else {
                soup = SoupConfig.getSoup(soups, soupName);
              }
              
              if (!soup) {
                const hint = soupName ? 
                    `未找到题目"${soupName}"，使用【.ai soup list】查看所有题目` :
                    '题库为空，请在配置文件中添加题目';
                seal.replyToSender(ctx, msg, hint);
                return ret;
              }

              // 启动游戏
              ai.soupGame.active = true;
              ai.soupGame.currentSoup = soup;
              ai.soupGame.questionCount = 0;
              ai.soupGame.hintsUsed = 0;

              const reply = `海龟汤游戏开始

**题目**：${soup.name}
**类型**：${soup.type} | ${soup.style}

**汤面**：
${soup.surface}

请开始提问吧
使用【.ai soup hint】可获取提示
使用【.ai soup answer】可查看答案并结束游戏`;

              seal.replyToSender(ctx, msg, reply);
              AIManager.saveAI(id);
              return ret;
            }

            case 'hint': {
              if (!ai.soupGame.active) {
                seal.replyToSender(ctx, msg, '当前没有进行中的游戏');
                return ret;
              }

              const soup = ai.soupGame.currentSoup!;
              if (ai.soupGame.hintsUsed >= soup.hints.length) {
                seal.replyToSender(ctx, msg, '已经没有更多提示了');
                return ret;
              }

              const hint = soup.hints[ai.soupGame.hintsUsed];
              ai.soupGame.hintsUsed++;
              
              seal.replyToSender(ctx, msg, `提示 ${ai.soupGame.hintsUsed}/${soup.hints.length}：
${hint}`);
              AIManager.saveAI(id);
              return ret;
            }

            case 'answer': {
              if (!ai.soupGame.active) {
                seal.replyToSender(ctx, msg, '当前没有进行中的游戏');
                return ret;
              }

              const soup = ai.soupGame.currentSoup!;
              ai.soupGame.active = false;

              seal.replyToSender(ctx, msg, `游戏结束

**汤底**：
${soup.truth}

提问次数：${ai.soupGame.questionCount}
使用提示：${ai.soupGame.hintsUsed}/${soup.hints.length}`);
              
              AIManager.saveAI(id);
              return ret;
            }

            case 'stop': {
              if (!ai.soupGame.active) {
                seal.replyToSender(ctx, msg, '当前没有进行中的游戏');
                return ret;
              }

              ai.soupGame.active = false;
              seal.replyToSender(ctx, msg, '游戏已停止');
              AIManager.saveAI(id);
              return ret;
            }

            case 'status': {
              if (!ai.soupGame.active) {
                seal.replyToSender(ctx, msg, '当前没有进行中的游戏');
                return ret;
              }

              const soup = ai.soupGame.currentSoup!;
              seal.replyToSender(ctx, msg, `游戏状态
题目：${soup.name}
类型：${soup.type} | ${soup.style}
提问次数：${ai.soupGame.questionCount}
使用提示：${ai.soupGame.hintsUsed}/${soup.hints.length}`);
              return ret;
            }

            case 'list': {
              const type = cmdArgs.getArgN(3);
              let list = '';
              
              if (type === '红汤' || type === '清汤') {
                list = SoupConfig.listSoups(soups, type);
              } else {
                list = SoupConfig.listSoups(soups);
              }

              seal.replyToSender(ctx, msg, `题目列表：
${list}

使用【.ai soup start <题目名称>】开始指定游戏
使用【.ai soup start 红汤/清汤】随机开始对应类型的游戏
使用【.ai soup start】随机开始游戏`);
              return ret;
            }

            case '':
            case 'help':
            default: {
              seal.replyToSender(ctx, msg, `海龟汤游戏帮助:
【.ai soup start [题目名称/红汤/清汤]】开始游戏
【.ai soup hint】获取提示
【.ai soup answer】查看答案并结束游戏
【.ai soup stop】停止当前游戏
【.ai soup status】查看当前游戏状态
【.ai soup list [红汤/清汤]】查看题目列表

游戏中直接向AI提问即可，AI会回答"是"、"否"或"无关"`);
              return ret;
            }
          }
        }
        case 'timer': {
          const pr = ai.privilege;
          if (ctx.privilegeLevel < pr.limit) {
            seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
            return ret;
          }

          const subCmd = cmdArgs.getArgN(2);
          switch (subCmd) {
            case 'set': {
              // .ai timer set <名称> <时间> [内容]
              const name = cmdArgs.getArgN(3);
              const timeStr = cmdArgs.getArgN(4);
              const content = cmdArgs.getRestArgsFrom(5) || '定时提醒';

              if (!name || !timeStr) {
                seal.replyToSender(ctx, msg, `用法: .ai timer set <名称> <时间> [内容]
时间格式:
- 相对时间: 30m, 2h, 1d
- 绝对时间: 14:30, 2024-10-09 14:30
- 重复周期: daily@14:30, weekly@1@09:00`);
                return ret;
              }

              const parsed = TimeParser.parse(timeStr);
              if (!parsed) {
                seal.replyToSender(ctx, msg, '时间格式错误');
                return ret;
              }

              const result = TimerManager.addNamedTimer(
                ctx, msg, ai, name, parsed.timestamp, content, parsed.repeatType
              );
              seal.replyToSender(ctx, msg, result.message);
              return ret;
            }

            case 'list':
            case 'lst': {
              // .ai timer list [过滤条件]
              const filter = cmdArgs.getArgN(3);
              const timers = TimerManager.listTimers(ai.id, filter);

              if (timers.length === 0) {
                seal.replyToSender(ctx, msg, filter ? `没有找到包含"${filter}"的定时器` : '没有找到定时器');
                return ret;
              }

              const list = timers.map(t => TimerManager.formatTimerInfo(t, true)).join('\n');
              seal.replyToSender(ctx, msg, `定时器列表(${timers.length}个):\n${list}`);
              return ret;
            }

            case 'info': {
              // .ai timer info <名称>
              const name = cmdArgs.getArgN(3);
              if (!name) {
                seal.replyToSender(ctx, msg, '用法: .ai timer info <名称>');
                return ret;
              }

              const timer = TimerManager.getTimer(ai.id, name);
              if (!timer) {
                seal.replyToSender(ctx, msg, '定时器不存在');
                return ret;
              }

              seal.replyToSender(ctx, msg, TimerManager.formatTimerInfo(timer));
              return ret;
            }

            case 'del':
            case 'rm': {
              // .ai timer del <名称>
              const name = cmdArgs.getArgN(3);
              if (!name) {
                seal.replyToSender(ctx, msg, '用法: .ai timer del <名称>');
                return ret;
              }

              const success = TimerManager.deleteTimer(ai.id, name);
              seal.replyToSender(ctx, msg, success ? '定时器已删除' : '定时器不存在');
              return ret;
            }

            case 'enable':
            case 'on': {
              // .ai timer enable <名称>
              const name = cmdArgs.getArgN(3);
              if (!name) {
                seal.replyToSender(ctx, msg, '用法: .ai timer enable <名称>');
                return ret;
              }

              const success = TimerManager.toggleTimer(ai.id, name, true);
              seal.replyToSender(ctx, msg, success ? '定时器已启用' : '定时器不存在');
              return ret;
            }

            case 'disable':
            case 'off': {
              // .ai timer disable <名称>
              const name = cmdArgs.getArgN(3);
              if (!name) {
                seal.replyToSender(ctx, msg, '用法: .ai timer disable <名称>');
                return ret;
              }

              const success = TimerManager.toggleTimer(ai.id, name, false);
              seal.replyToSender(ctx, msg, success ? '定时器已禁用' : '定时器不存在');
              return ret;
            }

            case 'edit': {
              // .ai timer edit <名称> <属性> <新值>
              const name = cmdArgs.getArgN(3);
              const property = cmdArgs.getArgN(4);
              const value = cmdArgs.getRestArgsFrom(5);

              if (!name || !property || !value) {
                seal.replyToSender(ctx, msg, `用法: .ai timer edit <名称> <属性> <新值>
属性可选: time, content, trigger, repeat`);
                return ret;
              }

              if (!['time', 'content', 'repeat'].includes(property)) {
                seal.replyToSender(ctx, msg, '属性错误，可选: time, content, repeat');
                return ret;
              }

              const result = TimerManager.editTimer(ai.id, name, property as any, value);
              seal.replyToSender(ctx, msg, result.message);
              return ret;
            }

            default: {
              seal.replyToSender(ctx, msg, `定时器帮助:
【.ai timer set <名称> <时间> [内容]】创建定时器
【.ai timer list [过滤]】查看定时器列表
【.ai timer info <名称>】查看定时器详情
【.ai timer del <名称>】删除定时器
【.ai timer enable <名称>】启用定时器
【.ai timer disable <名称>】禁用定时器
【.ai timer edit <名称> <属性> <新值>】编辑定时器

时间格式示例:
- 相对: 30m(30分钟后), 2h(2小时后), 1d(1天后)
- 绝对: 14:30(今天14:30), 2024-10-09 14:30
- 重复: daily@14:30(每天14:30), weekly@1@09:00(每周一9点)

编辑属性说明:
- time: 修改触发时间
- content: 修改提示内容
- repeat: 修改重复类型(once/daily/weekly/monthly)`);
              return ret;
            }
          }
        }
        case 'shut': {
          const pr = ai.privilege;
          if (ctx.privilegeLevel < pr.limit) {
            seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, "核心:提示_无权限"));
            return ret;
          }

          if (ai.stream.id === '') {
            seal.replyToSender(ctx, msg, '当前没有正在进行的对话');
            return ret;
          }

          ai.stopCurrentChatStream()
            .then(() => seal.replyToSender(ctx, msg, '已停止当前对话'));
          return ret;
        }
        default: {
          ret.showHelp = true;
          return ret;
        }
      }
    } catch (e) {
      logger.error(`指令.ai执行失败:${e.message}`);
      seal.replyToSender(ctx, msg, `指令.ai执行失败:${e.message}`);
      return seal.ext.newCmdExecuteResult(true);
    }
  }

  const cmdImage = seal.ext.newCmdItemInfo();
  cmdImage.name = 'img'; // 指令名字，可用中文
  cmdImage.help = `盗图指南:
【.img draw [stl/lcl/save/all]】随机抽取偷的图片/本地图片/保存的图片/全部
【.img stl [on/off]】偷图 开启/关闭
【.img f [stl/save/all]】遗忘偷的图片/保存的图片/全部
【.img itt [图片/ran] (附加提示词)】图片转文字
【.img list [show/send]】展示保存的图片列表/展示并发送所有保存的图片
【.img del <图片名称1> <图片名称2> ...】删除指定名称的保存图片`;
  cmdImage.solve = (ctx, msg, cmdArgs) => {
    try {
      const val = cmdArgs.getArgN(1);
      const uid = ctx.player.userId;
      const gid = ctx.group.groupId;
      const id = ctx.isPrivate ? uid : gid;

      const ret = seal.ext.newCmdExecuteResult(true);
      const ai = AIManager.getAI(id);

      switch (val) {
        case 'draw': {
          const type = cmdArgs.getArgN(2);
          switch (type) {
            case 'lcl':
            case 'local': {
              const file = ai.imageManager.drawLocalImageFile();
              if (!file) {
                seal.replyToSender(ctx, msg, '暂无本地图片');
                return ret;
              }
              seal.replyToSender(ctx, msg, `[CQ:image,file=${file}]`);
              return ret;
            }
            case 'stl':
            case 'stolen': {
              ai.imageManager.drawStolenImageFile()
                .then(file => seal.replyToSender(ctx, msg, file ? `[CQ:image,file=${file}]` : '暂无偷取图片'));
              return ret;
            }
            case 'save': {
              const file = ai.imageManager.drawSavedImageFile();
              if (!file) {
                seal.replyToSender(ctx, msg, '暂无保存的表情包图片');
              }
              seal.replyToSender(ctx, msg, `[CQ:image,file=${file}]`);
              return ret;
            }
            case 'all': {
              ai.imageManager.drawImageFile()
                .then(file => seal.replyToSender(ctx, msg, file ? `[CQ:image,file=${file}]` : '暂无图片'));
              return ret;
            }
            default: {
              ret.showHelp = true;
              return ret;
            }
          }
        }
        case 'stl':
        case 'steal': {
          const op = cmdArgs.getArgN(2);
          switch (op) {
            case 'on': {
              ai.imageManager.stealStatus = true;
              seal.replyToSender(ctx, msg, `图片偷取已开启,当前偷取数量:${ai.imageManager.stolenImages.filter(img => img.isUrl).length}`);
              AIManager.saveAI(id);
              return ret;
            }
            case 'off': {
              ai.imageManager.stealStatus = false;
              seal.replyToSender(ctx, msg, `图片偷取已关闭,当前偷取数量:${ai.imageManager.stolenImages.filter(img => img.isUrl).length}`);
              AIManager.saveAI(id);
              return ret;
            }
            default: {
              seal.replyToSender(ctx, msg, `图片偷取状态:${ai.imageManager.stealStatus},当前偷取数量:${ai.imageManager.stolenImages.filter(img => img.isUrl).length}`);
              return ret;
            }
          }
        }
        case 'f':
        case 'fgt':
        case 'forget': {
          const type = cmdArgs.getArgN(2);
          switch (type) {
            case 'stl':
            case 'stolen': {
              ai.imageManager.stolenImages = [];
              seal.replyToSender(ctx, msg, '偷取图片已遗忘');
              AIManager.saveAI(id);
              return ret;
            }
            case 'save': {
              ai.imageManager.savedImages = [];
              seal.replyToSender(ctx, msg, '保存图片已遗忘');
              AIManager.saveAI(id);
              return ret;
            }
            case 'all': {
              ai.imageManager.stolenImages = [];
              ai.imageManager.savedImages = [];
              seal.replyToSender(ctx, msg, '所有图片已遗忘');
              AIManager.saveAI(id);
              return ret;
            }
            default: {
              ret.showHelp = true;
              return ret;
            }
          }
        }
        case 'itt': {
          const val2 = cmdArgs.getArgN(2);
          if (!val2) {
            seal.replyToSender(ctx, msg, '【.img itt [图片/ran] (附加提示词)】图片转文字');
            return ret;
          }

          if (val2 == 'ran') {
            ai.imageManager.drawStolenImageFile()
              .then(url => {
                if (!url) {
                  seal.replyToSender(ctx, msg, '图片偷取为空');
                  return;
                }
                const text = cmdArgs.getRestArgsFrom(3);
                ImageManager.imageToText(url, text)
                  .then(s => seal.replyToSender(ctx, msg, `[CQ:image,file=${url}]\n` + s));
              });
          } else {
            const match = val2.match(/\[CQ:image,file=(.*?)\]/);
            if (!match) {
              seal.replyToSender(ctx, msg, '请附带图片');
              return ret;
            }
            const url = match[1];
            const text = cmdArgs.getRestArgsFrom(3);
            ImageManager.imageToText(url, text)
              .then(s => seal.replyToSender(ctx, msg, `[CQ:image,file=${url}]\n` + s));
          }
          return ret;
        }
        case 'list': {
          const type = cmdArgs.getArgN(2);
          switch (type) {
            case 'show': {
              if (ai.imageManager.savedImages.length === 0) {
                seal.replyToSender(ctx, msg, '暂无保存的图片');
                return ret;
              }

              const imageList = ai.imageManager.savedImages.map((img, index) => `${index + 1}. 名称: ${img.id}
应用场景: ${img.scenes.join('、') || '无'}
权重: ${img.weight}`).join('\n');

              seal.replyToSender(ctx, msg, `保存的图片列表:\n${imageList}`);
              return ret;
            }
            case 'send': {
              if (ai.imageManager.savedImages.length === 0) {
                seal.replyToSender(ctx, msg, '暂无保存的图片');
                return ret;
              }

              const imageList = ai.imageManager.savedImages.map((img, index) => {
                return `${index + 1}. 名称: ${img.id}
应用场景: ${img.scenes.join('、') || '无'}
权重: ${img.weight}
[CQ:image,file=${seal.base64ToImage(img.base64)}]`;
              }).join('\n\n');

              seal.replyToSender(ctx, msg, `保存的图片列表:\n${imageList}`);
              return ret;
            }
            default: {
              seal.replyToSender(ctx, msg, '参数缺失，【.img list show】展示保存的图片列表，【.img list send】展示并发送所有保存的图片');
              return ret;
            }
          }
        }
        case 'del': {
          const nameList = cmdArgs.args.slice(1);
          if (nameList.length === 0) {
            seal.replyToSender(ctx, msg, '参数缺失，【.img del <图片名称1> <图片名称2> ...】删除指定名称的保存图片');
            return ret;
          }

          ai.imageManager.delSavedImage(nameList);
          seal.replyToSender(ctx, msg, `已删除图片`);
          return ret;
        }
        default: {
          ret.showHelp = true;
          return ret;
        }
      }
    } catch (e) {
      logger.error(`指令.img执行失败:${e.message}`);
      seal.replyToSender(ctx, msg, `指令.img执行失败:${e.message}`);
      return seal.ext.newCmdExecuteResult(true);
    }
  }

  // 将命令注册到扩展中
  ext.cmdMap['AI'] = cmdAI;
  ext.cmdMap['ai'] = cmdAI;
  ext.cmdMap['img'] = cmdImage;

  //接受非指令消息
  ext.onNotCommandReceived = (ctx, msg): void | Promise<void> => {
    try {
      const { disabledInPrivate, globalStandby, triggerRegexes, ignoreRegexes, triggerCondition } = ConfigManager.received;
      if (ctx.isPrivate && disabledInPrivate) {
        return;
      }

      const userId = ctx.player.userId;
      const groupId = ctx.group.groupId;
      const id = ctx.isPrivate ? userId : groupId;

      let message = msg.message;
      const ai = AIManager.getAI(id);

      // 非指令消息忽略
      const ignoreRegex = ignoreRegexes.join('|');
      if (ignoreRegex) {
        let pattern: RegExp;
        try {
          pattern = new RegExp(ignoreRegex);
        } catch (e) {
          logger.error(`正则表达式错误，内容:${ignoreRegex}，错误信息:${e.message}`);
        }

        if (pattern && pattern.test(message)) {
          logger.info(`非指令消息忽略:${message}`);
          return;
        }
      }

      // 检查CQ码
      const CQTypes = transformTextToArray(message).filter(item => item.type !== 'text').map(item => item.type);
      if (CQTypes.length === 0 || CQTypes.every(item => CQTYPESALLOW.includes(item))) {
        clearTimeout(ai.context.timer);
        ai.context.timer = null;

        // 非指令消息触发
        const triggerRegex = triggerRegexes.join('|');
        if (triggerRegex) {
          let pattern: RegExp;
          try {
            pattern = new RegExp(triggerRegex);
          } catch (e) {
            logger.error(`正则表达式错误，内容:${triggerRegex}，错误信息:${e.message}`);
          }

          if (pattern && pattern.test(message)) {
            const fmtCondition = parseInt(seal.format(ctx, `{${triggerCondition}}`));
            if (fmtCondition === 1) {
              return ai.handleReceipt(ctx, msg, ai, message, CQTypes)
                .then(() => ai.chat(ctx, msg, '非指令'));
            }
          }
        }

        // AI自己设定的触发条件触发
        if (triggerConditionMap.hasOwnProperty(id) && triggerConditionMap[id].length !== 0) {
          for (let i = 0; i < triggerConditionMap[id].length; i++) {
            const condition = triggerConditionMap[id][i];
            if (condition.keyword && !new RegExp(condition.keyword).test(message)) {
              continue;
            }
            if (condition.uid && condition.uid !== userId) {
              continue;
            }

            return ai.handleReceipt(ctx, msg, ai, message, CQTypes)
              .then(() => ai.context.addSystemUserMessage('触发原因提示', condition.reason, [], ai))
              .then(() => triggerConditionMap[id].splice(i, 1))
              .then(() => ai.chat(ctx, msg, 'AI设定触发条件'));
          }
        }

        // 开启任一模式时
        const pr = ai.privilege;
        if (pr.standby || globalStandby) {
          ai.handleReceipt(ctx, msg, ai, message, CQTypes)
            .then((): void | Promise<void> => {
              // 如果在海龟汤游戏中，计数提问次数
              if (ai.soupGame.active) {
                ai.soupGame.questionCount++;
                AIManager.saveAI(id);
              }

              if (pr.counter > -1) {
                ai.context.counter += 1;
                if (ai.context.counter >= pr.counter) {
                  ai.context.counter = 0;
                  return ai.chat(ctx, msg, '计数器');
                }
              }

              if (pr.prob > -1) {
                const ran = Math.random() * 100;
                if (ran <= pr.prob) {
                  return ai.chat(ctx, msg, '概率');
                }
              }

              if (pr.timer > -1) {
                ai.context.timer = setTimeout(() => {
                  ai.context.timer = null;
                  ai.chat(ctx, msg, '计时器');
                }, pr.timer * 1000 + Math.floor(Math.random() * 500));
              }
            });
        }
      }
    } catch (e) {
      logger.error(`非指令消息处理出错，错误信息:${e.message}`);
    }
  }

  //接受的指令
  ext.onCommandReceived = (ctx, msg, cmdArgs) => {
    try {
      if (ToolManager.cmdArgs === null) {
        ToolManager.cmdArgs = cmdArgs;
      }

      const { allcmd } = ConfigManager.received;
      if (allcmd) {
        const uid = ctx.player.userId;
        const gid = ctx.group.groupId;
        const id = ctx.isPrivate ? uid : gid;

        const ai = AIManager.getAI(id);

        let message = msg.message;

        const CQTypes = transformTextToArray(message).filter(item => item.type !== 'text').map(item => item.type);
        if (CQTypes.length === 0 || CQTypes.every(item => CQTYPESALLOW.includes(item))) {
          const pr = ai.privilege;
          if (pr.standby) {
            ai.handleReceipt(ctx, msg, ai, message, CQTypes);
          }
        }
      }
    } catch (e) {
      logger.error(`指令消息处理出错，错误信息:${e.message}`);
    }
  }

  //骰子发送的消息
  ext.onMessageSend = (ctx, msg) => {
    try {
      const uid = ctx.player.userId;
      const gid = ctx.group.groupId;
      const id = ctx.isPrivate ? uid : gid;

      const ai = AIManager.getAI(id);

      let message = msg.message;

      ai.tool.listen.resolve?.(message); // 将消息传递给监听工具

      const { allmsg } = ConfigManager.received;
      if (allmsg) {
        if (message === ai.context.lastReply) {
          ai.context.lastReply = '';
          return;
        }

        const CQTypes = transformTextToArray(message).filter(item => item.type !== 'text').map(item => item.type);
        if (CQTypes.length === 0 || CQTypes.every(item => CQTYPESALLOW.includes(item))) {
          const pr = ai.privilege;
          if (pr.standby) {
            ai.handleReceipt(ctx, msg, ai, message, CQTypes);
          }
        }
      }
    } catch (e) {
      logger.error(`获取发送消息处理出错，错误信息:${e.message}`);
    }
  }
}

main();
