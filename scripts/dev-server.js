// KaiOS 2.4 dev server
// - 启动 rollup -c -w 子进程 (持续构建)
// - 等 build/app.js 生成后，起 express 服务器：静态文件 + 5 条 B 站 API 代理（带 buvid cookie 注入）
//
// rollup-plugin-serve 不支持代理（验证过其源码），所以 B 站 5 条 API 路由必须由 express 中间件承担。
// 这样避免了 CORS / 双端口 / 双终端的代价。

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const buildDir = path.join(projectRoot, 'build');
const require = createRequire(import.meta.url);

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const history = require('connect-history-api-fallback');
const crypto = require('node:crypto');

// B 站风控要求：缺失 buvid 会返回 -412
function generateBuvid() {
  const hex32 = crypto.randomBytes(16).toString('hex');
  const buvid3 = hex32 + crypto.randomBytes(4).toString('hex');
  const ts = Date.now();
  const buvid4 = crypto.randomUUID().toUpperCase() + ts;
  const b_nut = ts;
  return { buvid3, buvid4, b_nut };
}

// 代理配置：改写 Referer / User-Agent，注入 buvid cookie
function makeProxy(target) {
  const buvid = generateBuvid();
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    secure: true,
    pathRewrite: { '^/(api|passport|vc|app|search)-proxy': '' },
    onProxyReq(proxyReq, req) {
      proxyReq.setHeader('Referer', 'https://www.bilibili.com/');
      proxyReq.setHeader('Origin', 'https://www.bilibili.com');
      proxyReq.setHeader(
        'User-Agent',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );
      let cookie = req.headers['x-cookie'] || req.headers['cookie'] || '';
      if (!cookie.includes('buvid3')) cookie += (cookie ? '; ' : '') + 'buvid3=' + buvid.buvid3;
      if (!cookie.includes('buvid4')) cookie += '; buvid4=' + buvid.buvid4;
      if (!cookie.includes('b_nut')) cookie += '; b_nut=' + buvid.b_nut;
      proxyReq.setHeader('Cookie', cookie);
    }
  });
}

// 1. spawn rollup watch 子进程
const isWin = process.platform === 'win32';
const rollup = spawn(
  isWin ? 'npx' : 'npx',
  ['rollup', '-c', '-w'],
  { stdio: 'inherit', cwd: projectRoot, env: { ...process.env, ROLLUP_WATCH: 'true' }, shell: isWin }
);

const shutdown = (sig) => {
  console.log(`\n[dev-server] received ${sig}, killing rollup`);
  rollup.kill(sig);
  process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
rollup.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`[dev-server] rollup exited with code ${code}`);
    process.exit(code);
  }
});

// 2. 等 build/app.js 出现后启动 server
const startServer = () => {
  const app = express();

  // 代理路由必须在 history() 之前，否则会被 SPA fallback 拦截
  app.use('/api-proxy',      makeProxy('https://api.bilibili.com'));
  app.use('/passport-proxy', makeProxy('https://passport.bilibili.com'));
  app.use('/vc-proxy',       makeProxy('https://api.vc.bilibili.com'));
  app.use('/app-proxy',      makeProxy('https://app.bilibili.com'));
  app.use('/search-proxy',   makeProxy('https://s.search.bilibili.com'));

  // SPA fallback: 必须在代理之后，否则代理请求会被重定向到 index.html
  app.use(history({ index: '/index.html' }));

  app.use(express.static(buildDir));

  http.createServer(app).listen(4173, '0.0.0.0', () => {
    console.log('[dev-server] http://localhost:4173');
  });
};

const poll = setInterval(() => {
  if (fs.existsSync(path.join(buildDir, 'app.js'))) {
    clearInterval(poll);
    startServer();
  }
}, 250);

// 兜底：30 秒后没生成 bundle 就报错退出
setTimeout(() => {
  if (!fs.existsSync(path.join(buildDir, 'app.js'))) {
    console.error('[dev-server] build/app.js not produced within 30s, aborting');
    process.exit(1);
  }
}, 30000);
