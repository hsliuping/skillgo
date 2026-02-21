#!/usr/bin/env node
'use strict'

/**
 * 创建 skillgo 数据库
 * 用法: node scripts/init-db.js
 */

require('dotenv').config()

const mysql = require('mysql2/promise')

const host = process.env.MYSQL_HOST || '127.0.0.1'
const port = Number(process.env.MYSQL_PORT) || 3306
const user = process.env.MYSQL_USER || 'root'
const password = process.env.MYSQL_PASSWORD || ''
const database = process.argv[2] || process.env.MYSQL_DATABASE || 'skillgo'

async function main() {
  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password
  })
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  console.log(`数据库 ${database} 已就绪`)
  await conn.end()
}

main().catch((e) => {
  console.error('创建数据库失败:', e.message)
  process.exit(1)
})
