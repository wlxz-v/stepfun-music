# caption 写法：风格提示词工程

`caption` 是整个流程里**唯一**的风格输入。写歪了，后面全白跑。
组织顺序：**genre → vocals → groove & tempo → timble → emotion → key**。

## 六段式模板

```
<genre>, <subgenre/scene>, <vocal type & gender>, <groove/rhythm feel>, <BPM>, <key & mode>,
<signature instruments / timbre>, <production/mix character>, <emotion & imagery>
```

英文更稳（服务端内部也改写英文），中文能用但偶有损失。

## 各段怎么写

| 段 | 写什么 | 例子 |
|---|---|---|
| genre | 主风格 + 子风格或场景 | `city pop`、`lo-fi hip hop`、`cinematic orchestral`、`ambient techno` |
| vocals | 人声有无、性别、音色、唱法 | `female vocal, breathy and airy`、`male rap, gritty low register`、`no vocals` |
| groove | 节奏型与律动 | `four-on-the-floor`、`swung shuffle`、`half-time trap beat`、`loose live drum feel` |
| tempo | BPM，可给区间 | `85 BPM`、`100–110 BPM` |
| timbre | 标志性乐器与音色质感 | `warm Rhodes piano, dusty vinyl crackle`、`analog synth pads, tape saturation` |
| production | 混音与制作特征 | `wide stereo, lush reverb, modern mastering`、`dry and intimate, close-mic'd` |
| emotion | 情绪与画面感 | `relaxed and nostalgic`、`melancholic but hopeful`、`triumphant and epic` |
| key | 调性与调式 | `C major`、`D minor`、`F# Lydian` |

## 常见场景速查

**视频 BGM（不抢人声）**
```
ambient instrumental, soft synth pads and gentle piano, no drums, slow and spacious,
minimal and unobtrusive, warm and calm, D major
```

**专注/学习**
```
lo-fi hip hop instrumental, warm Rhodes piano, muted bass, soft brushed drums,
dusty vinyl crackle, relaxed and nostalgic, 85 BPM, C major
```

**运动/燃**
```
electronic rock, driving four-on-the-floor, distorted synth bass, aggressive male vocal,
powerful and defiant, 128 BPM, E minor
```

**晚安/放松**
```
solo acoustic guitar instrumental, fingerpicked, gentle reverb, slow tempo,
intimate and tender, G major
```

**国风**
```
Chinese pop, guzheng and bamboo flute intertwined, modern pop drum groove,
female vocal soft and clear, warm and vast with a touch of longing, D minor
```

**儿歌/轻快**
```
upbeat children's pop, ukulele and glockenspiel, bouncy shuffle groove,
bright female vocal, playful and sunny, F major
```

## 三个容易踩的点

1. **一次只描述一首歌的风格**。把三种互斥风格塞进一条 caption，模型会平均成一锅粥。
2. **情绪词要具体，不要空泛**。`sad` 不如 `melancholic but hopeful`；`happy` 不如
   `playful and sunny`。
3. **BPM 和 key 给了就锁定**。不给的话模型自己定，同一条 caption 两次生成可能速度差很多。

## 跑偏了怎么调

生成结果不满意时，先看返回的 `rewritten_caption`：

- **跑偏 + `rewritten_caption` 已经变了样** → 你的 caption 有歧义，改写得更具体再试
- **跑偏 + `rewritten_caption` 忠实还原了你的描述** → 模型对这类风格的理解上限如此，
  换描述角度（比如从"情绪和画面"入手而不是堆乐器名）
- **`temperature` 调低**（如 0.7）能减少随机性，重复性和稳定性更好，代价是惊喜感下降
