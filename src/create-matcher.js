/* @flow */

import type VueRouter from './index'
import { resolvePath } from './util/path'
import { assert, warn } from './util/warn'
import { createRoute } from './util/route'
import { fillParams } from './util/params'
import { createRouteMap } from './create-route-map'
import { normalizeLocation } from './util/location'

export type Matcher = {
  match: (raw: RawLocation, current?: Route, redirectedFrom?: Location) => Route;
  addRoutes: (routes: Array<RouteConfig>) => void;
};

export function createMatcher (
  routes: Array<RouteConfig>,
  router: VueRouter
): Matcher {
  // 这里为什么不需要把这三个变量暴露出去
  // => 因为对于router来说，只需要match方法来获得匹配的路由即可
  // 增加时用addRoutes来增加，因为这三个通过闭包形成私有变量
  const { pathList, pathMap, nameMap } = createRouteMap(routes)

  function addRoutes (routes) {
    createRouteMap(routes, pathList, pathMap, nameMap)
  }

  // 返回一个匹配的route对象
  function match (
    raw: RawLocation,
    currentRoute?: Route,
    redirectedFrom?: Location
  ): Route {
    // TODO: 这里的raw并不等于router-link的to的值？
    // 将其标准化为{ hash, path, query, _normalized }的形式
    const location = normalizeLocation(raw, currentRoute, false, router)
    const { name } = location // 当raw中有name时或者相对路由中current.name存在时才会有

    if (name) {
      const record = nameMap[name]
      if (process.env.NODE_ENV !== 'production') {
        warn(record, `Route with name '${name}' does not exist`)
      }
      if (!record) return _createRoute(null, location)
      const paramNames = record.regex.keys // raw对应的record的params参数名称
        .filter(key => !key.optional)
        .map(key => key.name)

      if (typeof location.params !== 'object') {
        location.params = {}
      }

      // 这个currentRoute应该指的是跳转之前的相对Route，相同层级的路由跳转currentRoute为其父路由
      // 这里到底有什么用？
      // => 在normalizeLocation中如果name存在或者相对params的情况都只保留了raw中的params
      //    此时并没有基于currentRoute来合并params，在下面就是如果location.params中不存在的
      //    但是在record.regex.keys(即路由必须的参数)存在的，则加入到location.params中
      //    这里合并到location中是因为在createRoute的时候，params是取的location的params
      // 为什么不合并query？
      // => 因为在normalizeLocation中已经对query进行了合并
      // 为什么不把合并params的操作放到normalizeLocation中？
      // => 大概是由于不愿传递record？？？
      if (currentRoute && typeof currentRoute.params === 'object') {
        for (const key in currentRoute.params) {
          if (!(key in location.params) && paramNames.indexOf(key) > -1) {
            location.params[key] = currentRoute.params[key]
          }
        }
      }

      location.path = fillParams(record.path, location.params, `named route "${name}"`)
      return _createRoute(record, location, redirectedFrom)
    } else if (location.path) {
      location.params = {} // 为什么要把params放到这来，不在normalizeLocation中处理
      // => 因为这里normalizeLocation是个外部函数，无法访问pathList、pathMap变量
      for (let i = 0; i < pathList.length; i++) {
        const path = pathList[i]
        const record = pathMap[path]
        if (matchRoute(record.regex, location.path, location.params)) {
          return _createRoute(record, location, redirectedFrom)
        }
      }
    }
    // no match
    return _createRoute(null, location)
  }

  function redirect (
    record: RouteRecord,
    location: Location
  ): Route {
    const originalRedirect = record.redirect
    let redirect = typeof originalRedirect === 'function'
      ? originalRedirect(createRoute(record, location, null, router))
      : originalRedirect

    if (typeof redirect === 'string') {
      redirect = { path: redirect }
    }

    if (!redirect || typeof redirect !== 'object') {
      if (process.env.NODE_ENV !== 'production') {
        warn(
          false, `invalid redirect option: ${JSON.stringify(redirect)}`
        )
      }
      return _createRoute(null, location)
    }

    const re: Object = redirect
    const { name, path } = re
    let { query, hash, params } = location
    // 为什么这里要以redirect为基准
    // => 因为这里RouteRecord.redirect可能为一个函数
    //    如果这个函数返回string，则redirect为 { path: 'xxx' }
    //    但是如果这个函数返回一个 { path: 'xxx', params: 'xxx', query: 'xxx' }
    //    就需要以此为基准，location里面的path、params、query都是无效的
    query = re.hasOwnProperty('query') ? re.query : query
    hash = re.hasOwnProperty('hash') ? re.hash : hash
    params = re.hasOwnProperty('params') ? re.params : params

    if (name) {
      // resolved named direct
      const targetRecord = nameMap[name]
      if (process.env.NODE_ENV !== 'production') {
        assert(targetRecord, `redirect failed: named route "${name}" not found.`)
      }
      return match({
        _normalized: true,
        name,
        query,
        hash,
        params
      }, undefined, location)
    } else if (path) {
      // 1. resolve relative redirect
      const rawPath = resolveRecordPath(path, record)
      // 2. resolve params
      const resolvedPath = fillParams(rawPath, params, `redirect route with path "${rawPath}"`)
      // 3. rematch with existing query and hash
      return match({
        _normalized: true,
        path: resolvedPath,
        query,
        hash
      }, undefined, location)
    } else {
      if (process.env.NODE_ENV !== 'production') {
        warn(false, `invalid redirect option: ${JSON.stringify(redirect)}`)
      }
      return _createRoute(null, location)
    }
  }

  function alias (
    record: RouteRecord,
    location: Location,
    matchAs: string
  ): Route {
    const aliasedPath = fillParams(matchAs, location.params, `aliased route with path "${matchAs}"`)
    const aliasedMatch = match({
      _normalized: true,
      path: aliasedPath
    })
    if (aliasedMatch) {
      // 为什么这里还要多此一举将location.params得到路径的matched的params重新赋值给location.params
      // => 因为并且别名处于子路由中，location.params不但是父路由的参数也是子路由的参数
      //    所以取到aliasedRecord.params是只针对此别名的参数
      const matched = aliasedMatch.matched
      const aliasedRecord = matched[matched.length - 1]
      location.params = aliasedMatch.params
      return _createRoute(aliasedRecord, location)
    }
    return _createRoute(null, location)
  }

  function _createRoute (
    record: ?RouteRecord,
    location: Location,
    redirectedFrom?: Location
  ): Route {
    // 为什么要单独对冲定向进行处理，因为重定向中是以redirect为基准来跳转的
    if (record && record.redirect) {
      return redirect(record, redirectedFrom || location)
    }
    if (record && record.matchAs) {
      return alias(record, location, record.matchAs)
    }
    return createRoute(record, location, redirectedFrom, router)
  }

  return {
    match,
    addRoutes
  }
}

// 传入正则表达式和路径及路由参数，返回是否匹配
function matchRoute (
  regex: RouteRegExp,
  path: string,
  params: Object
): boolean {
  const m = path.match(regex)

  if (!m) {
    return false
  } else if (!params) {
    return true
  }
  // 注意i从1开始，忽略match原本的值
  for (let i = 1, len = m.length; i < len; ++i) {
    const key = regex.keys[i - 1]
    const val = typeof m[i] === 'string' ? decodeURIComponent(m[i]) : m[i]
    if (key) {
      // Fix #1994: using * with props: true generates a param named 0
      // 如果形如{ path: '/user-*' }，则会key.name会被编译为0
      params[key.name || 'pathMatch'] = val
    }
  }

  return true
}

function resolveRecordPath (path: string, record: RouteRecord): string {
  // 这里为什么要以parent为base
  // 因为对于redirect来说它就是以相对其父路由来重定向的
  return resolvePath(path, record.parent ? record.parent.path : '/', true)
}
