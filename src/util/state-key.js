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

// TODO 暂时理解为当需要滚动时返回一个以当前performance的时间的key来记录位置
export function getStateKey () {
  return _key
}

export function setStateKey (key: string) {
  return (_key = key)
}
