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
```

## License

MIT
