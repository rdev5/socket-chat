var Crypto = require('./crypto');
var uuid = require('node-uuid');

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
      this.username = null;
      this.uuid = null;
      this.Clients = {};
      this.Users = {};
   } else {
      return new Command(socket, io);
   }
}

Command.prototype.GetUsers = function() {
   var self = this;

   var users = {
      matt: { name: 'Matt', password: 'e259a43ba6df0f48aaef42d283fb926c28715decb365321c7c628d817cc2da427460f7d072f3d64d4d7cdb9f1d4b83d7c8554c44d0f4e2584d2db956c81b3f9d', admin: true },
      bob: { name: 'Bob', password: 'b0b0f9b64e165df1203156f10e1e9757c66ebc6f449efe90b9228d7a9a289bb508e74f6c892205705f3e91a2e3e900f7157a100b703c49176d1b5944989001ce' },
      john: { name: 'John', password: '110c77e53781bfce2f0d8f7c73551a4733bbd63f45b3e22227c93b9524cd9a77cf0543b2a3e35f286fed6eda89f0ff3605ce51cba81d50bb0245a5078a3ca23e' },
      demo: { name: 'Guest', password: 'abc60fba95338609bb9b0e5fd23ccd6c021ddd77983cf3848e54961121adb56ac320fe4e7b61fb968ee9b023755635f3152c0217722e0bfff31d81900695f808' }
   };

   return users;
}

Command.prototype.Admin = function() {
   var self = this;

   return self.Users[ self.username ].admin;
}

Command.prototype.UUID_Socket = function(u) {
   var self = this;

   var clients = self.Clients;

   for (var k in clients) {
      if (clients[k].uuid === u) {
         return clients[k].socket;
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
         if (!self.Admin()) {
            self.socket.emit('message', { message: 'Access denied.' });
            break;
         }

         self.Impersonate(args);
         break;

      case 'nick':
         if (!self.Admin()) {
            self.socket.emit('message', { message: 'Access denied.' });
            break;
         }

         if (!args[0]) {
            self.socket.emit('message', { message: 'Name required.' });
            break;
         }

         self.Rename( self.username, args[0] );
         break;

      case 'disconnect':
         // Allow self-disconnect
         if (!args[0] || args[0] === self.uuid) {
            self.Disconnect( self.socket );
            break;
         }

         if (!self.Admin()) {
            self.socket.emit('message', { message: 'Access denied.' });
            break;
         }

         self.Disconnect( self.UUID_Socket(args[0]) );
         break;

      case 'reboot':
         if (!self.Admin()) {
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
   while (!client_uuid || self.Clients[client_uuid] !== undefined) {
      client_uuid = uuid.v4();
   }

   return client_uuid;
}

Command.prototype.Authenticate = function(username, password) {
   var self = this;

   self.Users = self.GetUsers();
   if (self.Users[username] !== undefined && self.Users[username].password === Crypto.Hash(password)) {

      self.Clients[self.socket.id] = {
         uuid: self.GenerateUUID(),
         username: username,
         ip: self.socket.handshake.address.address,
         port: self.socket.handshake.address.port,
         socket: self.socket
      };

      // Update SocketCommand
      self.username = self.Clients[self.socket.id].username;
      self.uuid = self.Clients[self.socket.id].uuid;

      // Join the party!
      self.Join('auth');
   } else {
      self.socket.emit('message', { message: 'Authentication failed. Please try again.' });
   }
}

Command.prototype.Join = function(room) {
   var self = this;

   // Join room
   self.socket.join(room);

   // Send UUID
   self.socket.emit('message', {
      message: 'Authentication successful. Welcome back, ' + self.Users[ self.username ].name + '!'
   });

   self.socket.emit('ident', {
      success: true,
      uuid: self.uuid,
      name: self.Users[ self.username ].name,
      admin: self.Users[ self.username ].admin
   });

   // Broadcast user online to all but self
   self.Broadcast('message', { message: self.Users[ self.username ].name + ' is now online.' }, [ self.uuid ]);

   // Update online users
   self.io.sockets.in(room).emit('online', self.Online());
}

Command.prototype.Broadcast = function(emitter, data, excludes, includes) {
   var self = this;

   for (var socket_id in self.Clients) {
      var u = self.Clients[socket_id].uuid;

      if (excludes !== undefined && excludes.length > 0 && excludes.indexOf(u) !== -1)
         continue;

      if (includes !== undefined && includes.indexOf(u) === -1)
         continue;

      self.Clients[socket_id].socket.emit(emitter, data);
   }
}

// Sends key and salt with ciphertext (subject to MITM)
Command.prototype.EncryptBroadcast = function(send, client_select) {
   var self = this;

   // CC own socket
   if (!client_select[ self.uuid ]) {
      client_select[ self.uuid ] = true;
   }

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

         self.socket.emit('message', response);
      });
   } catch(err) {
      socket.emit('message', { message: 'Decrypt error.', error: err });
   }
}

Command.prototype.SanitizeMessage = function(message) {
   var self = this;


   if (self.Users[ self.username ].htmlspecialchars !== true) {
      message = (message).replace(/&/g, '&amp;');
   }

   if (self.Users[ self.username ].html !== true) {
      message = (message).replace(/</g, '&lt;');
      message = (message).replace(/>/g, '&gt;');
   }

   return message;
}

Command.prototype.Reboot = function() {
   var self = this;

   self.io.sockets.emit('message', { message: 'Disconnecting...' });
   self.io.sockets.emit('reload');

   self.Clients = {};
}

Command.prototype.Rename = function(username, name) {
   var self = this;

   self.Users[username].name = name;
   self.RefreshOnline();
}

Command.prototype.Disconnect = function(socket) {
   var self = this;

   var clients = self.Clients;

   if (!socket) {
      socket = self.socket;
   }

   socket.leave('auth'); // Leave authenticated room
   socket.emit('reload'); // Refresh client UI
   delete clients[socket.id]; // De-authenticate

   self.Clients = clients;
   self.RefreshOnline();
}

Command.prototype.Impersonate = function(args) {
   var self = this;

   var impersonate_name = args.shift();
   self.io.sockets.in('auth').emit('message', { name: impersonate_name, message: args.join(' ') });
}

Command.prototype.Online = function() {
   var self = this;

   var users_online = {};

   for (var k in self.Clients) {
      var username = self.Clients[k].username;
      var user_uuid = self.Clients[k].uuid;
      users_online[user_uuid] = {
         name: self.Users[username].name,
         admin: self.Users[username].admin,
         htmlspecialchars: self.Users[username].htmlspecialchars,
         html: self.Users[username].html
      };
   }

   return users_online;
}

Command.prototype.RefreshOnline = function() {
   var self = this;

   self.io.sockets.in('auth').emit('online', self.Online());
}

module.exports = Command;

