# merkle-dag

Merkle DAG on top of LevelDB

```
npm install merkle-dag
```

## Usage

``` js
var merkle = require('merkle-dag')
var db = require('level')('test.db')

var graph = merkle(db)

// add a node with value "hello" and no links
graph.add(null, 'hello', function(err, node) {
  console.log('added:', node)
  // add a node with value "world" linking to the "hello" node
  graph.add([node.key], 'world', function(err, node) {
    console.log('added:', node)
    // retrive a node
    graph.get(node.key, function(err, node) {
      console.log('retrieved:', node)
    })
  })
})
```

To get the `heads` of the graph (nodes that no one has a link to) use `graph.heads()`

``` js
// graph.heads() returns a stream of hashes of the heads
var heads = graph.heads()

heads.on('data', function(head) {
  console.log('head:', head)
})
```

Optionally you can provide a callback which will be called a list of heads

``` js
graph.heads(function(err, heads) {
  console.log(heads) // an array of heads
})
```

## License

MIT
