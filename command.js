var Crypto = require('./crypto');
var uuid = require('node-uuid');

var self = {};
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

function Command() {

}

Command.Setup = function(socket, io) {
   self.socket = socket;
   self.io = io;
   self.admin = module.exports.Users[ module.exports.Clients[self.socket.id].username ].admin
}

Command.UUID_Socket = function(u) {
   var clients = module.exports.Clients;

   for (var k in clients) {
      if (clients[k].uuid === u) {
         return clients[k].socket;
      }
   }

   return false;
}

Command.UUID_SocketId = function(u) {
   var clients = module.exports.Clients;

   for (var k in clients) {
      if (clients[k].uuid === u) {
         return k;
      }
   }

   return false;
}

Command.Do = function(command, args) {
   switch(command) {
      case 'encrypt':
         if (args.length === 1) {
            Command.EncryptMessage( Crypto.GenerateKey(), Crypto.GenerateSalt(), args[0], true );
            break;
         }

         if (args.length !== 3 || !args[0] || !args[1] || !args[2]) {
            self.socket.emit('message', { message: 'Usage: /encrypt &lt;key&gt; &lt;salt&gt; &lt;plaintext&gt;'});
            break;
         }

         Command.EncryptMessage( args[0], args[1], args[2], false );
         break;

      case 'decrypt':
         if (args.length !== 3 || !args[0] || !args[1] || !args[2]) {
            self.socket.emit('message', { message: 'Usage: /decrypt &lt;key&gt; &lt;salt&gt; &lt;plaintext&gt;'});
            break;
         }

         Command.DecryptMessage( args[0], args[1], args[2] );
         break;

      case 'impersonate':
         if (!self.admin) {
            self.socket.emit('message', { message: 'Access denied.' });
            break;
         }

         Command.Impersonate(args);
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

         Command.Rename( module.exports.Clients[self.socket.id].username, args[0] );
         break;

      case 'disconnect':
         // Allow self-disconnect
         if (!args[0] || args[0] === module.exports.Clients[self.socket.id].uuid) {
            Command.Disconnect( self.socket );
            break;
         }

         if (!self.admin) {
            self.socket.emit('message', { message: 'Access denied.' });
            break;
         }

         Command.Disconnect( Command.UUID_Socket(args[0]) );
         break;

      case 'reboot':
         if (!self.admin) {
            self.socket.emit('message', { message: 'Access denied.' });
            break;
         }

         Command.Reboot();
         break;

      default:
         break;
   }
}

Command.GenerateUUID = function() {
   var client_uuid;
   while (!client_uuid || module.exports.Clients[client_uuid] !== undefined) {
      client_uuid = uuid.v4();
   }

   return client_uuid;
}

Command.Broadcast = function(emitter, data, excludes, includes) {
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
Command.EncryptBroadcast = function(send, client_select) {
   var recipients = get_keys(client_select);

   Crypto.Config.secret_key = Crypto.GenerateKey();
   Crypto.Config.salt = Crypto.GenerateSalt();
   Crypto.Reload();

   Crypto.Encrypt(send.message, function(err, ciphertext) {

      var client_encoded = send;
      client_encoded.key = Crypto.Config.secret_key;
      client_encoded.salt = Crypto.Config.salt;
      client_encoded.message = ciphertext;

      Command.Broadcast('encoded', client_encoded, [], recipients);
   });
}

Command.EncryptMessage = function(key, salt, plaintext, display_decrypt) {
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

Command.DecryptMessage = function(key, salt, ciphertext, decode_request) {
   Crypto.Config.secret_key = key;
   Crypto.Config.salt = salt;
   Crypto.Reload();

   try {
      Crypto.Decrypt(ciphertext, function (err, plaintext) {
         var response = { message: Command.SanitizeMessage(plaintext) };

         // Handle request to decode incoming message
         if (decode_request) {
            response.name = decode_request.name;
            response.decoded = true;
         }

         console.log('DecryptMessage to ' + module.exports.Clients[self.socket.id].username + ': ' + JSON.stringify(response));

         self.socket.emit('message', response);
      });
   } catch(err) {
      self.socket.emit('message', { message: 'Decrypt error.', error: err });
   }
}

Command.SanitizeMessage = function(message) {

   if (module.exports.Users[ module.exports.Clients[self.socket.id].username ].htmlspecialchars !== true) {
      message = (message).replace(/&/g, '&amp;');
   }

   if (module.exports.Users[ module.exports.Clients[self.socket.id].username ].html !== true) {
      message = (message).replace(/</g, '&lt;');
      message = (message).replace(/>/g, '&gt;');
   }

   return message;
}

Command.Reboot = function() {
   self.io.sockets.emit('message', { message: 'Disconnecting...' });
   self.io.sockets.emit('reload');

   module.exports.Clients = {};
}

Command.Rename = function(username, name) {
   module.exports.Users[username].name = name;
   Command.RefreshOnline();
}

Command.Disconnect = function(socket) {
   var clients = module.exports.Clients;

   if (socket) {
      socket.leave('auth'); // Leave authenticated room
      socket.emit('reload'); // Refresh client UI
      delete clients[socket.id]; // De-authenticate

      module.exports.Clients = clients;
      Command.RefreshOnline();
   }
}

Command.Impersonate = function(args) {
   var impersonate_name = args.shift();
   self.io.sockets.in('auth').emit('message', { name: impersonate_name, message: args.join(' ') });
}

Command.Online = function() {
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

Command.RefreshOnline = function() {
   self.io.sockets.in('auth').emit('online', Command.Online());
}

module.exports = Command;
module.exports.Clients = clients;
module.exports.Users = users;
