import View from './components/view'
import Link from './components/link'

export let _Vue

export function install (Vue) {
  if (install.installed && _Vue === Vue) return
  install.installed = true

  _Vue = Vue

  const isDef = v => v !== undefined

  // 在RouterView中有registerRouteInstance
  // => 此函数用于当实例被执行完后，像router-view中注入vm实例，用于路由生命周期函数调用
  const registerInstance = (vm, callVal) => {
    let i = vm.$options._parentVnode
    if (isDef(i) && isDef(i = i.data) && isDef(i = i.registerRouteInstance)) {
      i(vm, callVal)
    }
  }

  Vue.mixin({
    beforeCreate () {
      if (isDef(this.$options.router)) {
        this._routerRoot = this
        this._router = this.$options.router
        this._router.init(this)
        Vue.util.defineReactive(this, '_route', this._router.history.current)
        // 这里有什么用？
        // 这里为什么不像上面那样通过this._route = current来赋值，而是通过defineReactive
        // 来定义响应式，以后会有修改_route的情况吗？
        // 在VueRouter.init中，执行history.listen为history中的cb增加了一个函数，
        // 该函数调用app._route = route来触发Vue的响应式更新渲染
        // 而在每次confirmTransition成功之后的updateRoute都会执行该函数
      } else {
        this._routerRoot = (this.$parent && this.$parent._routerRoot) || this
      }
      registerInstance(this, this)
    },
    destroyed () {
      registerInstance(this)
    }
  })

  Object.defineProperty(Vue.prototype, '$router', {
    get () { return this._routerRoot._router }
  })

  Object.defineProperty(Vue.prototype, '$route', {
    get () { return this._routerRoot._route }
  })

  Vue.component('RouterView', View)
  Vue.component('RouterLink', Link)

  const strats = Vue.config.optionMergeStrategies
  // use the same hook merging strategy for route hooks
  // 使用created的合并策略到router组件的三个生命周期函数里面
  strats.beforeRouteEnter = strats.beforeRouteLeave = strats.beforeRouteUpdate = strats.created
}
