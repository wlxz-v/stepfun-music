#!/usr/bin/env node
// StepAudio 3 Music 直调脚本 —— DSH 无音乐生成 provider，故走独立脚本模式
// （独立脚本模式：零第三方依赖，只用 Node 内置 fetch，拷走即用）
//
// API: POST https://api.stepfun.ai/v1/audio/music/submit   -> {task_id}
//      POST https://api.stepfun.ai/v1/audio/music/query    -> {status, audio(base64)}
// 异步"提交+轮询"模型，每 5 秒查一次，SUCCESS 后落盘。
//
// 用法示例：
//   node sfmusic.mjs --caption "city pop, female vocal, warm, D minor" --format mp3
//   node sfmusic.mjs --caption "lo-fi piano, nostalgic" --instrumental --format mp3
//   node sfmusic.mjs --caption "soul R&B" --lyrics lyrics.txt --format mp3
//   node sfmusic.mjs --task music_cover --caption "funk" --lyrics l.txt --song ref.mp3
//   node sfmusic.mjs --task vocal_to_music --caption "dance-pop" --lyrics l.txt --vocal dry.wav
//   node sfmusic.mjs --query <task_id>
//   node sfmusic.mjs --retag out.mp3 --caption "..." --name "街头古筝 90BPM"   # 只改名+打标签
//
// 交付命名（正式发行样式，关键词来自 caption，可用 --name 覆盖）：
//   <Artist> - <Genre> - <主奏乐器> - <BPM 调性> (<Year>).mp3
//   同时写 ID3v2.4（TIT2/TPE1/TALB/TCON/TDRC/COMM=提示词/TXXX:CAPTION/TASK_ID）
//   和同名 <base>.prompt.md（提示词全文 + 参数 + task_id）
//
// 输出默认 <当前目录>/outputs/music/，用 --out 或环境变量 STEPFUN_MUSIC_OUT 改
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join, resolve, extname, dirname } from 'node:path';
import { homedir } from 'node:os';

// 注意：官方文档写 api.stepfun.ai，但实测音乐接口只在 api.stepfun.com 上认这把 key
// （.ai 域名返回 401 invalid_api_key，.com 与 DSH 里 step_plan 的 baseURL 同域）。
// 故默认 .com，失败时自动回退 .ai 再试一次。
const HOSTS = ['https://api.stepfun.com/v1/audio/music', 'https://api.stepfun.ai/v1/audio/music'];
const CRED = join(homedir(), '.dsh', '.credentials.yaml');
const DEF_OUT = process.env.STEPFUN_MUSIC_OUT || 'outputs/music';
const MODEL = 'stepaudio-3-music-preview';

class CliError extends Error {
  constructor(msg, code) { super(msg); this.code = code || 1; }
}
function die(msg, code = 1) { throw new CliError(msg, code); }

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith('--')) {
      const k = t.slice(2);
      const nxt = argv[i + 1];
      if (nxt === undefined || nxt.startsWith('--')) { a[k] = true; }
      else { a[k] = nxt; i++; }
    } else a._.push(t);
  }
  return a;
}

// 从 ~/.dsh/.credentials.yaml 读 STEPFUN_API_KEY（YAML 扁平 refs 段，够用且免依赖）
function loadKey() {
  if (process.env.STEPFUN_API_KEY) return process.env.STEPFUN_API_KEY;
  if (!existsSync(CRED)) die('credentials not found: ' + CRED + '；请设置环境变量 STEPFUN_API_KEY');
  const txt = readFileSync(CRED, 'utf8');
  const m = txt.match(/^\s{2}STEPFUN_API_KEY:\s*(.+?)\s*$/m);
  if (!m) die('STEPFUN_API_KEY not found in ' + CRED);
  return m[1].replace(/^['"]|['"]$/g, '');
}

async function call(path, body) {
  const problems = [];
  for (let i = 0; i < HOSTS.length; i++) {
    const base = HOSTS[i];
    const isLast = i === HOSTS.length - 1;
    let r;
    try {
      r = await fetch(base + path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Authorization': 'Bearer ' + loadKey(),
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      problems.push(base + ' -> 网络错误 ' + (e && e.message));
      continue;
    }
    const text = await r.text();
    let j = null;
    try { j = JSON.parse(text); } catch { j = null; }

    // 401/403 = 这把 key 在该域不可用 → 换下一个域重试（仅当还有下一个）
    if (!isLast && (r.status === 401 || r.status === 403)) {
      problems.push(base + ' -> HTTP ' + r.status + ' ' + (j && j.error && j.error.message));
      continue;
    }
    // 到这里：要么是最后一个域，要么该域已认这把 key —— 结果就是最终答案
    if (!r.ok || j === null) {
      const retry = r.headers.get('x-should-retry');
      const em = (j && j.error && j.error.message) || text.slice(0, 200);
      const et = (j && j.error && j.error.type) || 'non_json';
      die(path + ' -> HTTP ' + r.status + ' type=' + et + ' msg=' + em +
        (retry ? ' (retryable=' + retry + ')' : '') +
        (problems.length ? ' | 已试过: ' + problems.join(' ; ') : ''),
        r.status === 402 ? 2 : 1);
    }
    return j;
  }
  die('所有域均不可用: ' + problems.join(' ; '));
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ============================================================ 命名与元数据 ==
// 交付物按「正式发行」的样子命名：
//   <Artist> - <Genre> - <主奏乐器> - <BPM 调性> (<Year>).mp3
// 例：roadless - West Coast G-funk rap - pipa+erhu+guzheng - 90BPM D minor pentatonic (2026).mp3
// 同时把 caption（提示词）写进 ID3v2.4 标签 + 同名 .prompt.md，便于以后回头找。

const INSTRUMENTS = [
  // 西洋
  'slap bass', 'electric guitar', 'acoustic guitar', 'rhodes', 'electric piano',
  'saxophone', 'trumpet', 'cello', 'violin', 'strings', 'talk box', 'drum machine',
  'piano', 'guitar', 'bass', 'synth', 'moog', '808', 'kalimba', 'harp', 'accordion',
  'flute',
  // 中国
  'bamboo flute', 'bianzhong', 'shakuhachi', 'guzheng', 'pipa', 'erhu', 'dizi',
  'suona', 'sheng', 'gong', 'koto', 'xiao',
  '古筝', '琵琶', '二胡', '笛子', '箫', '唢呐', '笙', '编钟', '锣', '马头琴',
  '钢琴', '吉他', '贝斯', '萨克斯', '弦乐', '合成器',
];
const INS_SORTED = INSTRUMENTS.slice().sort((x, y) => y.length - x.length);
// 中式乐器优先出现在文件名里（它们是这类编曲最可辨识的特征）
const CHINESE_INS = new Set(['guzheng', 'pipa', 'erhu', 'dizi', 'suona', 'sheng', 'bianzhong',
  'gong', 'koto', 'xiao', 'bamboo flute', 'shakuhachi',
  '古筝', '琵琶', '二胡', '笛子', '箫', '唢呐', '笙', '编钟', '锣', '马头琴']);

function cleanPart(s) {
  return String(s == null ? '' : s)
    .replace(/[\\/:*?"<>|\r\n\t]/g, ' ')   // Windows 非法字符
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[. ]+|[. ]+$/g, '');
}

// 从 caption 抽关键词：genre（首段）+ 主奏乐器（按出现顺序，最长匹配）+ BPM/调性
function deriveKeywords(caption) {
  const cap = String(caption || '');
  const segs = cap.split(/[,，、;；]/);
  let genre = cleanPart(segs[0] || 'music')
    .replace(/\b(no vocals|instrumental)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'music';
  if (genre.length > 48) genre = genre.slice(0, 48).trim();

  const lower = cap.toLowerCase();
  const hits = [];
  for (let i = 0; i < lower.length;) {
    const m = INS_SORTED.find(w => lower.startsWith(w.toLowerCase(), i));
    if (m) { hits.push(m); i += m.length; } else i++;
  }
  const instr = (() => {
    const uniq = [...new Set(hits)];
    const zh = uniq.filter(w => CHINESE_INS.has(w));
    const other = uniq.filter(w => !CHINESE_INS.has(w));
    return [...zh, ...other].slice(0, 3).join('+');
  })();

  const bpm = (cap.match(/\b(\d{2,3})\s*BPM\b/i) || [])[1];
  const km = cap.match(/\b([A-G][#b]?)\s*(minor|major|dorian|lydian|mixolydian|pentatonic)(?:\s+(pentatonic))?/i);
  const key = km ? (km[1] + ' ' + km[2].toLowerCase() + (km[3] ? ' ' + km[3].toLowerCase() : '')) : '';
  const tempo = [bpm ? bpm + 'BPM' : '', key].filter(Boolean).join(' ');

  return { genre, instr, tempo };
}

function buildName(a, caption) {
  const artist = cleanPart(a.artist || 'roadless') || 'roadless';
  const year = cleanPart(a.year || String(new Date().getFullYear())) || String(new Date().getFullYear());
  const kw = deriveKeywords(caption);
  const keywords = (a.name ? cleanPart(a.name) : [kw.genre, kw.instr, kw.tempo].filter(Boolean).join(' - '));
  const title = a.title ? cleanPart(a.title) : keywords;
  let base = `${artist} - ${keywords} (${year})`;
  if (base.length > 120) base = base.slice(0, 120).replace(/[. ]+$/, '');
  return { base, artist, year, title, keywords, ...kw };
}

// ---------------------------------------------------------------- ID3v2.4 --
function syncsafe(n) {
  return Buffer.from([(n >>> 21) & 0x7f, (n >>> 14) & 0x7f, (n >>> 7) & 0x7f, n & 0x7f]);
}
function frame(id, payload) {
  return Buffer.concat([Buffer.from(id, 'ascii'), syncsafe(payload.length), Buffer.from([0, 0]), payload]);
}
function textFrame(id, s) {
  return frame(id, Buffer.concat([Buffer.from([0x03]), Buffer.from(String(s || ''), 'utf8')]));
}
function txxxFrame(desc, val) {
  return frame('TXXX', Buffer.concat([
    Buffer.from([0x03]), Buffer.from(desc, 'utf8'), Buffer.from([0]), Buffer.from(String(val || ''), 'utf8'),
  ]));
}
function commFrame(desc, text) {
  return frame('COMM', Buffer.concat([
    Buffer.from([0x03]), Buffer.from('eng', 'ascii'), Buffer.from(desc, 'utf8'), Buffer.from([0]),
    Buffer.from(String(text || ''), 'utf8'),
  ]));
}
function stripId3(buf) {
  if (buf.length > 10 && buf.toString('ascii', 0, 3) === 'ID3') {
    const sz = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    return buf.subarray(10 + sz + ((buf[5] & 0x10) ? 10 : 0));
  }
  return buf;
}
// 把标签写到音频最前面（API 直出的裸 mp3 没有 ID3，重复交付时先剥掉旧标签）
function withTags(audio, n, extra) {
  const body = stripId3(audio);
  const framesBlock = Buffer.concat([
    textFrame('TIT2', n.title || n.base),
    textFrame('TPE1', n.artist),
    textFrame('TALB', extra.album || 'StepAudio 3 Music'),
    textFrame('TCON', extra.genre || 'AI Generated'),
    textFrame('TDRC', n.year),
    textFrame('TSSE', 'DSH stepfun-music / StepAudio 3 Music'),
    commFrame('prompt', extra.caption || ''),
    txxxFrame('CAPTION', extra.caption || ''),
    txxxFrame('MODEL', MODEL),
    txxxFrame('TASK_ID', extra.taskId || ''),
  ]);
  const header = Buffer.concat([Buffer.from('ID3', 'ascii'), Buffer.from([0x04, 0x00, 0x00]), syncsafe(framesBlock.length)]);
  return Buffer.concat([header, framesBlock, body]);
}

function renderPromptMd(o) {
  const L = [];
  L.push('# ' + o.title);
  L.push('');
  L.push('| 字段 | 内容 |');
  L.push('|---|---|');
  L.push('| 作者 / Artist | ' + o.artist + ' |');
  L.push('| 风格 / Genre | ' + o.genre + ' |');
  L.push('| 年份 / Year | ' + o.year + ' |');
  if (o.keywords) L.push('| 关键词 / Keywords | ' + o.keywords + ' |');
  L.push('| 模型 / Model | ' + MODEL + '（StepAudio 3 Music） |');
  L.push('| task_id | ' + o.taskId + ' |');
  L.push('| 生成时间 / Created | ' + new Date().toISOString() + ' |');
  L.push('');
  L.push('## 提示词 / Caption（提交原文）');
  L.push('');
  L.push('```');
  L.push(o.caption || '(空)');
  L.push('```');
  if (o.rewritten) {
    L.push('');
    L.push('## 服务端改写版 / Rewritten caption');
    L.push('');
    L.push('```');
    L.push(o.rewritten);
    L.push('```');
  }
  if (o.rewrittenLyrics) {
    L.push('');
    L.push('## 歌词 / Lyrics');
    L.push('');
    L.push('```');
    L.push(o.rewrittenLyrics);
    L.push('```');
  }
  L.push('');
  L.push('## 合规');
  L.push('');
  L.push('本音频由 AI 生成（StepAudio 3 Music）。对外分发时请保留 AI 生成声明。');
  L.push('');
  return L.join('\n');
}


async function main() {
  const a = parseArgs(process.argv.slice(2));

  // ---- 仅查询模式 -------------------------------------------------------
  if (a.query) {
    const q = await call('/query', { task_id: a.query });
    if (q.status === 'SUCCESS') save(q, a);
    else console.log(JSON.stringify(q, null, 2));
    return;
  }

  // ---- 仅改名 + 打标签模式（对已有音频重做交付，不提交任务、不扣积分）------
  if (a.retag) {
    const src = resolve(a.retag);
    if (!existsSync(src)) die('--retag 文件不存在: ' + src);
    if (!a.caption) die('--retag 需要 --caption：提示词要写进 ID3 和 .prompt.md');
    const ext = extname(src).replace(/^\./, '').toLowerCase() || 'mp3';
    const raw = stripId3(readFileSync(src));
    const meta = deliver(raw, { ...a, out: a.out || dirname(src) }, {
      ext,
      taskId: a.task_id || a['task-id'] || '',
      task: 'retag',
      samePath: src,
    });
    if (resolve(meta.file) !== src) { unlinkSync(src); console.log('REMOVED old ' + src); }
    return;
  }

  // ---- 提交模式 ---------------------------------------------------------
  const task = a.task || 'text_to_music';
  if (!['text_to_music', 'music_cover', 'vocal_to_music'].includes(task))
    die('--task must be one of text_to_music | music_cover | vocal_to_music');
  const caption = a.caption || a.prompt;
  if (!caption) die('missing --caption (风格描述，中英文均可)');

  const body = { task, model_id: MODEL, caption };
  if (a.lyrics) body.lyrics = readFileSync(resolve(a.lyrics), 'utf8');
  if (a.instrumental) { body.instrumental = true; delete body.lyrics; }
  if (a.format) body.response_format = a.format;
  if (a.rate) body.sample_rate = Number(a.rate);
  if (a.bitrate) body.bit_rate = Number(a.bitrate);
  if (a.maxtokens) body.max_tokens = Number(a.maxtokens);
  if (a.temperature) body.temperature = Number(a.temperature);
  if (a['lyrics-rewrite']) body.lyrics_rewrite = true;
  if (a['no-caption-rewrite']) body.disable_caption_rewrite = true;

  // 参考音频：base64 原始字节，不带 data: 前缀
  if (task === 'music_cover') {
    if (!a.song) die('music_cover 需要 --song <参考歌曲文件>');
    if (!body.lyrics) die('music_cover 需要 --lyrics');
    body.song_audio = readFileSync(resolve(a.song)).toString('base64');
  }
  if (task === 'vocal_to_music') {
    if (!a.vocal) die('vocal_to_music 需要 --vocal <干声文件>');
    if (!body.lyrics) die('vocal_to_music 需要 --lyrics');
    body.vocal_audio = readFileSync(resolve(a.vocal)).toString('base64');
  }

  const sub = await call('/submit', body);
  if (!sub.task_id) die('submit 返回无 task_id: ' + JSON.stringify(sub));
  console.log('submitted task_id=' + sub.task_id);

  // ---- 轮询 -------------------------------------------------------------
  const interval = Number(a.interval || 5) * 1000;
  const timeout = Number(a.timeout || 600) * 1000;
  const t0 = Date.now();
  let last = '';
  for (;;) {
    if (Date.now() - t0 > timeout) die('轮询超时 ' + (timeout / 1000) + 's；task_id=' + sub.task_id + ' 可稍后 --query 续取');
    await sleep(interval);
    const q = await call('/query', { task_id: sub.task_id });
    if (q.status !== last) { last = q.status; console.log('status=' + q.status); }
    if (q.status === 'SUCCESS') { save(q, a, sub.task_id); return; }
    if (q.status === 'FAILED') die('生成失败 stage=' + (q.error && q.error.stage) + ' msg=' + (q.error && q.error.message) + '；task_id=' + sub.task_id, 3);
  }
}

function deliver(raw, a, opts) {
  const ext = String(opts.ext || 'mp3').toLowerCase();
  const outDir = resolve(a.out || DEF_OUT);
  mkdirSync(outDir, { recursive: true });
  const tid = opts.taskId || 'x';
  const caption = a.caption || '';
  const n = buildName(a, caption);

  // 重名不覆盖：base 里已带 (年)，撞名就追加 task 尾号（原地 retag 例外）
  let base = n.base;
  let p = join(outDir, base + '.' + ext);
  const same = opts.samePath ? resolve(opts.samePath) : '';
  if (existsSync(p) && resolve(p) !== same) {
    base = base.replace(/\s*\(\d{4}\)\s*$/, '') + ' ~' + String(tid).replace(/-/g, '').slice(-4) + ' (' + n.year + ')';
    p = join(outDir, base + '.' + ext);
  }

  const buf = withTags(raw, n, { caption, genre: n.genre, taskId: tid });
  writeFileSync(p, buf);

  // 歌词：优先用本地 --lyrics 文件（服务端 query 路径不回 rewritten_lyrics）
  let lyricsText = opts.rewritten_lyrics;
  if (a.lyrics) {
    const lp = resolve(a.lyrics);
    if (existsSync(lp)) { try { lyricsText = readFileSync(lp, 'utf8').trim(); } catch { /* 读不到就用服务端版 */ } }
  }

  const promptPath = join(outDir, base + '.prompt.md');
  writeFileSync(promptPath, renderPromptMd({
    title: n.title || base, artist: n.artist, genre: n.genre, year: n.year,
    keywords: n.keywords, taskId: tid, caption,
    rewritten: opts.rewritten_caption, rewrittenLyrics: lyricsText,
  }));

  const meta = {
    file: p,
    bytes: buf.length,
    title: n.title || base,
    artist: n.artist,
    year: n.year,
    genre: n.genre,
    keywords: n.keywords,
    prompt_file: promptPath,
    task_id: tid,
    task: opts.task || 'text_to_music',
    response_format: ext,
    sample_rate: opts.sample_rate,
    rewritten_caption: opts.rewritten_caption,
    rewritten_lyrics: opts.rewritten_lyrics,
  };
  console.log('SAVED ' + p + '  (' + buf.length + ' bytes)');
  console.log('PROMPT ' + promptPath);
  console.log('META ' + JSON.stringify(meta, null, 2));
  if (a.json) writeFileSync(p + '.json', JSON.stringify(meta, null, 2));
  return meta;
}

function save(q, a, taskId) {
  if (!q.audio) die('SUCCESS 但无 audio 字段');
  const ext = (q.response_format || a.format || 'wav').toLowerCase();
  return deliver(Buffer.from(q.audio, 'base64'), a, {
    ext,
    taskId: taskId || q.task_id,
    task: q.task,
    sample_rate: q.sample_rate,
    rewritten_caption: q.rewritten_caption,
    rewritten_lyrics: q.rewritten_lyrics,
  });
}

main().catch(e => {
  if (e instanceof CliError) { console.error('ERROR: ' + e.message); process.exitCode = e.code; }
  else { console.error('ERROR: ' + (e && e.message ? e.message : String(e))); process.exitCode = 1; }
});
