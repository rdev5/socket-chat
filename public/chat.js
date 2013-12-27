window.onload = function() {

   var messages = [];
   var port = 3700;
   var server_ip = $('#server').text();
   var socket = io.connect('http://' + server_ip + ':' + port);

   var field = document.getElementById('field');
   var sendButton = document.getElementById('send');
   var content = document.getElementById('content');
   var name = document.getElementById('name');

   $('#name').html('<h1>socket.io</h1>');

   socket.on('reload', function (data) {
      $('#logoff').trigger('click');
   });

   socket.on('ident', function (data) {
      if (!data.success)
         return false;

      if (data.success) {
         $('#auth-form').hide();
         $('#chat-controls').show();
         $('#uuid').val(data.uuid);

         $('#field').focus();
      }
   });

   socket.on('online', function (data) {
      var html = '';
      for (var client_uuid in data) {
         html += '<input type="checkbox" name="client_select" value="' + client_uuid + '" /> ';
         if (data[client_uuid].admin) {
            html += '@';
         }
         html += data[client_uuid].name;
         html += '<br />';
      }

      $('#online').html(html);
   });

   socket.on('message', function (data) {
      if (data.message) {
         var html = '<ul id="messages">';

         messages.push(data);
         for (var i = 0; i < messages.length; i++) {

            var display_name = messages[i].name ? messages[i].name : 'Server';

            // display_name admin marker
            if (messages[i].admin) {
               display_name = '@' + display_name;
            }

            // display_name encoded marker
            if (messages[i].decoded) {
               display_name = '(' + display_name + ')';
            }

            html += '<li><strong>' + display_name + '</strong> ' + messages[i].message + '</li>';
         }
         html += '</ul>';

         content.innerHTML = html;

         $('#content').scrollTop($('#content')[0].scrollHeight);
      } else {
         console.log('Error (no message): ' + JSON.stringify(data));
      }
   });

   socket.on('encoded', function (data) {
      socket.emit('decode', data);
   });

   function checked_values(field_name) {
      var values = {};

      $('input[name=' + field_name + ']:checked').each(function() {
         values[$(this).val()] = true;
      });

      return values;
   }

   sendButton.onclick = function() {
      if (name.value === '') {
         alert('Please enter your name!');
      } else {
         var text = field.value;
         var send = {
            message: text,
            name: name.value,
            uuid: uuid.value,
            client_select: JSON.stringify(checked_values('client_select'))
         }
         socket.emit('send', send);

         field.value = '';
         field.focus();
      }
   };

   $('#authenticate').click(function() {
      socket.emit('auth', { username: $('#username').val(), password: $('#password').val() });
   });

   $('#logoff').click(function() {
      socket.disconnect();
      location.reload(true);
   });
}

function show_crypto(self) {
   var _this = jQuery(self);
   var encoded = JSON.parse($(_this).find('span').first().text());

   $('#ciphertext').html('Ciphertext: ' + encoded.message);
   $('#key').html('Key: ' + encoded.key);
   $('#salt').html('Salt: ' + encoded.salt);

   return false;
}