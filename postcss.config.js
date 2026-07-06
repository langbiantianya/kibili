import postcssCustomProperties from 'postcss-custom-properties'

export default {
  plugins: [
    postcssCustomProperties({
      // 保留 CSS 变量声明，同时生成静态 fallback
      // 现代浏览器使用变量，Gecko 48 使用静态值
      preserve: true
    })
  ]
}
