---
name: stepfun-music
description: 用 StepFun StepAudio 3 Music 生成音乐——纯器乐、带词歌曲、参考曲翻唱、干声配乐。当用户说"来一首歌""做个背景音乐""写首歌""配音效/BGM""器乐""纯音乐""按这个风格生成音乐"，或给出歌词要求作曲时使用。用户描述模糊时会先用带推荐的可搜索风格名（爵士/灵魂/民谣/复古流行、主歌-副歌式/AABA/12-Bar Blues、City Pop 配置/爵士三重奏/卧室 Lo-fi）反问结构、唱法、乐器，跑之前再把歌词和编排一次性摆出来给用户确认，确认了才开跑。StepAudio 3 Music 不在 DSH 的 step-plan 路由里、也没有对应插件，本技能是唯一调用通路，走本地脚本 scripts/sfmusic.mjs，不要再尝试配置 llm-pi-ai 或调用内置 generate_image。
metadata:
  version: "1.5.2"
---

# stepfun-music — StepAudio 3 Music 生成音乐

## 铁律

- 出音乐**只能**跑 `scripts/sfmusic.mjs`，**不要**去改 `cordis.patch.yml` 配模型路由——
  StepAudio 3 Music 不在 `/step_plan/v1/models` 里，且音乐是异步任务制 API，与 `llm-pi-ai`
  只认的四种 chat 形状（openai-completions / openai-responses / anthropic-messages / google）
  结构上无法映射，配了也是死路由。
- **不要**用内置 `generate_image` / `generate_images` / `edit_image` 做任何音乐相关的事。
- API key 由脚本自己从 `~/.dsh/.credentials.yaml` 读 `STEPFUN_API_KEY`，**不要**向用户索要 key，
  也不要把 key 写进任何文件或对话。
- 一次生成正常 30–120 秒（模型自定时长，通常 1–3 分钟）。**用后台任务跑，别让前台命令超时。**
- **同一首歌不要重复提交**。拿到 `task_id` 后中断了，用 `--query <task_id>` 接着取。

## 环境

- 脚本：`scripts/sfmusic.mjs`（Node 22+，只用内置模块，零依赖）
- key：`~/.dsh/.credentials.yaml` 的 `STEPFUN_API_KEY`，或环境变量同名
- 输出：默认 `<运行目录>/outputs/music/`，用 `--out` 或环境变量 `STEPFUN_MUSIC_OUT` 改
- 命名：交付物按发行样式命名（关键词来自 caption），提示词同时写进 ID3 和 `.prompt.md`，
  见下文「文件命名与元数据」
- 接口域名：`https://api.stepfun.com/v1/audio/music`（脚本内置 `.com` 优先、`.ai` 兜底换域）

## 工作流程

```
缺口分析 → 反问（只问缺的）→ 写 caption → 写歌词 → 交付前确认 → 跑脚本 → 校验交付
                ↑ 用户已说清的就跳过这一步                    ↑ 歌词确认是硬关卡
```

### 1. 缺口分析：用户已经给了什么

先列出来，再决定问什么：

| 维度 | 用户给没给 |
|---|---|
| 要什么（器乐 / 带词 / 翻唱 / 干声配乐） | |
| 风格 genre | |
| 情绪 / 用途 | |
| 人声（有无、性别、唱法） | |
| 乐器 | |
| 结构（几段、有没有副歌） | |
| BPM / 调性 | |

**全给了 → 直接跳到第 3 步，一个字都别多问。**
**缺 1–2 项且能从 genre 合理推出 → 直接推，在第 7 步交付时说明你替他定了什么。**
**缺关键项（结构/乐器/唱法至少缺一个，且推不出来）→ 进入第 2 步反问。**

### 2. 反问：给选项，不给问答题

用 `ask_user_question` 工具，**一次问完，最多 3 个问题**。每个问题带 2–4 个推荐选项。

**铁律：每个选项必须写清「选了会听到什么」**，用能搜到的风格名 + 一句说明 +
一个可参考的歌手或曲目。禁用「极简」「氛围」「质感」这类既不能搜也没法想象的空泛词。

三个最常问的（完整选项库见 [references/choices.md](references/choices.md)）：

| 问题 | header | 选项（都是可搜索的风格名/术语，详细说明见 choices.md） |
|---|---|---|
| 歌曲结构 | 结构 | 主歌-副歌式（Verse-Chorus Form，九成流行歌都是这个）/ 三十二小节 AABA（爵士标准曲式）/ 十二小节蓝调（12-Bar Blues）/ 渐进爆发式（Build-up-Drop）/ 无副歌叙事式（Verse-only）/ 短循环式（Loop，一分半结束） |
| 演唱风格 | 唱法 | 爵士 / 灵魂（Soul）/ 民谣 / 复古流行（City Pop）/ 蓝调 / 乡村 / 气声流行（Breathy Pop）/ 实唱流行（Belt Pop）/ 说唱 / 多人叠唱 |
| 乐器编制 | 乐器 | 钢琴独奏 / 吉他弹唱编制 / 爵士三重奏 / 流行乐队四件套 / City Pop 配置 / 蓝调放克四件套 / 摇滚乐队 / 卧室 Lo-fi / Synth-pop / EDM / 钢琴加弦乐 / 新中式（完整分档见 choices.md） |

**写选项的铁律：标签必须是能搜到的风格名或专业术语**，不要用「气声多、音量小」这种描述性
口语——用户没法拿它去搜参考，也没法判断那到底是什么声音。标签后面补一句说明
和一个可参考的歌手/曲目。

**为什么反问值得**：结构决定歌词写几段、`--maxtokens` 给多少、时长多少；乐器是 caption
里权重最高的一段（写「city pop」不带电钢琴和萨克斯，模型给的是一首普通流行曲）；
唱法决定同一份歌词是两首不同的歌，还影响歌词用词（气声流行的句子要短、多用闭口音；
实唱流行的副歌需要开口音多的句子才推得上去）。这三项拍错了，整首要重跑，白扣一次积分。

**反问的三条纪律**：

1. **只问缺的**。用户说了「女声，爵士唱法」就别再问唱法。
2. **每个选项都要有推荐标记、一句说明、一个可参考的歌手/曲目**，不要丢一句「你想要什么结构？」就走。
3. **必须给退路**。用户回「你定 / 随便 / 都可以」→ 立刻按
   [references/choices.md](references/choices.md) 末尾的**默认值表**开跑，不再追问第二轮。

### 3. 写 caption

caption 是唯一的风格输入，组织顺序：**genre → vocals → groove & tempo → timbre →
production → emotion → key**。写法与场景速查见 [references/caption.md](references/caption.md)。

服务端会把 caption 改写成英文规范 prompt，**返回的 `rewritten_caption` 是服务端实际用的版本**——
结果跑偏时先看这个字段，就能判断是模型理解错了还是 caption 本身写歪了。

### 4. 写歌词（如有）

结构标签每个独占一行，标签本身不进唱词：

```
[Intro]
[Verse 1]
第一段正文
[Pre-Chorus]
[Chorus 1]
副歌正文
[Bridge]
[Outro]
```

段数按第 2 步选的结构来，别写超（`--maxtokens` 上限会截断，副歌可能出不完整）。
`--instrumental` 与 `--lyrics` **不能同时用**。
写法要点与完整示例见 [references/lyrics.md](references/lyrics.md)。

### 5. 交付前确认：歌词 + 编排，一次点完就开跑

**这一关是硬关卡，不能跳过。** 理由：跑一次扣一次积分，而歌词和编排是用户最主观、
最容易不满意的部分。歌词改一个词只要 5 秒，跑完才发现整首要重来。

用 `ask_user_question`，**一个问题四个选项**，把下面五项一次性摆清楚：

| 展示项 | 内容 |
|---|---|
| caption | 最终英文原文（服务端会改写成 `rewritten_caption`，这个字段是用户可核对的） |
| 结构骨架 | 一行写完，如 `[Intro]→[Verse]→[Pre]→[Chorus]→[Verse]→[Pre]→[Chorus]→[Bridge]→[Chorus]` |
| 歌词全文 | **带结构标签的完整歌词**，写在选项外面正文里，别塞进选项描述 |
| 关键参数 | BPM / 调性 / format / `--maxtokens` / 预计时长 |
| 你要跑的命令 | 完整命令行原文，让用户能看出格式与参数 |

四个选项：

1. **就按这个，开跑**（Recommended）— 直接进第 6 步
2. **歌词要改** — 问改哪里（韵脚/词太满/某段重写/全推翻），改完回到本步骤再确认
3. **结构 / 乐器 / 唱法要改** — 回到第 2 步重选，caption 和歌词一起改
4. **重新写一版歌词** — 不烧积分，改完回到本步骤

**唯一例外**：用户自己提供了歌词原文时，跳过歌词内容确认（内容是他的），
但**仍要确认编排**——把结构骨架和关键参数给他过一眼再跑。

### 6. 跑脚本（后台任务）

```bash
node scripts/sfmusic.mjs --caption "..." --lyrics <歌词文件> --format mp3 --json \
  --artist "roadless" --name "街头古筝 90BPM" --interval 5 --timeout 420
```

`--artist` / `--name` 都是可选的：不给 `--name` 时脚本从 caption 里自动抽关键词
（genre、主奏乐器、BPM 调性）拼文件名；`--artist` 默认 `roadless`，`--year` 默认当年。

用后台任务启动，再 `job_output(wait: true)` 收结果。stdout 会依次打
`submitted task_id=…` → `status=RUNNING` → `SAVED <路径>` → `META {...}`。

带词歌曲比纯器乐慢：实测有超过 8 分钟才 SUCCESS 的，`--timeout` 至少给 900。
真超时了**不要重新提交**，用 `--query <task_id>` 续取（单次 query 只查一次，
要持续等就自己写轮询循环，别重跑 submit）。

歌词**必须写真实文件**再传 `--lyrics`，不要用 `/dev/stdin`（Windows 下 MSYS 会把它
翻译成 `D:\proc\self\fd\0` 报 ENOENT）。

完整参数表、三种 task 的区别、错误码见 [references/api.md](references/api.md)。

### 7. 校验并交付

- 确认 stdout 有 `SAVED` / `PROMPT` / `META` 三段
- `META.bytes` 正常（mp3 一般 1.5–4 MB；几百字节说明是空壳或报错页）
- 确认文件名是关键词构成的发行样式，且 `META.prompt_file` 指向的 `.prompt.md` 已落盘
- 时长优先用 ffprobe 量实数（`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1 <file>`），
  没有 ffprobe 再用 `bytes × 8 ÷ 128000`（mp3 默认 128 kbps）估算
- 按用户既有偏好，**默认直接用 `send_wechat` 把音频文件推过去**，不用问
- 交付时说清四件事：风格、时长、task_id、
  **以及你在第 1 步替他做了哪些默认决定**（让他有机会纠正）
- 交付时**必须带 AI 生成声明**（见下文「合规」）

## 文件命名与元数据

交付物按「正式发行」的样子命名，隔几周也能凭关键词直接找回：

```
<Artist> - <Genre> - <主奏乐器> - <BPM 调性> (<Year>).mp3
roadless - West Coast G-funk rap - pipa+erhu+guzheng - 90BPM D minor pentatonic (2026).mp3
```

- 关键词从 caption 自动抽：首段作 genre（去掉 `instrumental` / `no vocals`）、按出现顺序取
  最多 3 件主奏乐器（中式乐器优先占位）、正则取 `90 BPM` 与 `D minor pentatonic`
- 想自己定关键词用 `--name "..."`；作者用 `--artist`（默认 `roadless`），年份用 `--year`（默认当年）
- 重名不覆盖：撞名时自动追加 task 尾号，形如 `... ~a20985 (2026).mp3`
- 提示词写两处：
  - **ID3v2.4 标签**（写进 mp3 本身）：`TIT2` 标题 / `TPE1` 作者 / `TALB` 专辑 /
    `TCON` 风格 / `TDRC` 年份 / `COMM:prompt` 与 `TXXX:CAPTION` 提示词全文 /
    `TXXX:MODEL` / `TXXX:TASK_ID`
  - **同名 `.prompt.md`**：关键词表 + caption 原文 + `rewritten_caption` + 歌词 + task_id
- 老文件补这套命名与标签（**不花积分、不重新生成**）：

```bash
node scripts/sfmusic.mjs --retag "D:/DSH/outputs/music/music_xxx.mp3" --caption "<当时的提示词>"
```

`--retag` 按当前规则改名、写 ID3 与 `.prompt.md`，并删掉旧文件；不给 `--out` 就原地处理。
注意 `.prompt.md` 里的提示词就是以后复现这首曲子的唯一凭据，别删。

## 错误处理

| 现象 | 含义 | 该做什么 |
|---|---|---|
| `HTTP 402 insufficient_credit` | 余额不足 | 停下告诉用户充值，别重试 |
| `HTTP 429 rate_limited` | 限流 | 等几分钟再试，告知用户 |
| `HTTP 451` | 提交阶段内容审核拦截 | 改 caption / 歌词，别原样重发 |
| `status=FAILED` + `error.stage=censor` | 生成阶段被拦 | 同上 |
| `status=FAILED` + `no_speech_detected` | 干声无效 | 换 `--vocal` 素材 |
| `status=FAILED` + `audio_transcode` | 参考音频解不开 | 参考文件转成 wav/flac/opus/mp3 再试 |
| `status=FAILED` + `internal` | 服务内部错 | 保留 task_id，稍后用 `--query` 重取 |
| `HTTP 401` | key 失效 | 让用户检查 `~/.dsh/.credentials.yaml` 的 `STEPFUN_API_KEY` |

## 合规

外部分发的生成内容**必须**标注 AI 生成。往小红书、B站、公众号等平台发的时候，
文案里带上 AI 生成声明。
