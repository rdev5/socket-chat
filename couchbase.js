var couchbase = require('couchbase');
var default_config = require('yaml-config').readConfig('./samples/config/couchbase.yml');

function Couchbase(options) {
   if (this instanceof Couchbase) {
      if (!options) {
         options = default_config;
      }

      this.db = new couchbase.Connection(options, function(err) {
         if (err) {
            console.log('Error connecting to Couchbase: ' + err);
         }
      });
   } else {
      return new Couchbase(options);
   }
}

Couchbase.get = function(key, options, callback) {
   var self = this;

   self.db.get(key, options, callback);
}

Couchbase.set = function(key, value, options, callback) {
   var self = this;

   self.db.set(key, value, options, callback);
}

module.exports = Couchbase;