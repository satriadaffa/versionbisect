import { z } from 'zod';
const A = z.object({ type: z.literal('a').default('a'), x: z.number() });
const B = z.object({ type: z.literal('b').default('b'), y: z.number() });
const U = z.discriminatedUnion('type', [A, B]);
console.log(U.safeParse({ type: 'a', x: 1 }).success);
