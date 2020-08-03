/* @flow */

// 执行队列函数
// 将队列数组的里面的函数一个一个取出来执行
// fn和cb在这里到底有什么用？
// => 其实这里很好理解，runQueue的作用就是将之前收集到的queue队列
// 从索引0开始一个一个取出来调用fn去执行，直到索引大于队列长度执行cb
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
