<script setup lang="ts">
import { useClipboard } from '@vueuse/core'

const props = defineProps<{
  samples: { label: string, code: string }[]
}>()

const items = computed(() => props.samples.map((s, i) => ({
  label: s.label,
  value: String(i),
  slot: 'sample' as const,
  code: s.code
})))

const { copy, copied } = useClipboard({ copiedDuring: 1600 })
</script>

<template>
  <div class="landing-code reveal">
    <UTabs
      :items="items"
      variant="link"
      :unmount-on-hide="false"
      :ui="{ list: 'border-default' }"
    >
      <template #sample="{ item }">
        <div class="landing-code__box">
          <UButton
            :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
            color="neutral"
            variant="ghost"
            size="sm"
            class="landing-code__copy"
            aria-label="Copy code"
            @click="copy(item.code)"
          />
          <pre class="landing-code__pre"><code>{{ item.code }}</code></pre>
        </div>
      </template>
    </UTabs>
  </div>
</template>

<style scoped>
.landing-code {
  width: 100%;
  max-width: 56rem;
  margin-inline: auto;
}
.landing-code__box {
  position: relative;
  margin-top: 1rem;
  overflow: hidden;
  border-radius: 1rem;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
}
.landing-code__copy {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
}
.landing-code__pre {
  margin: 0;
  padding: 1.25rem 3.5rem 1.25rem 1.25rem;
  overflow-x: auto;
  font-size: 0.8125rem;
  line-height: 1.65;
  color: var(--ui-text);
}
</style>
