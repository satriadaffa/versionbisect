import { parse, regex, string, transform } from 'valibot';
const schema = transform(
  string('Invalid string', [regex(/^[0-9]+ (milliseconds?|seconds?|minutes?|hours?|days?)/)]),
  () => {
    throw new Error('This error should not happen for invalid input');
  },
);
try {
  parse(schema, 'INVALID');
  console.log('no error');
} catch (e) {
  console.log(e.message);
}
