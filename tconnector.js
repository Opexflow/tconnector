const xml2json = require('xml2json');
const xmlParser = require('xml2js').parseString;

// const transaqConnector = require('./modules_in_project/finam/transaqConnector.js');

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

const ffi = require('ffi-cross');
const ref = require('ref-napi');
const fs = require('fs');
const path = require('path');

// const finamClass = require('./modules_in_project/finam/FinamClass');
// const functions = require('./modules_in_project/common_sevice_functions/functions');

const closeCommandStr = '</command>';
const securityStr = '<security>';
const closeSecurityStr = '</security>';

const config = require(path.resolve(__dirname, 'config.json'));

// #region функции в dll
const dllFunctions = {
    Initialize: [ffi.types.CString, [ffi.types.CString, ffi.types.int32]],
    UnInitialize: [ffi.types.CString, []],
    FreeMemory: [ffi.types.bool, [ffi.types.CString]],
    SendCommand: [ffi.types.CString, [ffi.types.CString]],
    SetCallback: [ffi.types.bool, ['pointer']],
    SetCallbackEx: [ffi.types.bool, ['pointer', ffi.types.CString]],
};

try {
    class TConnector {
        constructor() {
            try {
                this.clients = [];
                this.client = false;
                this.accountIdSelected;

                this.errorMessage;

                this.shares = [];
                this.futures = [];
                this.securities = {};
                this.historyCandles = {};
                this.subscribes = {};
                this.quotationsAndOrderbook = {};
                this.isFinalInited = false;

                this.orders = {};
                this.trades = {};
                this.allTrades = {};
                this.positions = {};
            } catch (e) {
                console.log(e); // eslint-disable-line no-console
            }
        }

        async getInfoByFigi(figi) {
            this.getSecuritiesInfo(figi);

            return new Promise(resolve => {
                if (!this.securities[figi]) {
                    const i = setInterval(() => {
                        if (this.securities[figi]) {
                            clearInterval(i);
                            resolve(this.securities[figi]);
                        }
                    }, 100);
                } else {
                    resolve(this.securities[figi]); // {
                    //     ...this.securities[figi],
                    //     // noBoardFigi: this.getNoBoardFigi(this.securities[figi]),
                    //     // noMarketFigi: this.getNoMarketFigi(this.securities[figi]),
                    // });
                }
            });
        }

        getFigi(s) {
            return `${s.seccode};${s.board};${s.market}`;
        }

        getNoMarketFigi(s) {
            // figi для инструментов.
            // quotes, candles
            return `${s.seccode};${s.board}`;
        }

        getNoBoardFigi(s) {
            // figi для клиента.
            // portfolio, positions
            return `${s.seccode};${s.market}`;
        }

        splitFigi(s) {
            const c = s.split(';');

            return {
                seccode: c[0],
                board: c[1],
                market: c[2],
            };
        }

        async connect(login, password, accountId) { // eslint-disable-line sonarjs/cognitive-complexity
            this.isHFT = login.substring(0, 4) === 'FZHF';
            this.host = this.isHFT ? 'hft.finam.ru' : 'tr1.finam.ru';
            this.port = this.isHFT ? 13900 : 3900;

            const dllFile = config.dllFiles[this.isHFT ? 'Hft' : 'NotHft'];

            this.sdk = ffi.Library(
                path.resolve(__dirname, dllFile),
                dllFunctions,
            );

            this.inProgress = true;
            this.token = login;
            this.accountIdSelected = accountId;
            const inited = false;
            const time = new Date().getTime();
            const parsingTime = 0;
            const processingTime = 0;
            const ignored = new Set();
            const used = new Set();

            console.log('connect'); // eslint-disable-line no-console

            const ffiCallback = ffi.Callback(
                ffi.types.bool,
                [ref.refType(ffi.types.CString)],
                async msg => {
                    // let tString = JSON.parse(xml2json.toJson(ref.readCString(msg, 0)));
                    const q = ref.readCString(msg, 0);

                    // console.log(q.substring(0, 120));

                    if (!q ||
                        !/(^<quotations|^<alltrades|^<messages|^<server_status|^<positions|^<overnight|^<orders|^<trades|^<sec_info>|^<securities|^<pits|^<quotes|^<client|^<candles|^<mc_portfolio)/.test(q.substring(0, 20))
                    ) {
                        if (this.isFinalInited && !ignored.has(q.substring(0, 15))) {
                            console.log('ignored after inited: ', q.substring(0, 15)); // eslint-disable-line no-console
                        }

                        ignored.add(q.substring(0, 15));
                    } else {
                        used.add(q.substring(0, 15));

                        xmlParser(q, {
                            explicitArray: false,
                            async: true,
                            mergeAttrs: true,
                        }, async (err, t) => { // eslint-disable-line complexity
                            try {
                                // console.log(JSON.stringify(t));
                                if (t.server_status && t.server_status.connected === 'error') {
                                    this.errorMessage = t.server_status['$t'] || t.server_status['_'];

                                    // {"server_status":{"connected":"error","$t":"Неверный идентификатор, пароль или Touch Memory"}}
                                    // {"server_status":{"sys_ver":"629","build":"18","server_tz":"Russian Standard Time","id":"6","connected":"true"}}
                                }

                                // if (
                                //     !t.markets &&
                                //         !t.candlekinds &&
                                //         !t.securities &&
                                //         !t.pits &&
                                //         !t.sec_info_upd &&
                                //         !t.boards &&
                                //         !t.candles &&
                                //         !t.server_status &&
                                //         !t.client &&
                                //         !t.quotations &&

                                //         // !t.quotations &&
                                //         !t.overnight &&
                                //         !t.mc_portfolio &&
                                //         !t.positions &&
                                //         !t.news_header &&
                                //         !t.quotes
                                // ) {
                                //     // Отслеживаем необработанные сообщения.
                                //     // console.log(tString); // eslint-disable-line no-console
                                //     console.log(t); // eslint-disable-line no-console
                                // }

                                if (t.messages) {
                                    this.messages = [...this.getWithArr(t.messages.message)];
                                }

                                if (t.positions) {
                                    // console.log('positions', JSON.stringify(t.positions, null, 4));
                                    this.savePositions(t.positions);
                                }

                                if (t.orders) {
                                    this.saveOrders(t.orders);
                                }

                                if (t.trades) {
                                    this.saveTrades(t.trades);
                                }

                                if (t.alltrades) {
                                    this.saveAllTrades(t.alltrades);
                                }

                                if (!this.isFinalInited && t.overnight) {
                                    this.isFinalInited = true;
                                    console.log('inited', parseInt((new Date().getTime() - time) / 1000, 10)); // eslint-disable-line no-console

                                    console.log('ignored: ', [...ignored].join(', ')); // eslint-disable-line no-console
                                    console.log('used: ', [...used].join(', ')); // eslint-disable-line no-console

                                    // this.subscribeAll();
                                }

                                if (t.sec_info) {
                                    const s = t.sec_info;
                                    const figi = this.getFigi(s);

                                    this.setSecuritiesInfo(figi, s);
                                }

                                // if (t.candlekinds) {
                                // {
                                //     kind: [
                                //       { id: '1', period: '60', name: '1 minute' },
                                //       { id: '2', period: '300', name: '5 minutes' },
                                //       { id: '3', period: '900', name: '15 minutes' },
                                //       { id: '4', period: '3600', name: '1 hour' },
                                //       { id: '5', period: '86400', name: '1 day' },
                                //       { id: '6', period: '604800', name: '1 week' }
                                //     ]
                                //   }
                                // }

                                if (t.candles) {
                                    this.saveHistoryData(t.candles);
                                }

                                if (t.pits) {
                                    const pits = Array.isArray(t.pits.pit) ? t.pits.pit : [t.pits.pit];

                                    for (const s of pits) {
                                        // minstep Стоимость_шага_цены = point_cost * minstep * 10^decimals
                                        const minPriceIncrement = (s.point_cost * s.minstep *
                                            Math.pow(10, s.decimals)) / 100;

                                        this.setSecuritiesInfo(this.getFigi({
                                            seccode: s.seccode || s['$'].seccode,
                                            board: s.board || s['$'].board,
                                            market: s.market,
                                        }), {
                                            ...s,

                                            // ...s['$'],
                                            lot: s.lotsize,
                                            minPriceIncrement: this.priceToObject(minPriceIncrement),
                                        });
                                    }
                                }

                                if (t.securities) {
                                    this.setSecurities(t.securities);
                                }

                                if (t.quotations) {
                                    this.logQuotations || (this.logQuotations = {});

                                    const quote = Array.isArray(t.quotations.quotation) ?
                                        t.quotations.quotation : [t.quotations.quotation];

                                    for (const s of quote) {
                                        const figi = this.getNoMarketFigi(s);

                                        if (!this.quotationsAndOrderbook[figi]) {
                                            this.quotationsAndOrderbook[figi] = {
                                                bids: {}, // покупка
                                                asks: {}, // продажа
                                                quotations: {},
                                            };
                                        }

                                        Object.assign(this.quotationsAndOrderbook[figi].quotations, s);

                                        if (!this.logQuotations[figi]) {
                                            this.logQuotations[figi] = [];
                                        }

                                        this.logQuotations[figi].push(s);
                                    }
                                }

                                if (t.quotes) {
                                    this.saveQuotes(t.quotes);
                                }

                                // else {
                                //     ++i;
                                //     if (!(i % 1000)) {
                                //         console.log('conn', i)
                                //     }
                                // }

                                if (t.client) {
                                    // client: {
                                    //     id: '7683898',
                                    //     remove: 'false',
                                    //     market: '4',
                                    //     currency: 'RUB',
                                    //     type: 'spot',
                                    //     forts_acc: '7683898'
                                    //   }

                                    this.clients.push(t.client);

                                    // this.client = t.client;
                                    // console.log(t.client);

                                    if (this.accountIdSelected === t.client.id) {
                                        this.client = { ...t.client };
                                    }
                                }

                                if (t.mc_portfolio) {
                                    this.portfolioSet(t.mc_portfolio);
                                }

                                // });

                                // return null;
                                // });
                            } catch (e) {
                                console.log(e); // eslint-disable-line no-console
                            }

                            // }, 0);
                            // console.log(Math.random());
                        });
                    }

                    if (msg !== undefined) {
                        setTimeout(() => {
                            this.sdk.FreeMemory(msg);
                        }, 15);
                    }

                    return null;
                },
            );

            process.on('exit', () => {
                this.disconnect();
                const x = ffiCallback;
            });

            //catches ctrl+c event
            // process.on('SIGINT', this.disconnect.bind(this));

            // // catches "kill pid" (for example: nodemon restart)
            // process.on('SIGUSR1', this.disconnect.bind(this));
            // process.on('SIGUSR2', this.disconnect.bind(this));

            // //catches uncaught exceptions
            process.on('uncaughtException', this.disconnect.bind(this));

            process
                .on('unhandledRejection', (reason, p) => {
                    console.error(reason, 'Unhandled Rejection at Promise', p);
                    this.disconnect();
                })
                .on('uncaughtException', err => {
                    console.error(err, 'Uncaught Exception thrown');
                    this.disconnect();
                    process.exit(1);
                });

            const promise = new Promise(resolve => {
                resolve(
                    this.sdk.Initialize(
                        path.resolve(__dirname, `log/${this.isHFT ? 'hft' : 'default'}`),
                        2,
                    ),
                );
            });

            try {
                console.log('SetCallback'); // eslint-disable-line no-console

                this.sdk.SetCallback(ffiCallback);

                // if (this.isHFT) {
                //     this.sdk.SetCallback(ffiCallback);
                // } else {
                //     this.sdk.SetCallback(ffiCallback);
                // }

                const myXMLConnectString = `${'<command id="connect">' + '<login>'}${login}</login>` +
                    `<password>${password}</password>` +
                    `<host>${this.host}</host>` +
                    `<port>${this.port}</port>` +
                    '<language>en</language>' +
                    '<autopos>true</autopos>' +
                    '<session_timeout>600</session_timeout>' +
                    '<request_timeout>100</request_timeout>' +
                    '<push_u_limits>10</push_u_limits>' +
                    '<push_pos_equity>10</push_pos_equity>' +
                    '<rqdelay>10</rqdelay>' +
                    closeCommandStr;

                this.sdk.SendCommand(myXMLConnectString);

                // this.checkServerStatusInterval();
            } catch (e) {
                console.log(e); // eslint-disable-line no-console
            }

            return null;
        }

        priceToObject(price) {
            if (typeof price === 'object' && typeof price.units !== 'undefined') {
                return price;
            }

            const trunced = Math.trunc(Number(price));

            return {
                units: trunced,
                nano: price * 1e9 - trunced * 1e9,
            };
        }

        // checkServerStatusInterval() {
        //     this.checkInterval = setInterval(() => {
        //         this.checkServerStatus();
        //     }, 5000);
        // }

        savePositions(positions) {
            try {
                Object.keys(positions).forEach(p => {
                    if (!this.positions[p]) {
                        this.positions[p] = {};
                    }

                    // const positionArr = this.getWithArr(this.positions[p]);

                    // for (const p of positionArr) {

                    // }
                });
            } catch (e) {
                console.log('savePositions', e); // eslint-disable-line no-console
            }
        }

        getWithArr(val) {
            return Array.isArray(val) ? val : [val];
        }

        getTradesKey(tradeno, orderno) {
            return `${tradeno || 0}+${orderno || 0}`;
        }

        saveTrades(trades) {
            try {
                const tradesArr = this.getWithArr(trades.trade);

                for (const t of tradesArr) {
                    const key = this.getTradesKey(t.tradeno, t.orderno);

                    if (!this.trades[key]) {
                        this.trades[key] = { ...t };
                    } else {
                        Object.assign(this.trades[key], t);
                    }
                }
            } catch (e) {
                console.log('saveTrades', e); // eslint-disable-line no-console
            }
        }

        saveAllTrades(trades) {
            try {
                this.logAllTrades || (this.logAllTrades = {});

                const tradesArr = this.getWithArr(trades.trade);

                for (const t of tradesArr) {
                    const key = this.getNoMarketFigi(t);

                    if (!this.allTrades[key]) {
                        this.allTrades[key] = { ...t };
                        this.logAllTrades[key] = [];
                    } else {
                        Object.assign(this.allTrades[key], t);
                    }

                    this.logAllTrades[key].push(t);
                }
            } catch (e) {
                console.log('saveTrades', e); // eslint-disable-line no-console
            }
        }

        _delOldOrders(figi, transactionid) {
            const key = this.getTradesKey(transactionid);

            if (this.orders[figi] && this.orders[figi][key]) {
                delete this.orders[figi][key];
            }
        }

        getOrders(figi) {
            const noMarketFigi = this.getNoMarketFigi(this.splitFigi(figi));

            if (this.orders[noMarketFigi]) {
                return Object.keys(this.orders[noMarketFigi]).map(key => {
                    return this.orders[noMarketFigi][key];
                });
            }

            return [];
        }

        saveOrders(orders) {
            try {
                const order = this.getWithArr(orders.order);

                for (const s of order) {
                    const figi = this.getNoMarketFigi(s);

                    if (!this.orders[figi]) {
                        this.orders[figi] = {};
                    }

                    if (Number(s.transactionid) && Number(s.orderno)) {
                        this._delOldOrders(figi, s.transactionid);
                    }

                    const key = this.getTradesKey(s.transactionid, s.orderno);
                    let delExecStatus = false;

                    if (['active', 'forwarding', 'inactive', 'wait', 'watching'].includes(s.status)) {
                        // Подстановка под проверку робота (EXECUTION_REPORT_STATUS_NEW (4))
                        s.executionReportStatus = 4;
                    } else {
                        delExecStatus = true;
                    }

                    s.lotsRequested = s.quantity;
                    s.initialOrderPrice = s.price;
                    s.direction = s.buysell === 'B' ? 1 : 2;
                    s.orderId = s.transactionid;

                    if (!this.orders[figi][key]) {
                        this.orders[figi][key] = {
                            ...s,
                            figi,
                        };
                    } else {
                        Object.assign(this.orders[figi][key], s);

                        if (delExecStatus) {
                            delete this.orders[figi][key].executionReportStatus;
                        }
                    }
                }
            } catch (e) {
                console.log('saveOrders', e); // eslint-disable-line no-console
            }
        }

        cancelOrder(transactionid) {
            const command = `<command id="cancelorder">
                <transactionid>${transactionid}</transactionid>
            </command>`;

            this.sdk.SendCommand(command);
        }

        saveQuotes(quotes) {
            try {
                const quote = Array.isArray(quotes.quote) ? quotes.quote : [quotes.quote];

                this.logAllQuotes || (this.logAllQuotes = {});

                for (const s of quote) {
                    const figi = this.getNoMarketFigi(s);

                    if (!this.quotationsAndOrderbook[figi]) {
                        this.quotationsAndOrderbook[figi] = {
                            bids: {}, // покупка
                            asks: {}, // продажа
                            quotations: {},
                        };
                    }

                    let { price, buy, sell } = s;

                    buy = Number(buy);
                    sell = Number(sell);
                    price = parseFloat(price);

                    if (!buy || buy <= 0) {
                        delete this.quotationsAndOrderbook[figi].bids[price];
                    } else {
                        this.quotationsAndOrderbook[figi].bids[price] = {
                            quantity: buy,
                            price: parseFloat(price),
                        };
                    }

                    if (!sell || sell <= 0) {
                        delete this.quotationsAndOrderbook[figi].asks[price];
                    } else {
                        this.quotationsAndOrderbook[figi].asks[price] = {
                            quantity: sell,
                            price: parseFloat(price),
                        };
                    }

                    if (!this.logAllQuotes[figi]) {
                        this.logAllQuotes[figi] = [];
                    }
                    this.logAllQuotes[figi].push(s);
                }
            } catch (e) {
                console.log('saveQuotes', e); // eslint-disable-line no-console
            }
        }

        getQuotations(figi) {
            const noMarketFigi = this.getNoMarketFigi(this.splitFigi(figi));
            const q = this.quotationsAndOrderbook[noMarketFigi] || undefined;

            if (q) {
                const bids = [];
                const asks = [];

                Object.keys(q.bids).forEach(key => {
                    bids.push(q.bids[key]);
                });

                Object.keys(q.asks).forEach(key => {
                    asks.push(q.asks[key]);
                });

                return {
                    bids,
                    asks,
                    quotations: q.quotations,
                    time: new Date().getTime(),
                };
            }
        }

        getClientId() {
            return this.client?.id || undefined;
        }

        getClientUnion() {
            return this.client?.union || undefined;
        }

        getPrice(quotation) {
            if (!quotation || typeof quotation !== 'object') {
                return quotation;
            }

            if (quotation.nano) {
                return quotation.units + quotation.nano / 1e9;
            }

            return quotation.units;
        }

        /**
         *
         * @param {*} figi
         * @param {*} price - если ноль, то выставляем по рынку.
         * @param {*} quantity
         * @param {*} buysell
         * @param {*} robotName
         * @returns
         */
        async newOrder(figi, price, quantity, buysell, robotName) {
            const { seccode, board } = this.splitFigi(figi);

            let command = `<command id="neworder"><security>
                <board>${board}</board>
                <seccode>${seccode}</seccode>
                </security>
                ${this.getUserCode(false)}`;

            command += price ? `<price>${this.getPrice(price)}</price><nosplit/>` : '<bymarket/>';

            // <hidden>скрытое количество в лотах</hidden>

            command += `<quantity>${quantity}</quantity>
                <buysell>${buysell}</buysell>
                <brokerref>${robotName.substring(0, 3)}</brokerref>
                <unfilled>PutInQueue</unfilled>
            </command>`;

            // <nosplit/>
            // <bymarket/>

            // <brokerref>${robotName.substring(0,3)}</brokerref> Длина этого поля сильно ограничена.

            // <usecredit/>
            // <expdate>дата экспирации (только для ФОРТС)</expdate>
            // (задается в формате 23.07.2012 00:00:00 (не обязательно)

            // console.log(command);

            // <result success="true" transactionid="id"
            const r = this.sdk.SendCommand(command);
            const { result } = JSON.parse(xml2json.toJson(r));

            const transaqtionId = result.transactionid;

            if (!result || result.success === 'false') {
                return result.message;
            }

            const noMarketFigi = this.getNoMarketFigi(this.splitFigi(figi));

            return new Promise(resolve => {
                try {
                    const i = setInterval(() => {
                        try {
                            const key = this.getTradesKey(transaqtionId);

                            if (this.orders[noMarketFigi][key]) {
                                clearInterval(i);
                                resolve(this.orders[noMarketFigi][key]);

                                return true;
                            } else {
                                Object.keys(this.orders[noMarketFigi]).some((s, k) => {
                                    if (this.orders[noMarketFigi][s].transactionid === transaqtionId) {
                                        clearInterval(i);
                                        resolve(this.orders[noMarketFigi][s]);

                                        return true;
                                    }
                                });
                            }
                        } catch (e) {
                            console.log('neworderpromise', e); // eslint-disable-line no-console
                        }
                    }, 50);
                } catch (e) {
                    console.log('neworderpromise', e); // eslint-disable-line no-console
                }
            });
        }

        setSelectedAccountId(id) {
            try {
                for (const c of this.clients) {
                    if (c.id === id) {
                        this.client = { ...c };
                        break;
                    }
                }
            } catch (e) {
                console.log(e); // eslint-disable-line no-console
            }
        }

        checkServerStatus() {
            try {
                const command = 'server_status';
                const result = this.sdk.SendCommand(`<command id="${command}"/>`);
                const r = JSON.parse(xml2json.toJson(result));
                let answer = {};

                if (r.result.success === 'true') {
                    this.connected = true;

                    if (this.errorMessage) {
                        delete this.errorMessage;
                    }

                    if (this.getClientId()) {
                        this.getPortfolioSend();
                    }
                } else {
                    this.connected = false;
                    answer = {
                        ...r.result,
                    };
                }

                return {
                    ...answer,
                    accountId: this.getClientId(),
                    errorMessage: this.errorMessage || '',
                    connected: this.connected,
                    isFinalInited: this.isFinalInited,
                    messages: this.messages || [],
                    token: this.token,
                };
            } catch (e) {
                console.log(e); // eslint-disable-line no-console
            }
        }

        changePassword(oldpass, newpass) {
            const command = `<command id="change_pass"
                oldpass="${oldpass}"
                newpass="${newpass}"
            />`;

            const r = JSON.parse(xml2json.toJson(this.sdk.SendCommand(command)));

            if (r?.result?.success === 'true') {
                this.messages = [];
                delete this.errorMessage;
            }

            return r;
        }

        async getHistoryDataActual(seccode, interval, isToday) {
            const sec = await this.getInfoByFigi(seccode);

            if (!sec || !sec.seccode || !sec.board) {
                return;
            }

            const command = `<command id="gethistorydata">
                <security>
                <board>${sec.board}</board>
                <seccode>${sec.seccode}</seccode>
                </security>
                <period>${interval}</period>
                <count>1440</count>
                <reset>${Boolean(isToday)}</reset>
                </command>`;

            this.sdk.SendCommand(command);
        }

        getCandleUnixTime(candleTime) {
            const splitTime = candleTime.split(' ');
            const date = splitTime[0];
            const time = splitTime[1];

            const splitDate = date.split('.');

            return new Date(`${splitDate[1]}.${splitDate[0]}.${splitDate[2]} ${time}`).getTime();
        }

        saveHistoryData(candles) {
            if (!candles || !candles.candle) {
                return;
            }

            const noMarketFigi = this.getNoMarketFigi(candles);

            this.subscribe(noMarketFigi);

            if (!this.historyCandles[noMarketFigi]) {
                this.historyCandles[noMarketFigi] = {};
            }

            if (!this.historyCandles[noMarketFigi][candles.period]) {
                this.historyCandles[noMarketFigi][candles.period] = {};
            }

            const candleArr = Array.isArray(candles.candle) ? candles.candle : [candles.candle];

            for (const c of candleArr) {
                const time = this.getCandleUnixTime(c.date || c['$'].date);

                this.historyCandles[noMarketFigi][candles.period][time] = {
                    ...c,
                    period: candles.period,
                    time,
                };
            }
        }

        async getHistoryData(figi, period) {
            const noMarketFigi = this.getNoMarketFigi(this.splitFigi(figi));
            let time = 0;

            return new Promise(resolve => {
                const i = setInterval(() => {
                    if (this.historyCandles[noMarketFigi]) {
                        clearInterval(i);

                        return resolve(this.historyCandles[noMarketFigi][period]);
                    }

                    time += 100;

                    // Timeout.
                    if (time >= 60000) {
                        clearInterval(i);

                        return resolve();
                    }
                }, 100);
            });
        }

        getClients() {
            return this.clients;
        }

        async getPortfolioAsync() {
            const p = this.getPortfolio();

            p.updated = false;

            if (p.infoRequrested) {
                return;
            }

            p.infoRequrested = true;

            this.getPortfolioSend();

            return new Promise(resolve => {
                const i = setInterval(() => {
                    try {
                        const portfolio = this.getPortfolio();

                        if (portfolio.updated) {
                            portfolio.infoRequrested = false;
                            i && clearInterval(i);

                            resolve({
                                ...portfolio,
                                security: portfolio.security &&
                                    portfolio.security
                                        .filter(sec => Number(sec.balance))
                                        .map(sec => {
                                            const figi = this.getNoBoardFigi(sec);
                                            const secInfo = this.getFromObjectByField(this.securities, 'noBoardFigi', figi);

                                            return {
                                                ...sec,
                                                figi,
                                                averagePositionPrice: sec.balance_prc,
                                                quantity: { units: sec.balance },
                                                expectedYield: sec.unrealized_pnl,

                                                // Если баланс больше нуля, топозиция long.
                                                direction: sec.balance > 0 ? 1 : 2,
                                                quantityLots: {
                                                    units: secInfo && parseInt(sec.balance / secInfo.lotsize, 10),
                                                },
                                            };
                                        }),
                            });
                        }
                    } catch (e) {
                        console.log(e); // eslint-disable-line no-console
                    }
                }, 100);
            });
        }

        getFromObjectByField(obj, field, value) {
            try {
                return obj[Object.keys(obj).find(s => this.securities[s][field] === value)];
            } catch (e) {
                console.log('getFromObjectByField', e); // eslint-disable-line no-console
            }
        }

        getPortfolioSend() {
            try {
                const user = this.getUserCode();

                if (!user) {
                    return;
                }

                const myXMLConnectString = `<command id="get_mc_portfolio" ${user} 
                    currency="true" asset="true" money="true" depo="true"
                    registers="true" maxbs="true"/></command>`;

                this.sdk.SendCommand(myXMLConnectString);
            } catch (e) {
                console.log(e); // eslint-disable-line no-console
            }
        }

        getUserCode(equality = true) {
            const clientId = this.getClientId();
            const union = this.getClientUnion();

            if (!clientId && !union) {
                return;
            }
            if (equality) {
                return union ? `union="${union}"` : `client="${clientId}"`;
            }

            return union ? `<union>${union}</union>` : `<client>${clientId}</client>`;
        }

        getPortfolio() {
            return this.portfolio || {};
        }

        portfolioSet(p) {
            p.updated = true;
            this.portfolio = p;
        }

        getShares() {
            return {
                shares: {
                    instruments: this.shares,
                },
            };
        }

        getFutures() {
            return {
                futures: {
                    instruments: this.futures,
                },
            };
        }

        addFigi(s) {
            s.ticker = s.seccode;
            s.figi = this.getFigi(s);
            s.name = s.shortname;

            return s;
        }

        setSecurities(securities) {
            const sec = this.getWithArr(securities.security);

            try {
                // console.log(t.securities);
                for (const s of sec) {
                    const newSec = this.addFigi(s);

                    if (s.currency === 'RUR') {
                        if (s.sectype === 'FUT') {
                            this.futures.push(newSec);
                        } else if (s.sectype === 'SHARE') {
                            this.shares.push(newSec);
                        }
                    }

                    this.setSecuritiesInfo(newSec.figi, newSec);
                }
            } catch (e) {
                console.log(e); // eslint-disable-line no-console
            }
        }

        setSecuritiesInfo(figi, data) {
            if (!this.securities[figi]) {
                this.securities[figi] = data;

                this.securities[figi].noBoardFigi = this.getNoBoardFigi(this.securities[figi]);
                this.securities[figi].noMarketFigi = this.getNoMarketFigi(this.securities[figi]);

                return;
            }

            Object.assign(this.securities[figi], data);

            return this.securities[figi];
        }

        getSecuritiesInfo(figi) {
            try {
                if (!this.securities[figi] || this.securities[figi].infoRequrested) {
                    return;
                }

                this.securities[figi].infoRequrested = true;

                const { seccode, market } = this.splitFigi(figi);

                const command = `<command id = "get_securities_info">
                    <security>
                    <market>${market}</market>
                    <seccode>${seccode}</seccode>
                    </security>
                    </command>`;

                this.sdk.SendCommand(command);
            } catch (e) {
                console.log('getSecuritiesInfo error', e); // eslint-disable-line no-console
            }
        }

        subscribeAll(subscribe = 1) {
            let command = `<command id="${subscribe ? 'subscribe' : 'unsubscribe'}">`;
            let alltrades = '<alltrades>';
            let quotations = '<quotations>';
            let quotes = '<quotes>';

            [...Object.keys(this.shares), ...Object.keys(this.futures)].forEach(f => {
                const figi = this.shares[f].figi || this.futures[f].figi;

                const { seccode, board } = this.splitFigi(figi);

                if (this.subscribes[seccode + ' ' + board]) {
                    return;
                }

                alltrades += `<security><board>${board}</board><seccode>${seccode}</seccode></security>`;

                quotations += `<security><board>${board}</board><seccode>${seccode}</seccode></security>`;

                quotes += `<security><board>${board}</board><seccode>${seccode}</seccode></security>`;

                this.subscribes[seccode + ' ' + board] = true;
            });

            alltrades += '</alltrades>';
            quotations += '</quotations>';
            quotes += '</quotes>';

            command += alltrades + quotations + quotes + closeCommandStr;

            this.sdk.SendCommand(command);
        }

        subscribe(figi, subscribe = 1) {
            if (this.subscribes[figi]) {
                return;
            }

            this.subscribes[figi] = true;
            const { seccode, board } = this.splitFigi(figi);

            let command = `<command id="${subscribe ? 'subscribe' : 'unsubscribe'}">`;

            command += `<alltrades>
                <security><board>${board}</board>
                <seccode>${seccode}</seccode>
                </security>
                </alltrades>`;

            command += `<quotations><security>
                <board>${board}</board>
                <seccode>${seccode}</seccode>
                </security></quotations>`;

            command += `<quotes>
                <security>
                <board>${board}</board>
                <seccode>${seccode}</seccode>
                </security>
                </quotes>`;

            command += closeCommandStr;

            this.subscribes[figi] = true;
            this.sdk.SendCommand(command);
        }

        disconnect() {
            try {
                this.inProgress = false;
                this.checkInterval && clearInterval(this.checkInterval);

                this.sdk.SendCommand(
                    '<command id="disconnect"/>',
                );

                console.log('disconnect'); // eslint-disable-line no-console
                // console.trace();

                // this.sdk.UnInitialize();
            } catch (e) {
                console.log(e); // eslint-disable-line no-console
            }
        }
    }

    module.exports.TConnector = TConnector;
} catch (e) {
    console.log(e); // eslint-disable-line no-console
}

/**
 * struct
 *
 * {
  positions: {
    sec_position: [
      [Object], [Object],
      [Object], [Object],
      [Object], [Object],
      [Object], [Object],
      [Object], [Object],
      [Object]
    ],
    money_position: {
      currency: 'RUR',
      client: '30W6B/30W6B',
      union: '406977R8RWR',
      markets: [Object],
      asset: 'FOND_MICEX',
      shortname: 'Деньги КЦБ ММВБ (RUR)',
      saldoin: '-2.03',
      bought: '0.0',
      sold: '0.0',
      saldo: '-2.16',
      ordbuy: '0.0',
      ordbuycond: '0.0',
      comission: '0.13'
    }
  }
}

{
  orders: {
    order: {
      transactionid: '35258605',
      orderno: '1892947646771896972',
      secid: '20318',
      union: '406977R8RWR',
      board: 'FUT',
      seccode: 'SiU2',
      client: '76832ri',
      status: 'matched',
      buysell: 'B',
      time: '30.08.2022 15:02:53',
      brokerref: {},
      value: '0',
      accruedint: '0.0',
      settlecode: {},
      balance: '0',
      price: '66123',
      quantity: '1',
      hidden: '0',
      yield: '0.0',
      withdrawtime: '0',
      condition: 'None',
      maxcomission: '0.0',
      within_pos: 'false',
      result: {}
    }
  }
}

{
  trades: {
    trade: {
      secid: '20318',
      tradeno: '1892947646767954601',
      orderno: '1892947646771909661',
      board: 'FUT',
      seccode: 'SiU2',
      client: '76832ri',
      buysell: 'S',
      union: '406977R8RWR',
      time: '30.08.2022 15:03:42',
      brokerref: {},
      value: '0',
      comission: '0.0',
      price: '61016',
      quantity: '1',
      items: '1',
      yield: '0.0',
      currentpos: '0',
      accruedint: '0.0',
      tradetype: 'T',
      settlecode: {}
    }
  }
}

 */
