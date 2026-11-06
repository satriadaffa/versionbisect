import { z } from 'zod';
console.log(z.string().safeParse('hello').success);
