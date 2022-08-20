let io;

module.exports = {
    init: http => {
        io = require('socket.io')(http, {
            cors: {
                origin: '*',
                methods: ['GET', 'POST'],
                transports: ['websocket', 'polling'],
                credentials: true,
            },
            allowEIO3: true,
        });

        return io;
    },
    get: () => {
        if (!io) {
            throw new Error('socket is not initialized');
        }

        return io;
    },
};
