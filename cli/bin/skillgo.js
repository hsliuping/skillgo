#!/usr/bin/env node
'use strict'

const API_BASE = process.env.SKILLGO_API || 'http://localhost:3100'

const fetchJson = async (path) => {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw new Error(`请求失败: ${res.status}`)
  return res.json()
}

const fetchText = async (path) => {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw new Error(`请求失败: ${res.status}`)
  return res.text()
}

const search = async (keyword) => {
  const data = await fetchJson(`/api/skills?status=published&q=${encodeURIComponent(keyword)}&pageSize=20`)
  const items = data.items || []
  if (items.length === 0) {
    console.log('未找到匹配的技能')
    return
  }
  console.log('\n技能列表:')
  items.forEach((s) => {
    console.log(`  ${s.slug}@${s.version} - ${s.name}`)
    console.log(`    ${s.description}`)
  })
}

const install = async (slug, version, cwd) => {
  let data
  if (version) {
    data = await fetchJson(`/api/skills?status=published&slug=${encodeURIComponent(slug)}&version=${encodeURIComponent(version)}`)
  } else {
    const all = await fetchJson('/mcp/skills?latest=true')
    const skills = all.skills || []
    const skill = skills.find((s) => s.slug === slug)
    if (!skill) {
      console.error(`未找到技能: ${slug}`)
      process.exit(1)
    }
    const text = await fetchText(`/api/skills/${skill.id}/skill`)
    const fs = await import('fs/promises')
    const path = await import('path')
    const dir = path.join(cwd, 'skills', skill.slug)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, 'SKILL.md'), text, 'utf-8')
    console.log(`已安装 ${skill.slug}@${skill.version} 到 ${dir}/SKILL.md`)
    return
  }
  const items = data.items || []
  const skill = items[0]
  if (!skill) {
    console.error(`未找到技能: ${slug}${ver ? '@' + ver : ''}`)
    process.exit(1)
  }
  if (skill.review_tier === 'none' || !skill.review_tier) {
    console.warn('警告：该技能未经审核，使用前请自行评估安全风险。')
  }
  const text = await fetchText(`/api/skills/${skill.id}/skill`)
  const fs = await import('fs/promises')
  const path = await import('path')
  const dir = path.join(cwd, 'skills', skill.slug)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'SKILL.md'), text, 'utf-8')
  console.log(`已安装 ${skill.slug}@${skill.version} 到 ${dir}/SKILL.md`)
}

const list = async (cwd) => {
  const fs = await import('fs/promises')
  const path = await import('path')
  const skillsDir = path.join(cwd, 'skills')
  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true })
    const dirs = entries.filter((e) => e.isDirectory())
    if (dirs.length === 0) {
      console.log('当前目录下未安装任何技能')
      return
    }
    console.log('\n已安装技能:')
    for (const d of dirs) {
      const skillPath = path.join(skillsDir, d.name, 'SKILL.md')
      try {
        await fs.access(skillPath)
        console.log(`  ${d.name}`)
      } catch {}
    }
  } catch (e) {
    if (e.code === 'ENOENT') console.log('当前目录下未安装任何技能')
    else throw e
  }
}

const update = async (cwd) => {
  const fs = await import('fs/promises')
  const path = await import('path')
  const skillsDir = path.join(cwd, 'skills')
  let entries
  try {
    entries = await fs.readdir(skillsDir, { withFileTypes: true })
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.log('当前目录下未安装任何技能')
      return
    }
    throw e
  }
  const dirs = entries.filter((e) => e.isDirectory())
  for (const d of dirs) {
    try {
      const slug = d.name.includes('@') ? d.name.split('@')[0] : d.name
      await install(slug, null, cwd)
    } catch (e) {
      console.error(`更新 ${d.name} 失败:`, e.message)
    }
  }
}

const main = async () => {
  const args = process.argv.slice(2)
  const cmd = args[0]
  const cwd = process.cwd()

  if (cmd === 'search') {
    const keyword = args[1] || ''
    await search(keyword)
    return
  }

  if (cmd === 'install') {
    const spec = args[1]
    if (!spec) {
      console.error('用法: skillgo install <slug>[@version]')
      process.exit(1)
    }
    const at = spec.indexOf('@')
    const slug = at > 0 ? spec.slice(0, at) : spec
    const version = at > 0 ? spec.slice(at + 1) : null
    await install(slug, version, cwd)
    return
  }

  if (cmd === 'list') {
    await list(cwd)
    return
  }

  if (cmd === 'update') {
    if (args[1] === '--all') {
      await update(cwd)
    } else {
      console.log('用法: skillgo update --all')
    }
    return
  }

  console.log(`
SkillGo CLI - 技能管理工具 (https://skillgo.cn)

用法:
  skillgo search <keyword>    搜索技能
  skillgo install <slug>      安装技能到当前目录 skills/
  skillgo install <slug>@<ver> 安装指定版本
  skillgo list                列出已安装技能
  skillgo update --all        更新所有已安装技能

环境变量:
  SKILLGO_API  API 地址，默认 http://localhost:3100
`)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
