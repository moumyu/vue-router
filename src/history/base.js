/* @flow */

import { _Vue } from '../install'
import type Router from '../index'
import { inBrowser } from '../util/dom'
import { runQueue } from '../util/async'
import { warn, isError, isRouterError } from '../util/warn'
import { START, isSameRoute } from '../util/route'
import {
  flatten,
  flatMapComponents,
  resolveAsyncComponents
} from '../util/resolve-components'
import {
  createNavigationDuplicatedError,
  createNavigationCancelledError,
  createNavigationRedirectedError,
  createNavigationAbortedError
} from './errors'

export class History {
  router: Router
  base: string
  current: Route
  pending: ?Route
  cb: (r: Route) => void
  ready: boolean
  readyCbs: Array<Function>
  readyErrorCbs: Array<Function>
  errorCbs: Array<Function>
  listeners: Array<Function>
  cleanupListeners: Function

  // implemented by sub-classes
  // 这些加号有什么用？
  // flow.js的写法，表明这个方法为只读，其实现由其子类实现
  +go: (n: number) => void
  +push: (loc: RawLocation) => void
  +replace: (loc: RawLocation) => void
  +ensureURL: (push?: boolean) => void
  +getCurrentLocation: () => string
  +setupListeners: Function

  constructor (router: Router, base: ?string) {
    this.router = router
    this.base = normalizeBase(base)
    // start with a route object that stands for "nowhere"
    this.current = START
    this.pending = null
    this.ready = false
    this.readyCbs = []
    this.readyErrorCbs = []
    this.errorCbs = []
    this.listeners = []
  }

  listen (cb: Function) {
    this.cb = cb
  }

  onReady (cb: Function, errorCb: ?Function) {
    if (this.ready) {
      cb()
    } else {
      this.readyCbs.push(cb)
      if (errorCb) {
        this.readyErrorCbs.push(errorCb)
      }
    }
  }

  onError (errorCb: Function) {
    this.errorCbs.push(errorCb)
  }

  transitionTo (
    location: RawLocation,
    onComplete?: Function,
    onAbort?: Function
  ) {
    const route = this.router.match(location, this.current)
    this.confirmTransition(
      route,
      () => {
        const prev = this.current // 保留当前route
        this.updateRoute(route) // 更新当前route（this.current）
        onComplete && onComplete(route) // 保留滚动相关
        this.ensureURL()
        // 此时跳转玩后才执行afterHooks
        this.router.afterHooks.forEach(hook => {
          hook && hook(route, prev)
        })

        // fire ready cbs once
        // TODO 这个ready callbacks又是什么
        if (!this.ready) {
          this.ready = true
          this.readyCbs.forEach(cb => {
            cb(route)
          })
        }
      },
      err => {
        if (onAbort) {
          onAbort(err)
        }
        if (err && !this.ready) {
          this.ready = true
          this.readyErrorCbs.forEach(cb => {
            cb(err)
          })
        }
      }
    )
  }

  confirmTransition (route: Route, onComplete: Function, onAbort?: Function) {
    const current = this.current
    const abort = err => {
      // changed after adding errors with
      // https://github.com/vuejs/vue-router/pull/3047 before that change,
      // redirect and aborted navigation would produce an err == null
      if (!isRouterError(err) && isError(err)) {
        if (this.errorCbs.length) {
          this.errorCbs.forEach(cb => {
            cb(err)
          })
        } else {
          warn(false, 'uncaught error during route navigation:')
          console.error(err)
        }
      }
      onAbort && onAbort(err)
    }
    if (
      isSameRoute(route, current) &&
      // in the case the route map has been dynamically appended to
      // TODO: 这里为什么要比较两者matched的长度
      // => 我觉得这里current.matched在一轮transitionTo或者开始时已经被确定了
      //    但是router map可以通过addRoutes来改变
      route.matched.length === current.matched.length
    ) {
      this.ensureURL()
      return abort(createNavigationDuplicatedError(current, route))
    }

    // 根据当前路由和要跳转的路由找出哪些是需要更新的组件，哪些是离开的组件，哪些是激活的组件
    // updated、deactivated、activated都是RouteReord数组（注意与RouteConfig的区别）
    const { updated, deactivated, activated } = resolveQueue(
      this.current.matched,
      route.matched
    )

    // 当前导航的queue
    const queue: Array<?NavigationGuard> = [].concat(
      // in-component leave guards
      // 显示离开组件的生命周期
      extractLeaveGuards(deactivated),
      // global before hooks
      // 然后是全局router
      this.router.beforeHooks,
      // in-component update hooks
      // 然后是重用组件的update
      extractUpdateHooks(updated),
      // in-config enter guards
      // 然后是被激活组件的enter
      activated.map(m => m.beforeEnter),
      // async components
      // TODO 这里是全局beforeResolve还是仅仅是异步组件
      resolveAsyncComponents(activated)
      // 最后的全局的afterEach去哪里了
      // => 这里还不能执行afterHooks，因为这里要在transitionTo的compolete参数中才执行真正
      // 的路由跳转，跳转之后才能执行afterHooks
    )

    this.pending = route
    // hook为当前钩子函数，next为调用下一个钩子函数的函数
    const iterator = (hook: NavigationGuard, next) => {
      if (this.pending !== route) { // TODO 什么时候会不相等而导致丢弃
        return abort(createNavigationCancelledError(current, route))
      }
      try {
        // hook钩子函数第一个参数为当前路径（from），第二个参数为上一个路径（to）
        // 第三个参数为传入一个函数来访问组件实例(next)
        hook(route, current, (to: any) => {
          if (to === false) {
            // next(false) -> abort navigation, ensure current URL
            // 如果是next(false)，则丢弃路由跳转
            this.ensureURL(true)
            abort(createNavigationAbortedError(current, route))
          } else if (isError(to)) { // 如果是Error实例也要丢弃
            this.ensureURL(true)
            abort(to)
          } else if (
            typeof to === 'string' ||
            (typeof to === 'object' &&
              (typeof to.path === 'string' || typeof to.name === 'string'))
          ) {
            // next('/') or next({ path: '/' }) -> redirect
            abort(createNavigationRedirectedError(current, route))
            if (typeof to === 'object' && to.replace) {
              this.replace(to)
            } else {
              this.push(to)
            }
          } else {
            // confirm transition and pass on the value
            next(to)
          }
        })
      } catch (e) {
        abort(e)
      }
    }

    // runQueue将queue中每个函数取出来执行iterator，直到最后执行cb
    runQueue(queue, iterator, () => {
      const postEnterCbs = []
      const isValid = () => this.current === route
      // wait until async components are resolved before
      // extracting in-component enter guards
      const enterGuards = extractEnterGuards(activated, postEnterCbs, isValid)
      const queue = enterGuards.concat(this.router.resolveHooks)
      runQueue(queue, iterator, () => {
        if (this.pending !== route) {
          return abort(createNavigationCancelledError(current, route))
        }
        this.pending = null
        onComplete(route)
        if (this.router.app) {
          this.router.app.$nextTick(() => {
            postEnterCbs.forEach(cb => {
              cb()
            })
          })
        }
      })
    })
  }

  // 更新最新this.current为route，执行cb
  // TODO: 这里的cb何时传进来的？
  updateRoute (route: Route) {
    this.current = route
    this.cb && this.cb(route)
  }

  setupListeners () {
    // Default implementation is empty
  }

  teardownListeners () {
    this.listeners.forEach(cleanupListener => {
      cleanupListener()
    })
    this.listeners = []
  }
}

function normalizeBase (base: ?string): string { // 将base标准化
  if (!base) {
    if (inBrowser) { // base不存在先去base标签里面取
      // respect <base> tag
      const baseEl = document.querySelector('base')
      base = (baseEl && baseEl.getAttribute('href')) || '/'
      // strip full URL origin
      base = base.replace(/^https?:\/\/[^\/]+/, '')
    } else {
      base = '/'
    }
  }
  // make sure there's the starting slash
  if (base.charAt(0) !== '/') {
    base = '/' + base
  }
  // remove trailing slash
  return base.replace(/\/$/, '')
}

// 比较current matched和route matched数组，找到不同路径开始的索引
// 需要更新的是0~不同的路径开始的索引
// 需要激活/失活的是不用路径开始的索引
// 比如/base/bar -> /base/foo，需要更新的就是/base，需要激活就是/foo，失活的是/bar
function resolveQueue (
  current: Array<RouteRecord>,
  next: Array<RouteRecord>
): {
  updated: Array<RouteRecord>,
  activated: Array<RouteRecord>,
  deactivated: Array<RouteRecord>
} {
  let i
  const max = Math.max(current.length, next.length)
  for (i = 0; i < max; i++) {
    if (current[i] !== next[i]) {
      break
    }
  }
  return {
    updated: next.slice(0, i),
    activated: next.slice(i),
    deactivated: current.slice(i)
  }
}

// 根据钩子函数名称name，提取出records中对应的生命周期函数
function extractGuards (
  records: Array<RouteRecord>,
  name: string,
  bind: Function,
  reverse?: boolean
): Array<?Function> {
  // flatMapComponents的主要作用为将传入records中的components
  // 进行遍历，将遍历的结果传入第二函数参数里
  // def即为component，instance，match为record本身,key为component对应的命名路由名称
  // 返回guards为绑定实例的生命周期钩子函数
  const guards = flatMapComponents(records, (def, instance, match, key) => {
    const guard = extractGuard(def, name) // 得到实例钩子函数
    if (guard) {
      return Array.isArray(guard)
        ? guard.map(guard => bind(guard, instance, match, key))
        : bind(guard, instance, match, key)
    }
  })
  return flatten(reverse ? guards.reverse() : guards)
}

// 如果def是function说明是一个Vue实例，如果不是则通过extend返回一个子实例
// 将实例中的钩子函数返回
function extractGuard (
  def: Object | Function,
  key: string
): NavigationGuard | Array<NavigationGuard> {
  if (typeof def !== 'function') {
    // extend now so that global mixins are applied.
    def = _Vue.extend(def)
  }
  return def.options[key]
}

function extractLeaveGuards (deactivated: Array<RouteRecord>): Array<?Function> {
  return extractGuards(deactivated, 'beforeRouteLeave', bindGuard, true)
}

function extractUpdateHooks (updated: Array<RouteRecord>): Array<?Function> {
  return extractGuards(updated, 'beforeRouteUpdate', bindGuard)
}

// 返回实例绑定钩子函数的函数
function bindGuard (guard: NavigationGuard, instance: ?_Vue): ?NavigationGuard {
  if (instance) {
    return function boundRouteGuard () {
      return guard.apply(instance, arguments)
    }
  }
}

function extractEnterGuards (
  activated: Array<RouteRecord>,
  cbs: Array<Function>,
  isValid: () => boolean
): Array<?Function> {
  return extractGuards(
    activated,
    'beforeRouteEnter',
    (guard, _, match, key) => {
      return bindEnterGuard(guard, match, key, cbs, isValid)
    }
  )
}

function bindEnterGuard (
  guard: NavigationGuard,
  match: RouteRecord,
  key: string,
  cbs: Array<Function>,
  isValid: () => boolean
): NavigationGuard {
  return function routeEnterGuard (to, from, next) {
    return guard(to, from, cb => {
      if (typeof cb === 'function') {
        cbs.push(() => {
          // #750
          // if a router-view is wrapped with an out-in transition,
          // the instance may not have been registered at this time.
          // we will need to poll for registration until current route
          // is no longer valid.
          poll(cb, match.instances, key, isValid)
        })
      }
      next(cb)
    })
  }
}

function poll (
  cb: any, // somehow flow cannot infer this is a function
  instances: Object,
  key: string,
  isValid: () => boolean
) {
  if (
    instances[key] &&
    !instances[key]._isBeingDestroyed // do not reuse being destroyed instance
  ) {
    cb(instances[key])
  } else if (isValid()) {
    setTimeout(() => {
      poll(cb, instances, key, isValid)
    }, 16)
  }
}
