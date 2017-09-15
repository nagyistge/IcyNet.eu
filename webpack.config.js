const path = require('path')
const UglifyJSPlugin = require('uglifyjs-webpack-plugin')

module.exports = {
  entry: {
    main: './src/script/main.js',
    admin: './src/script/admin.js'
  },
  output: {
    path: path.join(__dirname, 'build', 'script'),
    filename: '[name].js'
  },
  plugins: [
    new UglifyJSPlugin()
  ]
}
