/**
 * 生成唯一的 UUID
 * 使用 crypto.randomUUID()，回退到时间戳+随机数方案
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  // 回退方案：时间戳+随机数（仅用于兼容性）
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}
