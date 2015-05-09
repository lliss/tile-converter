"use strict";

var stream = require("stream"),
    url = require("url"),
    util = require("util");

var _ = require("highland"),
    async = require("async"),
    tilelive = require("tilelive");

var DEFAULT_CONCURRENCY = 8,
    PING = {},
    PING_DELAY = 50;

/**
 * Mildly enhanced PassThrough stream with header-setting capabilities.
 */
var TileStream = function(zoom, x, y) {
  stream.PassThrough.call(this);

  this.z = zoom;
  this.x = x;
  this.y = y;

  var dests = [],
      _pipe = this.pipe,
      _unpipe = this.unpipe;

  this.pipe = function(dest) {
    dests.push(dest);

    return _pipe.apply(this, arguments);
  };

  this.unpipe = function(dest) {
    if (dest && dests.indexOf(dest) >= 0) {
      // remove the destination
      dests.splice(dests.indexOf(dest), 1);
    } else if (!dest) {
      // reset destinations
      dests = [];
    }

    return _unpipe.apply(this, arguments);
  };

  this.setHeaders = function(headers) {
    if (headers) {
      dests.forEach(function(dest) {
        if (dest.setHeader) {
          Object.keys(headers).forEach(function(x) {
            dest.setHeader(x, headers[x]);
          });
        }
      });
    }
  };
};

util.inherits(TileStream, stream.PassThrough);

var clone = function(obj) {
  return Object.keys(obj || {}).reduce(function(v, k) {
    v[k] = obj[k];

    return v;
  }, {});
};

var applyDefaults = function(info, isOptions) {
  var data = clone(info);

  if (isOptions) {
    data.scheme = data.scheme || "scanline";
  }

  data.minzoom = "minzoom" in data ? data.minzoom : 0;
  data.maxzoom = "maxzoom" in data ? data.maxzoom : Infinity;
  data.bounds = data.bounds || [-180, -85.0511, 180, 85.0511];

  return data;
};

var restrict = function(info, by) {
  info = applyDefaults(info);
  by = applyDefaults(by);

  // restrict the options according to known restrictions
  info.minzoom = Math.max(info.minzoom, by.minzoom);
  info.maxzoom = Math.min(info.maxzoom, by.maxzoom);
  info.bounds[0] = Math.max(info.bounds[0], by.bounds[0]);
  info.bounds[1] = Math.max(info.bounds[1], by.bounds[1]);
  info.bounds[2] = Math.min(info.bounds[2], by.bounds[2]);
  info.bounds[3] = Math.min(info.bounds[3], by.bounds[3]);

  return info;
};

/**
* Generate a stream of stream objects containing tile data and coordinates.
*/
var Readable = function(sourceConfig, source, options) {
  stream.Readable.call(this, {
    objectMode: true,
    highWaterMark: options && options.concurrency ? options.concurrency : DEFAULT_CONCURRENCY
  });

  // set some defaults
  sourceConfig = applyDefaults(sourceConfig, true);

  var readable = this,
      scheme;

  // TODO emit basic stats about the read stream (number of records if known,
  // etc.)

  source.getInfo(function(err, info) {
    if (err) {
      console.warn(err);
    }

    if (info) {
      sourceConfig = restrict(sourceConfig, info);
      readable.emit("info", restrict(info, sourceConfig));
    }

    readable.sourceConfig = sourceConfig;

    // tilelive uses a different key from TileJSON
    sourceConfig.bbox = sourceConfig.bounds;
    scheme = tilelive.Scheme.create(sourceConfig.scheme, sourceConfig);
    scheme.formats = ["tile"];
  });

  var pending = 0;
  var CONCURRENCY = options && options.concurrency ? options.concurrency : DEFAULT_CONCURRENCY;

  this._read = function() {
    // limit the number of concurrent reads pending
    if (pending >= CONCURRENCY) {
      // bail early if already reading
      return;
    }

    if (!scheme) {
      // scheme isn't ready yet
      return setImmediate(this._read.bind(this));
    }

    var self = this,
        done = false,
        keepGoing = true;

    // support concurrent buffering
    var ping = setTimeout(function() {
      self.push(PING);
    }, PING_DELAY);

    return async.whilst(function() {
      return keepGoing && !done;
    }, function(callback) {
      var tile = scheme.nextTile();

      if (tile) {
        // track pending requests so we don't end the stream before they finish
        pending++;
        return source.getTile(tile.z, tile.x, tile.y, function(err, data, headers) {
          pending--;

          if (err) {
            if (!err.message.match(/Tile|Grid does not exist/)) {
              console.warn(err.stack);
              return callback();
            }
          }

          if (data || headers) {
            // downstream consumers expect stream objects w/ coordinates attached
            var out = new TileStream(tile.z, tile.x, tile.y);

            // push this tile and see if we should keep buffering
            keepGoing = self.push(out);

            out.setHeaders(headers);

            // since we already have all of the data here, flush it all at once
            out.end(data || null);
          }

          return callback();
        });
      }

      // no more tiles
      done = true;
      clearTimeout(ping);

      return callback();
    }, function() {
      // all pending getTile() calls are complete

      if (done && pending === 0) {
        // end the stream
        self.push(null);
      }
    });
  };
};

util.inherits(Readable, stream.Readable);

/**
* Consume a stream of stream objects containing tile data and coordinates.
*/
var Collector = function(options) {
  stream.Transform.call(this, {
    objectMode: true,
    highWaterMark: options && options.concurrency ? options.concurrency : DEFAULT_CONCURRENCY
  });

  this.on("pipe", function(src) {
    // forward "info" events
    src.on("info", this.emit.bind(this, "info"));
  });

  this._transform = function(obj, _, done) {
    // sentinel object (empty)
    if (obj === PING) {
      return done();
    }

    var self = this,
        chunks = [],
        headers = {};

    var collector = new stream.PassThrough();

    collector.setHeader = function(k, val) {
      headers[k] = val;
    };

    collector._transform = function(chunk, _, callback) {
      chunks.push(chunk);

      return callback();
    };

    collector._flush = function(callback) {
      var data = Buffer.concat(chunks);

      // emit a "tile" event once a tile's data has been successfully received
      self.emit("tile", {
        z: obj.z,
        x: obj.x,
        y: obj.y,
        headers: headers,
        length: data.length
      });

      self.push({
        z: obj.z,
        x: obj.x,
        y: obj.y,
        headers: headers,
        data: data
      });

      callback();

      return done();
    };

    return obj.pipe(collector);
  };
};

util.inherits(Collector, stream.Transform);

/**
* Wrap a tilelive sink
*/
var Writable = function(sink, options) {
  stream.Writable.call(this, {
    objectMode: true,
    highWaterMark: options && options.concurrency ? options.concurrency : DEFAULT_CONCURRENCY
  });

  this._write = function(obj, _, callback) {
    if (sink.putTile.length === 5) {
      // sink doesn't include a headers parameter
      return sink.putTile(obj.z, obj.x, obj.y, obj.data, callback);
    }

    return sink.putTile(obj.z, obj.x, obj.y, obj.data, obj.headers, callback);
  };
};

util.inherits(Writable, stream.Writable);

var enhance = function(uri, source) {
  if (typeof(uri) === "string") {
    uri = url.parse(uri);
  }

  var proto = uri.protocol.slice(0, -1);

  try {
    source = require("./lib/" + proto)(source);
  } catch (err) {}

  return source;
};

module.exports = function(tilelive, options) {
  options = options || {};
  options.concurrency = options.concurrency || DEFAULT_CONCURRENCY;

  var enableStreaming = function(uri, source) {
    if (source._streamable) {
      // already enhanced

      return source;
    }

    // attempt to enhance the source with custom streams
    source = enhance(uri, source);

    // fall back to default enhancement

    if (source.getTile) {
      // only add readable streams if the underlying source is readable

      source.createReadStream = source.createReadStream || function(opts) {
        return new Readable(opts, this);
      };
    }

    if (source.putTile) {
      // only add writable streams if the underlying source is writable

      source.createWriteStream = source.createWriteStream || function(opts) {
        var sink = this,
            writeStream = new Collector(options);

        opts = opts || {};
        opts.info = opts.info || {};

        if (sink.putInfo) {
          var infoReceived = false;

          writeStream.once("info", function(info) {
            infoReceived = true;
            options.info = _.extend(opts.info, info);

            return sink.putInfo(restrict(opts.info, info), function(err) {
              if (err) {
                throw err;
              }
            });
          });

          writeStream.on("finish", function() {
            if (!infoReceived) {
              infoReceived = true;
              return sink.putInfo(opts.info, function(err) {
                if (err) {
                  throw err;
                }
              });
            }
          });
        }

        writeStream
          .pipe(new Writable(this, options));

        // return a reference to the head-end of the pipeline
        return writeStream;
      };
    }

    source._streamable = true;

    return source;
  };

  var _load = tilelive.load.bind(tilelive);

  tilelive.load = function(uri, callback) {
    return _load(uri, function(err, source) {
      if (!err) {
        source = enableStreaming(uri, source);
      }

      return callback(err, source);
    });
  };

  return tilelive;
};

module.exports.Collector = Collector;
module.exports.Readable = Readable;
module.exports.TileStream = TileStream;
module.exports.Writable = Writable;
module.exports.applyDefaults = applyDefaults;
module.exports.clone = clone;
module.exports.restrict = restrict;
