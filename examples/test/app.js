import Vue from 'vue'
import VueRouter from 'vue-router'

// track number of popstate listeners
let numPopstateListeners = 0
const listenerCountDiv = document.createElement('div')
listenerCountDiv.id = 'popstate-count'
listenerCountDiv.textContent = numPopstateListeners + ' popstate listeners'
document.body.appendChild(listenerCountDiv)

const originalAddEventListener = window.addEventListener
const originalRemoveEventListener = window.removeEventListener
window.addEventListener = function (name, handler) {
  if (name === 'popstate') {
    listenerCountDiv.textContent =
      ++numPopstateListeners + ' popstate listeners'
  }
  return originalAddEventListener.apply(this, arguments)
}
window.removeEventListener = function (name, handler) {
  if (name === 'popstate') {
    listenerCountDiv.textContent =
      --numPopstateListeners + ' popstate listeners'
  }
  return originalRemoveEventListener.apply(this, arguments)
}

// 1. Use plugin.
// This installs <router-view> and <router-link>,
// and injects $router and $route to all router-enabled child components
Vue.use(VueRouter)

// 2. Define route components
const Home = { template: '<div>home</div>' }
const Foo = { template: '<div><div>foo</div><router-view></router-view></div>' }
const Bar = { template: '<div>bar</div>' }
const Unicode = { template: '<div>unicode</div>' }

const Child1 = { template: '<div>child one</div>' }
const Child2 = { template: '<div>child two</div>' }
const Child3 = { template: '<div>child three</div>' }
const Params = {
  template: '<div>params: {{ $route.params }}</div>'
}

// 3. Create the router
const router = new VueRouter({
  mode: 'history',
  base: __dirname,
  routes: [
    { path: '*', component: Unicode },
    { path: '/', component: Home },
    { path: '/foo',
      name: 'foo',
      component: Foo,
      children: [
        {
          path: '/',
          component: Child1
        }
      ]
    },
    {
      path: '/bar',
      alias: '/par',
      component: Bar,
      children: [
        {
          path: '/',
          component: Child2,
          beforeEnter: function (to) {
            console.log(to)
          }
        }
      ]
    },
    {
      path: '/params/:name',
      name: 'params',
      component: Params,
      children: [
        {
          path: '/links/:age',
          name: 'links',
          component: Child3
        }
      ]
    },
    {
      path: '/user-*',
      name: 'user',
      component: { template: '<div>user</div>' }
    }
  ]
})

// 4. Create and mount root instance.
// Make sure to inject the router.
// Route components will be rendered inside <router-view>.
const vueInstance = new Vue({
  router,
  data: () => ({ n: 0 }),
  template: `
    <div id="app">
      <h3>
        命名路由默认子路由(
        <em style="color: red">点击下方链接会渲染foo组件，但是foo组件的默认子组件不会渲染</em>
        )
      </h3>
      <router-link :to="{ name: 'foo' }">跳转到foo</router-link>
      <hr />
      <h3>命名路由router-link中的query会被丢弃</h3>
      <h5>并不会被丢弃，在跳转命名路由时，在normalizeLocation中如果是命名路由，则直接返回新的raw（并没有丢弃原来的属性，只是复制了params）</h5>
      <router-link :to="{ name: 'foo', query: { name: 'muyu' } }">命名路由带query</router-link>
      <hr />
      <h3>观察带有参数的路由跳转时match中对params的处理情况</h3>
      <router-link :to="{ name: 'links', params: { name: 'muyu1', age: 25 } }">命名路由带params</router-link>
      <hr />
      <h3>路由导航中只有params的情况</h3>
      <router-link :to="{ params: { name: 'muyu1', age: 26 } }">只带params的RawLocation</router-link>
      <hr />
      <h3>路由导航中同时含有path和params时，params会被丢弃</h3>
      <router-link :to="{ path: '/params/12', params: { name: 'muyu1', age: 26 } }">只带params的RawLocation</router-link>
      <div style="height: 20px; border-bottom: 2px solid #e1e1e1"></div>
      <div>----------- 以下为router-view -----------</div>
      <router-view class="view"></router-view>
    </div>
  `,

  methods: {
    foo () {
      this.$router.push('foo')
    }
  }
}).$mount('#app')

document.getElementById('unmount').addEventListener('click', () => {
  vueInstance.$destroy()
  vueInstance.$el.innerHTML = ''
})
