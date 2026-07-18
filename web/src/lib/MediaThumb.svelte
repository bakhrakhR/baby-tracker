<script lang="ts">
  import { mediaUrl } from './storage'

  let { path, alt = '' }: { path: string; alt?: string } = $props()

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
</script>

{#if url}
  <img class="thumb" src={url} {alt} loading="lazy" onerror={() => (failed = true)} />
{:else}
  <!-- placeholder: mock paths, loading state, or a failed signature -->
  <div class="thumb thumb--ph" data-failed={failed} aria-label={alt}></div>
{/if}

<style>
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
