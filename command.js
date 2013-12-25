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

Command.GetClients = function() {
   return module.exports.Clients;
}

Command.GetUsers = function() {
   return module.exports.Users;
}

Command.Vars = function(key) {
   return self.options[key] ? self.options[key] : self[key];
}

Command.Setup = function(options) {
   self.io = options.io;
   self.options = options;
}

Command.UUID_Socket = function(u) {
   var clients = Command.GetClients();

   for (var k in clients) {
      if (clients[k].uuid === u) {
         return clients[k].socket;
      }
   }

   return false;
}

Command.UUID_SocketId = function(u) {
   var clients = Command.GetClients();

   for (var k in clients) {
      if (clients[k].uuid === u) {
         return k;
      }
   }

   return false;
}

Command.Reboot = function() {
   self.io.sockets.emit('message', { message: 'Disconnecting...' });
   self.io.sockets.emit('reload');

   module.exports.Clients = {};
}

Command.Disconnect = function(socket) {
   var clients = Command.GetClients();

   if (socket) {
      socket.leave('auth'); // Leave authenticated room
      socket.emit('connected'); // Refresh client UI
      delete clients[socket.id]; // De-authenticate

      Command.RefreshOnline();
   }

   module.exports.Clients = clients;
}

Command.Impersonate = function(args) {
   var impersonate_name = args.shift();
   self.io.sockets.in('auth').emit('message', { name: impersonate_name, message: args.join(' ') });
}

Command.Online = function() {
   var users_online = {};
   var users = Command.GetUsers();
   var clients = Command.GetClients();

   for (var k in clients) {
      var username = clients[k].username;
      var user_uuid = clients[k].uuid;
      users_online[user_uuid] = {
         name: users[username].name,
         admin: users[username].admin,
         htmlspecialchars: users[username].htmlspecialchars,
         html: users[username].html
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
