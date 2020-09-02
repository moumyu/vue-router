/* @flow */

import type VueRouter from '../index'
import { parsePath, resolvePath } from './path'
import { resolveQuery } from './query'
import { fillParams } from './params'
import { warn } from './warn'
import { extend } from './misc'

// 将当前raw路径解析，并返回path/query/hash
// 这里为什么不返回params
// => 注意看当raw包含name和相对params时候是返回了params的，只是说如果有path的情况，会忽略掉params
export function normalizeLocation (
  raw: RawLocation,
  current: ?Route,
  append: ?boolean,
  router: ?VueRouter
): Location {
  let next: Location = typeof raw === 'string' ? { path: raw } : raw // 封装要跳转的路径
  // named target
  // 如果已经被normalized了直接返回
  // 是否只有这个函数返回的normalized
  // => 并非只有这个函数，当RouteConfig中含有redirect和alias时就会有_normalized，
  //    此时，直接返回这个对象
  if (next._normalized) {
    return next
  } else if (next.name) { // 如果next.name存在，这个函数基本就返回next对象
    // TODO: 为什么这里不需要被_normalized
    next = extend({}, raw)
    const params = next.params
    if (params && typeof params === 'object') {
      next.params = extend({}, params)
    }
    return next
  }

  // relative params
  // 这种情况什么时候会发生
  // => 在当前路由的基础之上，只改变params时发生
  if (!next.path && next.params && current) {
    next = extend({}, next)
    next._normalized = true
    const params: any = extend(extend({}, current.params), next.params)
    if (current.name) {
      next.name = current.name
      next.params = params
    } else if (current.matched.length) {
      const rawPath = current.matched[current.matched.length - 1].path
      next.path = fillParams(rawPath, params, `path ${current.path}`)
    } else if (process.env.NODE_ENV !== 'production') {
      warn(false, `relative params navigation requires a current route.`)
    }
    return next
  }

  // 以下为必有path的情况
  const parsedPath = parsePath(next.path || '')
  const basePath = (current && current.path) || '/'
  const path = parsedPath.path
    ? resolvePath(parsedPath.path, basePath, append || next.append)
    : basePath // 这里暂且认为返回的就是parsedPath.path
  // => 不可以，这个因为location中可以不传入path，这里为不传入path做了一个规避

  // 将query解析成对象的形式
  const query = resolveQuery(
    parsedPath.query,
    next.query,
    router && router.options.parseQuery
  )

  let hash = next.hash || parsedPath.hash
  if (hash && hash.charAt(0) !== '#') {
    hash = `#${hash}`
  }

  return {
    _normalized: true,
    path,
    query,
    hash
  }
}
