var Crypto = require('./crypto');
var uuid = require('node-uuid');

var clients = {};
var users = {
   matt: { name: 'Matt', password: 'matt123', admin: true },
   bob: { name: 'Bob', password: 'bob456' },
   john: { name: 'John', password: 'john789' },
   demo: { name: 'Guest', password: 'demo' }
};

function get_keys(obj) {
   var keys = [];
   for (var k in obj) {
      keys.push(k);
   }
   return keys;
}

function is_empty(map) {
   for(var key in map) {
      if (map.hasOwnProperty(key)) {
         return false;
      }
   }
   return true;
}

function Command(socket, io) {
   if (this instanceof Command) {
      this.socket = socket;
      this.io = io;
      // self.admin = module.exports.Users[ module.exports.Clients[self.socket.id].username ].admin
   } else {
      return new Command(socket, io);
   }
}

Command.prototype.UUID_Socket = function(u) {
   var self = this;

   var clients = module.exports.Clients;

   for (var k in clients) {
      if (clients[k].uuid === u) {
         return clients[k].socket;
      }
   }

   return false;
}

Command.prototype.UUID_SocketId = function(u) {
   var self = this;

   var clients = module.exports.Clients;

   for (var k in clients) {
      if (clients[k].uuid === u) {
         return k;
      }
   }

   return false;
}

Command.prototype.Do = function(command, args) {
   var self = this;

   switch(command) {
      case 'encrypt':
         if (args.length === 1) {
            self.EncryptMessage( Crypto.GenerateKey(), Crypto.GenerateSalt(), args[0], true );
            break;
         }

         if (args.length !== 3 || !args[0] || !args[1] || !args[2]) {
            self.socket.emit('message', { message: 'Usage: /encrypt &lt;key&gt; &lt;salt&gt; &lt;plaintext&gt;'});
            break;
         }

         self.EncryptMessage( args[0], args[1], args[2], false );
         break;

      case 'decrypt':
         if (args.length !== 3 || !args[0] || !args[1] || !args[2]) {
            self.socket.emit('message', { message: 'Usage: /decrypt &lt;key&gt; &lt;salt&gt; &lt;plaintext&gt;'});
            break;
         }

         self.DecryptMessage( args[0], args[1], args[2] );
         break;

      case 'impersonate':
         if (!self.admin) {
            self.socket.emit('message', { message: 'Access denied.' });
            break;
         }

         self.Impersonate(args);
         break;

      case 'nick':
         if (!self.admin) {
            self.socket.emit('message', { message: 'Access denied.' });
            break;
         }

         if (!args[0]) {
            self.socket.emit('message', { message: 'Name required.' });
            break;
         }

         self.Rename( module.exports.Clients[self.socket.id].username, args[0] );
         break;

      case 'disconnect':
         // Allow self-disconnect
         if (!args[0] || args[0] === module.exports.Clients[self.socket.id].uuid) {
            self.Disconnect( self.socket );
            break;
         }

         if (!self.admin) {
            self.socket.emit('message', { message: 'Access denied.' });
            break;
         }

         self.Disconnect( self.UUID_Socket(args[0]) );
         break;

      case 'reboot':
         if (!self.admin) {
            self.socket.emit('message', { message: 'Access denied.' });
            break;
         }

         self.Reboot();
         break;

      default:
         break;
   }
}

Command.prototype.GenerateUUID = function() {
   var self = this;

   var client_uuid;
   while (!client_uuid || module.exports.Clients[client_uuid] !== undefined) {
      client_uuid = uuid.v4();
   }

   return client_uuid;
}

Command.prototype.Broadcast = function(emitter, data, excludes, includes) {
   var self = this;

   for (var socket_id in module.exports.Clients) {
      var u = module.exports.Clients[socket_id].uuid;

      if (excludes !== undefined && excludes.length > 0 && excludes.indexOf(u) !== -1)
         continue;

      if (includes !== undefined && includes.indexOf(u) === -1)
         continue;

      module.exports.Clients[socket_id].socket.emit(emitter, data);
   }
}

// Sends key and salt with ciphertext (subject to MITM)
Command.prototype.EncryptBroadcast = function(send, client_select) {
   var self = this;

   var recipients = get_keys(client_select);

   Crypto.Config.secret_key = Crypto.GenerateKey();
   Crypto.Config.salt = Crypto.GenerateSalt();
   Crypto.Reload();

   Crypto.Encrypt(send.message, function(err, ciphertext) {

      var client_encoded = send;
      client_encoded.key = Crypto.Config.secret_key;
      client_encoded.salt = Crypto.Config.salt;
      client_encoded.message = ciphertext;

      self.Broadcast('encoded', client_encoded, [], recipients);
   });
}

Command.prototype.EncryptMessage = function(key, salt, plaintext, display_decrypt) {
   var self = this;

   Crypto.Config.secret_key = key;
   Crypto.Config.salt = salt;
   Crypto.Reload();

   try {
      Crypto.Encrypt(plaintext, function(err, ciphertext) {
         if (display_decrypt === true) {
            self.socket.emit('message', { message: 'Key: ' + key + ', Salt: ' + salt + ' | ' + ciphertext });
         } else {
            self.socket.emit('message', { message: ciphertext });
         }
      });
   } catch(err) {
      self.socket.emit('message', { message: 'Encrypt error.', error: err });
   }
}

Command.prototype.DecryptMessage = function(key, salt, ciphertext, decode_request) {
   var self = this;

   Crypto.Config.secret_key = key;
   Crypto.Config.salt = salt;
   Crypto.Reload();

   try {
      Crypto.Decrypt(ciphertext, function (err, plaintext) {
         var response = { message: self.SanitizeMessage(plaintext) };

         // Handle request to decode incoming message
         if (decode_request) {
            response.name = decode_request.name;
            response.decoded = true;
         }

         module.exports.Clients[self.socket.id].socket.emit('message', response);
      });
   } catch(err) {
      socket.emit('message', { message: 'Decrypt error.', error: err });
   }
}

Command.prototype.SanitizeMessage = function(message) {
   var self = this;


   if (module.exports.Users[ module.exports.Clients[self.socket.id].username ].htmlspecialchars !== true) {
      message = (message).replace(/&/g, '&amp;');
   }

   if (module.exports.Users[ module.exports.Clients[self.socket.id].username ].html !== true) {
      message = (message).replace(/</g, '&lt;');
      message = (message).replace(/>/g, '&gt;');
   }

   return message;
}

Command.prototype.Reboot = function() {
   var self = this;

   self.io.sockets.emit('message', { message: 'Disconnecting...' });
   self.io.sockets.emit('reload');

   module.exports.Clients = {};
}

Command.prototype.Rename = function(username, name) {
   var self = this;

   module.exports.Users[username].name = name;
   self.RefreshOnline();
}

Command.prototype.Disconnect = function(socket) {
   var self = this;

   var clients = module.exports.Clients;

   if (socket) {
      socket.leave('auth'); // Leave authenticated room
      socket.emit('reload'); // Refresh client UI
      delete clients[socket.id]; // De-authenticate

      module.exports.Clients = clients;
      self.RefreshOnline();
   }
}

Command.prototype.Impersonate = function(args) {
   var self = this;

   var impersonate_name = args.shift();
   self.io.sockets.in('auth').emit('message', { name: impersonate_name, message: args.join(' ') });
}

Command.prototype.Online = function() {
   var self = this;

   var users_online = {};

   for (var k in module.exports.Clients) {
      var username = module.exports.Clients[k].username;
      var user_uuid = module.exports.Clients[k].uuid;
      users_online[user_uuid] = {
         name: module.exports.Users[username].name,
         admin: module.exports.Users[username].admin,
         htmlspecialchars: module.exports.Users[username].htmlspecialchars,
         html: module.exports.Users[username].html
      };
   }

   return users_online;
}

Command.prototype.RefreshOnline = function() {
   var self = this;

   self.io.sockets.in('auth').emit('online', self.Online());
}

module.exports = Command;
module.exports.Clients = clients;
module.exports.Users = users;
