import { Hono } from 'hono';
const app = new Hono();
app.use('/v1/*/*', async (c, next) => {
  c.header('x-checked', 'yes');
  await next();
});
app.get('/v1/:a/:b', (c) => c.text(`${c.req.param('a')} ${c.req.param('b')}`));
const res = await app.request('/v1/x/y');
console.log(res.headers.get('x-checked'));
