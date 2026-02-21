<template>
  <RouterLink :to="`/skills/${skill.id}`" class="skill-card">
    <div class="card-top">
      <h3 class="card-title">{{ skill.name }}</h3>
      <div class="card-badges">
        <span v-if="skill.review_tier === 'human'" class="badge badge-reviewed">人工审核</span>
        <span v-else-if="skill.review_tier === 'ai'" class="badge badge-ai">AI审核</span>
        <span v-else class="badge badge-none" title="该技能未经审核，使用前请自行评估安全风险">未审核</span>
        <span class="badge badge-cat">{{ skill.category }}</span>
        <span class="badge badge-ver">v{{ skill.version || '1.0.0' }}</span>
        <span v-for="t in (skill.tags || []).slice(0, 3)" :key="t" class="badge badge-tag">{{ t }}</span>
      </div>
    </div>
    <p class="card-desc">{{ skill.description }}</p>
    <div class="card-meta">
      <span v-if="skill.submitter_username" class="meta-item">
        <span class="meta-dot">·</span>
        {{ skill.submitter_username }}
      </span>
      <span v-if="repoShort" class="meta-item">
        <span class="meta-dot">·</span>
        <span class="meta-repo">{{ repoShort }}</span>
      </span>
      <span v-if="skill.avg_rating" class="meta-item meta-rating">★ {{ skill.avg_rating }}</span>
    </div>
    <div class="card-footer">
      <span class="card-link">查看详情 →</span>
    </div>
  </RouterLink>
</template>

<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

const props = defineProps({
  skill: {
    type: Object,
    required: true
  }
})

const repoShort = computed(() => {
  const url = props.skill?.repo_url || ''
  const m = url.match(/github\.com\/([^/]+\/[^/]+?)(?:\/|\.git)?$/i) || url.match(/gitee\.com\/([^/]+\/[^/]+?)(?:\/|\.git)?$/i)
  return m ? m[1] : ''
})
</script>

<style scoped>
.skill-card {
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 16px;
  padding: 24px;
  border: 1px solid #e2e8f0;
  text-decoration: none;
  color: inherit;
  transition: all 0.25s ease;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
}

.skill-card:hover {
  border-color: #c7d2fe;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.12);
  transform: translateY(-2px);
}

.card-top {
  margin-bottom: 12px;
}

.card-title {
  font-size: 18px;
  font-weight: 700;
  margin: 0 0 12px 0;
  color: #0f172a;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.badge {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
}

.badge-reviewed {
  background: #f3e8ff;
  color: #7c3aed;
}

.badge-ai {
  background: #dcfce7;
  color: #15803d;
}

.badge-none {
  background: #fef9c3;
  color: #a16207;
  cursor: help;
}

.badge-cat {
  background: #f0fdf4;
  color: #166534;
}

.badge-ver {
  background: #eef2ff;
  color: #4338ca;
}

.badge-tag {
  background: #f8fafc;
  color: #475569;
  border: 1px solid #e2e8f0;
}

.card-desc {
  font-size: 14px;
  line-height: 1.6;
  color: #64748b;
  margin: 0 0 16px 0;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-meta {
  font-size: 13px;
  color: #94a3b8;
  margin-bottom: 16px;
}

.meta-item {
  margin-right: 4px;
}

.meta-dot {
  margin: 0 4px;
  opacity: 0.6;
}

.meta-repo {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
}

.meta-rating {
  color: #f59e0b;
}

.card-footer {
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid #f1f5f9;
}

.card-link {
  font-size: 14px;
  font-weight: 600;
  color: var(--primary-color);
  transition: color 0.2s;
}

.skill-card:hover .card-link {
  color: #1758d6;
}
</style>
