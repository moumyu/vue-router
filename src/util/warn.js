/* @flow */

export function assert (condition: any, message: string) {
  if (!condition) {
    throw new Error(`[vue-router] ${message}`)
  }
}

export function warn (condition: any, message: string) {
  if (process.env.NODE_ENV !== 'production' && !condition) {
    typeof console !== 'undefined' && console.warn(`[vue-router] ${message}`)
  }
}

// 是否是error实例
export function isError (err: any): boolean {
  return Object.prototype.toString.call(err).indexOf('Error') > -1
}

// 是否是router上的错误
export function isRouterError (err: any, errorType: ?string): boolean {
  return isError(err) && err._isRouter && (errorType == null || err.type === errorType)
}
