<script setup>
defineProps({
  name: String,
  description: String,
  link: String
})
</script>

<template>
  <a :href="link" class="skill-card">
    <div class="skill-card-content">
      <h3 class="skill-name">{{ name }}</h3>
      <p class="skill-desc">{{ description }}</p>
    </div>
  </a>
</template>

<style scoped>
.skill-card {
  display: block;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 16px;
  background-color: var(--vp-c-bg-soft);
  transition: all 0.3s ease;
  text-decoration: none !important;
  color: inherit !important;
}

.skill-card:hover {
  border-color: var(--vp-c-brand);
  transform: translateY(-2px);
}

.skill-name {
  margin: 0 0 8px;
  font-size: 1.1em;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.skill-desc {
  margin: 0;
  font-size: 0.9em;
  color: var(--vp-c-text-2);
}
</style>
