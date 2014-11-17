var merkle = require('./')
var memdb = require('memdb')

var m = merkle(memdb())

var truncate = function(key) {
  return key.slice(0, 10)
}

var toString = function(node) {
  return truncate(node.key)+' ['+node.links.map(truncate).join(' ')+']'
}

m.changes({live:true}).on('data', function(data) {
  console.log('change #'+data.change+': '+toString(data))
})

m.add(null, 'hi', function(err, hi) {
  m.add(hi.key, 'hello', function(err, node) {
    m.add(node.key, 'verden', function(err, verden) {
      m.add(node.key, 'world', function(err, world) {
        m.add([verden.key, world.key], 'welt')
      })
    })
  })
})