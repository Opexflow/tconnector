// #region переменные
const http = require('http');
const url = require('url');
const xml2json = require('xml2json');
const transaqConnector = require('./modules_in_project/finam/transaqConnector.js');
const functions = require('./modules_in_project/common_sevice_functions/functions.js');

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

// #endregion

// #region веб сервер

http
    .createServer(null, async (req, res) => {
        try {
            //   const clientIp = req.socket.remoteAddress.split(':').slice('-1')[0];
            //   if (clientIp !== '127.0.0.1')
            //     return res.end(
            //       JSON.stringify({
            //         error: true,
            //         message: 'Non localhost requests is not avaible',
            //       })
            //     );
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
            res.setHeader('Access-Control-Allow-Origin', '*');

            const urlParts = url.parse(req.url, true);
            const queryObject = urlParts.query;
            //check if the object is empety or not
            if(Object.keys(queryObject).length !== 0 && queryObject.constructor === Object)
              {
                /** @var queryObject.command string */
                /** @var queryObject.HftOrNot string */
                let { command } = queryObject;
                const { HftOrNot } = queryObject;
                const clientId =transaqConnector.objectAccountsAndDll.users[HftOrNot].Account.clientId_1;
                // if there is some command
                if (command !== undefined) {
                    let result = '';
                    
                    // простая команда
                    if (command === 'connect') {
                        if (transaqConnector.isTransaqConnected[HftOrNot]) {
                            result = objectAccountsAndDll['afterInitialize'][ HftOrNot].SendCommand('<command id="disconnect"/>');
                        } 
                        else {
                            transaqConnector.isTransaqConnected[HftOrNot] = true;
                        }
                        const {login, password, host, port,} = queryObject;

                        console.log(queryObject);
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
                            return transaqConnector.functionConnect(HftOrNot, data => {
                            const message = JSON.parse(xml2json.toJson(data));
                             //if message and other info exist
                             if (!message) {
                                return;
                            }
                            if (!message.sec_info_upd && !message.pits && !message.securities) {
                                console.log(message);
                            }
                            // set value if they exist
                            transaqConnector.objectAccountsAndDll.users[HftOrNot].Account = message.client && message.client.id && message.client;
                            transaqConnector.objectAccountsAndDll.users[HftOrNot].Account.clientId_1 = message.client && message.client.id && message.client.id;
                            const incoming_message=message.messages
                            
                            if (incoming_message && incoming_message.message && incoming_message.message.text === 'Password expired. Please change the password') {
                                // TODO: popup about pass expired.
                                console.log('pass expired');
                            }
                            if (message['server_status']) {
                                if (message.server_status.connected === 'error' || message.server_status.connected === 'false') {
                                    // TODO: popup about connect error and redirect to login page
                                  // redirect to login page
                                  res.writeHead(302, {
                                    location: "/login",
                                  });
                                  console.log('error login');
                                    res.end(
                                        JSON.stringify({
                                            error: true,
                                            message: 'Wrong login or password',
                                        }),
                                    );
                                } else if (message['server_status']['connected'] === 'true') {
                                    // TODO: exit button and disconnect on click.
                                    console.log('login ok');
                                    res.end(JSON.stringify({ error: false }));
                                }
                            }
                        });
                    }
                    if (arrayOneWorldCommands.includes(command)) {
                        result = transaqConnector.objectAccountsAndDll['afterInitialize'][HftOrNot].SendCommand(`<command id="${command}"/>`);
                    } 
                    else if (arrayAnyWorldCommands.includes(command)) 
                    {
                        if (command === 'change_pass') {
                            if (!queryObject.oldpass || !queryObject.newpass) {
                                return res.end(
                                    JSON.stringify({
                                        error: true,
                                        message: 'oldpass And newpass are required',
                                    }),
                                );
                            }
                            result =transaqConnector.objectAccountsAndDll['afterInitialize'][HftOrNot]
                            .SendCommand(`<command id="change_pass" oldpass="${queryObject.oldpass}" newpass="${queryObject.newpass}"/>`,);
                            result = JSON.parse(xml2json.toJson(result)).result;
                            return res.end(
                                JSON.stringify({
                                    error: result.success !== 'true',
                                    message: result.message,
                                }),
                            );
                        }

                        if (command === 'gethistorydata') {
                            result = transaqConnector.functionGetHistory(queryObject);
                        } 
                        else if (command === 'get_portfolio' || command === 'get_mc_portfolio') {
                            result = transaqConnector.objectAccountsAndDll['afterInitialize'][HftOrNot]
                            .SendCommand(`<command id="${command}" money="true" client="${clientId}"/>`);
                        } 
                        else if (command === 'get_forts_positions') {
                            result = transaqConnector.objectAccountsAndDll['afterInitialize'][HftOrNot]
                            .SendCommand(`<command id="${command}" client="${clientId}"/>`);
                        } else if (command === 'neworder' ||command === 'newstoporder' ||command === 'newcondorder') 
                        {
                            result = transaqConnector.functionSendOrderToBirga(queryObject);
                        } else if (command === 'cancelorder' ||command === 'cancelstoporder') {
                            const { HftOrNot } = queryObject;
                            /** @var queryObject.orderId string */
                            const { orderId, command } = queryObject;
                            const makeParametrsFromUrl =
                            `<command id="${command}">` +
                            `<transactionid>${orderId}</transactionid>` +
                            '</command>';
                           result=transaqConnector.objectAccountsAndDll['afterInitialize'][HftOrNot].SendCommand(makeParametrsFromUrl,);
                        }
                    }

                    // если о твет = false, вывести ответ и завершить работу веб сервера
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
                    res.write(JSON.stringify({ error: false, message: result }));
                    if (result.indexOf('true') > -1) {
                        res.end();
                    }

                    // иначе экспортировать переменные, завершение вывода ответа и завершение работы веб сервера будет в transaqConnector.js
                    else {
                        workHereOrInTransaqConnector = false;
                        module.exports.workHereOrInTransaqConnector =workHereOrInTransaqConnector;
                        module.exports.commandText = command;
                    }
                }
            }
            module.exports.res = res;
        } catch (e) {
            console.log(e);
        }
    })
    .listen(12345);

// #endregion