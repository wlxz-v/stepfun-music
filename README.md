# stepfun-music

用 StepFun StepAudio 3 Music 生成音乐的 DeepSeek Harness 技能（Skill）。

支持四种玩法：纯器乐、带词歌曲、参考曲翻唱（`music_cover`）、干声配乐（`vocal_to_music`）。

## 为什么不是「在 DSH 里配模型」

`stepaudio-3-music-preview` 确实在 StepFun `/v1/models` 里，但 **DSH 的 `llm-pi-ai` 无法把它配成路由**：

| 检查项 | 结果 |
|---|---|
| 在 step-plan 路由表 | ❌ `/step_plan/v1/models` 只有 9 个（5 个 LLM + stepaudio-2.5 系列），没有 music |
| API 形状兼容 | ❌ 音乐是异步任务制（submit → task_id → 轮询 query），`llm-pi-ai` 只认 4 种 `messages[] → choices[].message` 形状 |
| 有音乐生成插件 | ❌ 只有 STT+TTS / 图片 / 已有歌曲做 MV 三类 |

所以正确形态是 Skill：脚本留在本地，指令写在 `SKILL.md`，agent 读到就会用。
**不动 `cordis.patch.yml`、不装依赖、不重启客户端。**

## 安装

整个目录拷进任一技能发现根即可，有 watcher，放进去即生效：

```bash
# 全局
cp -r stepfun-music "$DSH_HOME/skills/"

# 或只给当前项目
cp -r stepfun-music <项目根>/.agents/skills/
```

## 用法

装完之后直接对 agent 说人话就行：

> 「来一首 lo-fi 风格的背景音乐，纯器乐」
> 「按这个感觉写首歌：城市流行，女声，D 小调」+ 贴歌词
> 「把这首曲子翻成中文版」

也可以手跑：

```bash
cd stepfun-music
node scripts/sfmusic.mjs --caption "lo-fi hip hop instrumental, warm Rhodes piano, 85 BPM, C major" --instrumental --format mp3 --json
```

## 前置条件

- Node 22+（只用内置模块，零依赖）
- `~/.dsh/.credentials.yaml` 里有 `STEPFUN_API_KEY`（StepFun 账号的 key）
- 接口域名是 `api.stepfun.com`——**官方文档写的 `api.stepfun.ai` 对该 key 返回 401**，脚本已内置换域兜底

## 文档

| 文件 | 内容 |
|---|---|
| [`SKILL.md`](SKILL.md) | 主入口：铁律、七步工作流程、错误处理 |
| [`references/choices.md`](references/choices.md) | **反问选项库**：结构/乐器/唱法三张推荐表 + 默认值表 + 反问示例 |
| [`references/api.md`](references/api.md) | 完整参数表、三种 task 区别、错误码、歌词结构标签 |
| [`references/caption.md`](references/caption.md) | caption 写法（风格提示词工程）+ 场景速查 |
| [`references/lyrics.md`](references/lyrics.md) | 歌词结构标签与写作要点 + 完整示例 |

## 易用性设计：带推荐的反问

用户描述模糊时，skill 不会直接开跑，也不会丢一句开放式问题，而是用 `ask_user_question`
给出**带原因的可点选项**。三个最常问的维度：

| 维度 | 选项（都是可搜索的风格名/术语） |
|---|---|
| 歌曲结构 | 主歌-副歌式（Verse-Chorus Form）/ 三十二小节 AABA / 十二小节蓝调（12-Bar Blues）/ 渐进爆发式（Build-up-Drop）/ 无副歌叙事式 / 短循环式 |
| 乐器编制 | 钢琴独奏 / 吉他弹唱编制 / 爵士三重奏 / Bossanova / 流行乐队四件套 / City Pop 配置 / 蓝调放克四件套 / 摇滚乐队 / 独立摇滚 / 卧室 Lo-fi / Synth-pop / EDM / Ambient / 钢琴加弦乐 / 电影配乐编制 / 新中式 / 民乐小编制 |
| 演唱风格 | 爵士 / 灵魂（Soul）/ 民谣 / 复古流行（City Pop）/ 蓝调 / 乡村 / 气声流行（Breathy Pop）/ 实唱流行（Belt Pop）/ 说唱 / 多人叠唱 |

选项标签一律用**能搜到的风格名或专业术语**，标签后补一句说明和一个可参考的歌手/曲目。
不用「气声多、音量小」这类描述性口语——用户没法拿它去搜参考，也没法判断那是什么声音。

反问守则：只问缺的、一次问完（≤3 题）、每题给推荐 + 一句说明 + 一个参考、
用户说「你定」就按默认值表直接开跑不再追问。

## 易用性设计：跑之前先确认歌词

第 5 步是硬关卡。把 caption、结构骨架、歌词全文、关键参数、命令行原文一次摆全，
给四个选项（就按这个开跑 / 歌词要改 / 结构乐器唱法要改 / 重新写一版歌词），
确认了才 `submit`。理由：跑一次扣一次积分，改词 5 秒，跑错整首要重来。

唯一例外：用户自己给的歌词，跳过歌词内容确认，但编排仍要过一眼。

## 规范符合性

按 [DSH Skill Specification 0.1](https://github.com/yzfly/awesome-dsh-skills/blob/main/SPEC.zh.md)
编写，DSK001–DSK033 全项通过（无 MUST 违规）。
