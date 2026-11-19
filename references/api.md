# StepAudio 3 Music API 完整参考

模型 ID 固定 `stepaudio-3-music-preview`，由脚本写死，不用手传。

## 三种 task

| task | 必填 | 说明 |
|---|---|---|
| `text_to_music` | `caption` | 默认。文字描述生成音乐；`instrumental=true` 时纯器乐 |
| `music_cover` | `caption` + `song_audio` + `lyrics` | 参考曲翻唱——保留原曲旋律结构，按新歌词和新风格重做 |
| `vocal_to_music` | `caption` + `vocal_audio` + `lyrics` | 干声配乐——保留人声音色，重新配器和编曲 |

## 请求参数

| 参数 | 脚本选项 | 默认 | 说明 |
|---|---|---|---|
| `caption` | `--caption` | **必填** | 风格描述。genre/vocals/groove/timbre/emotion/key。中英文均可，服务端会改写成英文规范 prompt，结果在 `rewritten_caption` 返回 |
| `lyrics` | `--lyrics <file>` | 无 | 歌词文件路径。`text_to_music` 省略时服务端自动写词 |
| `instrumental` | `--instrumental` | false | 纯器乐。仅 `text_to_music` 支持；**不能与 `--lyrics` 同用** |
| `task` | `--task` | `text_to_music` | 见上表 |
| `song_audio` | `--song <file>` | — | `music_cover` 必填，参考歌曲 |
| `vocal_audio` | `--vocal <file>` | — | `vocal_to_music` 必填，干声（无伴奏） |
| `response_format` | `--format` | `wav` | `wav`/`flac`/`opus`/`mp3`/`pcm`。**建议 mp3**，响应体小一个量级 |
| `sample_rate` | `--rate` | 48000 | 传 `0` 保持模型原生采样率 |
| `bitrate` | `--bitrate` | — | MP3/Opus 码率（kbps） |
| `max_tokens` | `--maxtokens` | 16000 | 生成 token 上限，直接影响时长 |
| `temperature` | `--temperature` | 0.85 | **不支持 0**。越高越大胆、越容易跑偏 |
| `top_k` | — | 80 | 脚本未暴露，需要时改脚本 |
| `top_p` | — | 0.92 | 同上 |
| `repetition_penalty` | — | 1.08 | 同上 |

时长由模型自行决定，不可精确指定，通常 1–3 分钟。想更长就调大 `--maxtokens`。

## 歌词结构标签

`[Intro]` `[Verse 1]` `[Verse 2]` `[Pre-Chorus]` `[Chorus 1]` `[Chorus 2]` `[Bridge]`
`[Instrumental]` `[Hook]` `[Break]` `[Drop]` `[Ad-lib]` `[Outro]`

规则：
- 每个标签**独占一行**，标签本身不进入唱词
- 可以重复（`[Chorus 1]` / `[Chorus 2]`），数字不是必须的
- `[Instrumental]` 段不写词，模型自己加过门或间奏
- 中文歌词直接写中文，不用拼音

## 参考音频输入约束

- Base64 原始字节，**不带** `data:` 前缀（脚本已处理）
- 容器只支持 `wav` / `flac` / `opus` / `mp3`
- `--song` 用整首伴奏+人声的成品；`--vocal` 用去掉伴奏的干声，给错了会 `no_speech_detected`

## 输出

- 命名按发行样式：`<Artist> - <Genre> - <主奏乐器> - <BPM 调性> (<Year>).<ext>`，
  关键词从 caption 自动抽，`--name` / `--artist` / `--year` 可覆盖；撞名追加 `~<task尾4位>`
- 落盘目录 `<运行目录>/outputs/music/`
- 同时写 ID3v2.4（`TIT2` / `TPE1` / `TALB` / `TCON` / `TDRC` / `TSSE` / `COMM:prompt` /
  `TXXX:CAPTION` / `TXXX:MODEL` / `TXXX:TASK_ID`）和同名 `.prompt.md`
- stdout 依次打 `SAVED <路径> (<字节数>)`、`PROMPT <提示词文件>`、`META {json}`
- `META` 字段：`file` / `bytes` / `title` / `artist` / `year` / `genre` / `keywords` /
  `prompt_file` / `task_id` / `task` / `response_format` / `sample_rate`
  / `rewritten_caption` / `rewritten_lyrics`
- `--json` 时额外落一份 `<文件>.json` 元数据

## CLI 额外选项（非 API 参数）

| 选项 | 说明 |
|---|---|
| `--artist <s>` | ID3 作者 / 文件名前缀，默认 `roadless` |
| `--name <s>` | 直接指定文件名关键词段，顶掉自动抽取的 genre / 乐器 / BPM |
| `--title <s>` | 只覆盖 ID3 `TIT2`，不影响文件名 |
| `--year <s>` | 发行年份，默认当年 |
| `--retag <file>` | 不提交任务，只对已有音频改名 + 写 ID3 + `.prompt.md`（配合 `--caption`） |

## HTTP 错误码

| HTTP | `error.type` | 处理 |
|---|---|---|
| 400 | `request_params_invalid` | 参数错或组合非法（如 instrumental + lyrics 同用） |
| 401 | `not_allowed` | key 无效；脚本会先试 `.com`，仍 401 就是 key 问题 |
| 402 | `insufficient_credit` | 余额不足，脚本 exit 2 |
| 404 | `model_invalid` | 模型 ID 错或无权限 |
| 429 | `rate_limited` / `*_credit_limit_exceeded` | 限流。配额类的重试无用，等下一个计费周期 |
| 503 | `service_unavailable` | 过载，可重试 |

## 业务终态（HTTP 200 但 status=FAILED）

`error.stage` 的取值：

| stage | 含义 | 对策 |
|---|---|---|
| `audio_transcode` | 参考音频解码失败 | 转成 wav/flac/opus/mp3 再传 |
| `no_speech_detected` | 干声里没检测到语音 | 换 `--vocal` 素材 |
| `censor` | 安全拦截 | 改 caption / 歌词 |
| `internal` | 服务内部错误 | 保留 task_id，稍后 `--query` 重取 |

提交阶段的内容审核会**同步**返回 HTTP 451，不等任务创建。

## 域名（文档与实测不一致）

官方文档写 `https://api.stepfun.ai/v1/audio/music/...`，实测：

| 域名 | 结果 |
|---|---|
| `api.stepfun.ai/v1/audio/music/query` | `401 invalid_api_key` |
| `api.stepfun.com/v1/audio/music/query` | `400 task not found` ← key 被接受 |
| `api.stepfun.com/v1/models` | `200` |

脚本 `HOSTS` 数组 `.com` 在前、`.ai` 兜底，遇 401/403 自动换域；其他错误直接报终态，不误换。

## 合规

外部分发的生成内容必须标注 AI 生成。
