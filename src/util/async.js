/* @flow */

// 执行队列函数
// 将队列数组的里面的函数一个一个取出来执行
// TODO fn和cb在这里到底有什么用？
export function runQueue (queue: Array<?NavigationGuard>, fn: Function, cb: Function) {
  const step = index => {
    if (index >= queue.length) {
      cb()
    } else {
      if (queue[index]) {
        fn(queue[index], () => {
          step(index + 1)
        })
      } else {
        step(index + 1)
      }
    }
  }
  step(0)
}
