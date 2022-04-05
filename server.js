// #region переменные
const express = require('express');
const cors = require('cors');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        transports: ['websocket', 'polling'],
        credentials: true,
    },
    allowEIO3: true,
});

const route = express.Router();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors());
app.use(route);

const xml2json = require('xml2json');
const transaqConnector = require('./modules_in_project/finam/transaqConnector.js');
const dev = app.get('dev') === 'production';

// различные функции
let workHereOrInTransaqConnector = true;
const arrayOneWorldCommands = ['server_status', 'get_securities'];
const arrayAnyWorldCommands = [
    'gethistorydata',
    'get_portfolio',
    'get_mc_portfolio',
    'get_forts_positions',
    'neworder',
    'newstoporder',
    'newcondorder',
    'cancelstoporder',
    'cancelorder',
    'change_pass',
];
let clientsocket;

io.on('connection', function(socket) {
    //Whenever someone disconnects this piece of code executed
    clientsocket = socket;
    clientsocket.emit('conn', 'wait for this');
    socket.on('disconnect', function() {});
});

// if we are sure to listen only to port 12345 we can remove this random port process.env.PORT
const ip = '0.0.0.0';
const port = process.env.PORT || 12345;

http.listen(port, ip, function() {});

function getFunctionConnect(transaqConnector, lastEmitTime, HftOrNot) {
    return transaqConnector.functionConnect(HftOrNot, data => {
        const message = JSON.parse(xml2json.toJson(data));

        if (!message) {
            return;
        }
        if (Date.now() - lastEmitTime > 5000) {
            clientsocket.emit('auth', {
                checkStatus: true,
            });

            lastEmitTime = Date.now();
        }
        if (message.candles) {
            clientsocket.emit('show-widget', message);
        }
        clientsocket && clientsocket.emit('show-logs', message);
        if (Date.now() - lastEmitTime > 5000) {
            clientsocket.emit('auth', {
                checkStatus: true,
            });

            lastEmitTime = Date.now();
        }

        if (message.client && message.client.id) {
            transaqConnector.objectAccountsAndDll.users[HftOrNot].Account =
        message.client;
            transaqConnector.objectAccountsAndDll.users[HftOrNot].Account.clientId_1 =
        message.client.id;

            clientsocket.emit('auth', {
                connected: true,
            });
        }
        if (
            message.messages &&
      message.messages.message &&
      message.messages.message.text ===
        'Password expired. Please change the password'
        ) {
            // TODO: popup about pass expired. not active emit

            clientsocket.emit(
                'pass-expired',
                'password expired, Please change your password',
            );

            // socket io notifu the user that the password is expired , make this to sender only
            // clientsocket.emit("password-expired",'Password expired. Please change the password')
            clientsocket.emit('auth', {
                expired: true,
            });
        }
        if (message['server_status']) {
            if (
                message.server_status.connected === 'error' ||
        message.server_status.connected === 'false'
            ) {
                // TODO: popup about connect error and redirect to login page
                // redirect to login page
                clientsocket.emit('auth', {
                    error: true,
                });
            } else if (message['server_status']['connected'] === 'true') {
                // TODO: exit button and disconnect on click.
                clientsocket.emit('auth', {
                    connected: true,
                });
            }
        }
    });
}

function commandConnect(req, transaqConnector, result, HftOrNot) {
    if (transaqConnector.isTransaqConnected[HftOrNot]) {
        result = transaqConnector.objectAccountsAndDll['afterInitialize'][
            HftOrNot
        ].SendCommand('<command id="disconnect"/>');
    } else {
        transaqConnector.isTransaqConnected[HftOrNot] = true;
    }
    const { login, password, host, port } = req.query;

    transaqConnector.objectAccountsAndDll.users[HftOrNot] = {
        Account: {
            login,
            password,
            clientId_1: '',
        },
    };
    transaqConnector.objectAccountsAndDll.servers[HftOrNot] = {
        host,
        port,
    };

    const lastEmitTime = Date.now();

    return getFunctionConnect(transaqConnector, lastEmitTime, HftOrNot);
}

function getChangeByPass(req, result, transaqConnector, HftOrNot) {
    result = transaqConnector.objectAccountsAndDll['afterInitialize'][
        HftOrNot
    ].SendCommand(
    `<command id="change_pass" oldpass="${req.query.oldpass}" newpass="${req.query.newpass}"/>`,
    );

    const passwordChangeErrorString = 'password-change-error';

    result = JSON.parse(xml2json.toJson(result));
    if (result.result) {
        const incomemessage = result.result.message;

        if (result.result.success !== 'true') {
            clientsocket.emit(passwordChangeErrorString, incomemessage);
        }
        if (result.result.success === 'true') {
            clientsocket.emit(
                passwordChangeErrorString,
                'Password changed successfuly',
            );
        }
    } else {
        clientsocket.emit(passwordChangeErrorString, 'Please log-in first');
    }

    return result;
}

function getAnyWorldByCommand(req, result, transaqConnector, params) {
    const { HftOrNot, command, clientId } = params;

    if (command === 'change_pass') {
        result = getChangeByPass(req, result, transaqConnector, HftOrNot);
    }
    if (command === 'gethistorydata') {
        result = transaqConnector.functionGetHistory(req.query);
    } else if (command === 'get_portfolio' || command === 'get_mc_portfolio') {
        result = transaqConnector.objectAccountsAndDll['afterInitialize'][
            HftOrNot
        ].SendCommand(
      `<command id="${command}" money="true" client="${clientId}"/>`,
        );
    } else if (command === 'get_forts_positions') {
        result = transaqConnector.objectAccountsAndDll['afterInitialize'][
            HftOrNot
        ].SendCommand(`<command id="${command}" client="${clientId}"/>`);
    } else if (
        command === 'neworder' ||
    command === 'newstoporder' ||
    command === 'newcondorder'
    ) {
        result = transaqConnector.functionSendOrderToBirga(req.query);

    //send that he mades new order socket io
    } else if (command === 'cancelorder' || command === 'cancelstoporder') {
        const { HftOrNot } = req.query;

        /** @var req.query.orderId string */
        const { orderId, command } = req.query;
        const makeParametrsFromUrl =
      `<command id="${command}">` +
      `<transactionid>${orderId}</transactionid>` +
      '</command>';

        result =
      transaqConnector.objectAccountsAndDll['afterInitialize'][
          HftOrNot
      ].SendCommand(makeParametrsFromUrl);

    //send that he made order cancel socket io
    }

    return result;
}

function getCommand(req, res, command) {
    const HftOrNot = req.query.HftOrNot;

    const clientId =
    transaqConnector.objectAccountsAndDll.users[HftOrNot].Account.clientId_1;
    let result;

    if (command === 'connect') {
        commandConnect(req, transaqConnector, result, HftOrNot);
    }

    if (arrayOneWorldCommands.includes(command)) {
        result = transaqConnector.objectAccountsAndDll['afterInitialize'][
            HftOrNot
        ].SendCommand(`<command id="${command}"/>`);
        const r = JSON.parse(xml2json.toJson(result));

        if (
            command === 'server_status' &&
      r &&
      r.result &&
      r.result.success === 'true'
        ) {
            transaqConnector.objectAccountsAndDll.users[
                HftOrNot
            ].Account.connected = true;
            clientsocket.emit('auth', {
                connected: true,
            });
        }
    } else if (arrayAnyWorldCommands.includes(command)) {
        result = getAnyWorldByCommand(req, result, transaqConnector, {
            HftOrNot,
            command,
            clientId,
        });
    }

    if (result.indexOf('true') > -1) {
        res.end();
    } else {
        workHereOrInTransaqConnector = false;
        module.exports.workHereOrInTransaqConnector = workHereOrInTransaqConnector;
        module.exports.commandText = command;
    }
}

route.get('/', (req, res) => {
    try {
        const command = req.query.command;

        if (command !== undefined) {
            getCommand(req, res, command);
        }
        module.exports.res = res;
    } catch (error) {
        return res
            .status(500)
            .json({ status: error.status, message: error.message });
    }
});
