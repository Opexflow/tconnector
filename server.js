// #region переменные
/* eslint-disable no-console */
const express = require('express');
const cors = require('cors');
const app = express();
const http = require('http').Server(app);

// const morgan=require('morgan');
// const path = require("path");
// const compression = require('compression');
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

// #region веб сервер

/*
         server_status
             http://127.0.0.1:12345/?command=server_status&HftOrNot=NotHft
             http://127.0.0.1:12345/?command=server_status&HftOrNot=Hft
         get_securities
             http://127.0.0.1:12345/?command=get_securities&HftOrNot=NotHft
             http://127.0.0.1:12345/?command=get_securities&HftOrNot=Hft
         get_portfolio
             http://127.0.0.1:12345/?command=get_portfolio&HftOrNot=NotHft
             http://127.0.0.1:12345/?command=get_portfolio&HftOrNot=Hft
         get_forts_positions
             http://127.0.0.1:12345/?command=get_forts_positions&HftOrNot=NotHft
             http://127.0.0.1:12345/?command=get_forts_positions&HftOrNot=Hft
         gethistorydata
            5-минутная история
             http://127.0.0.1:12345/?command=gethistorydata&period=2&count=162&reset=true&HftOrNot=NotHft
             часовая
             http://127.0.0.1:12345/?command=gethistorydata&period=4&count=14&reset=true&HftOrNot=NotHft
         neworder
            http://127.0.0.1:12345?command=neworder&buysell=buy&orderprice=40000&quantity=1&HftOrNot=NotHft&ismarket=true
            http://127.0.0.1:12345?command=neworder&buysell=sell&orderprice=90000&quantity=1&HftOrNot=NotHft&ismarket=true
            http://127.0.0.1:12345?command=neworder&buysell=buy&orderprice=40000&quantity=1&HftOrNot=Hft&ismarket=true
            http://127.0.0.1:12345?command=neworder&buysell=sell&orderprice=90000&quantity=1&HftOrNot=Hft&ismarket=true
         newstoporder
            http://127.0.0.1:12345?command=newstoporder&buysell=buy&orderprice=40000&quantity=1&stoplosspercent=3.3&takeprofitpercent=5.8&HftOrNot=NotHft
            http://127.0.0.1:12345?command=newstoporder&buysell=sell&orderprice=90000&quantity=1&stoplosspercent=3.3&takeprofitpercent=5.8&HftOrNot=NotHft
            http://127.0.0.1:12345?command=newstoporder&buysell=buy&orderprice=40000&quantity=1&stoplosspercent=3.3&takeprofitpercent=5.8&HftOrNot=Hft
            http://127.0.0.1:12345?command=newstoporder&buysell=sell&orderprice=90000&quantity=1&stoplosspercent=3.3&takeprofitpercent=5.8&HftOrNot=Hft
        newcondorder
            http://127.0.0.1:12345?command=newcondorder&buysell=sell&orderprice=90000&quantity=1&cond_type=LastUp&cond_value=90000&condorder=true&HftOrNot=NotHft
            http://127.0.0.1:12345?command=newcondorder&buysell=sell&orderprice=90000&quantity=1&cond_type=LastUp&cond_value=90000&condorder=true&HftOrNot=Hft
        cancelorder
            http://127.0.0.1:12345/?command=cancelorder&orderId=10703545&HftOrNot=NotHft
            http://127.0.0.1:12345/?command=cancelorder&orderId=10703545&HftOrNot=Hft
        cancelstoporder
            http://127.0.0.1:12345/?command=cancelstoporder&orderId=27499316&HftOrNot=NotHft
            http://127.0.0.1:12345/?command=cancelstoporder&orderId=27499316&HftOrNot=Hft
        * */
let clientsocket;

io.on('connection', function(socket) {
    console.log('connection come');
    console.log(`user connected with socket id: ${socket.id}`);

    //Whenever someone disconnects this piece of code executed
    clientsocket = socket;
    clientsocket.emit('conn', 'wait for this');
    socket.on('disconnect', function() {
        console.log('disconnected');
    });
});

// if we are sure to listen only to port 12345 we can remove this random port process.env.PORT
const ip = '0.0.0.0';
const port = process.env.PORT || 12345;

http.listen(port, ip, function() {
    console.log(`we are listening on port ${port}`);
});

function getFunctionConnect(transaqConnector, lastEmitTime, HftOrNot) {
    return transaqConnector.functionConnect(HftOrNot, data => {
        const message = JSON.parse(xml2json.toJson(data));

        //if message and other info exist
        if (!message) {
            return;
        }

        // !message.sec_info_upd && !message.pits && !message.securities &&
        if (Date.now() - lastEmitTime > 5000) {
            clientsocket.emit('auth', {
                checkStatus: true,
            });

            // console.log(Date.now() - lastEmitTime)
            lastEmitTime = Date.now();
        }
        if (message.candles) {
            clientsocket.emit('show-widget', message);
        }
        clientsocket && clientsocket.emit('show-logs', message);

        // !message.sec_info_upd && !message.pits && !message.securities &&
        if (Date.now() - lastEmitTime > 5000) {
            clientsocket.emit('auth', {
                checkStatus: true,
            });

            // console.log(Date.now() - lastEmitTime)

            lastEmitTime = Date.now();
        }

        // set value if they exist

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

    //    console.log(`our client socket${clientsocket.id}`)
    //    clientsocket.emit("before",'we are connecting you')

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
        //  clientsocket.emit("history-data",result);
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

        // console.log(command, result);

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

    // если о твет = false, вывести ответ и завершить работу веб сервера
    // console.log("status1")
    // res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
    // res.json({ error: false, message: result });
    //use socket

    if (result.indexOf('true') > -1) {
        res.end();
    } else {
        // иначе экспортировать переменные, завершение вывода ответа и завершение работы веб сервера будет в transaqConnector.js
        workHereOrInTransaqConnector = false;
        module.exports.workHereOrInTransaqConnector = workHereOrInTransaqConnector;
        module.exports.commandText = command;
    }
}

route.get('/', (req, res) => {
    try {
        // clientsocket.emit('another', "another one");
        const command = req.query.command;

        if (command !== undefined) {
            getCommand(req, res, command);
        }
        module.exports.res = res;
    } catch (error) {
        // clientsocket.emit("password-change-error",'Wrong login or password')
        console.log(error);

        return res
            .status(500)
            .json({ status: error.status, message: error.message });
    }
});
/* eslint-disable no-console */
