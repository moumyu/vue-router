/* @flow */

// 确定path路径
// 传入此函数的有三种情况
// 1.以/开头，直接返回路径
// 2.以?或者#开头，返回current.path + path
// 3.相对path，先把current.path取出来一个，再根据传入path主意加入
export function resolvePath (
  relative: string,
  base: string,
  append?: boolean
): string {
  const firstChar = relative.charAt(0)
  if (firstChar === '/') {
    return relative
  }
  // 这个后面什么情况下执行
  // => 这里从parsePath中出来的path不可能有'?'或者'#'，其他地方是否存在调用resolvePath的情况？
  // => 在redirect中，执行resolveRecordPath带过来的path可能以'?'或者'#'号开头的情况
  if (firstChar === '?' || firstChar === '#') {
    return base + relative
  }

  const stack = base.split('/')

  // remove trailing segment if:
  // - not appending
  // - appending to trailing slash (last segment is empty)
  // 如果不是append或者stack最后一个不存在，则取出
  // 此时因为形如/path/path1，如果没有append的情况下可能变为/path/path2
  if (!append || !stack[stack.length - 1]) {
    stack.pop()
  }

  // resolve relative path
  // 这个为什么把斜杠去掉，又要以斜杠分割 => 这里是指整个字符串以斜杠开头，并非替换掉中间的斜杠
  const segments = relative.replace(/^\//, '').split('/')
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (segment === '..') {
      stack.pop()
    } else if (segment !== '.') {
      stack.push(segment)
    }
  }

  // ensure leading slash
  if (stack[0] !== '') {
    stack.unshift('')
  }

  return stack.join('/')
}

// 解析path，返回path、hash和query
// 此时的path、hash和query均是字符串
export function parsePath (path: string): {
  path: string;
  query: string;
  hash: string;
} {
  let hash = ''
  let query = ''

  const hashIndex = path.indexOf('#')
  if (hashIndex >= 0) {
    hash = path.slice(hashIndex)
    path = path.slice(0, hashIndex)
  }

  const queryIndex = path.indexOf('?')
  if (queryIndex >= 0) {
    query = path.slice(queryIndex + 1)
    path = path.slice(0, queryIndex)
  }

  return {
    path,
    query,
    hash
  }
}

export function cleanPath (path: string): string { // 将路径中两个斜杠替换成一个斜杠
  return path.replace(/\/\//g, '/')
}
