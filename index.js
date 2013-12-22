var uuid = require('node-uuid');
var express = require('express');
var app = express();
var port = 3700;

app.use(express.static(__dirname + '/public'));

app.set('views', __dirname + '/tpl');
app.set('view engine', 'jade');

app.engine('jade', require('jade').__express);

app.get('/', function(req, res) {
   res.render('basic-ui');
});

function getKeys(obj) {
   var keys = [];
   for (var k in obj) {
      keys.push(k);
   }
   return keys;
}

// app.listen(port);
var io = require('socket.io').listen(app.listen(port));
console.log('Listening on port ' + port);

function broadcast(emitter, data, excludes, includes) {
   for (var uuid in clients) {
      if (excludes !== undefined && excludes.length > 0 && excludes.indexOf(uuid) !== -1)
         continue;

      if (includes !== undefined && includes.length > 0 && includes.indexOf(uuid) === -1)
         continue;

      clients[uuid].socket.emit(emitter, data);
   }
}

function logoff(socket, data) {
   // Leave room
   socket.leave('auth');

   // Revert form controls via 'connected'
   socket.emit('connected');

   // Remove from clients
   delete clients[data.uuid];
}

// Maintain list of authenticated clients
var clients = {};

io.sockets.on('connection', function (socket) {

   // Registered users (TODO: Pull from Couchbase)
   var auth = {
      matt: { name: 'Matt', password: 'matt123' },
      bob: { name: 'Bob', password: 'bob456' },
      john: { name: 'John', password: 'john789' }
   }

   // Emit welcome message to newly connected socket
   socket.emit('connected');
   socket.emit('message', { message: 'Connection successful. Please authenticate.' });

   // Authentication
   socket.on('auth', function (data) {

      var auth_user = auth[data.username];

      if (auth_user !== undefined && auth_user.password === data.password) {

         // Generate UUID for authenticated client
         while (client_uuid === undefined || clients[client_uuid] !== undefined)
            var client_uuid = uuid.v4();

         // Save authenticated client details
         clients[client_uuid] = {
            username: data.username,
            ip: socket.handshake.address.address,
            port: socket.handshake.address.port,
            socket: socket
         };

         // Join room
         socket.join('auth');

         // Send UUID
         socket.emit('message', { message: 'Authentication successful. Welcome back, ' + auth[data.username].name + '!' });
         socket.emit('ident', { success: true, uuid: client_uuid, name: auth[data.username].name });

         // Broadcast user online to all but self
         broadcast('message', { message: auth[data.username].name + ' is now online.' }, [ client_uuid ]);
      } else {
         socket.emit('message', { message: 'Authentication failed. Please try again.' });
      }
   });

   // De-authenticate
   socket.on('deauth', function (data) {
      if (clients[data.uuid] === undefined)
         return false;

      // Broadcast user offline to all but self
      broadcast('message', { message: auth[clients[data.uuid].username].name + ' logged off.' }, [ data.uuid ]);
      logoff(socket, data);
   });

   // List for socket to emit data to 'send'
   socket.on('send', function (data) {

      // Require authenticated UUID
      if (clients[data.uuid] === undefined) {
         socket.emit('message', { message: 'Invalid ident. Please re-authenticate.' });
         // logoff(socket, data);
         return false;
      }

      // Require same IP
      if (clients[data.uuid].ip !== socket.handshake.address.address) {
         socket.emit('message', { message: 'Invalid origin. Please re-authenticate.' });
         // logoff(socket, data);
         return false;
      }

      // Sanitize data to broadcast
      var username = clients[data.uuid].username;
      var send = {
         name: auth[username].name,
         message: data.message
      }

      // Broadcast on all io.sockets
      // io.sockets.emit('message', send);

      // Broadcast on all authenticated io.sockets
      io.sockets.in('auth').emit('message', send);
   });
   
});