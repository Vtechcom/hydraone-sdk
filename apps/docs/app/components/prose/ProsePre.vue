<script setup lang="ts">
/**
 * Overrides the Nuxt UI code block so ```mermaid fences become diagrams.
 * Every other language is handed to the stock block unchanged.
 */
import UProsePre from '@nuxt/ui/components/prose/Pre.vue'

defineOptions({ inheritAttrs: false })

defineProps<{
  code?: string
  language?: string
  filename?: string
  icon?: string
  highlights?: number[]
  hideHeader?: boolean
  meta?: string
  class?: string
}>()
</script>

<template>
  <MermaidDiagram
    v-if="language === 'mermaid'"
    :code="code ?? ''"
  />
  <UProsePre
    v-else
    v-bind="{ ...$attrs, code, language, filename, icon, highlights, hideHeader, meta, class: $props.class }"
  >
    <slot />
  </UProsePre>
</template>
