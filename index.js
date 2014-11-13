var shasum = require('shasum')
var protobuf = require('protocol-buffers')
var through = require('through2')
var from = require('from2')
var eos = require('end-of-stream')
var fs = require('fs')

var schema = protobuf(fs.readFileSync(__dirname+'/schema.proto'))

var noop = function() {}
var prebatch = function(batch, cb) { cb(null, batch) }

var collect = function(stream, cb) {
  if (!cb) return stream
  var result = []
  stream.on('data', function(data) {
    result.push(data)
  })
  eos(stream, function(err) {
    if (err) return cb(err)
    cb(null, result)
  })
}

var HEAD = 'head!'
var NODE = 'node!'

var Merkle = function(db, opts) {
  if (!(this instanceof Merkle)) return new Merkle(db, opts)
  if (!opts) opts = {}
  this.db = db
  this.prebatch = opts.prebatch || prebatch
}

Merkle.prototype.nodes = function(head, opts) {
  if (!opts) opts = {}

  var self = this
  var queue = [head]
  var limit = opts.limit || Infinity

  return from.obj(function(size, cb) {
    if (!queue.length || !limit) return cb(null, null)
    self.get(queue.shift(), function(err, node) {
      if (err) return cb(err)
      queue.push.apply(queue, node.links)
      limit--
      cb(null, node)
    })
  })
}

Merkle.prototype.add = function(links, value, cb) {
  if (!cb) cb = noop
  if (!links) links = []
  if (!Array.isArray(links)) links = [links]
  if (!Buffer.isBuffer(value)) value = new Buffer(value)

  var self = this
  var batch = []
  var key = shasum(shasum(value)+links.join(''))

  var node = {
    key: key,
    links: links,
    value: value
  }

  batch.push({type:'put', key:NODE+key, value:schema.Node.encode(node)})
  batch.push({type:'put', key:HEAD+key, value:key})

  var flush = function() {
    self.prebatch(batch, function(err, batch) {
      if (err) return cb(err)
      self.db.batch(batch, function(err) {
        if (err) return cb(err)
        cb(null, node)
      })
    })
  }

  var loop = function(i) {
    if (i === links.length) return flush()
    self.db.get(NODE+links[i], function(err) {
      if (err) return cb(err)
      batch.push({type:'del', key:HEAD+links[i]})
      loop(i+1)
    })
  }

  loop(0)
}

Merkle.prototype.heads = function(opts, cb) {
  if (typeof opts === 'function') return this.heads(null, opts)
  if (!opts) opts = {}

  var rs = this.db.createValueStream({
    gt: HEAD,
    lt: HEAD+'\xff',
    valueEncoding: 'utf-8',
    limit: opts.limit
  })

  return collect(rs, cb)
}

Merkle.prototype.get = function(key, cb) {
  this.db.get(NODE+key, {valueEncoding:'binary'}, function(err, value) {
    if (err) return cb(err)
    cb(null, schema.Node.decode(value))
  })
}

module.exports = Merkle

if (module !== require.main) return

var memdb = require('memdb')
var m = Merkle(memdb(), {
  prebatch: function(batch, cb) {
    console.log('prebatch', batch)
    cb(null, batch)
  }
})

var truncate = function(key) {
  return key.slice(0, 10)
}

var print = function() {
  m.heads({limit:1}).on('data', function(head) {
    m.nodes(head).on('data', function(data) {
      console.log(truncate(data.key)+' ['+data.links.map(truncate).join(' ')+']')
    })
  })
}

m.add(null, 'hi', function(err, hi) {
  m.add(hi.key, 'hello', function(err, node) {
    m.add(node.key, 'verden', function(err, verden) {
      m.add(node.key, 'world', function(err, world) {
        m.add([verden.key, world.key], 'welt', print)
        m.heads(console.log)
      })
    })
  })
})
