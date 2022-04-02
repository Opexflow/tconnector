// #region переменные
const ffi = require('ffi-cross');
const ref = require('ref-napi');
const xml2json = require('xml2json');
const fs = require('fs');
const path = require('path');
const finamClass = require('./FinamClass.js');
const functions = require('../common_sevice_functions/functions.js');

// \различные функции
const config = require(path.join(process.cwd(), 'config.json'));

// const mysqlModule = require('../common_sevice_functions/mysqlClass.js');

const arrayUnikStringCloseOpenPositions = []; // массив уникальных строк, чтобы не выставлять закрытия позиций больше одной
// относительный путь в виндовс не всегда работает корректно, иногда существующий файл не находится
// #endregion

const isTransaqConnected = {
    Hft: false,
    NoHft: false,
};

// #region параметры подключения
const board = 'FUT';

// #region объект с логинами, паролями, dll файлами hft и НЕ hft, объектами dll
const objectAccountsAndDll = {
    users: {
        Hft: { Account: { login: '', password: '', clientId_1: '' } },
        NotHft: {
            Account: {
                login: '',
                password: '',
                clientId_1: '',
            },
        },
    },
    dllFiles: config.dllFiles,
    servers: {
        Hft: {},
        NotHft: {},
    },
    afterInitialize: {
        Hft: {},
        NotHft: {},
    },
};

// #region функции в dll
const dllFunctions = {
    Initialize: [ffi.types.CString, [ffi.types.CString, ffi.types.int32]],
    UnInitialize: [ffi.types.CString, []],
    FreeMemory: [ffi.types.bool, [ffi.types.CString]],
    SendCommand: [ffi.types.CString, [ffi.types.CString]],
    SetCallback: [ffi.types.bool, ['pointer']],
    SetCallbackEx: [ffi.types.bool, ['pointer', ffi.types.CString]],
};

// #endregion

// регистр важен
const typesUsersArray = ['Hft', 'NotHft'];

// инициализация в цикле
Object.keys(typesUsersArray).forEach(number => {
    const typeUser = typesUsersArray[number];

    objectAccountsAndDll['afterInitialize'][typeUser] = ffi.Library(
        path.join(process.cwd(), objectAccountsAndDll['dllFiles'][typeUser]),
        dllFunctions,
    );
});

// #endregion

const mainFile = require('../../server.js');
const subscribeOnGlass = {
    Hft: false,
    NotHft: false,
};
let getHistoryByTimer = true; // !!
let openOrdersObject = {
    Hft: {
        stoporder: [],
        order: [],
    },
    NotHft: {
        stoporder: [],
        order: [],
    },
};
const typesOrdersArray = ['order', 'stoporder'];

finamClass.saveOpenOrders(openOrdersObject);

// мксимальная и минимальная цена сессии, нужны для выставления рыночных ордеров
let maxPrices = {
    Hft: {
        maxPriceHigh: 0,
        maxPriceLow: 0,
    },
    NotHft: {
        maxPriceHigh: 0,
        maxPriceLow: 0,
    },
};
let isCheckFortsPosition = false;
let startTimeTimer = new Date().getTime();

finamClass.saveMaxPrices(maxPrices);

// #endregion

// #region callback обрабатывает и hft и не hft
/**
 * @this {functionCallback}
 * @param msg string
 * @param HftOrNot string
 *
 * @return null
 * */
function functionCallback(msg, HftOrNot) {
    try {
        /** @var ref.readCString function */
        const inputData = ref.readCString(msg, 0);

        if (inputData) {
            let unixTime = new Date().getTime();
            const dateHuman = new Date(unixTime)
                .toISOString()
                .replace('T', ' ')
                .replace('Z', '');
            const string = xml2json.toJson(inputData);
            const object = JSON.parse(string);

            /** @var object.news_header string */
            /** @var object.sec_info_upd string */
            if (
                object.quotes === undefined &&
        object.quotations === undefined &&
        object.news_header === undefined &&
        object.sec_info_upd === undefined
            ) {

                // vvv отладочное
                // writeToFile(string, 'C:/Users/Administrator/Project/robot/log/' + HftOrNot + '/log.log');
                // console.log(HftOrNot + ' ' + string);
            }

            // #region завершение вывода ответа и завершение работы веб сервера с server.js
            // передано из сервера из файла server.js, вывести результат выполнения команды и завершить работу веб сервера
            if (mainFile.workHereOrInTransaqConnector === false) {
                const { commandText } = mainFile;

                if (string.indexOf(commandText) > -1) {
                    const messageLog =
            `${HftOrNot} ` +
            `Результат выполнения команды <br>\r\n${commandText
                .replace(/</g, '&#706;')
                .replace(/>/g, '&#707;')}<br>\r\n` +
            ` = <br>\r\n${string
                .replace(/</g, '&#706;')
                .replace(/>/g, '&#707;')}<br>\r\n`;

                    debugger;
                    functionCloseWebServer(messageLog, string);
                } else if (
                    commandText.indexOf('gethistorydata') > -1 &&
          string.indexOf('candles') > -1
                ) {
                    let messageLog =
            `${HftOrNot} ` +
            `Результат выполнения команды <br>\r\n${commandText
                .replace(/</g, '&#706;')
                .replace(/>/g, '&#707;')}<br>\r\n` +
            ` = <br>\r\n${string
                .replace(/</g, '&#706;')
                .replace(/>/g, '&#707;')}<br>\r\n`;

                    // историю можно получать по таймеру, в этом случае НЕ нужно вызывать functionCloseWebServer
                    if (object.candles.period === '2') {
                        const arraySplit = object.candles.candle['0'].date.split(' ');
                        const arraySplitDate = arraySplit['0'].split('.');
                        const tableName = `history_5min_${arraySplitDate['2']}-${arraySplitDate['1']}-${arraySplitDate['0']}`;

                        // mysqlModule.functionCreateTable(tableName);
                    }

                    if (getHistoryByTimer === false) {
                        debugger;
                        functionCloseWebServer(messageLog, string);
                    } else {
                        // это история по таймеру
                        messageLog = `${dateHuman}<br>\r\n ${messageLog}`;
                        console.log(
              `${HftOrNot} ${messageLog
                  .replace(/&#706;/g, '<')
                  .replace(/&#707;/g, '>')
                  .replace(/<br>/g, '')}`,
                        );
                        const object = JSON.parse(string);

                        /** @var object.candles object */
                        let tableName = 'history_1_hour';

                        // строка контракта меняется каждые 3 месяца, получить ее исходя из текущей даты
                        const contractString = functionActiveContractString();

                        // для 5-минутной истории создать новую таблицу
                        let addId = '';
                        let addIdValue = '';

                        if (object.candles.period === '2') {
                            const arraySplit = object.candles.candle['0'].date.split(' ');
                            const arraySplitDate = arraySplit['0'].split('.');

                            tableName = `history_5min_${arraySplitDate['2']}-${arraySplitDate['1']}-${arraySplitDate['0']}`;

                            // mysqlModule.functionCreateTable(tableName);
                        }
                        let idInDb = 1;

                        Object.keys(object.candles.candle).forEach(number => {
                            // нужно явно указать номер строки в таблице, иначе начинаются не с единицы
                            if (object.candles.period === '2') {
                                addId = '`id`, ';
                                addIdValue = `${idInDb}, `;
                            }
                            const arraySplit = object.candles.candle[number].date.split(' ');
                            const arraySplitDate = arraySplit['0'].split('.');
                            const datetimeHuman = `${arraySplitDate['2']}-${arraySplitDate['1']}-${arraySplitDate['0']} ${arraySplit['1']}`;

                            unixTime = Math.round(new Date(datetimeHuman).getTime()) / 1000;

                            /** @var object.candle object */
                            const stringInsert =
                `INSERT INTO \`${tableName}\` ` +
                `(${addId}\`birga\`, \`pair\`, \`unix_time\`, \`datetime_human\`, \`open\`, \`low\`, \`high\`, \`close\`, \`volume\`) ` +
                'VALUES ' +
                `(${addIdValue} 'Finam', '${contractString}', ${unixTime}, ` +
                `'${datetimeHuman}', ${object.candles.candle[number].open}, ${object.candles.candle[number].low}, ${object.candles.candle[number].high}, ${object.candles.candle[number].close}, ${object.candles.candle[number].volume})`;

                            // mysqlModule.functionWriteInDb(stringInsert, 'connectionForWriteHistory');
                            idInDb++;
                        });

                        // сброс переменных
                        mainFile.workHereOrInTransaqConnector = true;
                        mainFile.commandText = '';
                    }

                    // сбросить переменную getHistoryByTimer
                    getHistoryByTimer = false;
                } else if (
                    commandText.indexOf('get_portfolio') > -1 &&
          string.indexOf('portfolio') > -1
                ) {
                    console.log('portfolio');

                    // возврат
                    // {"portfolio_tplus":{"client":"11B4B/11B4B","coverage_fact":"1000000.00","coverage_plan":"1000000.00","coverage_crit":"1000000.00","open_equity":"7567.15","equity":"7567.15","cover":"7567.15","init_margin":"0.00",
                    // "pnl_income":"0.00","pnl_intraday":"0.00","leverage":"1.00","margin_level":"0.00","money":{"open_balance":"7567.15","bought":"0.00","sold":"0.00","balance":"7567.15","settled":"0.00","tax":"0.00",
                    // "value_part":{"register":"T0","open_balance":"7567.15","bought":"0.00","sold":"0.00","balance":"7567.15","settled":"0.00"}}}}
                    const messageLog =
            `${HftOrNot} ` +
            `Результат выполнения команды <br>\r\n${commandText
                .replace(/</g, '&#706;')
                .replace(/>/g, '&#707;')}<br>\r\n` +
            ` = <br>\r\n${string
                .replace(/</g, '&#706;')
                .replace(/>/g, '&#707;')}<br>\r\n`;

                    console.log(messageLog);
                    debugger;
                    functionCloseWebServer(messageLog, string);
                }
            }

            // #endregion

            /** @var object.orders object */
            if (object.orders !== undefined) {
                // массив открытых ордеров
                /** @var object.orders.stoporder array */
                openOrdersObject = finamClass.getOpenOrders(HftOrNot);
                Object.keys(typesOrdersArray).forEach(number => {
                    const orderType = typesOrdersArray[number];

                    if (object.orders[orderType] !== undefined) {
                        openOrdersObject = finamClass.fillOpenOrdersObject(
                            openOrdersObject,
                            orderType,
                            object.orders[orderType],
                        );
                    }
                });

                // сохранить массив ордеров после обработки
                finamClass.updateOpenOrders(openOrdersObject, HftOrNot);
            }

            // vvv проверка обязательна
            /** @var object.server_status string */
            else if (object.server_status !== undefined) {
                // vvv проверка обязательна
                if (object.server_status.connected === 'true') {
                    if (subscribeOnGlass[HftOrNot]) {
                        console.log(`${HftOrNot} ${string}`);
                        if (HftOrNot === 'Hft') {
                            // команда запроса стакана, чтобы не дублировать, только для Hft
                            // строка контракта меняется каждые 3 месяца, получить ее исходя из текущей даты
                            const contractString = functionActiveContractString();
                            const result = functionSubscribeAndUnSubscribe(
                                'subscribe',
                                'quotes',
                                contractString,
                                HftOrNot,
                            );

                            console.log(`${HftOrNot} ` + `glassSubscribeResult ${result}`);
                        }

                        // //команда запроса тиков сделок
                        // // let result = functionSubscribeAndUnSubscribe('subscribe', 'alltrades', seccode);
                        // console.log(HftOrNot + ' ' + 'alltradesSubscribeResult ' + result);
                        // команда запроса показателей торгов по инструментам, в ответе нужны поля:
                        // <high>Максимальная цена сделки :double</high>
                        // <low>Минимальная цена сделки :double</low>
                        // строка контракта меняется каждые 3 месяца, получить ее исходя из текущей даты
                        const contractString = functionActiveContractString();
                        const result = functionSubscribeAndUnSubscribe(
                            'subscribe',
                            'quotations',
                            contractString,
                            HftOrNot,
                        );

                        console.log(`${HftOrNot} ` + `quotationsSubscribeResult ${result}`);
                        subscribeOnGlass[HftOrNot] = false;
                    }
                } else {
                    // подключений к бирже с одним логином может быть только одно
                    console.log(`${HftOrNot} ` + `Ошибка server_status ${string}`);
                }
            }

            // стакан
            else if (object.quotes !== undefined) {
                // обработка стакана, чтобы не дублировать, только для Hft
                if (HftOrNot === 'Hft') {
                    finamClass.workOnGlass(object);
                }

                // let humanDate = new Date(unixTime).toISOString().replace('Z', '');
                // console.log(HftOrNot + ' ' + humanDate + ' quotes ' + string + '\r\n');
            }

            // показатели торгов по инструментам, мксимальная и минимальная цена сессии, нужны для выставления рыночных ордеров
            /** @var object.quotations object */
            /** @var object.quotations.quotation object */
            else if (object.quotations !== undefined) {
                if (
                    object.quotations.quotation.high !== undefined &&
          object.quotations.quotation.low !== undefined
                ) {
                    // let humanDate = new Date(unixTime).toISOString().replace('Z', '');
                    // console.log(HftOrNot + ' ' + humanDate + ' quotations ' + string + '\r\n');
                    maxPrices = {
                        maxPriceHigh: object.quotations.quotation.high,
                        maxPriceLow: object.quotations.quotation.low,
                    };
                    finamClass.updateMaxPrices(maxPrices, HftOrNot);
                }
            }

            // позиции
            else if (object.positions !== undefined) {
                if (object.positions.forts_position !== undefined) {
                    console.log(`${HftOrNot} ${string}`);

                    // количество лотов для закрытия открытых позици
                    if (isCheckFortsPosition === true) {
                        /** @var object.positions.forts_position object */
                        /** @var object.positions.forts_position.todaybuy integer */
                        /** @var object.positions.forts_position.todaysell integer */
                        const diffOpenPositions = Math.abs(
                            Number(object.positions.forts_position.todaybuy) -
                Number(object.positions.forts_position.todaysell),
                        );

                        if (diffOpenPositions === 0) {
                            isCheckFortsPosition = false;
                            const message = `${HftOrNot} ${dateHuman} лотов для закрытия открытых позиций нет. isCheckFortsPosition = false`;

                            console.log(message);
                            writeToFile(
                                message,
                                path.join(process.cwd(), `log/${HftOrNot}/log.log`),
                            );
                        } else {
                            isCheckFortsPosition = false;
                            const lots = Math.abs(
                                Number(object.positions.forts_position.todaybuy) -
                  Number(object.positions.forts_position.todaysell),
                            );
                            const savedMaxPrices = finamClass.getMaxPrices([HftOrNot]);
                            const clientId =
                objectAccountsAndDll.users[HftOrNot].Account.clientId_1;
                            let orderprice = 0;
                            let buysell = '';
                            let side = '';
                            let sideClose = '';

                            if (
                                Number(object.positions.forts_position.todaybuy) >
                Number(object.positions.forts_position.todaysell)
                            ) {
                                orderprice = savedMaxPrices.maxPriceLow;
                                buysell = 'sell';
                                side = 'продажа';
                                sideClose = 'покупки';
                            } else {
                                orderprice = savedMaxPrices.maxPriceHigh;
                                buysell = 'buy';
                                side = 'покупка';
                                sideClose = 'продажи';
                            }
                            const queryObject = {
                                client: clientId,
                                buysell,
                                orderprice,
                                quantity: lots,
                                ismarket: 'true',
                                HftOrNot,
                            };

                            const currentDate = new Date().toISOString().slice(0, 10);
                            const arrayDate = currentDate.split('-');
                            const currentUtcDateUnix = new Date(
                                Date.UTC(
                                    Number(arrayDate['0']),
                                    Number(arrayDate['1']) - 1,
                                    Number(arrayDate['2']),
                                ),
                            ).getTime();
                            const unikString =
                `${currentUtcDateUnix}_` +
                'todaybuy' +
                `_${Number(object.positions.forts_position.todaybuy)}_` +
                'todaysell' +
                `_${Number(object.positions.forts_position.todaysell)}`;

                            // проверка, не было ли уже отправки ордера для такого закрытия
                            if (!arrayUnikStringCloseOpenPositions.includes(unikString)) {
                                arrayUnikStringCloseOpenPositions.push(unikString);

                                const message =
                  `${HftOrNot} ${dateHuman} ${side} ${lots} лотов для закрытия открытой ${sideClose}\r\n` +
                  `diffOpenPositions = ${diffOpenPositions}, ` +
                  `todaybuy = ${object.positions.forts_position.todaybuy}, ` +
                  `todaysell = ${object.positions.forts_position.todaysell}\r\n` +
                  `object = ${JSON.stringify(object)}\r\n` +
                  `queryObject = ${JSON.stringify(queryObject)}\r\n` +
                  '\r\n';

                                console.log(message);
                                writeToFile(
                                    message,
                                    path.join(process.cwd(), `log/${HftOrNot}/log.log`),
                                );

                                functionSendOrderToBirga(queryObject);
                            } else {
                                const message =
                  `${HftOrNot} ` +
                  'Повторная попытка отправить уже отправленное закрытие, ЗАЯВКА НА БИРЖУ НЕ ОТПРАВЛЕНА!' +
                  `\r\n${dateHuman} ${side} ${lots} лотов для закрытия открытой ${sideClose}\r\n` +
                  `diffOpenPositions = ${diffOpenPositions}, ` +
                  `todaybuy = ${object.positions.forts_position.todaybuy}, ` +
                  `todaysell = ${object.positions.forts_position.todaysell}\r\n` +
                  `object = ${JSON.stringify(object)}\r\n` +
                  `queryObject = ${JSON.stringify(queryObject)}\r\n` +
                  '\r\n';

                                console.log(message);
                                writeToFile(
                                    message,
                                    path.join(process.cwd(), `log/${HftOrNot}/log.log`),
                                );
                            }
                        }
                    }
                }
            }

            // isCheckFortsPosition = true positions
            // сделки
            // if (object.alltrades !== undefined) {
            //     console.log(HftOrNot + ' ' + 'trades ' + string + '\r\n');
            // }
        }
    } catch (e) {
        console.log(e);
    }

    return null;
}

// #endregion

// #region разные callback в зависимости от HftOrNot, поступают возвраты на запросы
// const functionCallbackHft = ffi.Callback(
//     ref.types.bool,
//     [ref.refType(ref.types.CString)],
//     msg => {
//         functionCallback(msg, 'Hft');
//         if (msg !== undefined) {
//             objectAccountsAndDll['afterInitialize']['Hft'].FreeMemory(msg);
//         }

//         return null;
//     },
// );

// const functionCallbackNotHft = ffi.Callback(
//     ref.types.bool,
//     [ref.refType(ref.types.CString)],
//     msg => {
//         functionCallback(msg, 'NotHft');
//         if (msg !== undefined) {
//             objectAccountsAndDll['afterInitialize']['NotHft'].FreeMemory(msg);
//         }

//         return null;
//     },
// );

// #endregion

// #region подключение
/**
 * @this {functionConnect}
 *
 * @return null
 *  const ffi = require("ffi-cross");
   const { ref, types } = ffi;
 * */

async function functionConnect(HftOrNot, callback) {
    // noinspection JSUnusedLocalSymbols
    const ffiCallback = ffi.Callback(
        ffi.types.bool,
        [ref.refType(ffi.types.CString)],
        msg => {
            callback(ref.readCString(msg, 0), HftOrNot);
            functionCallback(msg, HftOrNot);
            if (msg !== undefined) {
                objectAccountsAndDll['afterInitialize'][HftOrNot].FreeMemory(msg);
            }

            return null;
        },
    );

    process.on('exit', function() {
        const x = ffiCallback;
    });

    //    console.log(objectAccountsAndDll['afterInitialize'][HftOrNot])
    const promise = new Promise((resolve, reject) => {
        resolve(

            // относительный путь в виндовс не всегда работает корректно, иногда существующий файл не находится
            objectAccountsAndDll['afterInitialize'][HftOrNot].Initialize(
                path.join(process.cwd(), `log/${HftOrNot}/log.log`),
                1,
            ),
        );
    });

    try {
        //converting to async await
        const init = await promise;

        console.log(init);
        let SetCallback;

        if (HftOrNot === 'Hft') {
            SetCallback = await objectAccountsAndDll['afterInitialize'][HftOrNot].SetCallback(ffiCallback);
        }
        if (HftOrNot === 'NotHft') {
            SetCallback = await objectAccountsAndDll['afterInitialize'][HftOrNot].SetCallback(ffiCallback);
        }
        console.log(`Promise ${HftOrNot} init ${init}`);

        console.log(`Promise ${HftOrNot} SetCallback ${SetCallback}`);

        const myXMLConnectString =
    `${'<command id="connect">' + '<login>'}${
      objectAccountsAndDll['users'][HftOrNot].Account.login
    }</login>` +
    `<password>${objectAccountsAndDll['users'][HftOrNot].Account.password}</password>` +
    `<host>${objectAccountsAndDll['servers'][HftOrNot].host}</host>` +
    `<port>${objectAccountsAndDll['servers'][HftOrNot].port}</port>` +
    '<language>en</language>' +
    '<autopos>false</autopos>' +
    '<session_timeout>200</session_timeout>' +
    '<request_timeout>20</request_timeout>' +
    '</command>';

        objectAccountsAndDll['afterInitialize'][HftOrNot].SendCommand(myXMLConnectString);
    } catch (err) {
        console.log(`Promise ${HftOrNot} catch ${err}`);
    } finally {
        console.log(`Promise ${HftOrNot} end`);
    }

    return null;
}

// подключение Hft и НЕ Hft в цикле
// Object.keys(typesUsersArray).forEach((number) => {
//   const HftOrNot = typesUsersArray[number];
//   console.log(HftOrNot);
//   functionConnect(HftOrNot);
// });
// #endregion

// #region подписка\отписка
/**
 * @this {functionSubscribeAndUnSubscribe}
 * @param type string
 * @param operation string
 * @param security string
 * @param HftOrNot string
 *
 * @return string
 * */
function functionSubscribeAndUnSubscribe(operation, type, security, HftOrNot) {
    return objectAccountsAndDll['afterInitialize'][HftOrNot].SendCommand(
    `<command id="${operation}">` +
      `<${type}>` +
      '<security>' +
      `<board>${board}</board>` +
      `<seccode>${security}</seccode>` +
      '</security>' +
      `</${type}>` +
      '</command>',
    );
}

// #endregion

// #region отписка по таймеру
/**
 * @this {functionUnSubscribeByTimer}
 *
 * @return null
 * */
function functionUnSubscribeByTimer(HftOrNot) {
    // строка контракта меняется каждые 3 месяца, получить ее исходя из текущей даты
    const contractString = functionActiveContractString();

    // отписка
    functionSubscribeAndUnSubscribe(
        'unsubscribe',
        'quotes',
        contractString,
        HftOrNot,
    );

    // отключение functionGetSettingsFromDb
    // clearTimeout(timerId);
}

// let timerId = setInterval(functionUnSubscribeByTimer, 20000);
// #endregion

// #region отключение
/**
 * @this {functionDisconnect}
 * @param HftOrNot string
 *
 * @return null
 * */
function functionDisconnect(HftOrNot) {
    objectAccountsAndDll['afterInitialize'][HftOrNot].SendCommand(
        '<command id="disconnect"/>',
    );

    return null;
}

// #endregion

// #region подключение в 9:59, снятие заявок и закрытие открытых позиций в 23:40
/**
 * @this {functionConnectByTimer}
 * @param HftOrNot string
 *
 * @return null
 * */
function functionConnectByTimer(HftOrNot) {
    const clientId = objectAccountsAndDll['users'][HftOrNot].Account.clientId_1;

    if (!clientId) {
        return;
    }

    const date = new Date();
    const unixTime = date.getTime();
    const currentFullDateThisServer = date
        .toISOString()
        .replace('T', ' ')
        .replace('Z', '');
    const currentDate = currentFullDateThisServer.slice(0, 10);
    const arrayDate = currentDate.split('-');

    // в UTC нужны год, месяц, дата, месяцы начинаются с 0, поэтому минус 1, arrayDate['0'] = "2020" (+arrayDate['1'] - 1) = 1 arrayDate['2'] = "01"
    // отклонение от UTC в часах, разница во времени между Мск. и этим сервером 4 часа, а offset показывает 3
    // let offset = date.getTimezoneOffset();
    const offset = -3;

    // let dateUnixForConnect = new Date(Date.UTC(+arrayDate['0'], (+arrayDate['1'] - 1), +arrayDate['2'], (10 + offset), 55)).getTime();
    // let dateHumanForConnect = new Date(dateUnixForConnect).toISOString().replace('T', ' ').replace('Z', '');
    // // console.log(currentFullDateThisServer + ' запуск functionConnectDisconnectByTimer');
    // let diff = unixTime - dateUnixForConnect;
    let command = '';

    // let timeStart = (7 * 60 * 60 * 1000);
    // разница во времени здесь получается 6 часов, активирую подключение за 60 секунд до запуска торгов
    // старт по таймеру отключаю, запускается, но не работает, сделал задание C:\Users\Administrator\AppData\Roaming\nvm\v11.0.0\pm2.cmd restart 0 в планировщике заданий
    // if (
    //     diff >= 200000
    //     &&
    //     diff <= 300000
    //     ) {
    //     console.log(
    //         'dateHumanForConnect ' + dateHumanForConnect + '\r\n' +
    //         'currentFullDateThisServer ' + currentFullDateThisServer + '\r\n' +
    //         'unixTime ' + unixTime + '\r\n' +
    //         'dateUnixForConnect ' + dateUnixForConnect + '\r\n' +
    //         'diff ' + diff + '\r\n' +
    //         'активирую подключение за 60 секунд до запуска торгов'
    //     );
    //     functionConnect();
    // }

    // снятие открытых заявок перед закрытием сессии в 23:40
    const dateUnixForCancelOpenOrders = new Date(
        Date.UTC(
            Number(arrayDate['0']),
            Number(arrayDate['1']) - 1,
            Number(arrayDate['2']),
            23 + offset,
            40,
        ),
    ).getTime();
    const diffForCancel = unixTime - dateUnixForCancelOpenOrders; // -33679989

    if (diffForCancel >= 60000 && diffForCancel <= 540000) {
        let isOpenOrdersExists = false;
        const openOrdersObject = finamClass.getOpenOrders(HftOrNot);

        Object.keys(typesOrdersArray).forEach(number => {
            const type = typesOrdersArray[number];

            if (openOrdersObject[type] !== undefined) {
                Object.keys(openOrdersObject[type]).forEach(
                    numberInOpenOrdersObject => {
                        const transactionId =
              openOrdersObject[type][numberInOpenOrdersObject].transactionid;

                        if (
                            openOrdersObject[type][numberInOpenOrdersObject].status ===
                'watching' &&
              openOrdersObject[type][numberInOpenOrdersObject].condition ===
                undefined
                        ) {
                            command = 'cancelstoporder';
                            isOpenOrdersExists = true;
                        } else if (
                            openOrdersObject[type][numberInOpenOrdersObject].status ===
                'active' ||

              // заявки, выставленные newcondorder
              (openOrdersObject[type][numberInOpenOrdersObject].status ===
                'watching' &&
                openOrdersObject[type][numberInOpenOrdersObject].condition !==
                  undefined)
                        ) {
                            command = 'cancelorder';
                            isOpenOrdersExists = true;
                        }
                        if (command !== '') {
                            const queryObject = {
                                command,
                                orderId: transactionId,
                                HftOrNot,
                            };
                            const result = functionCancelOrder(queryObject);
                            const message =
                `${HftOrNot} ` +
                `снятие заявки transactionId = ${transactionId}, queryObject = ${JSON.stringify(
                    queryObject,
                )}, result = ${result}`;

                            console.log(message);
                            writeToFile(
                                message,
                                path.join(process.cwd(), `log/${HftOrNot}/log.log`),
                            );
                        }
                    },
                );
            }
        });

        // если нет открытых заявок, закрытие открытых позиций
        if (unixTime - startTimeTimer >= 30000 && isCheckFortsPosition === true) {
            isCheckFortsPosition = false;
            const dateHuman = new Date(unixTime)
                .toISOString()
                .replace('T', ' ')
                .replace('Z', '');
            const message = `${HftOrNot} ${dateHuman} нет открытых заявок. Срабтывание в functionConnectByTimer, прошло ${
        (unixTime - startTimeTimer) / 1000
      } секунд.`;

            console.log(message);
            writeToFile(message, path.join(process.cwd(), `log/${HftOrNot}/log.log`));
        }

        if (isOpenOrdersExists === false) {
            if (isCheckFortsPosition === true) {
                // предположим условие сработало, и выпонилось dll.SendCommand(get_forts_positions
                // а при отсутствии позиций возврата не будет, и окажется зависшее условие и выполнение
                startTimeTimer = unixTime;
            } else {
                isCheckFortsPosition = true;
                objectAccountsAndDll['afterInitialize'][HftOrNot].SendCommand(
          `<command id="get_forts_positions" client="${clientId}"/>`,
                );
            }
        }
    }

    // после закрытия биржи получить историю, и сохранить ее в базу
    if (diffForCancel <= 900000) {
        // однотипный код получения истории
        if (diffForCancel >= 660000 && diffForCancel < 780000) {
            // 5-минутная история
            functionCodeForGetHistory(2, 162);
        } else if (diffForCancel >= 780000 && diffForCancel <= 900000) {
            // часовая история
            functionCodeForGetHistory(4, 14);
        }
    }

    setTimeout(functionConnectByTimer, 60000, HftOrNot);
}

// подключение Hft и НЕ Hft в цикле
Object.keys(typesUsersArray).forEach(number => {
    const HftOrNot = typesUsersArray[number];

    setTimeout(functionConnectByTimer, 60000, HftOrNot);
});

// #endregion

// #region если работа веб сервера не закончена, закончить по таймеру
/**
 * @this {functionCloseWebServerByTimer}
 *
 * @return null
 * */
function functionCloseWebServerByTimer() {
    if (mainFile.workHereOrInTransaqConnector === false) {
        if (getHistoryByTimer === false) {
            functionCloseWebServer(
                '<result success="false"><message>если работа веб сервера не закончена, закончить по таймеру</message></result>',
                '<result success="false"><message>если работа веб сервера не закончена, закончить по таймеру</message></result>',
            );
        }
    }
    setTimeout(functionCloseWebServerByTimer, 20000);
}
setTimeout(functionCloseWebServerByTimer, 20000);

// #endregion

// #region прекращенние работы веб сервера
/**
 * @this {functionCloseWebServer}
 *
 * @return null
 * */
function functionCloseWebServer(messageLog = '', string) {
    const unixTime = new Date().getTime();
    const dateHuman = new Date(unixTime)
        .toISOString()
        .replace('T', ' ')
        .replace('Z', '');

    messageLog = `${dateHuman}<br>\r\n ${messageLog}`;
    mainFile.workHereOrInTransaqConnector = true;

    // обратная замена, была для веб страницы, это для лога, разные переносы строки
    console.log(
        messageLog
            .replace(/&#706;/g, '<')
            .replace(/&#707;/g, '>')
            .replace(/<br>/g, ''),
    );
    mainFile.commandText = '';
    try {
        mainFile.res.write(string || messageLog);
        mainFile.res.end();
    } catch (e) {
        console.log(e);
    }

    return null;
}

// #endregion

// #region запись в файл
/**
 * @this {writeToFile}
 * @param inputArgs object
 * @param fileName string
 *
 * return null
 * */
function writeToFile(inputArgs, fileName) {
    try {
        // fs.appendFile(fileName, inputArgs + "\r\n", {'flag': 'as+'}, (err, fileDescriptor) => {
        //     if (err) {
        //         console.log(err);
        //     }
        // });
        fs.open(fileName, 'as+', (error, fileDescriptor) => {
            if (!error && fileDescriptor) {
                fs.writeFile(fileDescriptor, `${inputArgs}\r\n`, error => {
                    if (!error) {
                        fs.close(fileDescriptor, error => {
                            if (error) {
                                console.log(error);
                            }
                        });
                    } else {
                        console.log(error);
                    }
                });
            }
        });
    } catch (e) {
        const err = `Ошибка ${e.name}:${e.message}\n${e.stack}`;

        console.log(err);
    }

    return null;
}

// #endregion

// #region получение истории
/**
 * @this {functionGetHistory}
 * @param queryObject string
 *
 * @return string
 * */
function functionGetHistory(queryObject) {
    /*
    5-минутная история
    http://127.0.0.1:12345/?command=gethistorydata&period=2&count=162&HftOrNot=NotHft
    часовая
    http://127.0.0.1:12345/?command=gethistorydata&period=4&count=14&HftOrNot=NotHft
    * */
    /** @var queryObject.period string */
    /** @var queryObject.count string */
    const { command } = queryObject;
    const { period } = queryObject;
    const { count } = queryObject;

    // строка контракта меняется каждые 3 месяца, получить ее исходя из текущей даты
    const unixTime = new Date().getTime();
    const dateHuman = new Date(unixTime).toISOString().substring(0, 10);
    const arrayDate = dateHuman.split('-');
    const contractString = functions.functionContractString(arrayDate['0'], arrayDate['1'], arrayDate['2']);

    const commandXml =
    `<command id="${command}">` +
    '<security>' +
    `<board>${board}</board>` +
    `<seccode>${contractString}</seccode>` +
    '</security>' +
    `<period>${period}</period>` +
    `<count>${count}</count>` +
    '<reset>true</reset>' +
    '</command>';

    // истрию получаю для NotHft - указываю явно
    return objectAccountsAndDll['afterInitialize']['NotHft'].SendCommand(commandXml);
}

// #endregion

// #region разбор url для формирования xml запроса в dll
/**
 * @this {functionExplodeUrlCreateXml}
 * @param url string
 *
 * @return string
 * */
function functionExplodeUrlCreateXml(url) {
    // разбор составной команды
    const arraySplit = url.split('&');
    let allParametrs = '';

    for (const number in arraySplit) {
        if (Number(number) > 0) {
            const element = arraySplit[number];
            const splitElement = element.split('=');

            allParametrs += `<${splitElement['0']}>${splitElement['1']}</${splitElement['0']}>`;
        }
    }

    return allParametrs;
}

// #endregion

// #region получение истории по таймеру
/**
 * @this {functionGetHistoryByTimer}
 *
 * @return null
 * */
function functionGetHistoryByTimer() {
    // историю можно получать по тамеру, в этом случае НЕ нужно вызывать functionCloseWebServer, для этого присвоить getHistoryByTimer = true
    // однотипный код получения истории
    functionCodeForGetHistory();

    setTimeout(functionGetHistoryByTimer, 20000);
}

// setTimeout(functionGetHistoryByTimer, 20000);
// #endregion

// #region выставление заявки, парметры заявки конструируются из url
/**
 * @this {functionSendOrderToBirga}
 * @param queryObject object
 *
 * @return string
 * */
function functionSendOrderToBirga(queryObject) {
    const { HftOrNot } = queryObject;
    const command = functionXmlQueryToSendTransactionMakeParametrsFromUrl(queryObject);

    return objectAccountsAndDll['afterInitialize'][HftOrNot].SendCommand(command);
}

// #endregion

// #region конструирование json строки для выставления заявки из xml, не использовать, использовать упрощенную версию

// /**
//  * @this {functionXmlToJson}
//
//  * @return object
//  * */
// function functionXmlToJson(HftOrNot) {
//     let clientId = objectAccountsAndDll.users[HftOrNot].Account.clientId_1;
//     //#region все параметры заявки из документации
//     let fullParametrs =
//         '<command id="newstoporder">' +
//         '<secid>идентификатор бумаги</secid>' +
//         '<security>' +
//         '<board> идентификатор режима торгов </board>' +
//         '<seccode>Код инструмента</seccode>' +
//         '</security>' +
//         '<packetid>Номер пакета</packetid>' +
//         '<client>идентификатор клиента</client>' +
//         '<union>union code :string </union>' +
//         '<buysell>B/S</buysell>' +
//         '<linkedorderno>номер связанной активной заявки</linkedorderno>' +
//         '<validfor>заявка действительно до</validfor>' +
//         '<expdate>дата экспирации (только для ФОРТС)</expdate>' +
//         '<stoploss>' +
//         '<activationprice>Цена активации</activationprice>' +
//         '<orderprice>Цена заявки</orderprice>' +
//         '<bymarket/>' +
//         '<quantity>Количество</quantity>' +
//         '<usecredit/>' +
//         '<guardtime>Защитное время</guardtime>' +
//         '<brokerref>Примечание пользователя</brokerref>' +
//         '</stoploss>' +
//         '<takeprofit>' +
//         '<activationprice>Цена активации</activationprice>' +
//         '<quantity>Количество</quantity>' +
//         '<usecredit/>' +
//         '<guardtime>Защитное время</guardtime>' +
//         '<brokerref>Примечание пользователя</brokerref>' +
//         '<correction>Коррекция</correction>' +
//         '<spread>Защитный спрэд</spread>' +
//         '<bymarket/>' +
//         '</takeprofit>' +
//         '</command>';
//
//     //#region только нужные параметры заявки из документации
//     let buyOrSell = 'B';
//     // let buyOrSell = 'S';
//     //Для validfor значение "0" означает, что заявка будет действительна до конца сессии
//     let validfor = '0';
//     let orderPrice = '40000';
//     let quantity = '1';
//     let stopLossPrice = parseFloat('' + (+orderPrice * 0.97)).toFixed(0);
//     let takeProfitPrice = parseFloat('' + (+orderPrice * 1.03)).toFixed(0);
//     if (buyOrSell === 'S') {
//         stopLossPrice = parseFloat('' + (+orderPrice * 1.03)).toFixed(0);
//         takeProfitPrice = parseFloat('' + (+orderPrice * 0.97)).toFixed(0);
//     }
//
//     let onlyNeedParametrs =
//         '<command id="newstoporder">' +
//         '<security>' +
//             '<board>' + board + '</board>' +
//             '<seccode>' + seccode + '</seccode>' +
//         '</security>' +
//         '<client>' + clientId + '</client>' +
//         '<buysell>' + buyOrSell + '</buysell>' +
//         '<validfor>' + validfor + '</validfor>' +
//         '<stoploss>' +
//             '<orderprice>' + orderPrice + '</orderprice>' +
//             '<quantity>' + quantity + '</quantity>' +
//             '<activationprice>' + stopLossPrice + '</activationprice>' +
//         '</stoploss>' +
//         '<takeprofit>' +
//             '<activationprice>' + takeProfitPrice + '</activationprice>' +
//             '<quantity>' + quantity + '</quantity>' +
//         '</takeprofit>' +
//         '</command>';
//
//     let string = xml2json.toJson(onlyNeedParametrs);
//     let object = JSON.parse(string);
//
//     return {
//         'string': string,
//         'object': object
//     };
// }
// не использовать
// functionXmlToJson();
// использовать упрощенную версию

// #endregion

// #region конструирование строки заявки из url
/**
 * @this {functionXmlQueryToSendTransactionMakeParametrsFromUrl}
 * @param queryObject object

 * @return string
 * */
function functionXmlQueryToSendTransactionMakeParametrsFromUrl(queryObject) {
    /** @var queryObject.orderprice integer */
    /** @var queryObject.quantity integer */
    /** @var queryObject.stoplosspercent double */
    /** @var queryObject.takeprofitpercent double */
    /** @var queryObject.condorder string */
    /** @var queryObject.buysell string */
    const { HftOrNot } = queryObject;
    const clientId = objectAccountsAndDll.users[HftOrNot].Account.clientId_1;

    // строка контракта меняется каждые 3 месяца, получить ее исходя из текущей даты
    const contractString = functionActiveContractString();
    let condType = '';
    let condValue = '';

    if (queryObject.condorder !== undefined) {
        /*
        http://127.0.0.1:12345?command=newcondorder&buysell=sell&orderprice=90000&quantity=1&cond_type=LastUp&cond_value=90000&condorder=true&HftOrNot=NotHft
        Допустимые типы условия:
        Bid		= лучшая цена покупки
        BidOrLast	= лучшая цена покупки или сделка по заданной цене и выше
        Ask		= лучшая цена продажи
        AskOrLast	= лучшая цена продажи  или сделка по заданной цене и ниже
        Time		= время выставления заявки на Биржу
        CovDown	= обеспеченность ниже заданной
        CovUp		= обеспеченность выше заданной
        LastUp		= сделка на рынке по заданной цене или выше
        LastDown	= сделка на рынке по заданной цене или ниже */
        /** @var queryObject.cond_type string */
        /** @var queryObject.cond_value string */

        condType = queryObject.cond_type;
        condValue = queryObject.cond_value;
    }
    const buyOrSellFromUrl = queryObject.buysell;
    let buyOrSell = 'B';

    if (buyOrSellFromUrl === 'sell') {
        buyOrSell = 'S';
    }
    const { quantity } = queryObject;

    // Для validfor значение "0" означает, что заявка будет действительна до конца сессии
    const validfor = '0';
    let orderPrice = queryObject.orderprice;
    let stopLossPercent = 0;

    if (queryObject.stoplosspercent !== undefined) {
        stopLossPercent = Number(queryObject.stoplosspercent) / 100;
    }
    let takeProfitPercent = 0;

    if (queryObject.takeprofitpercent !== undefined) {
        takeProfitPercent = Number(queryObject.takeprofitpercent) / 100;
    }

    let stopLossPrice = parseFloat(
    `${Number(orderPrice) * (1 - stopLossPercent)}`,
    ).toFixed(0);
    let takeProfitPrice = parseFloat(
    `${Number(orderPrice) * (1 + takeProfitPercent)}`,
    ).toFixed(0);

    if (buyOrSell === 'S') {
        stopLossPrice = parseFloat(
      `${Number(orderPrice) * (1 + takeProfitPercent)}`,
        ).toFixed(0);
        takeProfitPrice = parseFloat(
      `${Number(orderPrice) * (1 - stopLossPercent)}`,
        ).toFixed(0);
    }

    // #region заявка со стоп-лоссом и тейк-профитом
    let makeParametrsFromUrl =
    `${
      '<command id="newstoporder">' + '<security>' + '<board>'
    }${board}</board>` +
    `<seccode>${contractString}</seccode>` +
    '</security>' +
    `<client>${clientId}</client>` +
    `<buysell>${buyOrSell}</buysell>` +
    `<validfor>${validfor}</validfor>` +
    '<stoploss>' +
    `<orderprice>${orderPrice}</orderprice>` +
    `<quantity>${quantity}</quantity>` +
    `<activationprice>${stopLossPrice}</activationprice>` +
    '</stoploss>' +
    '<takeprofit>' +
    `<activationprice>${takeProfitPrice}</activationprice>` +
    `<quantity>${quantity}</quantity>` +
    '</takeprofit>' +
    '</command>';

    // #endregion

    // #region рыночная заявка
    if (queryObject.ismarket !== undefined) {
        /** @var queryObject.ismarket string */
        const isMarket = Boolean(JSON.parse(String(queryObject.ismarket).toLowerCase()));

        if (isMarket === true) {
            // в ТС FORTS не предусмотрены заявки без цены, то рыночные заявки для фьючерсов эмулируются с помощью лимитированных следующим образом:
            // заявки на покупку подаются по максимально возможной цене сессии, а заявки на продажу - по минимально возможной. Для таких заявок также автоматически устанавливается признак "Снять остаток".
            const savedMaxPrices = finamClass.getMaxPrices([HftOrNot]);

            orderPrice = Number(savedMaxPrices.maxPriceHigh);
            if (buyOrSell === 'S') {
                orderPrice = Number(savedMaxPrices.maxPriceLow);
            }

            makeParametrsFromUrl =
        `${
          '<command id="neworder">' + '<security>' + '<board>'
        }${board}</board>` +
        `<seccode>${contractString}</seccode>` +
        '</security>' +
        `<client>${clientId}</client>` +
        `<buysell>${buyOrSell}</buysell>` +
        `<price>${orderPrice}</price>` +
        `<quantity>${quantity}</quantity>` +
        '<unfilled>PutInQueue</unfilled>' +
        '</command>';
        }
    }

    // #endregion

    // #region заявка с условием, newcondorder
    if (queryObject.condorder !== undefined) {
        makeParametrsFromUrl =
      `${
        '<command id="newcondorder">' + '<security>' + '<board>'
      }${board}</board>` +
      `<seccode>${contractString}</seccode>` +
      '</security>' +
      `<client>${clientId}</client>` +
      `<buysell>${buyOrSell}</buysell>` +
      `<price>${orderPrice}</price>` +
      `<quantity>${quantity}</quantity>` +
      `<validafter>${validfor}</validafter>` +
      `<validbefore>${validfor}</validbefore>` +
      `<cond_type>${condType}</cond_type>` +
      `<cond_value>${condValue}</cond_value>` +
      '</command>';
    }

    // #endregion

    return makeParametrsFromUrl;
}

// #endregion

// #region снятие открытой заявки
/**
 * @this {functionCancelOrder}
 * @param queryObject object
 *
 * @return string
 * */
//removed by maruf
// function functionCancelOrder(queryObject) {
//     /*
//     http://127.0.0.1:12345/?command=cancelorder&orderId=10703545&HftOrNot=NotHft
//     http://127.0.0.1:12345/?command=cancelstoporder&orderId=27499316&HftOrNot=NotHft
//     //<command id=”cancelstoporder”>
//     // <transactionid>номер из структуры orders</transactionid>
//     // </command>
//     * */
//     const { HftOrNot } = queryObject;

//     /** @var queryObject.orderId string */
//     const { orderId, command } = queryObject;
//     const {} = queryObject;
//     const makeParametrsFromUrl =
//     `<command id="${command}">` +
//     `<transactionid>${orderId}</transactionid>` +
//     '</command>';

//     return objectAccountsAndDll['afterInitialize'][HftOrNot].SendCommand(
//         makeParametrsFromUrl,
//     );
// }

// #endregion

// #region однотипный код получения истории
/**
 * @this {functionCodeForGetHistory}
 *
 * @return null
 * */
function functionCodeForGetHistory(period, count) {
    getHistoryByTimer = true;
    mainFile.commandText = 'gethistorydata';
    mainFile.workHereOrInTransaqConnector = false;
    const queryObject = {
        command: 'gethistorydata',
        period,
        count,
        HftOrNot: 'NotHft',
    };

    functionGetHistory(queryObject);

    return null;
}

// #endregion

// #region строка названия активного контракта исходя из текущей даты
/**
 * @this {functionActiveContractString}
 *
 * @return string
 * */
function functionActiveContractString() {
    const unixTime = new Date().getTime();
    const dateHuman = new Date(unixTime).toISOString().substring(0, 10);
    const arrayDate = dateHuman.split('-');

    return functions.functionContractString(
        arrayDate['0'],
        arrayDate['1'],
        arrayDate['2'],
    );
}

// #endregion

// #region module.exports
module.exports = {
    objectAccountsAndDll,
    functionGetHistory,
    functionSendOrderToBirga,
    functionConnect,
    isTransaqConnected,
};

// #endregion
