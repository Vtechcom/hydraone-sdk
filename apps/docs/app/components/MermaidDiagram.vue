<script setup lang="ts">
/**
 * Renders a ```mermaid code block as an SVG diagram.
 *
 * Server render and first paint show the plain source (so the page is readable without JS and
 * there is no layout jump on the server); the client then loads mermaid on demand, draws the
 * diagram and redraws it whenever the color mode changes.
 */
const props = defineProps<{ code: string }>()

const colorMode = useColorMode()
const svg = ref('')
const failed = ref(false)

let counter = 0
const nextId = () => `hydra-mermaid-${Date.now().toString(36)}-${counter++}`

const palette = {
  dark: {
    background: 'transparent',
    primaryColor: '#052E16',
    primaryBorderColor: '#00DC82',
    primaryTextColor: '#E6FFF3',
    secondaryColor: '#0A5331',
    secondaryBorderColor: '#00A155',
    secondaryTextColor: '#E6FFF3',
    tertiaryColor: '#101513',
    tertiaryBorderColor: '#2A3A33',
    tertiaryTextColor: '#E6FFF3',
    lineColor: '#75EDAE',
    textColor: '#E6FFF3',
    noteBkgColor: '#0A5331',
    noteTextColor: '#E6FFF3',
    noteBorderColor: '#00A155',
    actorBkg: '#052E16',
    actorBorder: '#00DC82',
    actorTextColor: '#E6FFF3',
    actorLineColor: '#2A3A33',
    signalColor: '#75EDAE',
    signalTextColor: '#E6FFF3',
    labelBoxBkgColor: '#052E16',
    labelBoxBorderColor: '#00A155',
    labelTextColor: '#E6FFF3',
    loopTextColor: '#E6FFF3',
    activationBkgColor: '#0A5331',
    activationBorderColor: '#00DC82',
    sequenceNumberColor: '#052E16',
    edgeLabelBackground: '#101513',
    clusterBkg: '#0B1410',
    clusterBorder: '#2A3A33'
  },
  light: {
    background: 'transparent',
    primaryColor: '#D9FBE8',
    primaryBorderColor: '#00A155',
    primaryTextColor: '#052E16',
    secondaryColor: '#EFFDF5',
    secondaryBorderColor: '#00C16A',
    secondaryTextColor: '#052E16',
    tertiaryColor: '#FFFFFF',
    tertiaryBorderColor: '#B3F5D1',
    tertiaryTextColor: '#052E16',
    lineColor: '#007F45',
    textColor: '#052E16',
    noteBkgColor: '#EFFDF5',
    noteTextColor: '#052E16',
    noteBorderColor: '#00C16A',
    actorBkg: '#D9FBE8',
    actorBorder: '#00A155',
    actorTextColor: '#052E16',
    actorLineColor: '#B3F5D1',
    signalColor: '#007F45',
    signalTextColor: '#052E16',
    labelBoxBkgColor: '#D9FBE8',
    labelBoxBorderColor: '#00A155',
    labelTextColor: '#052E16',
    loopTextColor: '#052E16',
    activationBkgColor: '#B3F5D1',
    activationBorderColor: '#00A155',
    sequenceNumberColor: '#FFFFFF',
    edgeLabelBackground: '#FFFFFF',
    clusterBkg: '#F6FEFA',
    clusterBorder: '#B3F5D1'
  }
} as const

async function draw() {
  try {
    const { default: mermaid } = await import('mermaid')
    const mode = colorMode.value === 'light' ? 'light' : 'dark'
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      themeVariables: { ...palette[mode], fontFamily: 'Public Sans, sans-serif', fontSize: '15px' },
      flowchart: { htmlLabels: true, curve: 'basis' },
      sequence: { mirrorActors: false, useMaxWidth: true }
    })
    const result = await mermaid.render(nextId(), props.code)
    svg.value = result.svg
    failed.value = false
  } catch (err) {
    console.error('[docs] mermaid failed to render a diagram', err)
    failed.value = true
  }
}

onMounted(draw)
watch(() => [colorMode.value, props.code], draw)
</script>

<template>
  <figure class="mermaid-figure my-6">
    <!-- The SVG comes from mermaid rendering our own markdown with securityLevel 'strict', not from user input. -->
    <!-- eslint-disable vue/no-v-html -->
    <div
      v-if="svg && !failed"
      class="mermaid-svg"
      role="img"
      v-html="svg"
    />
    <!-- eslint-enable vue/no-v-html -->
    <pre
      v-else
      class="mermaid-source"
      :aria-busy="!failed"
    ><code>{{ code }}</code></pre>
  </figure>
</template>

<style scoped>
.mermaid-figure {
  overflow-x: auto;
  border-radius: 0.75rem;
  border: 1px solid var(--ui-border);
  background: color-mix(in oklab, var(--ui-bg-elevated) 40%, transparent);
  padding: 1.25rem;
}
.mermaid-svg {
  display: flex;
  justify-content: center;
}
.mermaid-svg :deep(svg) {
  max-width: 100%;
  height: auto;
}
.mermaid-source {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--ui-text-muted);
  white-space: pre;
  overflow-x: auto;
}
</style>
