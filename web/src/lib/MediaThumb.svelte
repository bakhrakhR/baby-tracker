<script lang="ts">
  import { mediaUrl } from './storage'

  let {
    path,
    alt = '',
    onExpand,
  }: {
    path: string
    alt?: string
    // when set, tapping the thumb opens the full image (the parent renders the
    // lightbox); the tap does not bubble to the surrounding card
    onExpand?: (url: string) => void
  } = $props()

  let url = $state<string | null>(null)
  let failed = $state(false)

  $effect(() => {
    const p = path
    url = null
    failed = false
    mediaUrl(p)
      .then((u) => (url = u))
      .catch(() => (failed = true))
  })

  function expand(e: Event) {
    if (!onExpand || !url) return
    e.stopPropagation()
    onExpand(url)
  }
</script>

{#if url}
  {#if onExpand}
    <span
      class="thumbwrap"
      role="button"
      tabindex="0"
      aria-label="Открыть фото"
      onclick={expand}
      onkeydown={(e) => e.key === 'Enter' && expand(e)}
    >
      <img class="thumb" src={url} {alt} loading="lazy" onerror={() => (failed = true)} />
    </span>
  {:else}
    <img class="thumb" src={url} {alt} loading="lazy" onerror={() => (failed = true)} />
  {/if}
{:else}
  <!-- placeholder: mock paths, loading state, or a failed signature -->
  <div class="thumb thumb--ph" data-failed={failed} aria-label={alt}></div>
{/if}

<style>
  .thumbwrap {
    display: block;
    cursor: zoom-in;
    -webkit-tap-highlight-color: transparent;
  }
  .thumb {
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    border-radius: 18px;
    display: block;
    background: var(--hair);
  }
  .thumb--ph {
    background: repeating-linear-gradient(45deg, #f0e6d8, #f0e6d8 8px, #f7efe3 8px, #f7efe3 16px);
  }
  .thumb--ph[data-failed='true'] {
    opacity: 0.6;
  }
</style>
