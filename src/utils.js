/**
 * @param  {...string} parts
 * @returns {string}
 */
export function joinUrlPaths(...parts) {
  return parts
    .filter(Boolean)
    .map((part, i) => {
      if (i === 0) return part.replace(/\/+$/, '') // remove trailing slash on first
      return part.replace(/^\/+|\/+$/g, '') // remove leading/trailing slashes on the rest
    })
    .join('/')
}
