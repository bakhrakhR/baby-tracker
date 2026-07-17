<script lang="ts">
  let {
    title,
    emoji,
    note,
  }: { title: string; emoji: string; note: string } = $props()
</script>

<h1 class="section-title">{title}</h1>
<div class="soon">
  <div class="soon__emoji">{emoji}</div>
  <div class="soon__note">{note}</div>
</div>

<style>
  .soon {
    background: var(--surface);
    border-radius: var(--r-card);
    box-shadow: var(--sh-card);
    padding: 40px 24px;
    text-align: center;
    margin-top: 8px;
  }
  .soon__emoji {
    font-size: 48px;
    margin-bottom: 14px;
  }
  .soon__note {
    color: var(--muted);
    font-size: 15px;
    font-weight: 600;
    line-height: 1.5;
  }
</style>
