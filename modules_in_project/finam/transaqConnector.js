// #region переменные
const ffi = require('ffi-cross');
const ref = require('ref-napi');
const xml2json = require('xml2json');
const fs = require('fs');
const path = require('path');
const finamClass = require('./FinamClass.js');
const functions = require('../common_sevice_functions/functions.js');

const closeCommandStr = '</command>';
const securityStr = '<security>';
const closeSecurityStr = '</security>';

// \различные функции
const config = require(path.join(process.cwd(), 'config.json'));

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

function sameCodeBlock(string, commandText, HftOrNot) {
    const messageLog = getConvertedMessageFromCommand(
        string,
        commandText,
        HftOrNot,
    );

    functionCloseWebServer(messageLog, string);
}

function getConvertedMessageFromCommand(string, commandText, HftOrNot) {
    return (
    `${HftOrNot} ` +
    `Результат выполнения команды <br>\r\n${commandText
        .replace(/</g, '&#706;')
        .replace(/>/g, '&#707;')}<br>\r\n` +
    ` = <br>\r\n${string
        .replace(/</g, '&#706;')
        .replace(/>/g, '&#707;')}<br>\r\n`
    );
}

function inputDataFnSubMain(messageLog, dateHuman, string, unixTime, mainFile) {
    if (getHistoryByTimer === false) {
        functionCloseWebServer(messageLog, string);
    } else {
    // это история по таймеру
        messageLog = `${dateHuman}<br>\r\n ${messageLog}`;

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
}

function inputDataMainFileWorkHere(
    HftOrNot,
    dateHuman,
    object,
    string,
    unixTime,
) {
    if (mainFile.workHereOrInTransaqConnector === false) {
        const { commandText } = mainFile;

        if (string.indexOf(commandText) > -1) {
            sameCodeBlock(string, commandText, HftOrNot);
        } else if (
            commandText.indexOf('gethistorydata') > -1 &&
      string.indexOf('candles') > -1
        ) {
            const messageLog = getConvertedMessageFromCommand(
                string,
                commandText,
                HftOrNot,
            );

            // историю можно получать по таймеру, в этом случае НЕ нужно вызывать functionCloseWebServer
            if (object.candles.period === '2') {
                const arraySplit = object.candles.candle['0'].date.split(' ');
                const arraySplitDate = arraySplit['0'].split('.');
                const tableName = `history_5min_${arraySplitDate['2']}-${arraySplitDate['1']}-${arraySplitDate['0']}`;

                // mysqlModule.functionCreateTable(tableName);
            }

            //Function Call
            inputDataFnSubMain(messageLog, dateHuman, string, unixTime, mainFile);

            // сбросить переменную getHistoryByTimer
            getHistoryByTimer = false;
        } else if (
            commandText.indexOf('get_portfolio') > -1 &&
      string.indexOf('portfolio') > -1
        ) {
            sameCodeBlock(string, commandText, HftOrNot);
        }
    }
}

function inputDataCheckLastIf(HftOrNot, dateHuman, object, string, unixTime) {
    // количество лотов для закрытия открытых позици

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

        writeToFile(message, path.join(process.cwd(), `log/${HftOrNot}/log.log`));
    } else {
        isCheckFortsPosition = false;
        const lots = Math.abs(
            Number(object.positions.forts_position.todaybuy) -
        Number(object.positions.forts_position.todaysell),
        );
        const savedMaxPrices = finamClass.getMaxPrices([HftOrNot]);
        const clientId = objectAccountsAndDll.users[HftOrNot].Account.clientId_1;
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

            writeToFile(message, path.join(process.cwd(), `log/${HftOrNot}/log.log`));

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

            writeToFile(message, path.join(process.cwd(), `log/${HftOrNot}/log.log`));
        }
    }
}

function finalClassUpdateFN(HftOrNot, dateHuman, object, string, unixTime) {
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

    finamClass.updateOpenOrders(openOrdersObject, HftOrNot);
}

function subscribeOnGlassFn(HftOrNot, dateHuman, object, string, unixTime) {
    if (object.server_status.connected === 'true' && subscribeOnGlass[HftOrNot]) {
        if (HftOrNot === 'Hft') {
            const contractString = functionActiveContractString();
            const result = functionSubscribeAndUnSubscribe(
                'subscribe',
                'quotes',
                contractString,
                HftOrNot,
            );
        }
        const contractString = functionActiveContractString();
        const result = functionSubscribeAndUnSubscribe(
            'subscribe',
            'quotations',
            contractString,
            HftOrNot,
        );

        subscribeOnGlass[HftOrNot] = false;
    }
}

function inputDataFn(HftOrNot, dateHuman, object, string, unixTime) {
    inputDataMainFileWorkHere(HftOrNot, dateHuman, object, string, unixTime);
    if (object.orders !== undefined) {
        finalClassUpdateFN(HftOrNot, dateHuman, object, string, unixTime);
    } else if (object.server_status !== undefined) {
        subscribeOnGlassFn(HftOrNot, dateHuman, object, string, unixTime);
    } else if (object.quotes !== undefined && HftOrNot === 'Hft') {
        finamClass.workOnGlass(object);
    } else if (object.quotations !== undefined) {
        if (
            object.quotations.quotation.high !== undefined &&
      object.quotations.quotation.low !== undefined
        ) {
            maxPrices = {
                maxPriceHigh: object.quotations.quotation.high,
                maxPriceLow: object.quotations.quotation.low,
            };
            finamClass.updateMaxPrices(maxPrices, HftOrNot);
        }
    } else if (
        object.positions !== undefined &&
    object.positions.forts_position !== undefined &&
    isCheckFortsPosition === true
    ) {
        inputDataCheckLastIf(HftOrNot, dateHuman, object, string, unixTime);
    }
}

function functionCallback(msg, HftOrNot) {
    try {
    /** @var ref.readCString function */
        const inputData = ref.readCString(msg, 0);

        if (inputData) {
            const unixTime = new Date().getTime();
            const dateHuman = new Date(unixTime)
                .toISOString()
                .replace('T', ' ')
                .replace('Z', '');
            const string = xml2json.toJson(inputData);
            const object = JSON.parse(string);

            inputDataFn(HftOrNot, dateHuman, object, string, unixTime);
        }
    } catch (e) {}

    return null;
}

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

    //
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

        let SetCallback;

        if (HftOrNot === 'Hft') {
            SetCallback = await objectAccountsAndDll['afterInitialize'][
                HftOrNot
            ].SetCallback(ffiCallback);
        }
        if (HftOrNot === 'NotHft') {
            SetCallback = await objectAccountsAndDll['afterInitialize'][
                HftOrNot
            ].SetCallback(ffiCallback);
        }

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
      closeCommandStr;

        objectAccountsAndDll['afterInitialize'][HftOrNot].SendCommand(
            myXMLConnectString,
        );
    } catch (err) {}

    return null;
}

function functionSubscribeAndUnSubscribe(operation, type, security, HftOrNot) {
    return objectAccountsAndDll['afterInitialize'][HftOrNot].SendCommand(
    `<command id="${operation}"> \
        <${type}> \
        <security> \
        <board>${board}</board> \
        <seccode>${security}</seccode> \
        </security> \
        </${type}> \
        </command>`,
    );
}

function writeToFileFN(command, isOpenOrdersExists, HftOrNot) {
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
                        const result = ''; // functionCancelOrder(queryObject);
                        const message =
              `${HftOrNot} ` +
              `снятие заявки transactionId = ${transactionId}, queryObject = ${JSON.stringify(
                  queryObject,
              )}, result = ${result}`;

                        writeToFile(
                            message,
                            path.join(process.cwd(), `log/${HftOrNot}/log.log`),
                        );
                    }
                },
            );
        }
    });
}

function checkCalculations(
    diffForCancel,
    HftOrNot,
    command,
    unixTime,
    clientId,
) {
    if (diffForCancel >= 60000 && diffForCancel <= 540000) {
        const isOpenOrdersExists = false;
        const openOrdersObject = finamClass.getOpenOrders(HftOrNot);

        writeToFileFN(command, isOpenOrdersExists, HftOrNot);

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
}

function SomeCalulations(diffForCancel) {
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
}

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

    const offset = -3;

    const command = '';

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

    // fucntion to be placed here
    checkCalculations(diffForCancel, HftOrNot, command, unixTime, clientId);

    SomeCalulations(diffForCancel);

    setTimeout(functionConnectByTimer, 60000, HftOrNot);
}

// подключение Hft и НЕ Hft в цикле
Object.keys(typesUsersArray).forEach(number => {
    const HftOrNot = typesUsersArray[number];

    setTimeout(functionConnectByTimer, 60000, HftOrNot);
});

function functionCloseWebServerByTimer() {
    if (
        mainFile.workHereOrInTransaqConnector === false &&
    getHistoryByTimer === false
    ) {
        functionCloseWebServer(
            '<result success="false"><message>если работа веб сервера не закончена, закончить по таймеру</message></result>',
            '<result success="false"><message>если работа веб сервера не закончена, закончить по таймеру</message></result>',
        );
    }
    setTimeout(functionCloseWebServerByTimer, 20000);
}
setTimeout(functionCloseWebServerByTimer, 20000);

function functionCloseWebServer(messageLog = '', string) {
    const unixTime = new Date().getTime();
    const dateHuman = new Date(unixTime)
        .toISOString()
        .replace('T', ' ')
        .replace('Z', '');

    messageLog = `${dateHuman}<br>\r\n ${messageLog}`;
    mainFile.workHereOrInTransaqConnector = true;

    // обратная замена, была для веб страницы, это для лога, разные переносы строки

    mainFile.commandText = '';
    try {
        mainFile.res.write(string || messageLog);
        mainFile.res.end();
    } catch (e) {}

    return null;
}

function writeToFile(inputArgs, fileName) {
    try {
        fs.open(fileName, 'as+', (error, fileDescriptor) => {
            if (!error && fileDescriptor) {
                fs.writeFile(fileDescriptor, `${inputArgs}\r\n`, error => {
                    if (!error) {
                        fs.close(fileDescriptor, () => {});
                    }
                });
            }
        });
    } catch (e) {
        const err = `Ошибка ${e.name}:${e.message}\n${e.stack}`;
    }

    return null;
}

function functionGetHistory(queryObject) {
    const { command } = queryObject;
    const { period } = queryObject;
    const { count } = queryObject;

    // строка контракта меняется каждые 3 месяца, получить ее исходя из текущей даты
    const unixTime = new Date().getTime();
    const dateHuman = new Date(unixTime).toISOString().substring(0, 10);
    const arrayDate = dateHuman.split('-');
    const contractString = functions.functionContractString(
        arrayDate['0'],
        arrayDate['1'],
        arrayDate['2'],
    );

    const commandXml =
    `<command id="${command}">` +
    securityStr +
    `<board>${board}</board>` +
    `<seccode>${contractString}</seccode>` +
    closeSecurityStr +
    `<period>${period}</period>` +
    `<count>${count}</count>` +
    '<reset>true</reset>' +
    closeCommandStr;

    // истрию получаю для NotHft - указываю явно
    return objectAccountsAndDll['afterInitialize']['NotHft'].SendCommand(
        commandXml,
    );
}

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

function functionGetHistoryByTimer() {
    // историю можно получать по тамеру, в этом случае НЕ нужно вызывать functionCloseWebServer, для этого присвоить getHistoryByTimer = true
    // однотипный код получения истории
    functionCodeForGetHistory();

    setTimeout(functionGetHistoryByTimer, 20000);
}

function functionSendOrderToBirga(queryObject) {
    const { HftOrNot } = queryObject;
    const command =
    functionXmlQueryToSendTransactionMakeParametrsFromUrl(queryObject);

    return objectAccountsAndDll['afterInitialize'][HftOrNot].SendCommand(command);
}

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
      '<command id="newstoporder">' + securityStr + '<board>'
    }${board}</board>` +
    `<seccode>${contractString}</seccode>` +
    closeSecurityStr +
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
    closeCommandStr;

    // #endregion

    // #region рыночная заявка
    if (queryObject.ismarket !== undefined) {
    /** @var queryObject.ismarket string */
        const isMarket = Boolean(
            JSON.parse(String(queryObject.ismarket).toLowerCase()),
        );

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
          '<command id="neworder">' + securityStr + '<board>'
        }${board}</board>` +
        `<seccode>${contractString}</seccode>` +
        closeSecurityStr +
        `<client>${clientId}</client>` +
        `<buysell>${buyOrSell}</buysell>` +
        `<price>${orderPrice}</price>` +
        `<quantity>${quantity}</quantity>` +
        '<unfilled>PutInQueue</unfilled>' +
        closeCommandStr;
        }
    }

    // #endregion

    // #region заявка с условием, newcondorder
    if (queryObject.condorder !== undefined) {
        makeParametrsFromUrl =
      `${
        '<command id="newcondorder">' + securityStr + '<board>'
      }${board}</board>` +
      `<seccode>${contractString}</seccode>` +
      closeSecurityStr +
      `<client>${clientId}</client>` +
      `<buysell>${buyOrSell}</buysell>` +
      `<price>${orderPrice}</price>` +
      `<quantity>${quantity}</quantity>` +
      `<validafter>${validfor}</validafter>` +
      `<validbefore>${validfor}</validbefore>` +
      `<cond_type>${condType}</cond_type>` +
      `<cond_value>${condValue}</cond_value>` +
      closeCommandStr;
    }

    // #endregion

    return makeParametrsFromUrl;
}

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
