<script>
  import { onMount } from 'svelte';
  import { ui } from '../stores/ui.js';
  import {
    softkeyMenu, openSoftkeyMenu,
    softkeyMenuMove, softkeyMenuActivate, softkeyMenuBack, softkeyMenuSide,
    softkeyMenuSelect
  } from '../stores/softkey.js';
  import { onKey } from '../keyboard/index.js';

  // ── 概述 ───────────────────────────────────────────────────────────
  // 软键栏是**一级菜单**: 三个格子 (左软键 / 中键提示 / 右软键)。
  // 页面把某个软键"让"给菜单 (onKey(..., { menu })) 后, 按它会展开
  // **二级菜单**; 二级菜单里的项如果还有子项, 再展开**三级菜单**。
  //
  // 菜单打开期间软键栏临时变成菜单的操作提示:
  //   二级: 左 = 关闭   中 = 选择   右 = (空)
  //   三级: 左 = 上一级 中 = 选择   右 = (空)
  // 关掉菜单后软键栏立刻恢复成页面自己的文案 —— 菜单不碰 ui.softkeys。
  //
  // 层级状态在 stores/softkey.js, 这里只负责: 画软键栏 + 画菜单 + 派按键。

  // 菜单打开时软键栏显示的操作提示
  const MENU_CLOSE = '关闭';
  const MENU_BACK = '上一级';
  const MENU_SELECT = '选择';

  // ── 状态 ───────────────────────────────────────────────────────────
  $: menuOpen = $softkeyMenu.open;
  $: registered = $softkeyMenu.registered;
  $: stack = $softkeyMenu.stack;
  $: depth = stack.length;                 // 1 = 二级菜单, 2 = 三级菜单…
  $: frame = depth ? stack[depth - 1] : null;
  $: items = frame ? frame.items : [];
  $: index = $softkeyMenu.index;
  $: crumbs = stack.map(f => f.title).filter(t => !!t);
  // 层级指示点: 菜单树一共几级 (打开菜单时才算得准)
  $: maxDepth = $softkeyMenu.maxDepth || 1;
  $: dots = new Array(maxDepth).fill(0);

  // ── 软键文案 ───────────────────────────────────────────────────────
  // 菜单关着 → 页面自己的文案 (菜单占的那一格换成菜单的 label)
  // 菜单开着 → 菜单的操作提示
  $: leftText = menuOpen
    ? (depth > 1 ? MENU_BACK : MENU_CLOSE)
    : (registered && registered.slot === 'left' && registered.items.length
        ? registered.label
        : ($ui.softkeys.left || ''));

  $: centerText = menuOpen ? MENU_SELECT : ($ui.softkeys.center || '');

  $: rightText = menuOpen
    ? ''
    : (registered && registered.slot === 'right' && registered.items.length
        ? registered.label
        : ($ui.softkeys.right || ''));

  // 菜单占的那一格画个小箭头, 提示"按它会展开菜单"
  $: leftIsMenu = !menuOpen && registered && registered.slot === 'left' && registered.items.length > 0;
  $: rightIsMenu = !menuOpen && registered && registered.slot === 'right' && registered.items.length > 0;

  // ── 按键作用域 ─────────────────────────────────────────────────────
  // 1) 兜底作用域 (priority 50)
  //    页面把某个软键"让"给菜单时, 软键栏接管这个键。
  //    优先级高于页面 (0) —— 菜单接管了就是接管了, 不能又被页面抢走,
  //    否则软键栏显示的文案和按下去的行为会对不上 (本项目的硬规矩:
  //    文案必须和行为一致)。不属于菜单的键一律 return false →
  //    总线继续往下找, 页面照常处理自己的软键。
  //
  // 2) 菜单作用域 (exclusive, priority 100)
  //    菜单打开期间独占按键: 页面收不到上下键, 也不会偷偷换软键文案。
  let menuScope = null;

  /**
   * 按下"菜单占的那个软键" → 展开菜单
   *
   * 不传树: 让 store 自己求值注册的菜单源 (注册的是函数时, 这里才拿到最新的项)
   *
   * @param {string} slot 'left' | 'right'
   * @returns {boolean} 是否处理了 (false = 这个键不归菜单管)
   */
  function openBySlot(slot) {
    if (!registered || registered.slot !== slot) return false;
    if (!registered.items.length) return false;
    return openSoftkeyMenu();
  }

  /**
   * 鼠标点菜单项 (真机上没鼠标, 留着方便桌面调试)
   * @param {number} i
   */
  function pick(i) {
    if (!softkeyMenuSelect(i)) return;
    softkeyMenuActivate();
  }

  onMount(() => {
    const offBar = onKey('softkey-bar', {
      SoftLeft: () => openBySlot('left'),
      SoftRight: () => openBySlot('right')
    }, { priority: 50 });

    // 菜单开 / 关时同步注册 / 注销独占作用域
    const unsub = softkeyMenu.subscribe(s => {
      if (s.open && !menuScope) {
        menuScope = onKey('softkey-menu', {
          Up: () => softkeyMenuMove(-1),
          Down: () => softkeyMenuMove(1),
          Left: () => softkeyMenuSide(-1),
          Right: () => softkeyMenuSide(1),
          Enter: () => softkeyMenuActivate(),
          // 返回键 = 退格键: 上一级; 已在二级就整个关掉
          Back: () => softkeyMenuBack(),
          // 左软键的文案和返回键一致 (二级=关闭 / 三级=上一级)
          SoftLeft: () => softkeyMenuBack()
        }, { exclusive: true, priority: 100 });
      } else if (!s.open && menuScope) {
        menuScope();
        menuScope = null;
      }
    });

    return () => {
      offBar();
      unsub();
      if (menuScope) {
        menuScope();
        menuScope = null;
      }
    };
  });
</script>

<div class="softkey-bar" class:menu-open={menuOpen}>
  <span class="left" class:empty={!leftText} class:menu-slot={leftIsMenu}>{leftText}</span>
  <span class="center" class:empty={!centerText}>{centerText}</span>
  <span class="right" class:empty={!rightText} class:menu-slot={rightIsMenu}>{rightText}</span>
</div>

{#if menuOpen}
  <div class="menu-layer" data-nav-root>
    <div class="menu-scrim"></div>
    <div class="menu-sheet">
      <div class="menu-head">
        <div class="menu-crumbs">
          {#each crumbs as crumb, i}
            {#if i > 0}<i class="menu-sep"></i>{/if}
            <span class="menu-crumb" class:current={i === crumbs.length - 1}>{crumb}</span>
          {/each}
        </div>
        {#if maxDepth > 1}
          <div class="menu-dots">
            {#each dots as _, i}
              <i class="menu-dot" class:on={i < depth}></i>
            {/each}
          </div>
        {/if}
      </div>
      {#key depth}
        <ul class="menu-list">
          {#each items as item, i}
            <li>
              <!-- 用 div 而不是 button:
                   KaiOS 2.4 (Gecko 48) 上 <button> 当 flex 容器时, 子元素**不会**
                   被当成 flex item 排布 (按钮的内容被塞进一个匿名块里按普通流排),
                   于是"文字撑满 + 右边小箭头"会被挤成两行 —— 箭头掉到下一行。
                   实测 (真机 Nokia 6300 4G): button 里箭头落到第二行, div 里正常。
                   本项目可点的行 (设置项/按键检测页) 本来也都用 div + role=button。 -->
              <div
                class="menu-item"
                class:selected={i === index}
                class:disabled={item.disabled}
                role="button"
                tabindex="-1"
                on:click={() => pick(i)}
              >
                {#if item.icon}<span class="menu-icon">{item.icon}</span>{/if}
                <span class="menu-text">{item.label}</span>
                {#if item.items && item.items.length}<i class="menu-sub"></i>{/if}
              </div>
            </li>
          {/each}
        </ul>
      {/key}
    </div>
  </div>
{/if}

<style>
  /* ── 软键栏 (一级菜单) ─────────────────────────────────────────── */
  .softkey-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: var(--kai-softkey-height);
    padding: 0 8px;
    background: var(--md-sys-color-surface-container);
    border-top: 1px solid var(--md-sys-color-outline-variant);
    box-shadow: var(--md-sys-elevation-level1);
    font-size: var(--md-sys-typescale-label-medium-size);
    font-weight: var(--md-sys-typescale-label-medium-weight);
    color: var(--md-sys-color-on-surface-variant);
    flex-shrink: 0;
    /* 全屏等 fixed 路由下 .app-root 里 SoftkeyBar 会成为首个在流内元素,
       margin-top:auto 保证它仍贴在底部; z-index 保证它盖在 fixed 覆盖层之上 */
    margin-top: auto;
    position: relative;
    z-index: 200;
    transition: background 0.18s ease;
  }

  /* 菜单打开时, 软键栏跟着"沉"下去一层, 和菜单面板拉开层次 */
  .softkey-bar.menu-open {
    background: var(--md-sys-color-surface-container-high);
  }

  .left,
  .right {
    flex: 0 0 auto;
    min-width: 40px;
    max-width: 42%;
    padding: 3px 6px;
    border-radius: var(--md-sys-shape-corner-small);
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .left {
    text-align: left;
  }

  .right {
    text-align: right;
  }

  /* 有文案的格子颜色更深, 空格子保持弱化 */
  .left:not(.empty),
  .right:not(.empty) {
    color: var(--md-sys-color-on-surface);
  }

  .left:active,
  .right:active {
    background: var(--md-sys-color-surface-container-highest);
  }

  .center {
    flex: 1 1 auto;
    min-width: 0;
    text-align: center;
    color: var(--md-sys-color-on-surface);
    font-weight: var(--md-sys-typescale-label-large-weight);
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .center.empty {
    color: var(--md-sys-color-on-surface-variant);
    font-weight: var(--md-sys-typescale-label-medium-weight);
  }

  /* 菜单占的那一格: 画个小箭头提示"按它会展开菜单"
     (用 CSS 画三角, 不依赖字体里有没有 › 这个字形) */
  .menu-slot::after {
    content: '';
    display: inline-block;
    width: 0;
    height: 0;
    margin-left: 4px;
    vertical-align: middle;
    border-top: 3px solid transparent;
    border-bottom: 3px solid transparent;
    border-left: 4px solid var(--md-sys-color-primary);
  }

  /* ── 菜单面板 (二级 / 三级) ────────────────────────────────────── */
  .menu-layer {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    /* 底边正好在软键栏上沿 —— 软键栏露出来当"关闭 / 选择"的提示 */
    bottom: var(--kai-softkey-height);
    z-index: 300;
  }

  .menu-scrim {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.4);
    animation: sk-fade 0.18s ease;
  }

  .menu-sheet {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    max-height: 88%;
    display: flex;
    flex-direction: column;
    background: var(--md-sys-color-surface-container-low);
    border-top-left-radius: var(--md-sys-shape-corner-extra-large);
    border-top-right-radius: var(--md-sys-shape-corner-extra-large);
    box-shadow: var(--md-sys-elevation-level3);
    overflow: hidden;
    animation: sk-rise 0.2s ease;
  }

  .menu-head {
    display: flex;
    align-items: center;
    padding: 6px 10px;
    background: var(--md-sys-color-surface-container-high);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    flex-shrink: 0;
  }

  /* 面包屑: 更多操作 › 举报 —— 一眼看出当前在哪一级、从哪来的 */
  .menu-crumbs {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    overflow: hidden;
  }

  .menu-crumb {
    font-size: var(--md-sys-typescale-label-medium-size);
    color: var(--md-sys-color-on-surface-variant);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .menu-crumb.current {
    font-size: var(--md-sys-typescale-title-medium-size);
    font-weight: var(--md-sys-typescale-title-medium-weight);
    color: var(--md-sys-color-on-surface);
  }

  .menu-sep {
    width: 0;
    height: 0;
    margin: 0 4px;
    flex-shrink: 0;
    border-top: 3px solid transparent;
    border-bottom: 3px solid transparent;
    border-left: 4px solid var(--md-sys-color-outline);
  }

  /* 层级指示点: 当前在第几级 */
  .menu-dots {
    display: flex;
    align-items: center;
    margin-left: 6px;
    flex-shrink: 0;
  }

  .menu-dot {
    width: 5px;
    height: 5px;
    margin-left: 3px;
    border-radius: var(--md-sys-shape-corner-full);
    background: var(--md-sys-color-outline-variant);
  }

  .menu-dot.on {
    background: var(--md-sys-color-primary);
  }

  .menu-list {
    list-style: none;
    margin: 0;
    padding: 4px 0;
    overflow-y: auto;
    flex: 1 1 auto;
    min-height: 0;
    /* 换一级重画一次 → 动画重新播, 做出"从右边滑进来"的感觉 */
    animation: sk-slide 0.18s ease;
  }

  .menu-item {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    height: 36px;
    padding: 0 12px;
    background: transparent;
    border: none;
    text-align: left;
    font-size: var(--md-sys-typescale-body-large-size);
    color: var(--md-sys-color-on-surface);
    outline: none;
    cursor: pointer;
  }
  /* 选中项: MD3 列表选中态 (容器色 + 左侧指示条) */
  .menu-item.selected {
    background: var(--md-sys-color-primary-container);
    color: var(--md-sys-color-on-primary-container);
  }

  .menu-item.selected::before {
    content: '';
    position: absolute;
    left: 0;
    top: 6px;
    bottom: 6px;
    width: 3px;
    border-radius: 0 2px 2px 0;
    background: var(--md-sys-color-primary);
  }

  .menu-item.disabled {
    color: var(--md-sys-color-outline);
  }

  .menu-icon {
    margin-right: 8px;
    font-size: 14px;
    line-height: 1;
    flex-shrink: 0;
  }

  .menu-text {
    flex: 1 1 auto;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* 有子项 → 右边画个箭头 (同样是 CSS 三角, 不吃字体字形) */
  .menu-sub {
    width: 0;
    height: 0;
    margin-left: 8px;
    flex-shrink: 0;
    border-top: 4px solid transparent;
    border-bottom: 4px solid transparent;
    border-left: 5px solid var(--md-sys-color-on-surface-variant);
  }

  /* 入场动画只动 transform, 不动 opacity ——
     动画万一被系统"卡住"(真机后台/低性能/动画被禁用), 菜单面板
     最多是位置偏一点, **绝不会整个透明看不见**。
     淡入只留给遮罩 (它只是装饰, 没了也不影响菜单可用)。 */
  @keyframes sk-fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes sk-rise {
    from { transform: translateY(10px); }
    to { transform: translateY(0); }
  }

  @keyframes sk-slide {
    from { transform: translateX(12px); }
    to { transform: translateX(0); }
  }
</style>
