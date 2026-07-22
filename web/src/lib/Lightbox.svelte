<script lang="ts">
  // Fullscreen photo viewer: tap anywhere (image, backdrop or ✕) closes.
  let { url, alt = '', onClose }: { url: string; alt?: string; onClose: () => void } = $props()
</script>

<div
  class="lb"
  role="button"
  tabindex="-1"
  onclick={onClose}
  onkeydown={(e) => e.key === 'Escape' && onClose()}
>
  <img class="lb__img" src={url} {alt} />
  <button class="lb__x" onclick={onClose} aria-label="Закрыть">✕</button>
</div>

<style>
  .lb {
    position: fixed;
    inset: 0;
    z-index: 80;
    background: rgba(20, 16, 12, 0.93);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 18px;
    animation: lbfade 0.15s ease;
  }
  .lb__img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 12px;
    animation: lbzoom 0.18s ease;
  }
  .lb__x {
    position: absolute;
    top: calc(env(safe-area-inset-top) + 14px);
    right: 16px;
    width: 44px;
    height: 44px;
    border: none;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.16);
    color: #fff;
    font-size: 18px;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  @keyframes lbfade {
    from {
      opacity: 0;
    }
  }
  @keyframes lbzoom {
    from {
      transform: scale(0.94);
    }
  }
</style>
