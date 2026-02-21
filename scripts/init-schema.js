#!/usr/bin/env node
'use strict'

/**
 * 初始化数据库 schema（建表 + 迁移）
 * 用法: node scripts/init-schema.js [--db=skillgo]
 *
 * 在运行 seed-local 前，若数据库为空或 schema 过旧，需先执行此脚本或启动一次 server。
 */

require('dotenv').config()

const mysql = require('mysql2/promise')
const bcrypt = require('bcryptjs')

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

const ensureColumn = async (name, definition) => {
  const [rows] = await pool.query(
    `select count(*) as count from information_schema.columns
     where table_schema = database() and table_name = 'skills' and column_name = ?`,
    [name]
  )
  if (rows[0]?.count === 0) {
    await pool.query(`alter table skills add column ${name} ${definition}`)
    console.log(`[SCHEMA] 已添加列 skills.${name}`)
  }
}

const ensureUniqueIndex = async (name, columns) => {
  const [rows] = await pool.query(
    `select count(*) as count from information_schema.statistics
     where table_schema = database() and table_name = 'skills' and index_name = ?`,
    [name]
  )
  if (rows[0]?.count === 0) {
    await pool.query(`create unique index ${name} on skills (${columns})`)
    console.log(`[SCHEMA] 已添加索引 skills.${name}`)
  }
}

async function main() {
  const db = process.env.MYSQL_DATABASE || 'skillgo'
  console.log(`[SCHEMA] 初始化 ${db}...`)

  await pool.query(`
    create table if not exists skills (
      id int auto_increment primary key,
      name varchar(255) not null,
      slug varchar(255) not null,
      version varchar(64) not null default '1.0.0',
      description varchar(1024) not null,
      category varchar(255) not null,
      content longtext not null,
      status varchar(32) not null,
      repo_url varchar(1024),
      source_path varchar(1024),
      compatibility varchar(255),
      runtime varchar(255),
      provider varchar(255),
      license varchar(255),
      license_url varchar(1024),
      entrypoint varchar(1024),
      created_at datetime not null,
      updated_at datetime not null
    )
  `)

  await ensureColumn('repo_url', 'varchar(1024)')
  await ensureColumn('source_path', 'varchar(1024)')
  await ensureColumn('version', "varchar(64) not null default '1.0.0'")
  await ensureColumn('compatibility', 'varchar(255)')
  await ensureColumn('runtime', 'varchar(255)')
  await ensureColumn('provider', 'varchar(255)')
  await ensureColumn('license', 'varchar(255)')
  await ensureColumn('license_url', 'varchar(1024)')
  await ensureColumn('entrypoint', 'varchar(1024)')
  await ensureColumn('install_count', 'int not null default 0')
  await ensureColumn('view_count', 'int not null default 0')
  await ensureColumn('review_note', 'varchar(500)')
  await ensureColumn('reviewed_at', 'datetime')
  await ensureColumn('review_tier', "varchar(16) not null default 'none'")
  await ensureColumn('ai_reviewed_at', 'datetime')
  await ensureColumn('submitter_id', 'int')
  await ensureColumn('review_count', 'int not null default 0')
  await ensureColumn('avg_rating', 'decimal(3,2) default null')

  await pool.query("update skills set review_tier = 'human' where reviewed_at is not null and (review_tier is null or review_tier = 'none')")
  await pool.query("update skills set version = '1.0.0' where version is null or version = ''")

  const [slugIndex] = await pool.query(
    `select count(*) as count from information_schema.statistics
     where table_schema = database() and table_name = 'skills' and index_name = 'slug' and non_unique = 0`
  )
  if (slugIndex[0]?.count) {
    await pool.query('alter table skills drop index slug')
  }
  await ensureUniqueIndex('slug_version', 'slug, version')

  await pool.query(`
    create table if not exists admins (
      id int auto_increment primary key,
      username varchar(64) not null unique,
      password_hash varchar(255) not null,
      created_at datetime not null,
      last_login_at datetime
    )
  `)

  await pool.query(`
    create table if not exists audit_logs (
      id int auto_increment primary key,
      admin_id int not null,
      action varchar(64) not null,
      target_type varchar(32) not null,
      target_id int not null,
      detail json,
      created_at datetime not null,
      foreign key (admin_id) references admins(id)
    )
  `)

  await pool.query(`
    create table if not exists tags (
      id int auto_increment primary key,
      name varchar(64) not null unique,
      use_count int not null default 0
    )
  `)

  await pool.query(`
    create table if not exists skill_tags (
      skill_id int not null,
      tag_id int not null,
      primary key (skill_id, tag_id),
      foreign key (skill_id) references skills(id) on delete cascade,
      foreign key (tag_id) references tags(id) on delete cascade
    )
  `)

  await pool.query(`
    create table if not exists users (
      id int auto_increment primary key,
      username varchar(64) not null unique,
      email varchar(255) not null unique,
      password_hash varchar(255) not null,
      avatar_url varchar(1024),
      bio varchar(500),
      status varchar(32) not null default 'active',
      created_at datetime not null,
      last_login_at datetime
    )
  `)

  await pool.query(`
    create table if not exists skill_reviews (
      id int auto_increment primary key,
      skill_id int not null,
      user_id int,
      rating tinyint not null,
      comment varchar(500),
      created_at datetime not null,
      foreign key (skill_id) references skills(id) on delete cascade,
      foreign key (user_id) references users(id) on delete set null
    )
  `)

  await pool.query(`
    create table if not exists skill_reports (
      id int auto_increment primary key,
      skill_id int not null,
      reporter_id int,
      reason varchar(32) not null,
      detail text,
      reporter_contact varchar(255),
      status varchar(32) not null default 'open',
      created_at datetime not null,
      resolved_at datetime,
      foreign key (skill_id) references skills(id) on delete cascade,
      foreign key (reporter_id) references users(id) on delete set null
    )
  `)

  const [reportCol] = await pool.query(
    `select count(*) as count from information_schema.columns where table_schema = database() and table_name = 'skill_reports' and column_name = 'reporter_contact'`
  )
  if (reportCol[0]?.count === 0) {
    await pool.query('alter table skill_reports add column reporter_contact varchar(255)')
  }

  const [adminRows] = await pool.query('select count(*) as count from admins')
  if (adminRows[0]?.count === 0) {
    const defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'admin123'
    const hash = await bcrypt.hash(defaultPassword, 10)
    await pool.query(
      'insert into admins (username, password_hash, created_at) values (?, ?, now())',
      ['admin', hash]
    )
    console.log(`[SCHEMA] 已创建默认管理员: admin / ${defaultPassword}`)
  }

  console.log('[SCHEMA] 完成')
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error('[SCHEMA]', err)
    pool.end()
    process.exit(1)
  })
