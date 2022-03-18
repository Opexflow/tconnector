try {
    // #region переменные
    // const mysqlModule = require('../common_sevice_functions/mysqlClass.js');
    const birgaNameVariableFinam = 'Finam';
    let isSnapshot = true;
    const functions = require('../common_sevice_functions/functions.js'); // различные функции
    // #endregion

    // #region класс FinamClass, сохранение\полученных данных в Closure и получение из Closure
    class FinamClass {
        constructor() {
            this.finamGlass = {};
        }

        // полученние стакана
        getGlass(pairName) {
            return this.finamGlass[pairName];
        }

        // #region сохранение snapshot-а стакана
        setSnapshot(pairName, snapshot) {
            // перебор обновления
            let amountUpdateBid = 0;
            let amountUpdateAsk = 0;
            const bids = [];
            const asks = [];

            Object.keys(snapshot.quotes.quote).forEach(numberInSnapshot => {
                const priceUpdate = Number(snapshot.quotes.quote[numberInSnapshot]['price']);

                // в snapshot попадают количества -1, по документации такие поля должны быть удалены
                if (snapshot.quotes.quote[numberInSnapshot]['buy'] !== undefined) {
                    amountUpdateBid = Number(snapshot.quotes.quote[numberInSnapshot]['buy']);
                    if (amountUpdateBid > 0) {
                        bids[priceUpdate] = amountUpdateBid;
                    }
                } else
                if (snapshot.quotes.quote[numberInSnapshot]['sell'] !== undefined) {
                    amountUpdateAsk = Number(snapshot.quotes.quote[numberInSnapshot]['sell']);
                    if (amountUpdateAsk > 0) {
                        asks[priceUpdate] = amountUpdateAsk;
                    }
                }
            });

            // сохранение snapshot-а стакана, массив bids сохранняется в обратном порядке, не переделываю его, кодом ниже беру нужные значения и возвращаю не сохраненный snapshot, а с нужными значениями
            // quotes.quote. - приходит от биржи, делаю аналог для сохранения snapshot
            this.finamGlass[pairName] = {
                quotes: {
                    quote: {
                        bids,
                        asks,
                    },
                },
            };

            // #region первые значения в стакане
            // ключи bids\asks
            const keysBids = Object.keys(bids);
            const keysAsks = Object.keys(asks);

            return {
                '0': {
                    bids: {
                        '0': {
                            '0': Number(keysBids[keysBids.length - 1]),
                            '1': bids[Number(keysBids[keysBids.length - 1])],
                        },
                    },
                    asks: {
                        '0': {
                            '0': Number(keysAsks['0']),
                            '1': asks[Number(keysAsks['0'])],
                        },
                    },
                },
                '1': this.finamGlass[pairName],
            };

            // #endregion
        }

        // #endregion

        // #region обновление стакана
        functionUpdateGlass(pairName, updateGlass) {
            let savedGlass = this.getGlass(pairName);

            // стакан обновляет общая функция обработки стакана
            savedGlass = this.functionCommonWorkOnGlass(savedGlass, updateGlass);

            // обновить сохраненное
            this.finamGlass[pairName] = savedGlass;

            // #region первые значения в стакане
            // ключи bids\asks
            const keysBids = Object.keys(savedGlass.quotes.quote.bids);
            const keysAsks = Object.keys(savedGlass.quotes.quote.asks);

            return {
                '0': {
                    bids: {
                        '0': {
                            '0': Number(keysBids[keysBids.length - 1]),
                            '1': savedGlass.quotes.quote.bids[Number(keysBids[keysBids.length - 1])],
                        },
                    },
                    asks: {
                        '0': {
                            '0': Number(keysAsks['0']),
                            '1': savedGlass.quotes.quote.asks[Number(keysAsks['0'])],
                        },
                    },
                },
                '1': this.finamGlass[pairName],
            };

            // #endregion
        }

        // #endregion

        // #region общая функция обработки стакана
        functionCommonWorkOnGlass(savedGlass, updateGlass) {
            if (updateGlass.quotes.quote.length > 0) {
                // перебор обновления
                Object.keys(updateGlass.quotes.quote).forEach(numberInUpdate => {
                    let amountUpdateBid = 0;
                    let amountUpdateAsk = 0;
                    const priceUpdate = Number(updateGlass.quotes.quote[numberInUpdate]['price']);

                    if (updateGlass.quotes.quote[numberInUpdate]['buy'] !== undefined) {
                        amountUpdateBid = Number(updateGlass.quotes.quote[numberInUpdate]['buy']);
                        if (amountUpdateBid < 0) {
                            // удаление из стакана
                            // (savedGlass.quotes.quote['bids']).splice(priceUpdate, 1);
                            delete savedGlass.quotes.quote['bids'][priceUpdate];
                        } else {
                            // изменение количества, если такое поле в массиве есть, или установка нового поля
                            savedGlass.quotes.quote['bids'][priceUpdate] = amountUpdateBid;
                        }
                    }
                    if (updateGlass.quotes.quote[numberInUpdate]['sell'] !== undefined) {
                        amountUpdateAsk = Number(updateGlass.quotes.quote[numberInUpdate]['sell']);
                        if (amountUpdateAsk < 0) {
                            // удаление из стакана
                            delete savedGlass.quotes.quote['asks'][priceUpdate];
                        } else {
                            // изменение количества, если такое поле в массиве есть, или установка нового поля
                            savedGlass.quotes.quote['asks'][priceUpdate] = amountUpdateAsk;
                        }
                    }
                });
            }

            return savedGlass;
        }

        // #endregion

        // полученние открытых ордеров
        getOpenOrders(HftOrNot) {
            return this.orders[HftOrNot];
        }

        // сохранение открытых ордеров
        saveOpenOrders(objectOrders) {
            this.orders = objectOrders;
        }

        // обновление открытых ордеров
        updateOpenOrders(
            objectOrders,
            HftOrNot,
        ) {
            this.orders[HftOrNot] = objectOrders;
        }

        // полученние максимальных цен
        getMaxPrices(HftOrNot) {
            return this.maxPrices[HftOrNot];
        }

        // сохранение максимальных цен
        saveMaxPrices(maxPrices) {
            this.maxPrices = maxPrices;
        }

        // обновление максимальных цен
        updateMaxPrices(
            maxPrices,
            HftOrNot,
        ) {
            this.maxPrices[HftOrNot] = maxPrices;
        }
    }

    const finamClass = new FinamClass();

    // #endregion

    // #region обработка поступающего стакана
    /**
     * @this {workOnGlass}
     * @param glass object
     *
     * @return null
     * */
    function workOnGlass(glass) {
        // #region стакан
        if (Object.keys(glass)['0'] === 'quotes') {
            // возможно, что если один массив, то ['0'] не делается биржей
            // if (glass.quotes.quote === undefined) {
            //     let a = 1;
            // }
            // else
            if (glass.quotes.quote['0'] === undefined) {
                glass.quotes.quote['0'] = glass.quotes.quote;
            }

            /** @var glass.quotes.quote.seccode string */
            const commonPairName = glass.quotes.quote['0'].seccode;

            // первым приходит snapshot, его сохраняю целиком
            if (isSnapshot === true) {
                isSnapshot = false;

                // сохранить snapshot стакана
                const glassSnapshot = finamClass.setSnapshot(commonPairName, glass);

                // #region запись котировок в базу
                // mysqlModule.functionSaveGlassInDb(commonPairName, birgaNameVariableFinam, glassSnapshot);
                // #endregion
            } else {
                // обновление стакана
                const glassAfterUpdate = finamClass.functionUpdateGlass(commonPairName, glass);

                // #region запись котировок в базу
                // mysqlModule.functionSaveGlassInDb(commonPairName, birgaNameVariableFinam, glassAfterUpdate);
                // #endregion
            }
        }

        // #endregion

        return null;
    }

    // #endregion

    // #region заполнение массивов открытых заявок
    /**
     * @this {fillOpenOrdersObject}
     * @param openOrdersObject object
     * @param type string
     * @param tempArray array
     *
     * @return null
     * */
    function fillOpenOrdersObject(
        openOrdersObject,
        type,
        tempArray,
    ) {
        // массив заявок уже есть
        // Это на случай, если tempArray - один объект из одной транзакции
        if (
            typeof (tempArray) === 'object' &&
            Array.isArray(tempArray) === false
        ) {
            const saveTemp = tempArray;

            tempArray = [];
            tempArray['0'] = saveTemp;
        }

        // true - массив - пустой, false - не пустой
        if (Object.keys(openOrdersObject[type]).length !== 0 && openOrdersObject[type].constructor === Object) {
            // есть ли поле новой транзакции в массиве
            for (const numberTemp in tempArray) {
                let isFieldExists = false;

                /** @var tempArray.transactionid string */
                const transactionIdTemp = tempArray[numberTemp].transactionid;

                Object.keys(openOrdersObject[type]).forEach(number => {
                    const transactionId = openOrdersObject[type][number].transactionid;

                    // если транзакция есть в массиве, то не добавлять ее, а изменить статус
                    if (transactionIdTemp === transactionId) {
                        // есть ли поле транзакции в массиве
                        isFieldExists = true;
                        const statusOld = openOrdersObject[type][number].status;

                        openOrdersObject[type][number].status = tempArray[numberTemp].status;
                        console.log(`status ${ statusOld } ${ transactionId } изменен на ${ tempArray[numberTemp].status}`);
                    }
                });

                // добавление заявки в массив заявок
                if (isFieldExists === false) {
                    openOrdersObject[type].push(tempArray[numberTemp]);
                }
            }
        } else {
            // первое создание массива заявок
            openOrdersObject[type] = tempArray;
        }

        return openOrdersObject;
    }

    // #endregion

    // #region module.exports
    module.exports.workOnGlass = workOnGlass;
    module.exports.getOpenOrders = finamClass.getOpenOrders;
    module.exports.saveOpenOrders = finamClass.saveOpenOrders;
    module.exports.updateOpenOrders = finamClass.updateOpenOrders;
    module.exports.getMaxPrices = finamClass.getMaxPrices;
    module.exports.saveMaxPrices = finamClass.saveMaxPrices;
    module.exports.updateMaxPrices = finamClass.updateMaxPrices;
    module.exports.fillOpenOrdersObject = fillOpenOrdersObject;

    // #endregion
} catch (e) {
    const err = `${e.name }:${ e.message }\n${ e.stack}`;

    messageForLog = `ошибка FinamClass.js ${ err}`;
    console.log(messageForLog);
}
