<script>
  import { onMount, onDestroy } from 'svelte';
  import { webQrGenerate, webQrPoll, extractCookiesFromUrl } from '../api/auth.js';
  import { webLogin } from '../stores/user.js';
  import { getNav } from '../api/user.js';
  import { navigate } from '../router/index.js';
  import { onKey, offKey } from '../keyboard/index.js';
  import { setSoftkeys, showToast } from '../stores/ui.js';
  import Loading from '../components/Loading.svelte';
  import QRCode from '../components/QRCode.svelte';

  let stage = 'init';   // init | qr | scanning | success | error
  let qrUrl = '';
  let qrcodeKey = '';
  let errMsg = '';
  let pollTimer = null;
  let pollHint = '请用哔哩哔哩 App 扫码';

  // 状态码 → 用户提示
  const POLL_HINTS = {
    86101: '请使用哔哩哔哩 App 扫码',
    86090: '已扫码, 请在手机上点击「登录」',
    86038: '二维码已失效, 请重新生成'
  };

  async function startLogin() {
    stage = 'qr';
    errMsg = '';
    stopPoll();
    try {
      const d = await webQrGenerate();
      qrUrl = d.url;
      qrcodeKey = d.qrcode_key;
      stage = 'scanning';
      startPoll();
    } catch (e) {
      errMsg = e.message || '生成二维码失败';
      stage = 'error';
    }
  }

  function startPoll() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(pollOnce, 2000);
  }

  function stopPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function pollOnce() {
    if (!qrcodeKey) return;
    try {
      const resp = await webQrPoll(qrcodeKey);
      // 顶层 code 恒为 0; 真实状态在 data.code
      if (!resp || !resp.data) {
        pollHint = '网络异常, 重试中...';
        return;
      }
      const data = resp.data;
      const statusCode = data.code;

      if (statusCode === 0) {
        // 登录成功
        stopPoll();
        const cookies = extractCookiesFromUrl(data.url || '');
        if (!cookies || !cookies.sessdata) {
          errMsg = '登录成功但未取到 cookie';
          stage = 'error';
          return;
        }
        // 存到 store
        webLogin({
          sessdata: cookies.sessdata,
          bili_jct: cookies.bili_jct,
          mid: parseInt(cookies.dedeUserID) || 0,
          name: '',
          face: ''
        });
        // 拉一次 nav 拿 name/face
        try {
          const nav = await getNav();
          if (nav && nav.isLogin) {
            webLogin({
              sessdata: cookies.sessdata,
              bili_jct: cookies.bili_jct,
              mid: nav.mid,
              name: nav.uname,
              face: nav.face
            });
          }
        } catch (e) { /* ignore */ }
        stage = 'success';
        showToast('登录成功');
        setTimeout(() => navigate('#/profile'), 1000);
      } else if (POLL_HINTS[statusCode]) {
        pollHint = POLL_HINTS[statusCode];
        if (statusCode === 86038) {
          stopPoll();
          errMsg = POLL_HINTS[statusCode];
          stage = 'error';
        }
      } else {
        pollHint = '等待扫码 (' + statusCode + ')';
      }
    } catch (e) {
      // 网络错误忽略, 继续轮询
    }
  }

  onMount(() => {
    setSoftkeys('刷新', '返回');
    onKey('login', {
      '5': () => startLogin(),
      '0': () => startLogin()
    });
    startLogin();
  });

  onDestroy(() => {
    offKey('login');
    stopPoll();
  });
</script>

<div class="screen">
  <div class="main">
    {#if stage === 'init'}
      <Loading message="初始化..." />
    {:else if stage === 'qr' || stage === 'scanning'}
      <div class="qr-area">
        <div class="hint-title">扫码登录</div>
        <QRCode text={qrUrl} cellSize={2} ecl="M" />
        <div class="hint">用哔哩哔哩 App 扫描上方二维码</div>
        <div class="status">{pollHint}</div>
        <div class="status small">有效期 3 分钟</div>
      </div>
    {:else if stage === 'success'}
      <div class="success">
        <div class="success-icon">✓</div>
        <p class="success-title">登录成功</p>
        <p class="hint">正在跳转...</p>
      </div>
    {:else if stage === 'error'}
      <div class="error">
        <div class="error-icon">✕</div>
        <p class="error-title">登录失败</p>
        <p class="err-msg">{errMsg}</p>
        <p class="hint">按 0 重试</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .qr-area {
    padding: 8px;
    font-size: var(--md-sys-typescale-body-medium-size);
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .hint-title {
    color: var(--md-sys-color-primary);
    font-size: var(--md-sys-typescale-title-medium-size);
    font-weight: var(--md-sys-typescale-title-medium-weight);
    margin-bottom: 4px;
  }
  .hint {
    color: var(--md-sys-color-on-surface-variant);
    font-size: var(--md-sys-typescale-body-small-size);
    margin: 4px 0;
    text-align: center;
  }
  .status {
    color: var(--md-sys-color-primary);
    font-size: var(--md-sys-typescale-body-medium-size);
    margin-top: 4px;
    text-align: center;
    font-weight: 500;
  }
  .status.small {
    color: var(--md-sys-color-on-surface-variant);
    font-size: var(--md-sys-typescale-body-small-size);
    font-weight: 400;
  }
  .success {
    padding: 20px 8px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .success-icon {
    font-size: 32px;
    color: var(--md-sys-color-primary);
    margin-bottom: 4px;
  }
  .success-title {
    color: var(--md-sys-color-primary);
    font-size: var(--md-sys-typescale-title-large-size);
    font-weight: var(--md-sys-typescale-title-large-weight);
  }
  .error {
    padding: 16px 8px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .error-icon {
    font-size: 32px;
    color: var(--md-sys-color-error);
    margin-bottom: 4px;
  }
  .error-title {
    color: var(--md-sys-color-error);
    font-size: var(--md-sys-typescale-title-large-size);
    font-weight: var(--md-sys-typescale-title-large-weight);
  }
  .err-msg {
    color: var(--md-sys-color-on-surface-variant) !important;
    font-size: var(--md-sys-typescale-body-medium-size) !important;
    margin-top: 4px;
  }
</style>
