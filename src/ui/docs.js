// 添加音源时的模板 + "接入说明"页面内容
import { esc } from '../core/util.js';

export const TEMPLATES = {
  http: `{
  "type": "http",
  "id": "my-api",
  "name": "我的音源 API",
  "version": "1.0.0",
  "description": "接入一个返回 JSON 的音乐接口",
  "headers": { "Authorization": "Bearer 你的密钥" },
  "search": {
    "url": "https://api.example.com/search?keyword={keyword}&page={page}&limit={pageSize}",
    "list": "data.songs",
    "total": "data.total",
    "fields": {
      "id": "id",
      "title": "name",
      "artist": "artists",
      "album": "album.name",
      "duration": "duration",
      "cover": "album.cover"
    },
    "durationUnit": "ms"
  },
  "url": {
    "url": "https://api.example.com/song/url?id={id}&quality={quality}",
    "path": "data.url"
  },
  "lyric": {
    "url": "https://api.example.com/lyric?id={id}",
    "path": "data.lrc"
  }
}`,
  subsonic: `{
  "type": "http",
  "id": "navidrome",
  "name": "我的 Navidrome",
  "version": "1.0.0",
  "description": "自建 Navidrome / Subsonic 曲库",
  "vars": {
    "server": "https://music.example.com",
    "auth": "u=用户名&p=enc:密码的十六进制&v=1.16.1&c=shell-player&f=json"
  },
  "search": {
    "url": "{server}/rest/search3?query={keyword}&songCount={pageSize}&songOffset={offset}&artistCount=0&albumCount=0&{auth}",
    "list": "subsonic-response.searchResult3.song",
    "pageSize": 30,
    "fields": { "id": "id", "title": "title", "artist": "artist", "album": "album", "duration": "duration" },
    "coverTemplate": "{server}/rest/getCoverArt?id={coverArt}&size=300&{auth}"
  },
  "url": {
    "template": "{server}/rest/stream?id={id}&{auth}"
  }
}`,
  script: `/**
 * @name 我的脚本音源
 * @version 1.0.0
 * @description 用 JS 写的音源，可以做签名、多步请求等 JSON 配置做不到的事
 */
module.exports = {
  // keyword: 关键词（可能为空字符串）；page: 从 1 开始
  async search(keyword, page) {
    const res = await request('https://api.example.com/search?q=' + encodeURIComponent(keyword) + '&page=' + page)
    return {
      list: res.data.map(s => ({
        id: s.id,
        title: s.name,
        artist: s.singer,
        album: s.album,
        duration: s.interval,   // 秒
        cover: s.img
      })),
      hasMore: res.hasMore
    }
  },
  // 返回可以直接播放的音频地址（字符串），或 { url, headers }
  async getUrl(track, quality) {
    const res = await request('https://api.example.com/url?id=' + track.id + '&quality=' + quality)
    return res.url
  },
  // 可选：返回 LRC 文本，或 { lrc, trans }
  async getLyric(track) {
    return await request('https://api.example.com/lrc?id=' + track.id, { type: 'text' })
  },
  // 可选：导入歌单。认不出的链接返回空数组，播放器会交给下一个音源
  async importSheet(url) {
    const id = (url.match(/playlist\/(\d+)/) || [])[1]
    if (!id) return []
    const res = await request('https://api.example.com/playlist?id=' + id)
    return res.songs.map(s => ({ id: s.id, title: s.name, artist: s.singer }))
  }
}`
};

export const DOC_HTML = () => `
<p>「空壳」只负责播放：搜索、播放列表、歌单、下载、歌词。歌从哪里来，完全由你添加的<b>音源</b>决定，播放器本身不内置任何第三方平台的音源。</p>

<h3>支持的音源格式</h3>
<div class="tbl"><table><tr><th>格式</th><th>能做什么</th><th>怎么添加</th></tr>
<tr><td><b>MusicFree 插件</b></td><td>搜索、播放、歌词，插件带 <code>importMusicSheet</code> 时还能导入歌单</td><td>粘贴插件 .js、填插件网址，或填 MusicFree 订阅地址（一次导入一组）</td></tr>
<tr><td><b>洛雪（LX Music）自定义源</b></td><td>只负责<b>取播放地址和歌词</b>，不能搜索</td><td>粘贴 .js 或填网址。需要再配一个能搜索对应平台的音源</td></tr>
<tr><td><b>JSON 配置源</b></td><td>把一个返回 JSON 的接口映射成音源，不用写代码</td><td>点「HTTP API」或「Navidrome」模板修改</td></tr>
<tr><td><b>空壳脚本源</b></td><td>用 JS 写，适合签名、多步请求；可选实现 <code>importSheet</code> 导入歌单</td><td>点「JS 脚本」模板修改</td></tr></table></div>

<h3>洛雪源怎么用</h3>
<p>洛雪源按平台工作（酷我 kw、酷狗 kg、QQ音乐 tx、网易云 wy、咪咕 mg）。播放器会这样调度：</p>
<ol>
<li>先用歌曲所在的音源自己取地址；</li>
<li>取不到时，交给支持该平台的洛雪源（例如 MusicFree 的「QQ音乐」插件搜到的歌，会交给支持 tx 的洛雪源）；</li>
<li>还取不到，并且打开了「失败自动换源」，就去其他音源里搜同名同歌手的歌再试。</li>
</ol>
<p>MusicFree 插件按插件名识别平台；JSON / 脚本源可以在配置里写 <code>"lxKey": "tx"</code> 声明自己的平台，或在每首歌上带 <code>lxKey</code>、<code>songmid</code>、<code>hash</code>、<code>copyrightId</code> 等字段。</p>

<h3>歌曲对象</h3>
<div class="tbl"><table><tr><th>字段</th><th>说明</th></tr>
<tr><td><code>id</code></td><td>在这个音源里唯一，必填</td></tr>
<tr><td><code>title</code> / <code>artist</code> / <code>album</code></td><td>歌名、歌手、专辑。歌手如果是数组会自动用 “ / ” 连接</td></tr>
<tr><td><code>duration</code></td><td>时长，单位秒；也接受 "3:45" 这样的字符串</td></tr>
<tr><td><code>cover</code></td><td>封面图片地址，可省略。播放时界面会按封面取色</td></tr>
<tr><td><code>lyric</code></td><td>可以直接带上 LRC 歌词，这样就不会再调用 getLyric</td></tr>
<tr><td><code>lxKey</code></td><td>平台代号，用于交给洛雪源取地址</td></tr>
<tr><td>其他字段</td><td>原样保留，在 getUrl / getLyric 里能读到（比如 <code>track.mid</code>）</td></tr></table></div>

<h3>JSON 配置源</h3>
<pre><code>${esc(TEMPLATES.http)}</code></pre>
<div class="tbl"><table><tr><th>字段</th><th>说明</th></tr>
<tr><td><code>search.url</code></td><td>搜索地址。可用变量 <code>{keyword}</code> <code>{page}</code> <code>{pageSize}</code> <code>{offset}</code></td></tr>
<tr><td><code>search.list</code></td><td>结果数组在返回 JSON 里的路径，用点分隔，数组下标写数字，例如 <code>data.list</code>、<code>result.0.songs</code></td></tr>
<tr><td><code>search.fields</code></td><td>把接口字段映射成歌曲对象字段，值同样是路径</td></tr>
<tr><td><code>search.total</code></td><td>可选，总数所在路径，用于判断还有没有下一页</td></tr>
<tr><td><code>search.durationUnit</code></td><td><code>"s"</code>（默认）或 <code>"ms"</code></td></tr>
<tr><td><code>search.coverTemplate</code></td><td>可选，用接口原始字段拼封面地址</td></tr>
<tr><td><code>url.url</code> + <code>url.path</code></td><td>请求接口拿播放地址。变量可用歌曲对象的任意字段：<code>{id}</code> <code>{raw.xxx}</code>，以及 <code>{quality}</code></td></tr>
<tr><td><code>url.template</code></td><td>播放地址可以直接拼出来时，用它代替 url.url，不发请求</td></tr>
<tr><td><code>lyric</code></td><td>可选，写法同 url；接口直接返回文本时加 <code>"type": "text"</code>；翻译歌词路径写 <code>transPath</code></td></tr>
<tr><td><code>headers</code> / <code>method</code> / <code>body</code></td><td>全局请求头；每个请求也能单独写 headers、method、body</td></tr>
<tr><td><code>vars</code></td><td>自定义变量（服务器地址、鉴权参数等），<b>原样替换不做 URL 编码</b>；其余变量会自动编码</td></tr>
<tr><td><code>lxKey</code></td><td>可选，声明这个源的歌属于哪个平台</td></tr></table></div>

<h3>例子：自建 Navidrome / Subsonic 曲库</h3>
<pre><code>${esc(TEMPLATES.subsonic)}</code></pre>
<p class="small muted">密码写法见 Subsonic API 文档：<code>p=enc:</code> 后接密码的十六进制；更安全的做法是用 token（<code>t=</code> 和 <code>s=</code>）。</p>

<h3>空壳脚本源</h3>
<p>通过 <code>module.exports</code> 导出一个对象。可以用全局的 <code>request(url, { method, headers, body, type, timeout })</code>（type 为 json / text / blob / raw）和 <code>utils</code>（getPath、parseDur、sleep），也可以 <code>require('axios')</code>、<code>require('crypto-js')</code> 等 MusicFree 插件常用的包。</p>
<pre><code>${esc(TEMPLATES.script)}</code></pre>

<h3>网页版、桌面版、安卓版的区别</h3>
<div class="tbl"><table><tr><th></th><th>网页版</th><th>桌面版 / 安卓版</th></tr>
<tr><td>跨域限制</td><td>有，接口需要允许跨域（CORS）</td><td>没有</td></tr>
<tr><td>自定义请求头（Referer、User-Agent、Cookie）</td><td>浏览器会忽略</td><td>支持</td></tr>
<tr><td>后台播放、系统媒体控制</td><td>看浏览器</td><td>支持（安卓有通知栏控制）</td></tr>
<tr><td>桌面歌词</td><td>无</td><td>桌面版支持</td></tr>
<tr><td>下载</td><td>保存到浏览器下载目录</td><td>保存到「下载/ShellPlayer」</td></tr></table></div>
<p class="small muted">音频地址如果要求特定请求头才能播放（少数插件会返回 headers），网页里的播放器没法带上，这类歌请用下载后播放。</p>

<h3>注意</h3>
<p>音源决定了你听到什么，也决定了合不合法。请只接入你有权使用的内容：自己的曲库、正版授权的接口、公版或 CC 授权音乐。脚本类音源能执行任意代码，只导入你信任的来源。</p>`;
