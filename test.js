var tape = require('tape')
var memdb = require('memdb')
var merkle = require('./')

tape('add and get', function(t) {
  var graph = merkle(memdb())

  graph.add(null, 'hello', function(err, node1) {
    graph.get([node1.key], function(err, node2) {
      t.same(node1, node2, 'same node')
      t.end()
    })
  })
})

tape('add unknown link', function(t) {
  var graph = merkle(memdb())

  graph.add(['foobar'], 'hello', function(err) {
    t.ok(err, 'add failed')
    t.end()
  })
})