<script>
  import { onMount } from "svelte";
  import { onKey, SYSTEM_KEYS, describe } from "../keyboard/index.js";
  import { canonicalKey, isTextKey, KEY, learnedKeyCodes } from "../keyboard/keys.js";
  import { keytest, recordKey, clearKeytest } from "../stores/keytest.js";
  import { back } from "../router/index.js";

  // ── 框架关心的键 → 期望的原始 DOM key 名 ──────────────────────────────
  //
  // 期望值来自 Gecko 48 的 dom/events/KeyNameList.h (KaiOS 2.4 实际能产生的
  // key 名) 和 dom/interfaces/events/nsIDOMKeyEvent.idl (keyCode)。
  //
  // 这一页的意义就是拿**真机的实测值**去对这张表:
  //   实测 e.key == 期望  → 框架按预期识别
  //   实测 e.key != 期望  → 是别名 (框架仍能归一化, 但说明这台机器/这个版本
  //                          和官方表格有出入, 得记下来)
  //   实测 keyCode != 期望 → 静态兜底表在这台机器上不准
  //                          (KaiOS 3 的音量键就是反的, 靠运行时自学习纠正)
  const LABEL = {
    Up: "方向上",
    Down: "方向下",
    Left: "方向左",
    Right: "方向右",
    Enter: "中键",
    SoftLeft: "左软键",
    SoftRight: "右软键",
    Back: "退格",
    VolumeUp: "音量加",
    VolumeDown: "音量减",
    Mute: "静音",
    Camera: "相机",
    Call: "通话",
    EndCall: "挂断",
    Power: "电源",
    Symbol: "符号",
    Notification: "通知"
  };

  const ORDER = [
    "Up", "Down", "Left", "Right",
    "Enter",
    "SoftLeft", "SoftRight",
    "Back",
    "VolumeUp", "VolumeDown", "Mute",
    "Camera", "Call", "EndCall", "Power", "Symbol", "Notification"
  ];

  const ROWS = ORDER.map(function (name) {
    const def = KEY[name] || { key: name, code: 0 };
    return { name: name, label: LABEL[name] || name, dom: def.key, code: def.code };
  });

  const ROW_BY_NAME = {};
  for (let i = 0; i < ROWS.length; i++) ROW_BY_NAME[ROWS[i].name] = ROWS[i];

  const ua = typeof navigator !== "undefined" ? String(navigator.userAgent || "") : "";

  // 自学习表: 引用 $keytest.total 才会跟着按键事件刷新
  $: learned = $keytest.total >= 0 ? learnedKeyCodes() : {};

  // 已捕获的键 → 原始信息
  //
  // 注意: 下面几个辅助函数都把 seen 当**参数**传进去, 不能在函数体里直接读
  // $keytest —— Svelte 编译模板时只能静态分析表达式里的依赖, 函数内部的
  // $keytest 访问它追踪不到, $keytest 变了也不会重新求值 (判定列会一直停在
  // "待测")。走这个顶层变量, 模板表达式才真的依赖上它。
  $: seen = $keytest.seen;

  // 表格之外抓到的键 (比如这台机器上报了 'End' / 'Send' 这种框架没定义的)
  $: extras = Object.keys(seen).filter(function (k) {
    return !ROW_BY_NAME[k];
  });

  // 当前生效的按键作用域 (谁在抢键一目了然)
  // 依赖 $keytest.total, 每次按键后刷新一次
  $: scopes = $keytest.total >= 0 ? describe() : [];

  /**
   * 某个规范名的判定结果
   * @param {Object} seen 已捕获的键
   * @param {string} name
   * @returns {{cls: string, text: string}}
   */
  function verdict(seen, name) {
    const s = seen[name];
    if (!s) return { cls: "pending", text: "待测" };
    const row = ROW_BY_NAME[name];
    if (row && s.dom !== row.dom) return { cls: "alias", text: "别名" };
    if (row && s.keyCode !== row.code) return { cls: "kc", text: "码差" };
    return { cls: "ok", text: "一致" };
  }

  /**
   * keyCode 单元格: 实测/期望
   * @param {Object} seen
   * @param {string} name
   * @returns {string}
   */
  function kcText(seen, name) {
    const s = seen[name];
    const row = ROW_BY_NAME[name];
    if (!s) return "-";
    if (!row) return String(s.keyCode);
    return s.keyCode + "/" + row.code;
  }

  /**
   * keyCode 与静态表不一致时标红
   * @param {Object} seen
   * @param {string} name
   * @returns {boolean}
   */
  function kcBad(seen, name) {
    const s = seen[name];
    const row = ROW_BY_NAME[name];
    return !!(s && row && s.keyCode !== row.code);
  }

  /**
   * 原始事件捕获
   *
   * 用**捕获阶段**挂在 window 上 —— 比按键总线 (冒泡阶段) 更早触发,
   * 拿到的是完全未经框架处理的原始事件。
   * @param {KeyboardEvent} e
   */
  function onRawKeyDown(e) {
    const name = canonicalKey(e);
    recordKey({
      dom: e.key || "",
      code: e.code || "",
      keyCode: e.keyCode || 0,
      repeat: !!e.repeat,
      name: name,
      text: isTextKey(name)
    });
  }

  onMount(() => {
    window.addEventListener("keydown", onRawKeyDown, true);
    const off = onKey(
      "keytest",
      // 本页不绑定任何快捷键 —— 返回/清空是页面下方的按钮, 不是按键
      {},
      {
        priority: 50,
        // 本页要吃掉**所有**按键: 不能让任何键把检测页带走。
        // 返回键家族尤其重要 —— 否则按退格键/挂断键就退出页面了, 根本测不完。
        // 返回和清空改用页面下方的按钮。
        catchAll: (e, key) => {
          // 方向键/中键放行: 框架默认行为 (焦点漫游 + 激活按钮) 要继续工作
          if (
            key === "Up" ||
            key === "Down" ||
            key === "Left" ||
            key === "Right" ||
            key === "Enter"
          ) {
            return false;
          }
          // 系统键放行: 官方要求永远别拦着用户离开应用
          if (SYSTEM_KEYS.indexOf(key) >= 0) return false;
          // 其余一律吞掉
          return true;
        },
        // 软键栏不挂快捷键, 只提示中键的作用
        // 注意顺序是 [左, 右, 中]
        softkeys: ["", "", "选择"]
      }
    );
    return () => {
      window.removeEventListener("keydown", onRawKeyDown, true);
      off();
    };
  });
</script>

<div class="screen">
  <!-- 不用 data-nav-root: 整页是一个线性区域, 方向键能从表格一路走到底部按钮 -->
  <div class="main scroll-y">
    <div class="title">按键检测</div>
    <div class="hint">依次按下实体按键, 看下面哪一栏变了</div>

    <!-- 最新一次按键 -->
    <div class="card last">
      {#if $keytest.last}
        <div class="last-main">
          <span class="dom">{$keytest.last.dom || "(空)"}</span>
          <span class="arr">&rarr;</span>
          <span class="norm {$keytest.last.name ? "ok" : "bad"}">
            {$keytest.last.name || "未识别"}
          </span>
        </div>
        <div class="last-meta">
          code={$keytest.last.code || "-"} &middot; kc={$keytest.last.keyCode} &middot;
          {$keytest.last.repeat ? "长按" : "短按"}{$keytest.last.text ? " &middot; 文字键" : ""}
        </div>
      {:else}
        <div class="last-meta">还没有收到按键事件</div>
      {/if}
    </div>

    <!-- 对照表 -->
    <div class="thead">
      <span class="c-name">规范名</span>
      <span class="c-label">硬件</span>
      <span class="c-dom">实测 e.key</span>
      <span class="c-kc">kc</span>
      <span class="c-v">判定</span>
    </div>

    {#each ROWS as row (row.name)}
      <div class="trow" data-navable tabindex="0">
        <span class="c-name">{row.name}</span>
        <span class="c-label">{row.label}</span>
        <span class="c-dom">{seen[row.name] ? seen[row.name].dom : "-"}</span>
        <span class="c-kc" class:bad={kcBad(seen, row.name)}>{kcText(seen, row.name)}</span>
        <span class="c-v {verdict(seen, row.name).cls}">{verdict(seen, row.name).text}</span>
      </div>
    {/each}

    <!-- 表格之外的键 -->
    {#if extras.length}
      <div class="section">框架没定义的键</div>
      {#each extras as name (name)}
        <div class="trow extra">
          <span class="c-name">{name}</span>
          <span class="c-label">-</span>
          <span class="c-dom">{seen[name].dom}</span>
          <span class="c-kc">{seen[name].keyCode}</span>
          <span class="c-v alias">别名</span>
        </div>
      {/each}
    {/if}

    <!-- 认不出来的原始 key -->
    <div class="section">框架认不出来的 e.key</div>
    <div class="note">
      {#if $keytest.unknown.length}
        {$keytest.unknown.join(" / ")}
      {:else}
        暂无
      {/if}
    </div>

    <!-- 运行时自学习表 -->
    <div class="section">自学习表 keyCode &rarr; 规范名</div>
    <div class="note">
      {#if Object.keys(learned).length}
        {#each Object.keys(learned) as code (code)}
          <span class="chip">{code} &rarr; {learned[code]}</span>
        {/each}
      {:else}
        暂无
      {/if}
    </div>

    <!-- 事件日志 -->
    <div class="section">事件日志 (最近 6 条)</div>
    <div class="log">
      {#each $keytest.log.slice(0, 6) as ev (ev.id)}
        <div class="log-row">
          <span class="l-dom">{ev.dom || "(空)"}</span>
          <span class="l-norm">{ev.name || "未识别"}</span>
          <span class="l-kc">kc{ev.keyCode}</span>
        </div>
      {/each}
    </div>

    <!-- 当前生效的按键作用域 -->
    <div class="section">当前作用域 (谁在抢键)</div>
    <div class="note">
      {#if scopes.length}
        {#each scopes as s (s)}
          <span class="chip">{s}</span>
        {/each}
      {:else}
        暂无
      {/if}
    </div>

    <div class="ua">{ua}</div>

    <!-- 底部按钮: 返回 / 清空 不绑快捷键, 用方向键选中后按中键 -->
    <div class="actions">
      <div class="btn" data-navable tabindex="0" role="button" on:click={clearKeytest}>
        清空记录
      </div>
      <div class="btn" data-navable tabindex="0" role="button" on:click={() => back()}>
        返回
      </div>
    </div>
  </div>
</div>

<style>
  .screen {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .main {
    flex: 1;
    min-height: 0;
    background: var(--md-sys-color-surface-bright);
  }

  .title {
    padding: 6px 6px 2px;
    font-size: var(--md-sys-typescale-title-medium-size);
    font-weight: var(--md-sys-typescale-title-medium-weight);
    color: var(--md-sys-color-on-surface);
  }

  .hint {
    padding: 0 6px 4px;
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
  }

  /* ---- 最新按键 ---- */
  .card {
    margin: 0 6px 6px;
    padding: 5px 8px;
    border-radius: var(--md-sys-shape-corner-medium);
    background: var(--md-sys-color-surface-container);
  }

  .last-main {
    display: flex;
    align-items: baseline;
    gap: 4px;
  }

  .dom {
    font-size: 13px;
    font-weight: 600;
    color: var(--md-sys-color-on-surface);
    max-width: 96px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .arr {
    font-size: 11px;
    color: var(--md-sys-color-on-surface-variant);
  }

  .norm {
    font-size: 13px;
    font-weight: 600;
  }

  .norm.ok {
    color: var(--md-sys-color-primary);
  }

  .norm.bad {
    color: var(--md-sys-color-error);
  }

  .last-meta {
    margin-top: 2px;
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
  }

  /* ---- 对照表 ---- */
  .thead,
  .trow {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 1px 6px;
    font-size: 9px;
    line-height: 13px;
  }

  .thead {
    font-weight: 600;
    color: var(--md-sys-color-on-surface-variant);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
  }

  .trow {
    background: var(--md-sys-color-surface);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
  }

  .trow:focus,
  .trow:hover {
    background: var(--md-sys-color-surface-container-high);
  }

  .c-name {
    flex: 1 1 52px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
    color: var(--md-sys-color-on-surface);
  }

  .c-label {
    flex: 0 0 30px;
    color: var(--md-sys-color-on-surface-variant);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .c-dom {
    flex: 1 1 52px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--md-sys-color-on-surface);
  }

  .c-kc {
    flex: 0 0 36px;
    text-align: right;
    color: var(--md-sys-color-on-surface-variant);
  }

  .c-kc.bad {
    color: var(--md-sys-color-error);
    font-weight: 600;
  }

  .c-v {
    flex: 0 0 28px;
    text-align: right;
    color: var(--md-sys-color-on-surface-variant);
  }

  .c-v.ok {
    color: var(--md-sys-color-primary);
    font-weight: 600;
  }

  .c-v.alias {
    color: #8a6100;
  }

  .c-v.kc {
    color: #8a6100;
  }

  .trow.extra {
    background: var(--md-sys-color-surface-container-low);
  }

  /* ---- 分节 ---- */
  .section {
    padding: 6px 6px 2px;
    font-size: var(--md-sys-typescale-label-medium-size);
    font-weight: 600;
    color: var(--md-sys-color-on-surface);
  }

  .note {
    padding: 0 6px 4px;
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
    word-break: break-all;
  }

  .chip {
    display: inline-block;
    margin: 1px 3px 1px 0;
    padding: 0 4px;
    border-radius: 8px;
    background: var(--md-sys-color-surface-container-high);
    color: var(--md-sys-color-on-surface);
  }

  /* ---- 日志 ---- */
  .log {
    padding: 0 6px;
  }

  .log-row {
    display: flex;
    gap: 6px;
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: 13px;
    color: var(--md-sys-color-on-surface-variant);
  }

  .l-dom {
    flex: 1 1 90px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--md-sys-color-on-surface);
  }

  .l-norm {
    flex: 1 1 90px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .l-kc {
    flex: 0 0 34px;
    text-align: right;
  }

  .ua {
    padding: 6px;
    font-size: 8px;
    color: var(--md-sys-color-outline);
    word-break: break-all;
  }

  /* ---- 底部按钮 (跟内容一起滚动) ---- */
  .actions {
    display: flex;
    gap: 6px;
    padding: 6px 6px 10px;
  }

  .btn {
    flex: 1;
    min-height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--md-sys-shape-corner-medium);
    background: var(--md-sys-color-surface-container-high);
    font-size: var(--md-sys-typescale-body-medium-size);
    color: var(--md-sys-color-on-surface);
    cursor: pointer;
  }

  .btn:focus,
  .btn:hover {
    background: var(--md-sys-color-primary-container);
    color: var(--md-sys-color-on-primary-container);
  }
</style>
