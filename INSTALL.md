# 安装 stepfun-music 技能

给 DeepSeek Harness（DSH）用的音乐生成技能：调用 StepFun **StepAudio 3 Music**，
生成纯器乐、带词歌曲、参考曲翻唱、干声配乐。

> **为什么需要这个技能？** StepAudio 3 Music 不在 DSH 的 `step-plan` 模型路由里，
> DSH 也没有音乐生成插件，`llm-pi-ai` 只支持 4 种 chat 形状（openai-completions /
> openai-responses / anthropic-messages / google），与音乐的异步任务制 API
> （submit → 轮询 query）结构上无法映射。装好本技能后，对 DSH 说「来一首歌」就能用。

---

## 一、安装（30 秒）

把 `stepfun-music/` 整个目录拷到下面任意一个位置：

| 位置 | 作用范围 | 适合谁 |
|---|---|---|
| `%USERPROFILE%\.dsh\skills\stepfun-music\` | 本机所有会话 | 个人使用（**推荐**） |
| `<项目根>\.agents\skills\stepfun-music\` | 该项目 | 团队协作 |

Windows 一键（PowerShell）：

```powershell
$dst = "$env:USERPROFILE\.dsh\skills\stepfun-music"
New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
Copy-Item -Recurse -Force ".\stepfun-music" $dst
```

或者手动解压 zip 后拖进去。

**生效方式**：技能目录有 watcher，放进去**立即生效，不用重启** DSH。

装完对 DSH 说一句「来一首 lo-fi 钢琴曲」就能验证。

---

## 二、装之前需要满足的条件

| 条件 | 说明 | 没有会怎样 |
|---|---|---|
| **Node.js ≥ 18** | 脚本是 `.mjs`，只用内置 `fetch`，零第三方依赖 | 跑不了 |
| **StepFun API Key** | 需要一个有 StepAudio 3 Music 权限的 key | 报 401 |

### 配 API Key（二选一）

**方式 A —— 写进 DSH 凭据文件（推荐，一劳永逸）**

编辑 `%USERPROFILE%\.dsh\.credentials.yaml`，加一行（缩进两格，和现有条目对齐）：

```yaml
refs:
  STEPFUN_API_KEY: "你的key"
```

**方式 B —— 环境变量**

```powershell
$env:STEPFUN_API_KEY = "你的key"
```

> 脚本读取顺序：环境变量优先，读不到再解析 `.credentials.yaml`。
> 技能规则要求**不要向用户索要 key、不要把 key 写进对话**，所以这条必须你自己先配好。

---

## 三、文件说明

```
stepfun-music/
├── SKILL.md                     # 技能主文件（DSH 读这个，含铁律与七步流程）
├── README.md                    # 完整用法手册（参数表 / 错误码 / 技巧）
├── INSTALL.md                   # 本文件
├── references/
│   ├── api.md                   # StepAudio 3 Music API 全参数速查
│   ├── caption.md               # caption 怎么写（genre/vocals/groove/timbre/emotion/key）
│   ├── lyrics.md                # 歌词结构标签与写法
│   └── choices.md               # 反问选项库（结构/乐器/唱法三张可搜索风格名表）
└── scripts/
    └── sfmusic.mjs              # 实际干活的脚本（零依赖，Node 直跑）
```

---

## 四、快速上手

装好后直接对 DSH 说人话就行：

| 你说 | 会发生什么 |
|---|---|
| 「来一首 lo-fi 钢琴曲」 | 直接生成 |
| 「按这个感觉写首歌：城市流行，女声，D 小调」 | 先反问结构/乐器/唱法（带推荐），再写词，**开跑前把词和编排摆给你确认** |
| 「这首歌帮我改成爵士版」 | 走翻唱模式（需要你给参考音频） |

也可以自己跑脚本：

```bash
# 纯器乐
node scripts/sfmusic.mjs --caption "lo-fi piano, nostalgic, 85 BPM" --instrumental --format mp3

# 带词歌曲
node scripts/sfmusic.mjs --caption "city pop, female vocal, D minor" --lyrics lyrics.txt

# 查一个已知 task（断点续取）
node scripts/sfmusic.mjs --query 01a19b51-3a94-7ee1-9e22-974c403c6930
```

完整参数见 `README.md`。

---

## 五、常见问题

**Q：提示 `401 not_allowed`？**
Key 不对或没有 StepAudio 3 Music 权限。注意音乐接口只在 `api.stepfun.com` 上认 key
（官方文档写的 `api.stepfun.ai` 会对同一把 key 返回 401，脚本已内置自动换域兜底）。

**Q：能指定歌曲时长吗？**
不能。StepAudio 3 Music 不吃精确时长指令，`--maxtokens` 也控制不了，模型自定时长
（通常 1–3 分钟）。多次生成取最长的一版，或用 `mp3trim.py` 按帧裁剪。

**Q：歌词里能写中文吗？**
能，中英日混写都行。歌曲主体语言由 caption 和歌词共同决定，Verse 想纯英文就在歌词里
全写英文、caption 里写 `verses rapped entirely in English`。

**Q：生成一次多久？**
30–120 秒。**用后台任务跑**，别让前台命令超时。

**Q：积分怎么算？**
按生成次数扣费，改词不收费。所以技能设计成「开跑前把词摆出来给你确认」——
改词 5 秒，重跑要重扣一次。

---

## 六、卸载

删掉技能目录即可，无残留：

```powershell
Remove-Item -Recurse -Force "$env:USERPROFILE\.dsh\skills\stepfun-music"
```

---

## 七、合规提醒

StepAudio 3 Music 生成的内容**外部分发时须加 AI 生成内容标识**。
