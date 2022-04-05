/**
 * проверка только объекта на пустоту - true - message - пустое, false - не пустое

 * @return boolean
 * */

/**
 * строку в boolean
 *
 * */

// #region строка контракта
/**
 * @param year integer
 * @param month integer
 * @param day integer
 *
 * @return string
 */
function functionContractString(year, month, day) {
    const contrakt = 'Si';

    const lastNumberInYear = Number(year.substring(3));

    month = Number(month);
    day = Number(day);
    const { contractsLetter, lastNumberInYearNew } = getContractedLetter(
        month,
        day,
        lastNumberInYear,
    );

    return contrakt + contractsLetter + lastNumberInYearNew;
}

function getSubContractedLetter(month, day) {
    let contractsLetter = '';

    if (month < 3 || (month === 3 && day < 15)) {
        contractsLetter = 'H';
    } else if (
        (month === 3 && day >= 15) ||
    month === 4 ||
    month === 5 ||
    (month === 6 && day < 15)
    ) {
        contractsLetter = 'M';
    } else if (
        (month === 6 && day >= 15) ||
    month === 7 ||
    month === 8 ||
    (month === 9 && day < 15)
    ) {
        contractsLetter = 'U';
    } else if (
        (month === 9 && day >= 15) ||
    month === 10 ||
    month === 11 ||
    (month === 12 && day < 15)
    ) {
        contractsLetter = 'Z';
    }

    return contractsLetter;
}

function getContractedLetter(month, day, lastNumber) {
    let contractsLetter = '';
    let lastNumberInYear = lastNumber;

    if (month === 12 && day >= 15) {
        contractsLetter = 'H';
        lastNumberInYear++;
        lastNumberInYear = lastNumberInYear === 10 ? 0 : lastNumber;
    }
    let contractsLetterNew = getSubContractedLetter(month, day);

    contractsLetterNew = contractsLetterNew ?
        contractsLetterNew :
        contractsLetter;

    return { contractsLetterNew, lastNumberInYearNew: lastNumberInYear };
}

// #endregion

// #region module.exports
module.exports.functionContractString = functionContractString;

// #endregion
