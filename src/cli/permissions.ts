import type { SessionPermission } from '../protocol/permissions.js'

export const permissionName = (tier: SessionPermission['effective']) => tier === 'allow-all' ? '完全访问权限' : tier === 'ask-risky' ? '请求批准' : '自动拦截'
export const permissionLabel = (permission: SessionPermission) => permissionName(permission.effective) + (permission.current === 'inherit' ? '（跟随默认）' : '')
export const PERMISSION_HELP = '/permissions 查看权限 · /permissions deny-risky 自动拦截 · /permissions ask-risky 请求批准 · /permissions allow-all 完全访问权限 · /permissions inherit 跟随默认。只改当前会话，不会批准已经等待确认的操作。'
