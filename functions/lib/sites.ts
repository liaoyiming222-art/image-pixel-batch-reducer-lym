import type { Database } from './db'
export const DEFAULT_SITE='pixelflow-image-tools'
export interface Site {id:string;name:string;host:string;launch_day:string;traffic_source:'cloudflare'|'events';cf_site_tag:string|null;enabled:number}
export const getSite=(db:Database,id=DEFAULT_SITE)=>db.prepare('SELECT * FROM sites WHERE id=? AND enabled=1').bind(id).first<Site>()
export const listSites=(db:Database)=>db.prepare('SELECT id,name,host,launch_day,traffic_source,cf_site_tag,enabled FROM sites WHERE enabled=1 ORDER BY launch_day,id').all<Site>()
// Primary IDs stay unchanged so queued legacy retries still deduplicate after migration.
export const scopedId=(site:string,id:string)=>site===DEFAULT_SITE?id:`${site}:${id}`
