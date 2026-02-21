<template>
  <div class="card">
    <h2 class="section-title">MCP 服务</h2>
    <p class="muted">提供技能发现接口，供代理或其它服务调用。</p>

    <div class="field">
      <label>技能列表接口</label>
      <input class="input" :value="`${apiBase}/mcp/skills`" readonly />
    </div>

    <div class="field">
      <label>示例请求</label>
      <pre class="content-block">curl {{ apiBase }}/mcp/skills?latest=true</pre>
    </div>

    <div class="field">
      <label>识别建议</label>
      <ul>
        <li>推荐用 slug + version 作为稳定识别键</li>
        <li>仅展示最新版本时使用 latest=true</li>
      </ul>
    </div>

    <div class="field">
      <label>返回字段</label>
      <ul>
        <li>service：服务标识</li>
        <li>updatedAt：响应生成时间（ISO 8601）</li>
        <li>skills：技能数组</li>
        <li>skills.id：技能 ID</li>
        <li>skills.name：技能名称</li>
        <li>skills.description：技能简介</li>
        <li>skills.category：技能分类</li>
        <li>skills.slug：技能唯一标识</li>
        <li>skills.version：技能版本</li>
        <li>skills.skill_url：SKILL.md 下载地址</li>
        <li>skills.repo_url：来源仓库地址</li>
        <li>skills.source_path：仓库内 SKILL.md 相对路径</li>
        <li>skills.compatibility：兼容性声明</li>
        <li>skills.runtime：运行时要求</li>
        <li>skills.provider：宿主平台</li>
        <li>skills.license：许可类型</li>
        <li>skills.license_url：许可链接</li>
        <li>skills.entrypoint：执行入口</li>
        <li>skills.run_url：执行接口（POST，路径以 /run 结尾）</li>
      </ul>
    </div>

    <div class="field">
      <label>Python SDK 示例</label>
      <pre class="content-block">import requests

base_url = "{{ apiBase }}"
resp = requests.get(f"{base_url}/mcp/skills", params={"latest": "true"})
resp.raise_for_status()
data = resp.json()

for skill in data.get("skills", []):
    print(skill["name"], skill.get("version"))
    if skill.get("run_url"):
        run_resp = requests.post(skill["run_url"], json={"input": {"text": "hello"}})
        print(run_resp.json().get("status"))
    if skill.get("skill_url"):
        skill_md = requests.get(skill["skill_url"]).text
        print(skill_md[:200])</pre>
    </div>

    <div class="field">
      <label>JS SDK 示例</label>
      <pre class="content-block">const baseUrl = "{{ apiBase }}"

async function loadSkills() {
  const response = await fetch(`${baseUrl}/mcp/skills?latest=true`)
  if (!response.ok) throw new Error("请求失败")
  const data = await response.json()
  for (const skill of data.skills || []) {
    console.log(skill.name, skill.version)
    if (skill.run_url) {
      const runResult = await fetch(skill.run_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: { text: "hello" } })
      }).then((res) => res.json())
      console.log(runResult.status)
    }
    if (skill.skill_url) {
      const skillMd = await fetch(skill.skill_url).then((res) => res.text())
      console.log(skillMd.slice(0, 200))
    }
  }
}

loadSkills()</pre>
    </div>
  </div>
</template>

<script setup>
import { apiBase } from '../api'
</script>

<style scoped>
</style>
