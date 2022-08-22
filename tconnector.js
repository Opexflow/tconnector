const xml2json = require('xml2json');

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
            } catch (e) {
                console.log(e); // eslint-disable-line no-console
            }
        }

        async connect(login, password, accountId) { // eslint-disable-line sonarjs/cognitive-complexity
            this.inProgress = true;
            this.token = login;
            this.accountIdSelected = accountId;

            const ffiCallback = ffi.Callback(
                ffi.types.bool,
                [ref.refType(ffi.types.CString)],
                msg => {
                    try {
                        // callback(ref.readCString(msg, 0), this.isHFT);
                        const tString = ref.readCString(msg, 0);
                        const t = JSON.parse(xml2json.toJson(tString));

                        if (t.server_status && t.server_status.connected === 'error') {
                            this.errorMessage = t.server_status['$t'];

                            // {"server_status":{"connected":"error","$t":"Неверный идентификатор, пароль или Touch Memory"}}
                            // {"server_status":{"sys_ver":"629","build":"18","server_tz":"Russian Standard Time","id":"6","connected":"true"}}
                        }

                        if (!t.markets &&
                            !t.candlekinds &&

                            // !t.securities &&
                            !t.pits &&
                            !t.sec_info_upd &&
                            !t.boards
                        ) {
                            // console.log(t); // eslint-disable-line no-console
                            // console.log(t.securities.security[0])
                            // console.log(t.securities.security[0].sectype, t.securities.security[0].board, t.securities.security[0].currency)
                        }

                        if (t.securities) { //} && t.securities.security[0].currency === 'RUR') {
                            for (const s of t.securities.security) {
                                if (s.sectype === 'FUT' && s.currency === 'RUR') {
                                    this.futures.push({
                                        ...s,
                                        ticker: s.seccode,
                                        figi: s.seccode,
                                        name: s.shortname,
                                    });
                                } else if (s.sectype === 'SHARE' && s.currency === 'RUR') {
                                    this.shares.push({
                                        ...s,
                                        ticker: s.seccode,
                                        figi: s.seccode,
                                        name: s.shortname,
                                    });
                                }

                                // this.shares = this.shares.concat(t.securities.security);
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

                        if (msg !== undefined) {
                            this.sdk.FreeMemory(msg);
                        }

                        return null;
                    } catch (e) {
                        console.log(e); // eslint-disable-line no-console
                    }
                },
            );

            process.on('exit', function() {
                this.disconnect();
                const x = ffiCallback;
            });

            const promise = new Promise((resolve, reject) => {
                resolve(
                    this.sdk.Initialize(
                        path.resolve(__dirname, `log/${this.isHFT ? 'hft' : 'default'}`),
                        1,
                    ),
                );
            });

            try {
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
                    '<request_timeout>20</request_timeout>' +
                    closeCommandStr;

                this.sdk.SendCommand(myXMLConnectString);

                // this.checkServerStatusInterval();
            } catch (e) {
                console.log(e); // eslint-disable-line no-console
            }

            return null;
        }

        // checkServerStatusInterval() {
        //     this.checkInterval = setInterval(() => {
        //         this.checkServerStatus();
        //     }, 5000);
        // }

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
                };
            } catch (e) {
                console.log(e); // eslint-disable-line no-console
            }
        }

        getClients() {
            return this.clients;
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

        disconnect() {
            try {
                this.inProgress = false;
                this.checkInterval && clearInterval(this.checkInterval);

                this.sdk.SendCommand(
                    '<command id="disconnect"/>',
                );

                this.sdk.UnInitialize();
            } catch (e) {
                console.log(e); // eslint-disable-line no-console
            }
        }
    }

    module.exports.TConnector = TConnector;
} catch (e) {
    console.log(e); // eslint-disable-line no-console
}
