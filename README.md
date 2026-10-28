# 汇线

一个桌面窗口，里面是 ChatGPT、Claude、Gemini、Grok 四个**互相隔开的网页会话**。

你在每一席的官方页面里登录自己的账号。登录态留在这台电脑上，不上传，也不走 API key。

## 跑起来

需要 Node 20 或更新。Windows、macOS、Linux 都可以。

```bash
npm install
npm start
```

第一次打开，右边就是各家自己的网站。点左边某一席，在那个页面里登录。关掉再开，分区还在，一般不用重登。

- **单席**：只把文字送进当前这一页。
- **并送**：同一句送进勾着的每一席。
- **四格**：四页同时看见。
- **交给下一席**：从当前页读回答（或你选中的文字），贴进下一席。读不到时，先用鼠标选中那段话。

右键页面可以粘贴、刷新、回到首页。Ctrl/⌘ + Enter 送出。

## 云端

0.2 把同一件事放到一台云电脑上：四块屏仍然隔开，登录留在服务器的 profile 里，人不在线也还在。

```bash
cd cloud && npm install && npx playwright install chromium && npm start
```

或者在仓库根目录：

```bash
docker compose up --build
```

然后调一次：

```bash
curl -s http://127.0.0.1:8787/v1/state
curl -s -X POST http://127.0.0.1:8787/v1/call \
  -H 'content-type: application/json' \
  -d '{"seat":"gpt","text":"用一句话说你看见的页面"}'
```

改「送出前加上的话」，再点「做成新版本」，就是下一次迭代。`POST /v1/versions/use` 把某一版调回来。对外部署时设 `HUIXIAN_TOKEN`，请求带 `Authorization: Bearer ...`。

画面上出现登录页或验证码时，状态是「需要接管」：点画面、打字、回车，由你自己登。程序不保存密码。

## 它做不到的

各家没有「把我的 ChatGPT 会员登录授权给你」这种接口。所以这不是 API，也不是嵌入在别人网站里的 iframe。网页版产品嵌不进 `chatgpt.com`。

自动填入靠的是页面上的输入框。对方一改版，送出就可能失败。失败时文字会进剪贴板，你贴一下就行。

Google 有时会拒绝在套壳浏览器里登录 Gemini。程序已经去掉了 Electron 的标识。若登录页仍写「此浏览器不安全」，那是 Google 拦嵌套浏览器，不是你少填了一把钥匙。

不要用这个程序去撞各家的使用条款。登录的是你自己的账号，频率自己看着办。

## 许可

MIT。见 [LICENSE](./LICENSE)。
