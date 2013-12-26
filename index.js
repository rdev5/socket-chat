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

function broadcast(emitter, data, excludes, includes) {
   for (var socket_id in Command.Clients) {
      var u = Command.Clients[socket_id].uuid;

      if (excludes !== undefined && excludes.length > 0 && excludes.indexOf(u) !== -1)
         continue;

      if (includes !== undefined && includes.indexOf(u) === -1)
         continue;

      Command.Clients[socket_id].socket.emit(emitter, data);
   }
}

// Maintain list of authenticated clients
Command.Clients = {};

io.sockets.on('connection', function (socket) {

   // Generate UUID for authenticated client
   while (client_uuid === undefined || Command.Clients[client_uuid] !== undefined)
      var client_uuid = uuid.v4();

   var auth = Command.Users;

   // Emit welcome message to newly connected socket
   socket.emit('connected');
   socket.emit('message', { message: 'Connection successful. Please authenticate.' });

   // Authentication
   socket.on('auth', function (data) {

      var auth_user = auth[data.username];

      if (auth_user !== undefined && auth_user.password === data.password) {

         // Save authenticated client details
         Command.Clients[socket.id] = {
            uuid: client_uuid,
            username: data.username,
            ip: socket.handshake.address.address,
            port: socket.handshake.address.port,
            socket: socket
            // crypto: { key: Crypto.GenerateKey(), salt: Crypto.GenerateSalt(), iv_size: IV_SIZE }
         };

         // Join room
         socket.join('auth');

         // Send UUID
         socket.emit('message', { message: 'Authentication successful. Welcome back, ' + auth[data.username].name + '!' });
         socket.emit('ident', { success: true, uuid: client_uuid, name: auth[data.username].name, admin: auth[data.username].admin });

         // Broadcast user online to all but self
         broadcast('message', { message: auth[data.username].name + ' (' + Command.Clients[socket.id].ip + ') is now online.' }, [ Command.Clients[socket.id].uuid ]);

         // Update online users
         io.sockets.in('auth').emit('online', Command.Online());
      } else {
         socket.emit('message', { message: 'Authentication failed. Please try again.' });
      }
   });

   // Handle requests to decode messages
   socket.on('decode', function (data) {
      Crypto.Config.secret_key = data.key;
      Crypto.Config.salt = data.salt;
      Crypto.Reload();

      Crypto.Decrypt(data.message, function (err, plaintext) {
         socket.emit('message', { name: data.name, message: plaintext, decoded: true });
      });
   });

   // Handle disconnect
   socket.on('disconnect', function () {
      if (Command.Clients[socket.id] === undefined)
         return false;

      // Broadcast user offline to all but self
      broadcast('message', { message: auth[Command.Clients[socket.id].username].name + ' is leaving the channel...' }, [ Command.Clients[socket.id].uuid ]);
      Command.Disconnect(socket);
   
      // Update online users
      io.sockets.in('auth').emit('online', Command.Online());
   });

   // List for socket to emit data to 'send'
   socket.on('send', function (data) {

      // Require authenticated UUID
      if (Command.Clients[socket.id] === undefined) {
         socket.emit('message', { message: 'Invalid ident. Please re-authenticate.' });
         return false;
      }

      // Send plaintext
      var username = Command.Clients[socket.id].username;
      var send = {
         name: auth[username].name,
         message: data.message,
         admin: auth[username].admin
      }

      // Handle commands
      var cmd = (data.message).match(/^\/([^\s]+)/i);
      if (cmd) {
         var args = (data.message).split(' ');
         args.shift();

         Command.Setup({ io: io, admin: auth[username].admin, socket: socket });
         Command.Do(cmd[1], args);
         return;
      }

      // Send encrypted
      var client_select = JSON.parse(data.client_select);
      if (!is_empty(client_select)) {
         // var client_crypto = clients[data.uuid].crypto;

         var recipients = get_keys(client_select);
         var client_encoded = send;

         client_encoded.key = Crypto.GenerateKey();
         client_encoded.salt = Crypto.GenerateSalt();

         Crypto.Config.secret_key = client_encoded.key;
         Crypto.Config.salt = client_encoded.salt;
         Crypto.Reload();

         Crypto.Encrypt(send.message, function(err, ciphertext) {
            client_encoded.message = ciphertext;

            recipients.push(client_uuid);
            broadcast('encoded', client_encoded, [], recipients);
         });
      } else {

         if (auth[username].htmlspecialchars !== true) {
            send.message = (send.message).replace(/&/g, '&amp;');
         }

         if (auth[username].html !== true) {
            send.message = (send.message).replace(/</g, '&lt;');
            send.message = (send.message).replace(/>/g, '&gt;');
         }

         // Broadcast on all authenticated io.sockets
         io.sockets.in('auth').emit('message', send);
      }
   });
   
});