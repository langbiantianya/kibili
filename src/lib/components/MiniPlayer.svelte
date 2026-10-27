<script>
  // 迷你播放条
  //
  // 听视频页被"最小化"后, 底部 (软键栏正上方) 浮这么一条:
  // 封面 + 正在播的视频名 + 播放进度。
  //
  // 它是**纯显示**的: 不注册按键作用域, 不抢中键/方向键 ——
  // 页面自己的按键行为不能被这条浮层打断。要跳回听视频页,
  // 走任意页面右软键菜单里的「正在播放」。

  import { nowPlaying, miniVisible, miniProgress } from '../stores/player.js';
  import { biliImg } from '../utils/platform.js';

  $: cur = $nowPlaying;
  $: coverUrl = cur && cur.pic ? biliImg(cur.pic, 80, 80, 'jpg') : '';
  $: pct = Math.round(Math.max(0, Math.min(1, $miniProgress)) * 100);
</script>

{#if $miniVisible && cur}
  <div class="mini-player">
    {#if coverUrl}
      <img class="cover" src={coverUrl} alt="" />
    {:else}
      <div class="cover placeholder">♪</div>
    {/if}
    <div class="info">
      <div class="title">{cur.title || '正在播放'}</div>
      <div class="track">
        <div class="played" style="width: {pct}%"></div>
      </div>
    </div>
  </div>
{/if}

<style>
  .mini-player {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    background: var(--md-sys-color-surface-container);
    border-top: 1px solid var(--md-sys-color-outline-variant);
  }

  .cover {
    flex: 0 0 auto;
    width: 44px;
    height: 26px;
    object-fit: cover;
    border-radius: 3px;
    background: var(--md-sys-color-surface-container-highest);
  }

  .cover.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    color: var(--md-sys-color-on-surface-variant);
  }

  .info {
    flex: 1 1 auto;
    min-width: 0;
  }

  .title {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .track {
    margin-top: 3px;
    height: 3px;
    border-radius: 2px;
    background: var(--md-sys-color-surface-container-highest);
    overflow: hidden;
  }

  .played {
    height: 100%;
    background: var(--md-sys-color-primary);
  }
</style>
