#!/usr/bin/env node
'use strict'

/**
 * 将技能 slug 迁移为英文（从 source_path 提取目录名）
 * 用法: node scripts/migrate-slug-to-en.js [--db=skillgo]
 */

require('dotenv').config()

const mysql = require('mysql2/promise')

const dbArg = process.argv.find((a) => a.startsWith('--db='))
if (dbArg) process.env.MYSQL_DATABASE = dbArg.split('=')[1]

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'skillgo',
  port: Number(process.env.MYSQL_PORT) || 3306,
  connectionLimit: 5
})

const getEnSlug = (sourcePath) => {
  const m = (sourcePath || '').match(/\/([^/]+)\/SKILL\.md$/i)
  if (!m) return null
  return m[1].toLowerCase().replace(/[^a-z0-9-]/g, '-') || m[1]
}

const REPO_URL = process.env.REPO_URL || process.env.SKILLGO_REPO_URL || 'https://github.com/hsliuping/skillgo'

async function main() {
  const [repoRows] = await pool.query(
    "select id, repo_url from skills where repo_url like '%skillgo/skillgo%' or repo_url is null"
  )
  if (repoRows.length) {
    for (const r of repoRows) {
      await pool.query('update skills set repo_url = ? where id = ?', [REPO_URL, r.id])
      console.log(`[MIGRATE] 更新 repo_url: id=${r.id}`)
    }
  }

  const [rows] = await pool.query(
    'select id, name, slug, source_path from skills where source_path is not null'
  )
  let updated = 0
  for (const r of rows) {
    const enSlug = getEnSlug(r.source_path)
    if (!enSlug || enSlug === r.slug) continue
    if (!/^[a-z0-9][a-z0-9-]*$/.test(enSlug)) continue
    await pool.query('update skills set slug = ? where id = ?', [enSlug, r.id])
    console.log(`[MIGRATE] ${r.name}: ${r.slug} -> ${enSlug}`)
    updated += 1
  }
  console.log(`[MIGRATE] 完成: 更新 ${updated} 条`)
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error('[MIGRATE]', err)
    pool.end()
    process.exit(1)
  })
