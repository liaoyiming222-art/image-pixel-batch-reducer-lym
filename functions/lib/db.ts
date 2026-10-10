export interface Statement {
  bind(...args: unknown[]): Statement
  run(): Promise<{ success: boolean; meta?: { changes?: number } }>
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  first<T = Record<string, unknown>>(): Promise<T | null>
}
export interface Database { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown[]> }
export interface Env { DB: Database; ADMIN_PASSWORD?: string; AUTH_SECRET?: string; ANALYTICS_HOST?: string; CLOUDFLARE_API_TOKEN?: string; CF_ACCOUNT_ID?: string; CF_SITE_TAG?: string }
export interface Context { request: Request; env: Env }
export const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
export const sameOrigin = (request: Request) => request.headers.get('Origin') === new URL(request.url).origin
export const beijingDay = (at: number) => new Date(at + 8 * 3600000).toISOString().slice(0, 10)
