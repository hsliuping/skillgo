'use strict'

const { z } = require('zod')

const AdminLoginSchema = z.object({
  username: z.string().min(1, '请提供用户名').max(64),
  password: z.string().min(1, '请提供密码')
})

const AuthRegisterSchema = z.object({
  username: z.string().min(1, '请填写用户名').max(64),
  email: z.string().email('邮箱格式无效').max(255),
  password: z.string().min(6, '密码至少 6 位')
})

const AuthLoginSchema = z.object({
  email: z.string().min(1, '请填写邮箱').max(255),
  password: z.string().min(1, '请填写密码')
})

const semverRegex = /^\d+\.\d+\.\d+$/
const SubmitSkillSchema = z.object({
  name: z.string().min(1, '请填写名称').max(255),
  description: z.string().min(1, '请填写简介').max(1024),
  category: z.string().min(1, '请选择分类').max(255),
  content: z.string().min(1, '请填写内容'),
  version: z.string().regex(semverRegex).optional().default('1.0.0'),
  tags: z.array(z.string().max(64)).max(10).optional().default([]),
  compatibility: z.string().max(255).optional().default(''),
  runtime: z.string().max(255).optional().default(''),
  provider: z.string().max(255).optional().default(''),
  license: z.string().max(255).optional().default(''),
  licenseUrl: z.string().max(1024).optional(),
  license_url: z.string().max(1024).optional(),
  entrypoint: z.string().max(1024).optional().default(''),
  run: z.string().max(1024).optional(),
  command: z.string().max(1024).optional()
}).passthrough()

const ImportSkillSchema = z.object({
  repoUrl: z.string().url('请提供有效的代码库链接').max(1024)
})

const ReportSkillSchema = z.object({
  reason: z.enum(['malicious', 'spam', 'duplicate', 'other']).optional().default('other'),
  detail: z.string().max(1000).optional().default(''),
  contact: z.string().max(255).optional().default('')
})

const ReviewSkillSchema = z.object({
  rating: z.number().min(1).max(5),
  comment: z.string().max(500).optional().default('')
})

const UpdateStatusSchema = z.object({
  status: z.enum(['published', 'rejected', 'pending', 'approved']),
  reviewNote: z.string().max(500).optional(),
  review_note: z.string().max(500).optional()
})

const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body)
  if (!result.success) {
    const first = result.error.errors[0]
    const msg = first?.message || '参数校验失败'
    res.status(400).json({ message: msg })
    return
  }
  req.validated = result.data
  next()
}

module.exports = {
  AdminLoginSchema,
  AuthRegisterSchema,
  AuthLoginSchema,
  SubmitSkillSchema,
  ImportSkillSchema,
  ReportSkillSchema,
  ReviewSkillSchema,
  UpdateStatusSchema,
  validate
}
