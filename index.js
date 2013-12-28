var uuid = require('node-uuid');
var express = require('express');
var crypto = require('crypto');
var Crypto = require('./crypto');
var Command = require('./command');
var os = require('os');
var app = express();
var port = 3700;

function local_addr() {
  var ifs = os.networkInterfaces();
  var addrs = [];
  for (var i in ifs) {
    if (ifs.hasOwnProperty(i)) {
      for (var j = 0; j < ifs[i].length; ++j) {
        if (!ifs[i][j].internal) {
          if (ifs[i][j].family === 'IPv4') {
            addrs.push(ifs[i][j].address);
          }
        }
      }
    }
  }
  return addrs[0];
};

var CORS = function(req, res, next) {
   res.header('Access-Control-Allow-Origin', '*');
   res.header('Access-Control-Allow-Headers', 'Authorization, Content-Length, X-Requested-With');
   res.header('Access-Control-Expose-Headers', 'Authorization, Content-Length, X-Requested-With');
   res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');

   // intercept OPTIONS method
   if ('OPTIONS' == req.method) {
      res.send(200);
   } else {
      next();
   }
};

app.use(CORS);
app.use(express.static(__dirname + '/public'));

app.set('views', __dirname + '/tpl');
app.set('view engine', 'jade');

app.engine('jade', require('jade').__express);

app.get('/', function(req, res) {
   res.render('basic-ui', { server: local_addr() });
});

// app.listen(port);
var io = require('socket.io').listen(app.listen(port));
console.log('Listening on port ' + port);

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

// Maintain list of authenticated clients
Command.Clients = {};

var SocketCommand = {};

// Note: SocketCommand[socket.id].Setup() must be called prior to processing any commands for the connected socket.
io.sockets.on('connection', function (socket) {

   SocketCommand[socket.id] = new Command(socket, io);

   // Emit welcome message to newly connected socket
   socket.emit('message', { message: 'Connection successful. Please authenticate.' });

   // Authentication
   socket.on('auth', function (data) {

      if (Command.Users[data.username] !== undefined && Command.Users[data.username].password === data.password) {

         var client_uuid = SocketCommand[socket.id].GenerateUUID();

         // Save authenticated client details
         Command.Clients[socket.id] = {
            uuid: client_uuid,
            username: data.username,
            ip: socket.handshake.address.address,
            port: socket.handshake.address.port,
            socket: socket
         };
         SocketCommand[socket.id].Clients = Command.Clients;

         // Join room
         socket.join('auth');

         // Send UUID
         socket.emit('message', { message: 'Authentication successful. Welcome back, ' + Command.Users[data.username].name + '!' });
         socket.emit('ident', { success: true, uuid: client_uuid, name: Command.Users[data.username].name, admin: Command.Users[data.username].admin });

         // Broadcast user online to all but self
         SocketCommand[socket.id].Broadcast('message', { message: Command.Users[data.username].name + ' is now online.' }, [ Command.Clients[socket.id].uuid ]);

         // Update online users
         io.sockets.in('auth').emit('online', SocketCommand[socket.id].Online());
      } else {
         socket.emit('message', { message: 'Authentication failed. Please try again.' });
      }
   });

   // Handle requests to decode messages
   socket.on('decode', function (data) {
      SocketCommand[socket.id].DecryptMessage(data.key, data.salt, data.message, data);
   });

   // Handle disconnect
   socket.on('disconnect', function () {
      if (!Command.Clients[socket.id])
         return false;

      // Broadcast user offline to all but self
      SocketCommand[socket.id].Broadcast('message', { message: Command.Users[Command.Clients[socket.id].username].name + ' is leaving the channel...' }, [ Command.Clients[socket.id].uuid ]);
      SocketCommand[socket.id].Disconnect(socket);
   
      // Update online users
      io.sockets.in('auth').emit('online', SocketCommand[socket.id].Online());
   });

   // List for socket to emit data to 'send'
   socket.on('send', function (data) {

      // Require authenticated UUID
      if (!Command.Clients[socket.id]) {
         socket.emit('message', { message: 'Invalid ident. Please re-authenticate.' });
         return false;
      }

      // Send plaintext
      var username = Command.Clients[socket.id].username;
      var send = {
         name: Command.Users[username].name,
         message: data.message,
         admin: Command.Users[username].admin
      }

      // Handle commands
      var cmd = (data.message).match(/^\/([^\s]+)/i);
      if (cmd) {
         var args = (data.message).split(' ');
         args.shift();
         SocketCommand[socket.id].Do(cmd[1], args);
         return;
      }

      // Send encrypted
      var client_select = JSON.parse(data.client_select);
      if (!is_empty(client_select)) {

         // Include self
         if (!client_select[ Command.Clients[socket.id].uuid ]) {
            client_select[ Command.Clients[socket.id].uuid ] = true;
         }

         SocketCommand[socket.id].EncryptBroadcast(send, client_select);
      } else {
         send.message = SocketCommand[socket.id].SanitizeMessage(send.message);
         io.sockets.in('auth').emit('message', send);
      }
   });
});