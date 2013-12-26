var self = {};
var clients = {};
var users = {
   matt: { name: 'Matt', password: 'matt123', admin: true },
   bob: { name: 'Bob', password: 'bob456' },
   john: { name: 'John', password: 'john789' },
   demo: { name: 'Guest', password: 'demo' }
};

function Command() {

}

Command.Setup = function(options) {
   self.io = options.io;
   self.admin = options.admin;
   self.socket = options.socket;
   self.options = options;
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
   console.log(module.exports.Clients[self.socket.id].username + ' issued command [' + command + '] with args [' + args + ']');

   switch(command) {
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

      case 'impersonate':
         if (!self.admin) {
            self.socket.emit('message', { message: 'Access denied.' });
            break;
         }

         Command.Impersonate(args);
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
