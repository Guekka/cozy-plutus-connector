module.exports = {
    getSwileData: async function (token) {
        return await Promise.all([gietStatements(token), getRewards(token), getOrders(token), getWithdrawals, getTransactions(token), getBalance(token), getAccount(token)]).then(function (values) {
            return {
                "statements": values[0],
                "rewards": values[1],
                "orders": values[2],
                "withdrawals": values[3],
                "transactions": values[4],
                "balance": values[5],
                "account": values[6]
            };
        });
    }
}

function getRequestOptions(token, method, body) {
    const myHeaders = new Headers();
    myHeaders.append("Authorization", "Bearer " + token);
    myHeaders.append("Content-Type", "application/json");

    const requestOptions = {
        method: method,
        headers: myHeaders,
        redirect: 'follow',
        body: body
    };

    return requestOptions;
}

async function getBalance(token) {
    const raw = "{\"operationName\":\"getBalance\",\"variables\":{\"currency\":\"EUR\"},\"query\":\"query getBalance($currency: enum_fiat_balance_currency!) {\\n  fiat_balance(where: {currency: {_eq: $currency}}) {\\n    id\\n    user_id\\n    currency\\n    amount\\n    created_at\\n    updated_at\\n    __typename\\n  }\\n  card_transactions_aggregate(\\n    where: {type: {_eq: \\\"AUTHORISATION\\\"}, status: {_eq: \\\"APPROVED\\\"}}\\n  ) {\\n    aggregate {\\n      sum {\\n        billing_amount\\n        __typename\\n      }\\n      __typename\\n    }\\n    __typename\\n  }\\n}\\n\"}"

    const requestOptions = getRequestOptions(token, 'POST', raw);

    return await fetch("https://hasura.plutus.it/v1alpha1/graphql", requestOptions)
        .then(response => response.json())
        .then(jsonResponse => {
            const balance = jsonResponse.data.fiat_balance[0].amount;
            const billing = jsonResponse.data.card_transactions_aggregate.aggregate.sum.billing_amount
            return balance - billing
        })
}

async function getAccount(token) {
    const requestOptions = getRequestOptions(token, 'GET', null);

    return await fetch("https://api.plutus.it/platform/account", requestOptions)
        .then(response => response.json())
        .then(jsonResponse => jsonResponse[0])
}

function _fixStatements(json) {
    // to simplify, we only consider one account. This means we have to remove transfers from main account to card account
    // this is for backwards compatibility, as the new Plutus only has one account
    json = json.filter(op => !["29", "LOAD_PLUTUS_CARD_FROM_CJ_WALLET", "LOAD_PLUTUS_CARD_FROM_WALLET"].includes(op.type));

    const types = {
        // old types
        "0": "PENDING",
        "5": "DECLINED_POS_CHARGE",
        "31": "PURCHASE",
        "35": "REFUND",
        "45": "REFUND",
        // new types
        "AUTHORISATION": "PENDING",
        "DEPOSIT_FUNDS_RECEIVED": "CARD_DEPOSIT",
        "CARD_REFUND": "REFUND",
    };

    function fixType(record) {
        if (record.type in types)
            record.type = types[record.type];
        else
            record.type = "UNKNOWN - " + record.type;
    }

    function fixDescription(record) {
        if (record.description)
            return;

        const isDeposit = record.type === "CARD_DEPOSIT";
        if (isDeposit) {
            record.description = "Deposit";
        }
        else {
            record.description = "Unknown";
        }
    }

    function fixAmount(record) {
        record.amount = Math.abs(record.amount);

        const isCredit = ["REFUND", "CARD_DEPOSIT", "DEPOSIT_FUNDS_RECEIVED"].includes(record.type);
        if (!isCredit)
            record.amount = -record.amount;
    }

    json.forEach(fixType);
    json.forEach(fixDescription);
    json.forEach(fixAmount);

    return json
}

async function getTransactions(token) {
    const requestOptions = getRequestOptions(token, 'GET');

    return await fetch("https://neobank-api.swile.co/api/v2/user/operations?per=999999", requestOptions)
        .then(response => response.json())
        .then(json => json.items)
        .then(_fixStatements)
}
