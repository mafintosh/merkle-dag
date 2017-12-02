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

## API

#### `var node = graph.add(links, value, [key], [callback])`

Add a new node to the graph. `links` should be an array of keys of other nodes this node links to.
If this node does not link to anything pass in `null` or an empty array.

The links *must* be present in the graph or else an error will be passed to the callback.
The node that will be inserted is returned (and passed to the callback).

key is optional, will use hash of value + links if not provided.

#### `graph.get(key, callback)`

Lookup a node using its key.

#### `graph.changes([options], [callback])`

Everytime a node is inserted a reference to it is added to a local change feed.
The order of this feed guarantees that all linked nodes come before a node.

``` js
var changes = graph.changes()

changes.on('data', function(node) {
  console.log('change #'+node.change, node)
})
```

Optionally you can provide a callback which will be called with a list of changes

``` js
graph.changes(function(err, nodes) {
  console.log('changes:', nodes)
})
```

Pass in `options.since = change` to start the change feed from a given change index

``` js
var changes = graph.changes({since:100}) // only get changes > 100
```

The change stream also support a realtime mode using `options.live`

``` js
var changes = graph.changes({live:true}) // will never end but keep emitting data
```

#### `graph.heads([options], [callback])`

To get the `heads` of the graph (nodes that no one has a link to) use `graph.heads()`

``` js
// graph.heads() returns a stream of hashes of the heads
var heads = graph.heads()

heads.on('data', function(node) {
  console.log('head:', node)
})
```

Optionally you can provide a callback which will be called with a list of heads

``` js
graph.heads(function(err, nodes) {
  console.log(nodes) // an array of heads
})
```

Options include

```
{
  limit: 10     // only get 10 heads at max
  reverse: true // get them in reverse order
}
```

## License

MIT
