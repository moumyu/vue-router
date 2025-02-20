import { warn } from '../util/warn'
import { extend } from '../util/misc'

export default {
  name: 'RouterView',
  functional: true,
  props: {
    name: {
      type: String,
      default: 'default'
    }
  },
  render (_, { props, children, parent, data }) {
    // used by devtools to display a router-view badge
    data.routerView = true

    // directly use parent context's createElement() function
    // so that components rendered by router-view can resolve named slots
    const h = parent.$createElement
    const name = props.name
    const route = parent.$route // router current route
    const cache = parent._routerViewCache || (parent._routerViewCache = {})

    // determine current view depth, also check to see if the tree
    // has been toggled inactive but kept-alive.
    // 找到router-view的层级，此外是否在keepAlive下
    let depth = 0
    let inactive = false
    // 一直向上层寻找，直到找到Vue实例
    while (parent && parent._routerRoot !== parent) {
      // $vnode只有为组件时才存在
      const vnodeData = parent.$vnode ? parent.$vnode.data : {}
      if (vnodeData.routerView) {
        depth++
      }
      if (vnodeData.keepAlive && parent._directInactive && parent._inactive) {
        inactive = true
      }
      parent = parent.$parent
    }
    data.routerViewDepth = depth

    // render previous view if the tree is inactive and kept-alive
    if (inactive) {
      const cachedData = cache[name]
      const cachedComponent = cachedData && cachedData.component
      if (cachedComponent) {
        // #2301
        // pass props
        // 这个configProps从哪里来？
        // => 下面处理中会将matched.props赋值给它
        if (cachedData.configProps) {
          fillPropsinData(cachedComponent, data, cachedData.route, cachedData.configProps)
        }
        return h(cachedComponent, data, children)
      } else {
        // render previous empty view
        return h()
      }
    }

    // 根据深度拿到matched？
    // => 这里就是根据router-view层级去匹配matched，得到的matched就是当前
    //    path所对应的RouterRecord
    const matched = route.matched[depth]
    const component = matched && matched.components[name]

    // render empty node if no matched route or no config component
    if (!matched || !component) {
      cache[name] = null
      return h()
    }

    // cache component
    cache[name] = { component }

    // attach instance registration hook
    // this will be called in the instance's injected lifecycle hooks
    // 这个函数有什么用
    // => 看上面的解释，注入vm实例，在组件内路由生命周期执行时需要
    //    在每个实例执行beforeCreate(由router混入)时执行
    //    functional组件中render会首先执行返回生成的Vnode
    //    因为在函数式组件中不会用到this（需要等到组件beforeCreate之后）
    //    所以真正渲染router-view时，beforeCreate函数中已经存在registerRouteInstance
    data.registerRouteInstance = (vm, val) => {
      // val could be undefined for unregistration
      // val的值是undefined或者未注册，也就是一般来说说matched.instances[name]的值只能
      // 初始化为vm或者再取消为undefined
      const current = matched.instances[name]
      if (
        (val && current !== vm) ||
        (!val && current === vm)
      ) {
        matched.instances[name] = val
      }
    }

    // also register instance in prepatch hook
    // in case the same component instance is reused across different routes
    ;(data.hook || (data.hook = {})).prepatch = (_, vnode) => {
      matched.instances[name] = vnode.componentInstance
    }

    // register instance in init hook
    // in case kept-alive component be actived when routes changed
    data.hook.init = (vnode) => {
      if (vnode.data.keepAlive &&
        vnode.componentInstance &&
        vnode.componentInstance !== matched.instances[name]
      ) {
        matched.instances[name] = vnode.componentInstance
      }
    }

    const configProps = matched.props && matched.props[name]
    // save route and configProps in cachce
    // 这里configProps拿到的就是RouteConfig的props属性
    if (configProps) {
      extend(cache[name], {
        route,
        configProps
      })
      fillPropsinData(component, data, route, configProps)
    }

    return h(component, data, children)
  }
}

function fillPropsinData (component, data, route, configProps) {
  // resolve props
  // 根据route和configProps得到props
  let propsToPass = data.props = resolveProps(route, configProps)
  if (propsToPass) {
    // clone to prevent mutation
    propsToPass = data.props = extend({}, propsToPass)
    // pass non-declared props as attrs
    const attrs = data.attrs = data.attrs || {}
    // 如果组件中props中没有接收这个参数则将其赋值到attrs中
    for (const key in propsToPass) {
      if (!component.props || !(key in component.props)) {
        attrs[key] = propsToPass[key]
        delete propsToPass[key]
      }
    }
  }
}

// 根据config去得到props
// 一般来说RouteConfig里面的props可能为boolean、object、function
// 如果是boolean的情况，则为Route.params
// 如果是object，则为此对象
// 如果是function，则执行这个function得到一个对象
function resolveProps (route, config) {
  switch (typeof config) {
    case 'undefined':
      return
    case 'object':
      return config
    case 'function':
      return config(route)
    case 'boolean':
      return config ? route.params : undefined
    default:
      if (process.env.NODE_ENV !== 'production') {
        warn(
          false,
          `props in "${route.path}" is a ${typeof config}, ` +
          `expecting an object, function or boolean.`
        )
      }
  }
}
