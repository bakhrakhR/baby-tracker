<script lang="ts">
  import { mediaUrl } from './storage'

  let {
    path,
    size = 50,
    radius = '50%',
  }: { path: string | null; size?: number; radius?: string } = $props()

  let url = $state<string | null>(null)

  $effect(() => {
    const p = path
    url = null
    if (p) mediaUrl(p).then((u) => (url = u)).catch(() => {})
  })
</script>

{#if url}
  <img
    class="av"
    src={url}
    alt=""
    style="width:{size}px; height:{size}px; border-radius:{radius}"
  />
{:else}
  <div
    class="av av--ph"
    style="width:{size}px; height:{size}px; border-radius:{radius}"
  ></div>
{/if}

<style>
  .av {
    object-fit: cover;
    border: 2px solid #fff;
    box-shadow: 0 3px 8px rgba(90, 64, 40, 0.15);
    flex: none;
    display: block;
  }
  .av--ph {
    background: repeating-linear-gradient(45deg, #f0e6d8, #f0e6d8 7px, #f7efe3 7px, #f7efe3 14px);
  }
</style>
