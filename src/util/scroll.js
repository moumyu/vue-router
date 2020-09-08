/* @flow */

import type Router from '../index'
import { assert } from './warn'
import { getStateKey, setStateKey } from './state-key'
import { extend } from './misc'

const positionStore = Object.create(null)

// 设置滚动行为为手动
// 为history state设置初始值
// 并replace到当前地址
// 设置popstate监听事件，返回取消监听函数
export function setupScroll () {
  // Prevent browser scroll behavior on History popstate
  if ('scrollRestoration' in window.history) {
    window.history.scrollRestoration = 'manual' // 使浏览器默认滚动行为改为手动
  }
  // Fix for #1585 for Firefox
  // Fix for #2195 Add optional third attribute to workaround a bug in safari https://bugs.webkit.org/show_bug.cgi?id=182678
  // Fix for #2774 Support for apps loaded from Windows file shares not mapped to network drives: replaced location.origin with
  // window.location.protocol + '//' + window.location.host
  // location.host contains the port and location.hostname doesn't
  const protocolAndPath = window.location.protocol + '//' + window.location.host
  const absolutePath = window.location.href.replace(protocolAndPath, '')
  // preserve existing history state as it could be overriden by the user
  const stateCopy = extend({}, window.history.state)
  stateCopy.key = getStateKey()
  // 这里为什么要执行这个
  // => 是因为在开始时, history.state里面没有key值，此处加上key值后再replace到当前地址
  window.history.replaceState(stateCopy, '', absolutePath)
  window.addEventListener('popstate', handlePopState)
  return () => {
    window.removeEventListener('popstate', handlePopState)
  }
}

// 处理滚动事件
export function handleScroll (
  router: Router,
  to: Route,
  from: Route,
  isPop: boolean
) {
  if (!router.app) {
    return
  }

  const behavior = router.options.scrollBehavior
  if (!behavior) {
    return
  }

  if (process.env.NODE_ENV !== 'production') {
    assert(typeof behavior === 'function', `scrollBehavior must be a function`)
  }

  // wait until re-render finishes before scrolling
  router.app.$nextTick(() => {
    const position = getScrollPosition()
    const shouldScroll = behavior.call(
      router,
      to,
      from,
      isPop ? position : null
    )

    if (!shouldScroll) {
      return
    }

    if (typeof shouldScroll.then === 'function') {
      shouldScroll
        .then(shouldScroll => {
          scrollToPosition((shouldScroll: any), position)
        })
        .catch(err => {
          if (process.env.NODE_ENV !== 'production') {
            assert(false, err.toString())
          }
        })
    } else {
      scrollToPosition(shouldScroll, position)
    }
  })
}

// 保存以当前performance.time.now为key的位置
export function saveScrollPosition () {
  const key = getStateKey()
  if (key) {
    positionStore[key] = {
      x: window.pageXOffset,
      y: window.pageYOffset
    }
  }
}
// 保存page滚动的位置并设置新的state key作为滚动位置的key
function handlePopState (e) {
  saveScrollPosition()
  if (e.state && e.state.key) {
    setStateKey(e.state.key)
  }
}

function getScrollPosition (): ?Object {
  const key = getStateKey()
  if (key) {
    return positionStore[key]
  }
}

function getElementPosition (el: Element, offset: Object): Object {
  const docEl: any = document.documentElement
  const docRect = docEl.getBoundingClientRect()
  const elRect = el.getBoundingClientRect()
  return {
    x: elRect.left - docRect.left - offset.x,
    y: elRect.top - docRect.top - offset.y
  }
}

function isValidPosition (obj: Object): boolean {
  return isNumber(obj.x) || isNumber(obj.y)
}

function normalizePosition (obj: Object): Object {
  return {
    x: isNumber(obj.x) ? obj.x : window.pageXOffset,
    y: isNumber(obj.y) ? obj.y : window.pageYOffset
  }
}

function normalizeOffset (obj: Object): Object {
  return {
    x: isNumber(obj.x) ? obj.x : 0,
    y: isNumber(obj.y) ? obj.y : 0
  }
}

function isNumber (v: any): boolean {
  return typeof v === 'number'
}

const hashStartsWithNumberRE = /^#\d/

// 滚动到指定的位置
function scrollToPosition (shouldScroll, position) {
  const isObject = typeof shouldScroll === 'object'
  if (isObject && typeof shouldScroll.selector === 'string') {
    // getElementById would still fail if the selector contains a more complicated query like #main[data-attr]
    // but at the same time, it doesn't make much sense to select an element with an id and an extra selector
    const el = hashStartsWithNumberRE.test(shouldScroll.selector) // $flow-disable-line
      ? document.getElementById(shouldScroll.selector.slice(1)) // $flow-disable-line
      : document.querySelector(shouldScroll.selector)

    if (el) {
      let offset =
        shouldScroll.offset && typeof shouldScroll.offset === 'object'
          ? shouldScroll.offset
          : {}
      offset = normalizeOffset(offset)
      position = getElementPosition(el, offset)
    } else if (isValidPosition(shouldScroll)) {
      position = normalizePosition(shouldScroll)
    }
  } else if (isObject && isValidPosition(shouldScroll)) {
    position = normalizePosition(shouldScroll)
  }

  if (position) {
    window.scrollTo(position.x, position.y)
  }
}
