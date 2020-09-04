/* @flow */
import { inBrowser } from './dom'

// use User Timing api (if present) for more accurate key precision
const Time =
  inBrowser && window.performance && window.performance.now
    ? window.performance
    : Date

export function genStateKey (): string {
  return Time.now().toFixed(3)
}

let _key: string = genStateKey()

// 暂时理解为当需要滚动时返回一个以当前performance的时间的key来记录位置
// 这里在滚动时多次返回一个key？ => 当前返回后，马上执行setStateKey，所以返回的是不同的key
// =  在每一次ensureUrl中会执行pushState，在pushState中会用过genStateKey来重新生成_key
export function getStateKey () {
  return _key
}

export function setStateKey (key: string) {
  return (_key = key)
}
