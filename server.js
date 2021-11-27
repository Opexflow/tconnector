// #region переменные
const http = require('http');
const url = require('url');
const transaqConnectorModule = require('./modules_in_project/finam/transaqConnector.js');
const functions = require('./modules_in_project/common_sevice_functions/functions.js');
const xml2json = require('xml2json');
const fs = require('fs');
// различные функции
let workHereOrInTransaqConnector = true;
const arrayOneWorldCommands = ['server_status', 'get_securities'];
const arrayAnyWorldCommands = [
  'gethistorydata',
  'get_portfolio',
  'get_forts_positions',
  'neworder',
  'newstoporder',
  'newcondorder',
  'cancelstoporder',
  'cancelorder',
  'change_pass',
];
const config = require('./config.json');
// #endregion

// #region веб сервер

const recieveBody = (req) =>
  new Promise((resolve, reject) => {
    const buffers = [];
    req.on('data', (chunk) => {
      buffers.push(chunk);
    });
    req.on('end', () => {
      resolve(Buffer.concat(buffers).toString());
    });
  });

http
  .createServer(null, async (req, res) => {
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

      res.setHeader('Access-Control-Allow-Origin', '*');

      console.log('New request');

      if (req.method != 'POST') {
        return res.end('method must be POST');
      }

      const body = await recieveBody(req);
      const { login, password } = JSON.parse(body);
      const urlParts = url.parse(req.url, true);
      const queryObject = urlParts.query;
      if (functions.functionEmptyOnlyObject(queryObject) === false) {
        /** @var queryObject.command string */
        /** @var queryObject.HftOrNot string */
        const { command } = queryObject;
        const { HftOrNot } = queryObject;
        const Account = config.users[HftOrNot].Account;
        if (login !== Account.login || password !== Account.password) {
          res.statusCode = 401;
          console.log('Wrong login or password');
          return res.end(
            JSON.stringify({ error: true, message: 'Wrong login or password' })
          );
        }

        const clientId =
          transaqConnectorModule.objectAccountsAndDll.users[HftOrNot].Account
            .clientId_1;
        if (command !== undefined) {
          let result = '';
          // простая команда
          if (command == 'auth') {
            return res.end(
              JSON.stringify({
                error: false,
                message: 'Logged in successfully',
              })
            );
          }
          if (arrayOneWorldCommands.includes(command) === true) {
            result = transaqConnectorModule.objectAccountsAndDll[
              'afterInitialize'
            ][HftOrNot].SendCommand(`<command id="${command}"/>`);
          } else if (arrayAnyWorldCommands.includes(command) === true) {
            if (command === 'change_pass') {
              if (!queryObject.oldpass || !queryObject.newpass) {
                return res.end(
                  JSON.stringify({
                    error: true,
                    message: 'oldpass and newpass are required',
                  })
                );
              }
              if (queryObject.oldpass != Account.password)
                return res.end(
                  JSON.stringify({
                    error: true,
                    message: 'Wrong oldpass',
                  })
                );
              console.log(':change_pass');
              result = transaqConnectorModule.objectAccountsAndDll[
                'afterInitialize'
              ][HftOrNot].SendCommand(
                `<command id="change_pass" oldpass=${queryObject.oldpass} newpass="${queryObject.newpass}"/>`
              );
              result = xml2json.toJson(result);
              Account.password = queryObject.newpass;
              fs.writeFileSync('./config.json', JSON.stringify(config));
              console.log('END change_pass');
            } else if (command === 'gethistorydata') {
              result = transaqConnectorModule.functionGetHistory(queryObject);
            } else if (command === 'get_portfolio') {
              result = transaqConnectorModule.objectAccountsAndDll[
                'afterInitialize'
              ][HftOrNot].SendCommand(
                `<command id="${command}" client="${clientId}"/>`
              );
            } else if (command === 'get_forts_positions') {
              result = transaqConnectorModule.objectAccountsAndDll[
                'afterInitialize'
              ][HftOrNot].SendCommand(
                `<command id="${command}" client="${clientId}"/>`
              );
            } else if (
              command === 'neworder' ||
              command === 'newstoporder' ||
              command === 'newcondorder'
            ) {
              result =
                transaqConnectorModule.functionSendOrderToBirga(queryObject);
            } else if (
              command === 'cancelorder' ||
              command === 'cancelstoporder'
            ) {
              result = transaqConnectorModule.functionCancelOrder(queryObject);
            }
          }
          console.log('ENDDD');
          // если о твет = false, вывести ответ и завершить работу веб сервера
          res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
          res.write(
            JSON.stringify({ error: false, message: JSON.parse(result) })
          );

          if (result.indexOf('true') > -1) {
            res.end();
          }
          // иначе экспортировать переменные, завершение вывода ответа и завершение работы веб сервера будет в transaqConnector.js
          else {
            workHereOrInTransaqConnector = false;
            module.exports.workHereOrInTransaqConnector =
              workHereOrInTransaqConnector;
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
