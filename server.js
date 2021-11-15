// #region переменные
const http = require('http');
const url = require('url');
const transaqConnectorModule = require('./modules_in_project/finam/transaqConnector.js');
const functions = require('./modules_in_project/common_sevice_functions/functions.js');
// различные функции
let workHereOrInTransaqConnector = true;
const arrayOneWorldCommands = [
    'server_status',
    'get_securities',
];
const arrayAnyWorldCommands = [
    'gethistorydata',
    'get_portfolio',
    'get_forts_positions',
    'neworder',
    'newstoporder',
    'newcondorder',
    'cancelstoporder',
    'cancelorder',
];
// #endregion

// #region веб сервер
http.createServer(null, (req, res) => {
    try {
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
        const urlParts = url.parse(req.url, true);
        const queryObject = urlParts.query;
        if (functions.functionEmptyOnlyObject(queryObject) === false) {
            /** @var queryObject.command string */
            /** @var queryObject.HftOrNot string */
            const { command } = queryObject;
            const { HftOrNot } = queryObject;
            const clientId = transaqConnectorModule.objectAccountsAndDll.users[HftOrNot].Account.clientId_1;
            if (command !== undefined) {
                let result = '';
                // простая команда
                if (arrayOneWorldCommands.includes(command) === true) {
                    result = transaqConnectorModule.objectAccountsAndDll['afterInitialize'][HftOrNot].SendCommand(
                        `<command id="${ command }"/>`,
                    );
                } else
                if (arrayAnyWorldCommands.includes(command) === true) {
                    if (command === 'gethistorydata') {
                        result = transaqConnectorModule.functionGetHistory(queryObject);
                    } else
                    if (command === 'get_portfolio') {
                        result = transaqConnectorModule.objectAccountsAndDll['afterInitialize'][HftOrNot].SendCommand(
                            `<command id="${ command }" client="${ clientId }"/>`,
                        );
                    } else
                    if (command === 'get_forts_positions') {
                        result = transaqConnectorModule.objectAccountsAndDll['afterInitialize'][HftOrNot].SendCommand(
                            `<command id="${ command }" client="${ clientId }"/>`,
                        );
                    } else
                    if (
                        command === 'neworder' ||
                        command === 'newstoporder' ||
                        command === 'newcondorder'
                    ) {
                        result = transaqConnectorModule.functionSendOrderToBirga(queryObject);
                    } else
                    if (
                        command === 'cancelorder' ||
                        command === 'cancelstoporder'
                    ) {
                        result = transaqConnectorModule.functionCancelOrder(queryObject);
                    }
                }

                // если ответ = false, вывести ответ и завершить работу веб сервера
                res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
                res.write(`${' Ответ на отправку команды' + '<br>\r\n'}${
                    command.replace(/</g, '&#706;').replace(/>/g, '&#707;') }<br>\r\n` +
                    ' = ' + `<br>\r\n${
                    result.replace(/</g, '&#706;').replace(/>/g, '&#707;') }.` + '<br>\r\n');
                if (result.indexOf('false') > -1) {
                    res.end();
                }
                // иначе экспортировать переменные, завершение вывода ответа и завершение работы веб сервера будет в transaqConnector.js
                else {
                    workHereOrInTransaqConnector = false;
                    module.exports.workHereOrInTransaqConnector = workHereOrInTransaqConnector;
                    module.exports.commandText = command;
                }
            }
        }

        module.exports.res = res;
    } catch (e) {
        console.log(e);
    }
}).listen(12345);
// #endregion
