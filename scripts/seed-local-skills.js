#!/usr/bin/env node
'use strict'

/**
 * 将本地 skills/ 目录下的技能导入数据库
 *
 * 用法：
 *   node scripts/seed-local-skills.js [--dry-run] [--db=skillgo]
 *
 * 环境变量：与 server 相同（MYSQL_*）
 * 可选 REPO_URL：技能来源仓库，默认 https://github.com/hsliuping/skillgo
 *
 * 注意：
 * - 数据库必须与 server 使用的 MYSQL_DATABASE 一致，否则前端查不到
 * - 若报错 Unknown column 'review_tier'，请先运行 npm run init-schema 初始化 schema
 */

require('dotenv').config()

const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')
const { parseSkillMarkdown } = require('../lib/executor')

const DRY_RUN = process.argv.includes('--dry-run')
const dbArg = process.argv.find((a) => a.startsWith('--db='))
if (dbArg) process.env.MYSQL_DATABASE = dbArg.split('=')[1]
const SKILLS_DIR = path.join(__dirname, '..', 'skills')
const DEFAULT_REPO_URL = 'https://github.com/hsliuping/skillgo'

const slugify = (value) => {
  const base = String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'skill'
}

const normalizeVersion = (value) => {
  const raw = String(value || '').trim()
  return raw || '1.0.0'
}

const upsertTagsForSkill = async (pool, skillId, tagNames) => {
  const names = [...new Set((tagNames || []).map((n) => String(n).trim()).filter(Boolean))].slice(0, 10)
  for (const name of names) {
    await pool.query(
      'insert into tags (name, use_count) values (?, 1) on duplicate key update use_count = use_count + 1',
      [name]
    )
    const [rows] = await pool.query('select id from tags where name = ?', [name])
    if (rows[0]) {
      await pool.query('insert ignore into skill_tags (skill_id, tag_id) values (?, ?)', [skillId, rows[0].id])
    }
  }
}

async function main() {
  if (!fs.existsSync(SKILLS_DIR)) {
    console.error('[SEED] skills/ 目录不存在')
    process.exit(1)
  }

  const subdirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)

  const skillFiles = []
  for (const name of subdirs) {
    const skillPath = path.join(SKILLS_DIR, name, 'SKILL.md')
    if (fs.existsSync(skillPath)) {
      skillFiles.push({ dir: name, path: skillPath, sourcePath: `skills/${name}/SKILL.md` })
    }
  }

  if (!skillFiles.length) {
    console.log('[SEED] 未找到 SKILL.md 文件')
    return
  }

  console.log(`[SEED] 发现 ${skillFiles.length} 个技能: ${skillFiles.map((f) => f.dir).join(', ')}`)
  if (DRY_RUN) {
    for (const f of skillFiles) {
      const content = fs.readFileSync(f.path, 'utf8')
      const meta = parseSkillMarkdown(content)
      console.log(`  - ${meta.name} (slug: ${slugify(meta.name)}, version: ${normalizeVersion(meta.version)})`)
    }
    console.log('[SEED] dry-run 完成，未写入数据库')
    return
  }

  const dbConfig = {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'skillgo',
    port: Number(process.env.MYSQL_PORT) || 3306,
    connectionLimit: 5
  }
  console.log(`[SEED] 连接数据库: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`)
  const pool = mysql.createPool(dbConfig)

  const repoUrl = process.env.REPO_URL || process.env.SKILLGO_REPO_URL || DEFAULT_REPO_URL
  let imported = 0
  let skipped = 0

  try {
    for (const file of skillFiles) {
      const markdown = fs.readFileSync(file.path, 'utf8')
      const meta = parseSkillMarkdown(markdown)
      const baseSlug = slugify(meta.name)
      const version = normalizeVersion(meta.version)

      const [existing] = await pool.query(
        'select id from skills where slug = ? and version = ?',
        [baseSlug, version]
      )
      if (existing.length) {
        console.log(`[SEED] 跳过 ${meta.name} (已存在)`)
        skipped += 1
        continue
      }

      const [insResult] = await pool.query(
        `insert into skills (name, slug, version, description, category, content, status, repo_url, source_path, compatibility, runtime, provider, license, license_url, entrypoint, submitter_id, review_tier, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now(), now())`,
        [
          meta.name,
          baseSlug,
          version,
          meta.description,
          meta.category,
          markdown,
          'published',
          repoUrl,
          file.sourcePath,
          meta.compatibility || null,
          meta.runtime || null,
          meta.provider || null,
          meta.license || null,
          meta.license_url || null,
          meta.entrypoint || null,
          null,
          'none'
        ]
      )
      await upsertTagsForSkill(pool, insResult.insertId, meta.tags || [])
      console.log(`[SEED] 导入 ${meta.name}`)
      imported += 1
    }
    console.log(`[SEED] 完成: 导入 ${imported}, 跳过 ${skipped}`)
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error('[SEED]', err)
  process.exit(1)
})
