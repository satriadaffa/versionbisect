import { defu } from 'defu';
const a = await import('data:text/javascript,export const foo = { nested: 1 }');
const b = await import('data:text/javascript,export const bar = 2');
console.log(JSON.stringify(defu({ pages: a }, { pages: b })));
