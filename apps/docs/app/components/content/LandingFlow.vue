<script setup lang="ts">
defineProps<{
  steps: { icon: string, title: string, text: string }[]
  note?: string
}>()
</script>

<template>
  <div class="landing-flow reveal">
    <ol class="landing-flow__grid reveal-stagger">
      <li
        v-for="(step, i) in steps"
        :key="step.title"
        class="landing-flow__step hcard"
      >
        <div class="landing-flow__head">
          <span class="landing-flow__icon">
            <UIcon
              :name="step.icon"
              class="size-5"
            />
          </span>
          <span class="landing-flow__num">0{{ i + 1 }}</span>
        </div>
        <h3 class="landing-flow__title">
          {{ step.title }}
        </h3>
        <p class="landing-flow__text">
          {{ step.text }}
        </p>
        <UIcon
          v-if="i < steps.length - 1"
          name="i-lucide-chevron-right"
          class="landing-flow__arrow"
        />
      </li>
    </ol>
    <p
      v-if="note"
      class="landing-flow__note"
    >
      {{ note }}
    </p>
  </div>
</template>

<style scoped>
/* Layout lives here (not in utility classes) so it never depends on Tailwind source scanning. */
.landing-flow {
  width: 100%;
  max-width: 72rem;
  margin-inline: auto;
}
.landing-flow__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.landing-flow__step {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.25rem;
  border-radius: 1rem;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
}
.landing-flow__head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.landing-flow__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.75rem;
  color: var(--ui-primary);
  background: color-mix(in oklab, var(--ui-primary) 10%, transparent);
  border: 1px solid color-mix(in oklab, var(--ui-primary) 30%, transparent);
}
.landing-flow__num {
  font-family: var(--font-display);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.16em;
  color: var(--ui-text-muted);
}
.landing-flow__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--ui-text-highlighted);
}
.landing-flow__text {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--ui-text-muted);
}
.landing-flow__arrow {
  position: absolute;
  top: 50%;
  right: -0.875rem;
  z-index: 1;
  width: 1.5rem;
  height: 1.5rem;
  padding: 0.125rem;
  transform: translateY(-50%);
  border-radius: 9999px;
  color: var(--ui-primary);
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
}
.landing-flow__note {
  margin: 1.5rem 0 0;
  text-align: center;
  font-size: 0.875rem;
  color: var(--ui-text-muted);
}
@media (max-width: 1023px) {
  .landing-flow__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .landing-flow__arrow { display: none; }
}
@media (max-width: 599px) {
  .landing-flow__grid { grid-template-columns: minmax(0, 1fr); }
}
</style>
