export const SLUG_NON_ALNUM_SEQUENCE_RE = /[^a-z0-9]+/g
export const SLUG_LEADING_DASH_RE = /^-+/
export const SLUG_TRAILING_DASH_RE = /-+$/

// Cap input length before running regexes so slug generation remains bounded on
// adversarial input even though these regexes are linear-time.
const SLUGIFY_MAX_INPUT_LENGTH = 1024

export function slugify(input: string): string {
  return input
    .slice(0, SLUGIFY_MAX_INPUT_LENGTH)
    .trim()
    .toLowerCase()
    .replace(SLUG_NON_ALNUM_SEQUENCE_RE, '-')
    .replace(SLUG_LEADING_DASH_RE, '')
    .replace(SLUG_TRAILING_DASH_RE, '')
    .slice(0, 64)
}
