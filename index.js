var shasum = require('shasum')
var protobuf = require('protocol-buffers')
var lru = require('lru-cache')
var mutexify = require('mutexify')
var through = require('through2')
var fs = require('fs')

var schema = protobuf(fs.readFileSync(__dirname+'/schema.proto'))
var noop = function() {}

var TAIL = 'tail!'
var HEAD = 'head!'
var NODE = 'node!'

var Merkle = function(db) {
  if (!(this instanceof Merkle)) return new Merkle(db)
  this.db = db
  this.lock = mutexify()
}

Merkle.prototype.get = function(key, cb) {
  this.db.get(NODE+key, {valueEncoding:'binary'}, function(err, node) {
    if (err) return cb(err)
    cb(null, schema.Node.decode(node))
  })
}

var range = function(self, prefix) {
  var rs = db.createReadStream({
    gt: prefix,
    lt: prefix+'\xff',
    valueEncoding: 'utf-8'
  })

  var format = through.obj(function(data, enc, cb) {
    self.get(data.value)
    cb(null, schema.Node.decode(data.value))
  })

  return rs.pipe(format)
}

Merkle.prototype.tails = function() {
  return range(this.db, TAIL)
}

Merkle.prototype.heads = function() {
  return range(this.db, HEAD)
}

Merkle.prototype.add = function(prev, value, cb) {
  if (!cb) cb = noop
  if (!prev) prev = []
  if (!Array.isArray(prev)) prev = [prev]
  if (typeof value === 'string') value = new Buffer(value)

  var self = this
  var hash = shasum(value)
  var key = shasum(hash+prev.join(''))
  var node = {key:key, value:value, prev:prev, next:[]}
  var batch = []

  this.lock(function(release) {
    if (!prev.length) batch.push({type:'put', key:TAIL+key, value:NODE+key})

    var flush = function() {
      batch.push({type:'put', key:NODE+key, value:schema.Node.encode(node)})
      batch.push({type:'put', key:HEAD+key, value:key})
      self.db.batch(batch, function(err) {
        if (err) return release(cb, err)
        release(cb, null, node)
      })
    }

    var loop = function(i) {
      if (prev.length === i) return flush()
      self.get(prev[i], function(err, node) {
        if (err) return release(cb, err)
        node.next.push(key)
        if (node.next.length === 1) batch.push({type:'del', key:HEAD+node.key})
        else node.next.sort()
        batch.push({type:'put', key:NODE+node.key, value:schema.Node.encode(node)})
        loop(i+1)
      })
    }

    loop(0)
  })
}

module.exports = Merkle

return

var m = Merkle(require('level')('test.db'))

m.add(null, 'hello', function(err, node) {
  m.add(node.key, 'world', function() {
    m.heads().on('data', console.log)
  })
})

