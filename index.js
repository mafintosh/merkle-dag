var mutexify = require('mutexify')
var lexint = require('lexicographic-integer')
var shasum = require('shasum')
var multistream = require('multistream')
var from = require('from2')
var protobuf = require('protocol-buffers')
var collect = require('stream-collector')
var LRU = require('lru-cache')
var through = require('through2')
var pump = require('pump')
var fs = require('fs')

var HEAD = 'head!'
var NODE = 'node!'
var CHANGE = 'change!'

var messages = protobuf(fs.readFileSync(__dirname+'/schema.proto'))
var noop = function() {}

var nextTick = function(cb, err, val) {
  process.nextTick(function() {
    cb(err, val)
  })
}

var Merkle = function(db) {
  if (!(this instanceof Merkle)) return new Merkle(db)
  this._cache = LRU(100)
  this._db = db
  this._clock = 0
  this._lock = mutexify()
  this._onflush = []
}

var init = function(self, cb) {
  if (self._clock) return cb()
  var rs = self._db.createKeyStream({gt:CHANGE, lt:CHANGE+'\xff', limit:1, reverse:true})
  collect(rs, function(err, keys) {
    if (err) return cb(err)
    self._clock = keys.length ? lexint.unpack(keys[0].slice(CHANGE.length), 'hex') : 0
    cb()
  })
}

var verify = function(self, links, cb) {
  var loop = function(i) {
    if (i === links.length) return cb()
    self.get(links[i], function(err) {
      if (err) return cb(new Error('Link '+links[i]+' does not exist'))
      loop(i+1)
    })
  }

  loop(0)  
}

var write = function(self, node, cb) {
  // quick-n-dirty impl with a global memory lock
  // can easily be optimized at a later point for faster bulk writes

  self._lock(function(release) {
    init(self, function(err) {
      if (err) return release(cb, err)
      verify(self, node.links, function(err) {
        if (err) return release(cb, err)
        
        node.change = self._clock+1

        var batch = []
        for (var i = 0; i < node.links.length; i++) batch.push({type:'del', key:HEAD+node.links[i]})
        batch.push({type:'put', key:HEAD+node.key, value:node.key})
        batch.push({type:'put', key:CHANGE+lexint.pack(node.change, 'hex'), value:node.key})
        batch.push({type:'put', key:NODE+node.key, value:messages.Node.encode(node)})

        self._db.batch(batch, function(err) {
          if (err) return release(cb, err)
          self._clock = node.change
          self._cache.set(node.key, node)
          while (self._onflush.length) self._onflush.shift()()
          release(cb, null, node)
        })
      })
    })
  })
}

Merkle.prototype.heads = function(opts, cb) {
  if (typeof opts === 'function') return this.heads(null, opts)
  if (!opts) opts = {}

  var rs = this._db.createValueStream({
    gt: HEAD,
    lt: HEAD+'\xff',
    limit: opts.limit,
    reverse: opts.reverse
  })

  var self = this
  var format = function(key, enc, cb) {
    self.get(key, cb)
  }

  return collect(pump(rs, through.obj(format)), cb)
}

var wait = function(self, read, cb) {
  self._onflush.push(function() {
    read(1, cb)
  })
}

Merkle.prototype.changes = function(opts, cb) {
  if (typeof opts === 'function') return this.changes(null, opts)
  if (!opts) opts = {}

  var rs = this._db.createValueStream({
    gt: CHANGE+lexint.pack(opts.since || 0, 'hex'),
    lt: CHANGE+'\xff',
    limit: opts.limit,
    reverse: opts.reverse
  })

  var self = this
  var prev = 0
  var format = function(key, enc, cb) {
    self.get(key, function(err, node) {
      if (err) return cb(err)
      prev = node.change
      cb(null, node)
    })
  }

  var read = function(size, cb) {
    if (prev >= self._clock) return wait(self, read, cb)
    self._db.get(CHANGE+lexint.pack(prev+1, 'hex'), function(err, key) {
      if (err) return cb(err)
      format(key, null, cb)
    })
  }

  rs = pump(rs, through.obj(format))
  if (opts.live) rs = multistream.obj([rs, from.obj(read)])

  return collect(rs, cb)
}

Merkle.prototype.get = function(key, cb) {
  var self = this
  var val = this._cache.get(key)
  if (val) return nextTick(cb, null, val)
  this._db.get(NODE+key, {valueEncoding:'binary'}, function(err, data) {
    if (err) return cb(err)
    val = messages.Node.decode(data)
    self._cache.set(key, val)
    cb(null, val)
  })
}

Merkle.prototype.add = function(links, value, cb) {
  if (typeof value === 'string') value = new Buffer(value)
  if (!links) links = []
  if (!Array.isArray(links)) links = [links]

  var key = shasum(shasum(value)+links.sort().join(''))
  var node = {key:key, change:0, value:value, links:links}

  write(this, node, cb || noop)

  return node
} 

module.exports = Merkle