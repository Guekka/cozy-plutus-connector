const { log, cozyClient, BaseKonnector, categorize } = require('cozy-konnector-libs')
const { getPlutusData, isCredit } = require('./swile')
const { getToken } = require('./auth')
const doctypes = require('cozy-doctypes')
const {
    Document,
    BankAccount,
    BankTransaction,
    BankingReconciliator
} = doctypes

Document.registerClient(cozyClient)

const reconciliator = new BankingReconciliator({ BankAccount, BankTransaction })

const VENDOR = 'Swile'

class PlutusConnector extends BaseKonnector {
    async fetch(fields) {
        log('info', 'Authenticating ...')
        this.jwt = `eyJraWQiOiI1MzNiZjVjOGRiZDA1ZWYxOGZkMDFlMmJiYmFiM2Q3ZjY5ZTM1MTFkZDA4NDAyODYyYjVkZTYzYjlhMjM4OTIzIiwiYWxnIjoiSFM1MTIifQ.eyJpYXQiOjE3MDEyNDU2NzUsImV4cCI6MTcwMTI0NzQ3NSwianRpIjoiNzAzNTk5NGMtZjE1Yi00OGU1LTgzNDEtZTI1YmQ5ZDg4MWVhIiwiaXNzIjoiYXBpLnN3aWxlLmNvIiwic3ViIjoiYjllNDUxOTktZGEwZS00MTEyLThmYzctZGE5NjcxMDI3Y2MyIiwiYmFua2luZ19hY2NvdW50X3V1aWQiOiI3ZDczMjlhYi04NDliLTRlNjEtYTk3ZS03M2MxMjNkY2Y0ZGYiLCJlbWFpbCI6Im1lbG9kaWUubWFyY2gwNkBnbWFpbC5jb20iLCJzY29wZSI6InB1YmxpYyJ9.JjUyZnc4FxtUPk_FlLmig6S0sZfTYEoJoj5faLd931FO_rtZ2x97EY476IzFqf80MgziUmv8rQCQ87tHSiv5cg`; // await getToken(this, fields.login, fields.password, fields.totp)
        log('info', 'Successfully logged in')

        if (this.browser) {
            await this.browser.close();
        }
        try {

            const plutusData = await getPlutusData(this.jwt)

            log('info', 'Successfully fetched data')
            log('info', 'Parsing ...')

            const account = this.makeAccount(plutusData.account, plutusData.balance)
            const transactions = this.getTransactions(plutusData.transactions, account)

            const categorizedTransactions = await categorize(transactions)

            await reconciliator.save([account], categorizedTransactions)
        } catch (e) {
            log('error', e)
            log('error', e.stack)
        }
    }

    makeAccount(account, balance) {
        return {
            "balance": balance,
            "institutionLabel": VENDOR,
            "label": "Plutus Modulr",
            "iban": account.iban_account,
            "number": String(account.id),
            "type": "bank",
            "idAccount": String(account.id),
            "vendorId": String(account.id),
            "currency": account.currency,
        }
    }



    getTransactions(transactions, account) {
        return transactions.map(transaction => {
            // remove "Crv*" and "Crv" from the label, case insensitive
            let label = transaction.description.replace(/Crv\*?/i, '')

            // Remove ", XX XX 0000" from the label
            label = label.replace(/, .. .. \d{4}$/, '')

            // Remove ", Vilnius" from the label
            label = label.replace(', Vilnius', '')

            return {
                "vendorId": transaction.id,
                "amount": transaction.amount / 100,
                "currency": transaction.currency,
                "date": transaction.date,
                "dateImport": new Date().toISOString(),
                "dateOperation": null,
                "label": label,
                "originalBankLabel": transaction.description,
                "vendorAccountId": account.vendorId,
                "type": transaction.type === "PURCHASE" ? "credit card" : "transfer",
            }
        })
    }
}

const connector = new PlutusConnector({
    cheerio: false,
    json: false
})

connector.run()
