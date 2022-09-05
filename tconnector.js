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

/*
         server_status
             http://127.0.0.1:12345/?command=server_status&this.isHFT=NotHft
             http://127.0.0.1:12345/?command=server_status&this.isHFT=Hft
         get_securities
             http://127.0.0.1:12345/?command=get_securities&this.isHFT=NotHft
             http://127.0.0.1:12345/?command=get_securities&this.isHFT=Hft
         get_portfolio
             http://127.0.0.1:12345/?command=get_portfolio&this.isHFT=NotHft
             http://127.0.0.1:12345/?command=get_portfolio&this.isHFT=Hft
         get_forts_positions
             http://127.0.0.1:12345/?command=get_forts_positions&this.isHFT=NotHft
             http://127.0.0.1:12345/?command=get_forts_positions&this.isHFT=Hft
         gethistorydata
            5-минутная история
             http://127.0.0.1:12345/?command=gethistorydata&period=2&count=162&reset=true&this.isHFT=NotHft
             часовая
             http://127.0.0.1:12345/?command=gethistorydata&period=4&count=14&reset=true&this.isHFT=NotHft
         neworder
            http://127.0.0.1:12345?command=neworder&buysell=buy&orderprice=40000&quantity=1&this.isHFT=NotHft&ismarket=true
            http://127.0.0.1:12345?command=neworder&buysell=sell&orderprice=90000&quantity=1&this.isHFT=NotHft&ismarket=true
            http://127.0.0.1:12345?command=neworder&buysell=buy&orderprice=40000&quantity=1&this.isHFT=Hft&ismarket=true
            http://127.0.0.1:12345?command=neworder&buysell=sell&orderprice=90000&quantity=1&this.isHFT=Hft&ismarket=true
         newstoporder
            http://127.0.0.1:12345?command=newstoporder&buysell=buy&orderprice=40000&quantity=1&stoplosspercent=3.3&takeprofitpercent=5.8&this.isHFT=NotHft
            http://127.0.0.1:12345?command=newstoporder&buysell=sell&orderprice=90000&quantity=1&stoplosspercent=3.3&takeprofitpercent=5.8&this.isHFT=NotHft
            http://127.0.0.1:12345?command=newstoporder&buysell=buy&orderprice=40000&quantity=1&stoplosspercent=3.3&takeprofitpercent=5.8&this.isHFT=Hft
            http://127.0.0.1:12345?command=newstoporder&buysell=sell&orderprice=90000&quantity=1&stoplosspercent=3.3&takeprofitpercent=5.8&this.isHFT=Hft
        newcondorder
            http://127.0.0.1:12345?command=newcondorder&buysell=sell&orderprice=90000&quantity=1&cond_type=LastUp&cond_value=90000&condorder=true&this.isHFT=NotHft
            http://127.0.0.1:12345?command=newcondorder&buysell=sell&orderprice=90000&quantity=1&cond_type=LastUp&cond_value=90000&condorder=true&this.isHFT=Hft
        cancelorder
            http://127.0.0.1:12345/?command=cancelorder&orderId=10703545&this.isHFT=NotHft
            http://127.0.0.1:12345/?command=cancelorder&orderId=10703545&this.isHFT=Hft
        cancelstoporder
            http://127.0.0.1:12345/?command=cancelstoporder&orderId=27499316&this.isHFT=NotHft
            http://127.0.0.1:12345/?command=cancelstoporder&orderId=27499316&this.isHFT=Hft
        * */

// #region функции в dll
const dllFunctions = {
    Initialize: [ffi.types.CString, [ffi.types.CString, ffi.types.int32]],
    UnInitialize: [ffi.types.CString, []],
    FreeMemory: [ffi.types.bool, [ffi.types.CString]],
    SendCommand: [ffi.types.CString, [ffi.types.CString]],
    SetCallback: [ffi.types.bool, ['pointer']],
    SetCallbackEx: [ffi.types.bool, ['pointer', ffi.types.CString]],
};

// let i = 0;

try {
    class TConnector {
        constructor(hft = false, host = 'tr1.finam.ru', port = 3900) {
            try {
                this.isHFT = Boolean(hft);
                this.host = host;
                this.port = port;

                const dllFile = config.dllFiles[this.isHFT ? 'Hft' : 'NotHft'];

                this.sdk = ffi.Library(
                    path.resolve(__dirname, dllFile),
                    dllFunctions,
                );

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

                this.orders = [];
                this.trades = [];
                this.positions = [];
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
                    resolve({
                        ...this.securities[figi],
                        noBoardFigi: this.getNoBoardFigi(this.securities[figi]),
                        noMarketFigi: this.getNoMarketFigi(this.securities[figi]),
                    });
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
                async msg => { // eslint-disable-line complexity
                    // if (!this.isFinalInited && msg.toString() === '<overnig') {
                    //     console.log('inited');
                    //     console.log(parseInt(new Date().getTime() - time / 1000, 10));
                    // }

                    // let tString = JSON.parse(xml2json.toJson(ref.readCString(msg, 0)));
                    const q = ref.readCString(msg, 0);

                    if (!/(^<quotations|^<messages|^<server_status|^<positions|^<overnight|^<sec_info>|^<securities|^<pits|^<quotes|^<client|^<candles|^<mc_portfolio)/.test(q)) {
                        ignored.add(q.substring(0, 15));
                    } else {
                        used.add(q.substring(0, 15));

                        xmlParser(q, {
                            explicitArray: false,
                            async: true,
                            mergeAttrs: true,
                        }, async (err, t) => { // eslint-disable-line complexity
                            try {
                            /*
                            setTimeout(() => {
                                try {

                                    if (!inited) {
                                        // if (msg.toString() === '<sec_inf') {
                                        //     tString = ref.readCString(msg, 0);

                                            if (tString.indexOf('<sec_info_upd') !== -1) {
                                                // msg && this.sdk.FreeMemory(msg)
                                                return null;
                                            }
                                        // }
                                    }

                                    // console.log(msg.toString());

                                if (!inited) {
                                    // const m = msg.toString();
                                    // if (m === '<sec_inf') {
                                    //     this.sdk.FreeMemory(msg);
                                    //     return;
                                    // }
                                    if (tString.indexOf('<overnig') !== -1) {
                                        inited = true;
                                        console.log('inited!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
                                        console.log(new Date().getTime() - time, ((new Date().getTime() - time) / 1000 / 60).toFixed(2));
                                    }
                                    // else {
                                    //     console.log(m);

                                    //     setTimeout(() => {
                                    //         this.sdk.FreeMemory(msg)
                                    //     }, 50);

                                    //     return;
                                    // }
                                }

                                // if (!inited) {
                                //     // console.log(msgToString);
                                //     this.sdk.FreeMemory(msg);
                                //     return;
                                // }

                                // callback(ref.readCString(msg, 0), this.isHFT);

                                let ps = new Date().getTime();
                                // const tString = '' + ref.readCString(msg, 0);
                                // tString || (tString = ref.readCString(msg, 0));

                                xmlParser(tString, (err, result) => {
                                    if (err) {
                                        console.log(err, tString);
                                    }

                                    const t = result; // JSON.parse(xml2json.toJson(tString));
                                    parsingTime += new Date().getTime() - ps;

                                    ps = new Date().getTime();

                            */
                                if (t.server_status && t.server_status.connected === 'error') {
                                    this.errorMessage = t.server_status['$t'];

                                    // {"server_status":{"connected":"error","$t":"Неверный идентификатор, пароль или Touch Memory"}}
                                    // {"server_status":{"sys_ver":"629","build":"18","server_tz":"Russian Standard Time","id":"6","connected":"true"}}
                                }

                                if (
                                    !t.markets &&
                                        !t.candlekinds &&
                                        !t.securities &&
                                        !t.pits &&
                                        !t.sec_info_upd &&
                                        !t.boards &&
                                        !t.candles &&
                                        !t.server_status &&
                                        !t.client &&
                                        !t.quotations &&

                                        // !t.quotations &&
                                        !t.overnight &&
                                        !t.mc_portfolio &&
                                        !t.positions &&
                                        !t.news_header &&
                                        !t.quotes
                                ) {
                                    // Отслеживаем необработанные сообщения.
                                    // console.log(tString); // eslint-disable-line no-console
                                    console.log(t); // eslint-disable-line no-console
                                }

                                if (t.positions) {
                                    // console.log(JSON.stringify(t.positions.sec_position, null, 4));
                                }

                                if (!this.isFinalInited && t.overnight) {
                                    this.isFinalInited = true;
                                    console.log('inited', parseInt((new Date().getTime() - time) / 1000, 10)); // eslint-disable-line no-console

                                    console.log('ignored: ', [...ignored].join(', ')); // eslint-disable-line no-console
                                    console.log('used: ', [...used].join(', ')); // eslint-disable-line no-console
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
                                    }
                                }

                                if (t.quotes) {
                                    const quote = Array.isArray(t.quotes.quote) ? t.quotes.quote : [t.quotes.quote];

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
                                    }
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
                this.disconnect(0);
                const x = ffiCallback;
            });

            // //catches ctrl+c event
            // process.on('SIGINT', this.disconnect.bind(this));

            // // catches "kill pid" (for example: nodemon restart)
            // process.on('SIGUSR1', this.disconnect.bind(this));
            // process.on('SIGUSR2', this.disconnect.bind(this));

            // //catches uncaught exceptions
            // process.on('uncaughtException', this.disconnect.bind(this));

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
                    '<autopos>false</autopos>' +
                    '<session_timeout>200</session_timeout>' +
                    '<request_timeout>5</request_timeout>' +
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

        saveOrders(orders) {

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
                    errorMessage: this.errorMessage,
                    connected: this.connected,
                    isFinalInited: this.isFinalInited,
                };
            } catch (e) {
                console.log(e); // eslint-disable-line no-console
            }
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
                <count>2000</count>
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
                // console.log(c);
                const time = this.getCandleUnixTime(c.date || c['$'].date);

                this.historyCandles[noMarketFigi][candles.period][time] = {
                    ...c,
                    period: candles.period,
                    time,
                };
            }
        }

        getHistoryData(figi, period) {
            const noMarketFigi = this.getNoMarketFigi(this.splitFigi(figi));

            if (this.historyCandles[noMarketFigi]) {
                return this.historyCandles[noMarketFigi][period];
            }
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
                                            return {
                                                ...sec,
                                                figi: this.getNoBoardFigi(sec),
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

        getPortfolioSend() {
            try {
                const clientId = this.getClientId();
                const union = this.getClientUnion();

                if (!clientId && !union) {
                    return;
                }

                const user = union ? `union="${union}"` : `client="${clientId}"`;
                const myXMLConnectString = `<command id="get_mc_portfolio" ${user} 
                    currency="true" asset="true" money="true" depo="true"
                    registers="true" maxbs="true"/></command>`;

                this.sdk.SendCommand(myXMLConnectString);
            } catch (e) {
                console.log(e); // eslint-disable-line no-console
            }
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
            let sec;

            if (!Array.isArray(securities.security)) {
                sec = [securities.security];
            } else {
                sec = securities.security;
            }

            try {
                // console.log(t.securities);
                for (const s of securities.security) {
                    // console.log(s);
                    // console.log(typeof s.currency, JSON.stringify(s.currency), Object.keys(s.currency));
                    // if (!s.currency) {
                    //     console.log(s);
                    //     qwe
                    // }
                    // if (s.currency === 'RUR') {

                    // s = {
                    //     ...s,
                    //     ...s['$'],
                    //     opmask: s.opmask && {
                    //         ...s.opmask['$']
                    //     }
                    // };
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

        subscribe(figi, subscribe = 1) {
            if (this.subscribes[figi]) {
                return;
            }

            this.subscribes[figi] = true;
            const { seccode, board } = this.splitFigi(figi);

            let command = `<command id="${subscribe ? 'subscribe' : 'unsubscribe'}">`;

            /* <alltrades> - подписка на сделки рынка
            <security>
            <board> идентификатор режима торгов</board>
            <seccode>код инструмента</seccode>
            </security>
            …
            </alltrades>
            <quotations> - подписка на изменения показателей торгов
            <security>
            <board> идентификатор режима торгов</board>
            <seccode>код инструмента</seccode>
            </security>
            …
            </quotations> */

            command += `<quotations><security>
            <board>${board}</board>
            <seccode>${seccode}</seccode>
            </security></quotations>`;

            command += `<quotes>
                <security>
                <board>${board}</board>
                <seccode>${seccode}</seccode>
                </security>
                </quotes>
                </command>`;

            this.subscribes[figi] = true;
            this.sdk.SendCommand(command);
        }

        disconnect(exit = 1) {
            try {
                this.inProgress = false;
                this.checkInterval && clearInterval(this.checkInterval);

                this.sdk.SendCommand(
                    '<command id="disconnect"/>',
                );

                console.log('disconnect'); // eslint-disable-line no-console
                this.sdk.UnInitialize();
                if (exit) {
                    process.exit();
                }
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
