<script>
  import { onMount } from "svelte";
  import { onKey, moveFocus } from "../keyboard/index.js";
  import { setSoftkeys, showToast } from "../stores/ui.js";
  import { softkeyMenu } from "../stores/softkey.js";

  // ── 这一页干什么 ─────────────────────────────────────────────────────
  // 真机上验证**软键菜单 (二级/三级操作)** 的一套手动测试页:
  //   1. 换"变体" → 看软键栏的「更多」菜单在不同菜单树下的表现
  //   2. 打开菜单 → ↑↓ 选, 中键进下一级 / 执行, 退格回上一级
  //   3. 每执行一个动作, 页面会记一笔 (菜单关掉后就能看到)
  //
  // 菜单树是**函数**: 打开菜单的那一刻才求值, 所以换变体只要改 variant,
  // 不必重新注册 (菜单树跟着按键作用域一起注册/释放, 不会漏到别的页面)。
  //
  // 动作本身不弹 toast —— 菜单打开时 toast 会被菜单面板挡住, 看不清。
  // 改成记在页面上, 关掉菜单就能看到"刚才到底按中了哪一项"。

  /** 最近一次动作 */
  let lastAction = "";
  /** 动作计数 (按了几次) */
  let actionCount = 0;
  /** 当前变体下标 */
  let variant = 0;

  /**
   * 记一笔动作
   * @param {string} name
   */
  function act(name) {
    lastAction = name;
    actionCount += 1;
  }

  // ── 菜单变体 ─────────────────────────────────────────────────────────
  const VARIANTS = [
    {
      name: "基础两级",
      desc: "二级菜单 + 两个带子项的项 (分享/举报)",
      build: () => ({
        slot: "right",
        label: "更多",
        title: "更多操作",
        items: [
          { label: "UP 主页", action: () => act("UP 主页") },
          {
            label: "分享",
            items: [
              { label: "复制链接", action: () => act("分享 › 复制链接") },
              { label: "分享给好友", action: () => act("分享 › 分享给好友") }
            ]
          },
          {
            label: "举报",
            items: [
              { label: "不友善", action: () => act("举报 › 不友善") },
              { label: "垃圾广告", action: () => act("举报 › 垃圾广告") },
              { label: "其他", action: () => act("举报 › 其他") }
            ]
          }
        ]
      })
    },
    {
      name: "带禁用项",
      desc: "禁用的项应该是灰的, 按中键没反应",
      build: () => ({
        slot: "right",
        label: "更多",
        title: "更多操作",
        items: [
          { label: "UP 主页", action: () => act("UP 主页") },
          { label: "不可用项", disabled: true, action: () => act("不该被触发") },
          {
            label: "分享",
            items: [
              { label: "复制链接", action: () => act("分享 › 复制链接") },
              { label: "也不可用", disabled: true, action: () => act("不该被触发") }
            ]
          }
        ]
      })
    },
    {
      name: "四级深菜单",
      desc: "测层级栈: 一级套一级, 退格键逐级回退",
      build: () => ({
        slot: "right",
        label: "更多",
        title: "更多操作",
        items: [
          {
            label: "第一层",
            items: [
              {
                label: "第二层",
                items: [
                  {
                    label: "第三层",
                    items: [{ label: "第四层", action: () => act("第四层") }]
                  }
                ]
              }
            ]
          }
        ]
      })
    },
    {
      name: "空菜单",
      desc: "没有菜单项 → 按「更多」应该什么都不发生",
      build: () => ({
        slot: "right",
        label: "更多",
        title: "更多操作",
        items: []
      })
    }
  ];

  /**
   * 当前变体的菜单树
   *
   * 每次打开菜单时求值 —— 所以换变体后不用重新注册。
   * @returns {Object}
   */
  function buildMenu() {
    return VARIANTS[variant].build();
  }

  /**
   * 把菜单树摊平成带缩进的行, 给页面画预览
   * @param {Array} items
   * @param {number} depth
   * @returns {Array<{label: string, depth: number, sub: boolean, disabled: boolean}>}
   */
  function flatten(items, depth) {
    const out = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const hasSub = !!(it.items && it.items.length);
      out.push({
        label: it.label,
        depth: depth,
        sub: hasSub,
        disabled: !!it.disabled
      });
      if (hasSub) {
        const deeper = flatten(it.items, depth + 1);
        for (let j = 0; j < deeper.length; j++) out.push(deeper[j]);
      }
    }
    return out;
  }

  // 预览跟着变体走 (菜单树是现算的, 不用真打开菜单)
  $: preview = flatten(VARIANTS[variant].build().items || [], 0);

  // 软键栏: 右软键交给菜单 (label 会被菜单树的 label 接管),
  // 中间提示中键的作用。菜单关着时中键 = 选中下面那行变体。
  $: setSoftkeys("", "更多", "选择");

  onMount(() => {
    // menu 是**函数**: 打开菜单那一刻才求值 → 换变体立刻生效。
    // 菜单跟着这个作用域一起释放, 不会漏到别的页面。
    return onKey(
      "menu-test",
      {
        // 上下在变体列表里移动 (变体按钮都带 data-navable)
        Down: () => moveFocus(+1),
        Up: () => moveFocus(-1)
      },
      {
        softkeys: true,
        menu: () => buildMenu()
      }
    );
  });

  /**
   * 换变体
   * @param {number} i
   */
  function pickVariant(i) {
    variant = i;
    showToast("已切换到「" + VARIANTS[i].name + "」");
  }
</script>

<div class="screen">
  <div class="main scroll-y">
    <div class="title">菜单测试</div>
    <div class="hint">右软键「更多」→ 二级菜单 → 有子项的再进一级</div>

    <!-- 最近一次动作 -->
    <div class="card last">
      <div class="last-label">最近动作</div>
      {#if lastAction}
        <div class="last-main">{lastAction}</div>
        <div class="last-meta">共执行 {actionCount} 次</div>
      {:else}
        <div class="last-main none">还没有动作</div>
        <div class="last-meta">打开菜单选一项试试</div>
      {/if}
    </div>

    <!-- 变体选择 -->
    <div class="section">菜单变体 (↑↓ 选中, 中键切换)</div>
    <div class="variants">
      {#each VARIANTS as v, i}
        <div
          class="vrow"
          class:active={i === variant}
          data-navable
          tabindex="0"
          role="button"
          on:click={() => pickVariant(i)}
        >
          <span class="vname">{v.name}</span>
          <span class="vdesc">{v.desc}</span>
        </div>
      {/each}
    </div>

    <!-- 当前变体的菜单树预览 -->
    <div class="section">当前菜单树 (打开后应该长这样)</div>
    <div class="tree">
      {#if preview.length}
        {#each preview as p}
          <div class="trow" class:sub={p.sub} class:dis={p.disabled}>
            <span class="tlabel">{p.label}</span>
            {#if p.disabled}<span class="tflag">禁用</span>{/if}
            {#if p.sub}<span class="tflag sub">有子项</span>{/if}
          </div>
        {/each}
      {:else}
        <div class="trow none">（空 —— 按「更多」不会打开任何东西）</div>
      {/if}
    </div>

    <!-- 按键说明 -->
    <div class="section">按键</div>
    <div class="keys">
      <div class="krow"><span class="kk">右软键</span><span class="kv">打开 / 关闭菜单</span></div>
      <div class="krow"><span class="kk">↑ ↓</span><span class="kv">在当前层移动高亮 (到头绕圈)</span></div>
      <div class="krow"><span class="kk">中键</span><span class="kv">有子项则进下一级, 否则执行动作</span></div>
      <div class="krow"><span class="kk">→</span><span class="kv">同上 (进下一级)</span></div>
      <div class="krow"><span class="kk">← / 退格</span><span class="kv">回上一级 (在二级就整个关掉)</span></div>
      <div class="krow"><span class="kk">左软键</span><span class="kv">同退格键</span></div>
    </div>

    <div class="ua">
      菜单状态: {$softkeyMenu.open ? "打开中" : "关闭"} ·
      层级: {$softkeyMenu.stack.length}
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

  /* ---- 最近动作 ---- */
  .card {
    margin: 0 6px 6px;
    padding: 5px 8px;
    border-radius: var(--md-sys-shape-corner-medium);
    background: var(--md-sys-color-surface-container);
  }

  .last-label {
    font-size: var(--md-sys-typescale-label-small-size);
    color: var(--md-sys-color-on-surface-variant);
  }

  .last-main {
    font-size: var(--md-sys-typescale-body-large-size);
    font-weight: 600;
    color: var(--md-sys-color-primary);
    margin-top: 1px;
    word-break: break-all;
  }

  .last-main.none {
    color: var(--md-sys-color-on-surface-variant);
    font-weight: 400;
  }

  .last-meta {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
    margin-top: 1px;
  }

  /* ---- 分节 ---- */
  .section {
    padding: 6px 6px 2px;
    font-size: var(--md-sys-typescale-label-medium-size);
    font-weight: 600;
    color: var(--md-sys-color-on-surface);
  }

  /* ---- 变体 ---- */
  .vrow {
    display: flex;
    flex-direction: column;
    padding: 4px 8px;
    background: var(--md-sys-color-surface);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
  }

  .vrow:focus,
  .vrow:hover {
    background: var(--md-sys-color-primary-container);
  }

  .vrow.active {
    background: var(--md-sys-color-surface-container-high);
  }

  .vrow.active .vname {
    color: var(--md-sys-color-primary);
  }

  .vname {
    font-size: var(--md-sys-typescale-body-large-size);
    font-weight: 600;
    color: var(--md-sys-color-on-surface);
  }

  .vdesc {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
  }

  /* ---- 菜单树预览 ---- */
  .trow {
    display: flex;
    align-items: center;
    padding: 3px 8px;
    background: var(--md-sys-color-surface);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    font-size: var(--md-sys-typescale-body-medium-size);
    color: var(--md-sys-color-on-surface);
  }

  .trow.sub {
    padding-left: 18px;
  }

  .trow.dis {
    color: var(--md-sys-color-outline);
  }

  .trow.none {
    color: var(--md-sys-color-on-surface-variant);
  }

  .tlabel {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tflag {
    flex-shrink: 0;
    margin-left: 4px;
    padding: 0 4px;
    border-radius: 6px;
    font-size: var(--md-sys-typescale-label-small-size);
    background: var(--md-sys-color-surface-container-highest);
    color: var(--md-sys-color-on-surface-variant);
  }

  .tflag.sub {
    background: var(--md-sys-color-secondary-container);
    color: var(--md-sys-color-on-secondary-container);
  }

  /* ---- 按键说明 ---- */
  .krow {
    display: flex;
    align-items: baseline;
    padding: 2px 8px;
    font-size: var(--md-sys-typescale-body-small-size);
  }

  .kk {
    flex: 0 0 52px;
    font-weight: 600;
    color: var(--md-sys-color-on-surface);
  }

  .kv {
    flex: 1 1 auto;
    min-width: 0;
    color: var(--md-sys-color-on-surface-variant);
  }

  .ua {
    padding: 6px 8px 10px;
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-outline);
  }
</style>
