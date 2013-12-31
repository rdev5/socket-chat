# socket-chat

> Written by Matt Borja

Developer-friendly socket chat application written in Node.js containing many useful helper functions for all your socket interaction needs.

## Main Features

- Sockets (socket.io)
- Crypto (bcrypt + crypto)
- YAML Configuration (yaml-config)
- Custom set of IRC-like chat commands
- Client authentication, access control lists, and more!

## Technical Details

- Client authentication implementing Bcrypt hashing and server issued unique UUID issuing
- Chat commands (see command.js for a complete list of currently available chat commands)
- Handy crypto wrapper with signing, ciphering, packing, and hashing
- Cross-Origin Resource Sharing (CORS)
- Various developer-friendly helper functions
- Implements yaml-config for configuring crypto
- Client UI with online users list and admin-only /reboot command :)
- Socket rooms restricted to authentication and access lists

## Feedback and Suggestions

Please feel free to fork and submit a pull request, or simply leave a comment, if you would like to make a contribution, leave feedback, or suggest a new feature. Small changes are welcomed too :)
