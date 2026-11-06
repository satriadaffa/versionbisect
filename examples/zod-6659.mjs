import { z } from 'zod';
const schema = z.union([z.array(z.string()).max(2), z.string()]);
const result = schema.safeParse(['a', 'b', 'c']);
console.log(result.error?.issues.map(({ code, origin, path }) => ({ code, origin, path })));
